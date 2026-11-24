import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { compareScores, type Score } from "@/lib/results";
import { addDays } from "@/lib/nutrition";
import { resultPartsSchema } from "@/lib/result-parts";
import { effectiveScaling } from "@/lib/workout-scaling";
import { scaleWorkoutDetailsSchema } from "@/lib/ai/scale-workout-schema";

type Client = SupabaseClient<Database>;
type Benchmark = Tables<"benchmarks">;
type DirectResult = Tables<"benchmark_results">;
type BenchmarkScaling = Pick<Tables<"athlete_workout_scalings">,
  "modifications" | "details" | "athlete_adjusted_at" | "coach_modifications" | "coach_details">;
export type ScheduledBenchmarkResult = Score & {
  id: string;
  performed_on: string;
  created_at: string;
  notes: string | null;
  parts?: Json;
  scaling?: BenchmarkScaling | null;
  workouts: {
    title: string;
    workout_type: Benchmark["workout_type"];
    workout_movements: { movement_id: string; reps: number | null }[];
  } | null;
};
export type BenchmarkAttempt = Score & {
  id: string;
  source: "direct" | "workout";
  performed_on: string;
  created_at: string;
  rep_max: number | null;
  estimatedOneRmKg: number | null;
  notes: string | null;
  isPr: boolean;
};

