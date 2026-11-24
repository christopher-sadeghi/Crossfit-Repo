import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadBenchmarkHistory,
  normalizeBenchmarkHistory,
} from "@/lib/benchmarks";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { toKg } from "@/lib/units";
import {
  liftPrCandidates,
  liftPrSetLocations,
  resultPartsSchema,
  type LiftPrCandidate,
  type ResultPart,
} from "@/lib/result-parts";

type Client = SupabaseClient<Database>;

export async function syncResultLiftPrs(
  supabase: Client,
  result: {
    id: string;
    athlete_id: string;
    coach_id: string;
    performed_on: string;
    created_at: string;
    is_rx: boolean;
    logged_by: string | null;
  },
  parts: ResultPart[],
  workoutTitle: string,
): Promise<{ candidates: LiftPrCandidate[]; error?: string }> {
  const movementIds = [...new Set(parts.map((part) => part.movement_id))];
  const { data: benchmarks, error: benchmarkError } = movementIds.length
    ? await supabase
        .from("benchmarks")
        .select("id, movement_id")
        .eq("kind", "lift")
        .in("movement_id", movementIds)
        .or(`coach_id.is.null,coach_id.eq.${result.coach_id}`)
    : { data: [], error: null };
  if (benchmarkError) return { candidates: [], error: benchmarkError.message };

  const benchmarkIds = new Set((benchmarks ?? []).map((benchmark) => benchmark.id));
  let history: Awaited<ReturnType<typeof loadBenchmarkHistory>>;
  try {
    history = await loadBenchmarkHistory(
      supabase,
      result.athlete_id,
      result.performed_on,
    );
  } catch (error) {
    return {
      candidates: [],
      error: error instanceof Error ? error.message : "Couldn't load lift history.",
    };
  }
  const bests = liftBestsFromHistory(
    history.benchmarks.filter((benchmark) => benchmarkIds.has(benchmark.id)),
    history.direct,
    history.scheduled,
    result,
    parts,
  );
  const candidates = liftPrCandidates(parts, bests);

  const { data: insertedRows, error: insertError } = candidates.length
    ? await supabase
        .from("benchmark_results")
        .insert(
      candidates.map((candidate) => ({
        coach_id: result.coach_id,
        athlete_id: result.athlete_id,
        benchmark_id: candidate.benchmark_id,
        performed_on: result.performed_on,
        load_kg: candidate.load_kg,
        rep_max: candidate.reps,
        is_rx: result.is_rx,
        notes: `From WOD: ${workoutTitle}`,
        source_result_id: result.id,
        logged_by: result.logged_by,
      })),
        )
        .select("id")
    : { data: [], error: null };
  if (insertError) return { candidates: [], error: insertError.message };

  const insertedIds = (insertedRows ?? []).map((row) => row.id);
  let obsoleteRowsQuery = supabase
    .from("benchmark_results")
    .delete()
    .eq("source_result_id", result.id);
  if (insertedIds.length) {
    obsoleteRowsQuery = obsoleteRowsQuery.not(
      "id",
      "in",
      `(${insertedIds.join(",")})`,
    );
  }
  const { error: deleteError } = await obsoleteRowsQuery;
  if (deleteError) return { candidates: [], error: deleteError.message };

  return { candidates };
}