export function estimateOneRepMax(loadKg: number | null, reps: number | null): number | null {
  if (loadKg == null || !Number.isFinite(loadKg) || loadKg < 0 || reps == null || !Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}

function compareAttempts(benchmark: Benchmark) {
  const compare = compareScores(benchmark.workout_type);
  return (a: BenchmarkAttempt, b: BenchmarkAttempt) => benchmark.kind === "lift"
    ? compare({ ...a, load_kg: a.estimatedOneRmKg ?? a.load_kg }, { ...b, load_kg: b.estimatedOneRmKg ?? b.load_kg })
    : compare(a, b);
}

export function normalizeBenchmarkHistory(benchmark: Benchmark, direct: DirectResult[], scheduled: ScheduledBenchmarkResult[]): BenchmarkAttempt[] {
  const scheduledIds = new Set(scheduled.map((result) => result.id));
  const attempts: BenchmarkAttempt[] = direct
    .filter((r) => r.benchmark_id === benchmark.id)
    .filter((r) => !r.source_result_id || !scheduledIds.has(r.source_result_id))
    .map((r) => ({
    ...r, source: "direct", estimatedOneRmKg: benchmark.kind === "lift" ? estimateOneRepMax(r.load_kg, r.rep_max) : null, isPr: false,
  }));
  for (const r of scheduled) {
    const w = r.workouts;
    if (!w) continue;
    const scaling = effectiveScaling(r.scaling, r.performed_on);
    const details = scaling ? scaleWorkoutDetailsSchema.safeParse(scaling.details) : null;
    const movements = details?.success ? details.data.movements : w.workout_movements;
    const movement = movements.find((m) => m.movement_id === benchmark.movement_id);
    if (benchmark.kind === "lift") {
      if (w.workout_type !== "strength") continue;
      const parsedParts = resultPartsSchema.safeParse(r.parts);
      if (parsedParts.success && parsedParts.data.length > 0) {
        const loadsByReps = new Map<number, number>();
        for (const part of parsedParts.data) {
          if (part.movement_id !== benchmark.movement_id) continue;
          for (const set of part.sets) {
            if (
              !set.done ||
              set.reps == null ||
              set.reps < 1 ||
              set.reps > 20 ||
              set.load_kg == null ||
              set.load_kg <= 0
            )
              continue;
            loadsByReps.set(
              set.reps,
              Math.max(loadsByReps.get(set.reps) ?? 0, set.load_kg),
            );
          }
        }
        for (const [rep_max, load_kg] of loadsByReps) {
          attempts.push({
            ...r,
            source: "workout",
            rep_max,
            load_kg,
            estimatedOneRmKg: estimateOneRepMax(load_kg, rep_max),
            isPr: false,
          });
        }
        continue;
      }
      if (!movement) continue;
      const rep_max = movement.reps ?? r.reps ?? 1;
      attempts.push({
        ...r,
        source: "workout",
        rep_max,
        estimatedOneRmKg: estimateOneRepMax(r.load_kg, rep_max),
        isPr: false,
      });
      continue;
    }
    if (
      w.workout_type !== benchmark.workout_type ||
      w.title.trim().toLowerCase() !== benchmark.name.trim().toLowerCase()
    )
      continue;
    attempts.push({
      ...r,
      source: "workout",
      rep_max: null,
      estimatedOneRmKg: null,
      isPr: false,
    });
  }
  attempts.sort((a, b) => a.performed_on.localeCompare(b.performed_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const compare = compareAttempts(benchmark);
  let best: BenchmarkAttempt | null = null;
  for (const a of attempts) {
    a.isPr = best != null && compare(a, best) < 0;
    if (!best || compare(a, best) < 0) best = a;
  }
  return attempts;
}

export function retestDue(lastDate: string | null, retestWeeks: number | null, today: string): boolean {
  return lastDate != null && retestWeeks != null && today > addDays(lastDate, retestWeeks * 7);
}

function summarize(benchmark: Benchmark, attempts: BenchmarkAttempt[], retestWeeks: number | null, today: string) {
  const best = [...attempts].sort(compareAttempts(benchmark))[0] ?? null;
  const last = attempts.at(-1) ?? null;
  const actualMax = (reps: number) => [...attempts].filter((a) => a.rep_max === reps && a.load_kg != null)
    .sort(compareScores("strength"))[0] ?? null;
  return {
    ...benchmark, attempts, best, last, retestWeeks, retestDue: retestDue(last?.performed_on ?? null, retestWeeks, today),
    bestActual: { one: actualMax(1), three: actualMax(3), five: actualMax(5) },
    trendPoints: attempts.map((a) => ({ date: a.performed_on, time_seconds: a.time_seconds, rounds: a.rounds, reps: a.reps, load_kg: a.load_kg, estimatedOneRmKg: a.estimatedOneRmKg, is_rx: a.is_rx, isPr: a.isPr })),
  };
}

export async function loadBenchmarkHistory(supabase: Client, athleteId: string, asOf?: string) {
  const directQuery = supabase.from("benchmark_results").select("*").eq("athlete_id", athleteId);
  const scheduledQuery = supabase.from("workout_results").select("id, workout_id, performed_on, created_at, time_seconds, rounds, reps, load_kg, is_rx, notes, parts, workouts(title, workout_type, workout_movements(movement_id, reps))").eq("athlete_id", athleteId);
  const [benchmarks, direct, scheduled, scalings] = await Promise.all([
    supabase.from("benchmarks").select("*").order("name"),
    asOf ? directQuery.lte("performed_on", asOf) : directQuery,
    asOf ? scheduledQuery.lte("performed_on", asOf) : scheduledQuery,
    supabase.from("athlete_workout_scalings").select("workout_id, modifications, details, athlete_adjusted_at, coach_modifications, coach_details").eq("athlete_id", athleteId),
  ]);
  for (const r of [benchmarks, direct, scheduled, scalings]) if (r.error) throw r.error;
  const scalingByWorkout = new Map((scalings.data ?? []).map((s) => [s.workout_id, s]));
  return { benchmarks: benchmarks.data ?? [], direct: direct.data ?? [], scheduled: (scheduled.data ?? []).map((r) => ({ ...r, scaling: scalingByWorkout.get(r.workout_id) ?? null })) };
}

export async function loadAthleteBenchmarks(supabase: Client, athleteId: string, today: string, asOf?: string) {
  const [history, athlete] = await Promise.all([
    loadBenchmarkHistory(supabase, athleteId, asOf),
    supabase.from("athletes").select("coach_id").eq("id", athleteId).single(),
  ]);
  if (athlete.error) throw athlete.error;
  const settings = await supabase.from("benchmark_settings").select("benchmark_id, retest_weeks").eq("coach_id", athlete.data.coach_id);
  if (settings.error) throw settings.error;
  return history.benchmarks.map((b) => summarize(b, normalizeBenchmarkHistory(b, history.direct, history.scheduled), settings.data.find((s) => s.benchmark_id === b.id)?.retest_weeks ?? null, today));
}

export type LiftMax = {
  name: string;
  movement_id: string;
  bestLoadKg: number | null;
  actualOneRmKg: number | null;
  actualDate: string | null;
  estimatedOneRmKg: number | null;
  estimatedReps: number | null;
  estimatedDate: string | null;
  oneRmKg: number | null;
  isEstimated: boolean;
};

export async function loadLiftMaxes(supabase: Client, athleteId: string, asOf?: string): Promise<LiftMax[]> {
  const history = await loadBenchmarkHistory(supabase, athleteId, asOf);
  const lifts = new Map<string, { name: string; attempts: BenchmarkAttempt[] }>();
  for (const b of history.benchmarks) {
    if (b.kind !== "lift" || !b.movement_id) continue;
    const entry = lifts.get(b.movement_id) ?? { name: b.name, attempts: [] };
    entry.attempts.push(...normalizeBenchmarkHistory(b, history.direct, history.scheduled));
    lifts.set(b.movement_id, entry);
  }
  return [...lifts].map(([movement_id, { name, attempts }]) => {
    const actual = attempts.filter((a) => a.rep_max === 1 && a.load_kg != null).sort((a, b) => b.load_kg! - a.load_kg!)[0];
    const estimated = attempts.filter((a) => a.rep_max !== 1 && a.estimatedOneRmKg != null).sort((a, b) => b.estimatedOneRmKg! - a.estimatedOneRmKg!)[0];
    const isEstimated = estimated != null && estimated.estimatedOneRmKg! > (actual?.load_kg ?? -Infinity);
    const loads = attempts.flatMap((a) => a.load_kg == null ? [] : [a.load_kg]);
    return { name, movement_id, bestLoadKg: loads.length ? Math.max(...loads) : null, actualOneRmKg: actual?.load_kg ?? null, actualDate: actual?.performed_on ?? null,
      estimatedOneRmKg: estimated?.estimatedOneRmKg ?? null, estimatedReps: estimated?.rep_max ?? null, estimatedDate: estimated?.performed_on ?? null,
      oneRmKg: isEstimated ? estimated.estimatedOneRmKg : actual?.load_kg ?? null, isEstimated };
  });
}