export function liftBestsFromHistory(
  benchmarks: Tables<"benchmarks">[],
  direct: Tables<"benchmark_results">[],
  scheduled: Awaited<ReturnType<typeof loadBenchmarkHistory>>["scheduled"],
  result: Pick<Tables<"workout_results">, "id" | "performed_on" | "created_at">,
  parts: ResultPart[],
) {
  const repsByMovement = new Map<string, Set<number>>();
  for (const part of parts) {
    for (const set of part.sets) {
      if (
        set.done &&
        set.reps != null &&
        set.reps >= 1 &&
        set.reps <= 20 &&
        set.load_kg != null &&
        set.load_kg > 0
      ) {
        const reps = repsByMovement.get(part.movement_id) ?? new Set<number>();
        reps.add(set.reps);
        repsByMovement.set(part.movement_id, reps);
      }
    }
  }

  const isEarlier = (attempt: { performed_on: string; created_at: string }) =>
    attempt.performed_on < result.performed_on ||
    (attempt.performed_on === result.performed_on &&
      attempt.created_at < result.created_at);
  const earlierDirect = direct.filter(
    (attempt) =>
      attempt.source_result_id !== result.id && isEarlier(attempt),
  );
  const earlierScheduled = scheduled.filter(
    (attempt) => attempt.id !== result.id && isEarlier(attempt),
  );

  return benchmarks.flatMap((benchmark) => {
    if (benchmark.kind !== "lift" || !benchmark.movement_id) return [];
    const reps = [...(repsByMovement.get(benchmark.movement_id) ?? [])];
    if (!reps.length) return [];
    const attempts = normalizeBenchmarkHistory(
      benchmark,
      earlierDirect,
      earlierScheduled,
    );
    return reps.map((rep_max) => ({
      benchmark_id: benchmark.id,
      movement_id: benchmark.movement_id!,
      rep_max,
      load_kg: attempts.reduce<number | null>((best, attempt) => {
        if (attempt.rep_max !== rep_max || attempt.load_kg == null)
          return best;
        const load = Number(attempt.load_kg);
        return best == null ? load : Math.max(best, load);
      }, null),
    }));
  });
}

export function submittedParts(raw: string, units: "kg" | "lb") {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Part results must be valid JSON." } as const;
  }
  if (!Array.isArray(parsed))
    return { error: "Part results must be an array." } as const;

  const kilograms = parsed.map((part) => {
    if (!part || typeof part !== "object" || !Array.isArray(part.sets))
      return part;
    return {
      ...part,
      sets: part.sets.map((set: unknown) => {
        if (!set || typeof set !== "object") return set;
        const value = set as Record<string, unknown>;
        return {
          ...value,
          load_kg:
            typeof value.load_kg === "number"
              ? toKg(value.load_kg, units)
              : value.load_kg,
        };
      }),
    };
  });
  return { value: kilograms } as const;
}

export function maxDoneSetLoad(parts: ResultPart[]) {
  return parts
    .flatMap((part) => part.sets)
    .filter((set) => set.done && set.load_kg != null)
    .reduce<number | null>(
      (maximum, set) =>
        maximum == null ? set.load_kg : Math.max(maximum, set.load_kg!),
      null,
    );
}

export async function loadResultPrSetLocations(
  supabase: Client,
  results: { id: string; parts: Json }[],
) {
  const locations = new Map<string, { position: number; set_index: number }[]>();
  if (!results.length) return locations;

  const { data, error } = await supabase
    .from("benchmark_results")
    .select("source_result_id, rep_max, load_kg, benchmarks(movement_id)")
    .in(
      "source_result_id",
      results.map((result) => result.id),
    );
  if (error) throw error;

  const recordsByResult = new Map<
    string,
    { movement_id: string; rep_max: number | null; load_kg: number | null }[]
  >();
  for (const row of data ?? []) {
    const movementId = row.benchmarks?.movement_id;
    if (!row.source_result_id || !movementId) continue;
    const records = recordsByResult.get(row.source_result_id) ?? [];
    records.push({
      movement_id: movementId,
      rep_max: row.rep_max,
      load_kg: row.load_kg == null ? null : Number(row.load_kg),
    });
    recordsByResult.set(row.source_result_id, records);
  }

  for (const result of results) {
    const parsed = resultPartsSchema.safeParse(result.parts);
    locations.set(
      result.id,
      parsed.success
        ? liftPrSetLocations(
            parsed.data,
            recordsByResult.get(result.id) ?? [],
          )
        : [],
    );
  }
  return locations;
}
