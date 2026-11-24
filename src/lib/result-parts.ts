import { z } from "zod";

import type { Enums } from "@/lib/supabase/database.types";
import { fromKg, fromKgPrecise, toKg, type Units } from "@/lib/units";

const resultPartSetSchema = z.object({
  reps: z.number().int().min(0).max(1000).nullable(),
  load_kg: z.number().min(0).max(1000).nullable(),
  done: z.boolean(),
}).strict();

const resultPartScoreSchema = z.object({
  time_seconds: z.number().int().min(0).optional(),
  rounds: z.number().int().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  calories: z.number().min(0).optional(),
  distance_m: z.number().min(0).optional(),
}).strict();

export const resultPartSchema = z.object({
  position: z.number().int().min(0).max(39),
  movement_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  sets: z.array(resultPartSetSchema).max(100),
  score: resultPartScoreSchema.optional(),
  notes: z.string().max(300).optional(),
}).strict();

export const resultPartsSchema = z.array(resultPartSchema).max(40);

export type ResultPartSet = z.infer<typeof resultPartSetSchema>;
export type ResultPart = z.infer<typeof resultPartSchema>;

export function shouldResetParts(
  previous: ResultPart[],
  next: ResultPart[],
  dirty: boolean,
): boolean {
  if (
    previous.length !== next.length ||
    previous.some((part, index) => part.movement_id !== next[index].movement_id)
  )
    return true;
  if (dirty) return false;
  const content = (parts: ResultPart[]) =>
    JSON.stringify(
      parts.map((part) => ({
        position: part.position,
        movement_id: part.movement_id,
        name: part.name,
        sets: part.sets.map(({ reps, load_kg, done }) => [reps, load_kg, done]),
        score: Object.entries(part.score ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
        notes: part.notes ?? null,
      })),
    );
  return content(previous) !== content(next);
}

export type ResultPartMovement = {
  movement_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  load_kg: number | null;
  notes: string | null;
  distance_m?: number | null;
  calories?: number | null;
  duration_seconds?: number | null;
};

export type ResultPartVersion = {
  movements: ResultPartMovement[];
  workout_type?: Enums<"workout_type">;
};

export function partsForVersion(
  parts: ResultPart[],
  version: ResultPartVersion,
): ResultPart[] | null {
  if (parts.length === 0) return [];
  const movements = version.movements.slice(0, 40);
  if (parts.length !== movements.length) return null;
  if (
    parts.some(
      (part, position) =>
        part.position !== position ||
        part.movement_id !== movements[position].movement_id,
    )
  )
    return null;
  return parts.map((part, position) => ({
    ...part,
    name: movements[position].name,
  }));
}

export function defaultParts(
  version: ResultPartVersion,
  units: Units,
): ResultPart[] {
  return version.movements.slice(0, 40).map((movement, position) => {
    const setCount =
      version.workout_type === "strength"
        ? Math.min(100, Math.max(1, movement.sets ?? 1))
        : movement.sets != null && movement.sets > 0
          ? Math.min(100, Math.max(1, movement.sets))
          : 0;
    const plannedLoad =
      movement.load_kg == null
        ? null
        : toKg(fromKgPrecise(movement.load_kg, units), units);

    return {
      position,
      movement_id: movement.movement_id,
      name: movement.name,
      sets: Array.from({ length: setCount }, () => ({
        reps: movement.reps,
        load_kg: plannedLoad,
        done: true,
      })),
      ...(setCount ? {} : { score: {} }),
    };
  });
}

export type LiftPrBest = {
  benchmark_id: string;
  movement_id: string;
  rep_max: number | null;
  load_kg: number | null;
};

export type LiftPrCandidate = {
  benchmark_id: string;
  movement_id: string;
  position: number;
  set_index: number;
  reps: number;
  load_kg: number;
};

export type LiftPrSetLocation = Pick<LiftPrCandidate, "position" | "set_index">;

export function liftPrCandidates(
  parts: ResultPart[],
  bests: LiftPrBest[],
): LiftPrCandidate[] {
  const heaviest = new Map<
    string,
    Omit<LiftPrCandidate, "benchmark_id">
  >();

  for (const part of parts) {
    for (const [set_index, set] of part.sets.entries()) {
      if (
        !set.done ||
        set.reps == null ||
        set.reps < 1 ||
        set.reps > 20 ||
        set.load_kg == null ||
        set.load_kg <= 0
      )
        continue;

      const key = `${part.movement_id}:${set.reps}`;
      const current = heaviest.get(key);
      if (!current || set.load_kg > current.load_kg) {
        heaviest.set(key, {
          movement_id: part.movement_id,
          position: part.position,
          set_index,
          reps: set.reps,
          load_kg: set.load_kg,
        });
      }
    }
  }

  const bestByBenchmark = new Map<string, number>();
  for (const best of bests) {
    if (best.rep_max == null || best.load_kg == null) continue;
    const key = `${best.benchmark_id}:${best.rep_max}`;
    bestByBenchmark.set(
      key,
      Math.max(bestByBenchmark.get(key) ?? 0, best.load_kg),
    );
  }

  const candidates: LiftPrCandidate[] = [];
  for (const set of heaviest.values()) {
    const matchingBenchmarks = bests
      .filter((best) => best.movement_id === set.movement_id && best.rep_max === set.reps)
      .map((best) => best.benchmark_id);
    for (const benchmark_id of new Set(matchingBenchmarks)) {
      if (set.load_kg > (bestByBenchmark.get(`${benchmark_id}:${set.reps}`) ?? 0))
        candidates.push({ ...set, benchmark_id });
    }
  }

  return candidates.sort(
    (a, b) =>
      a.position - b.position ||
      a.set_index - b.set_index ||
      a.benchmark_id.localeCompare(b.benchmark_id),
  );
}

export function liftPrSetLocations(
  parts: ResultPart[],
  records: { movement_id: string; rep_max: number | null; load_kg: number | null }[],
): LiftPrSetLocation[] {
  const locations: LiftPrSetLocation[] = [];
  const used = new Set<string>();
  for (const record of records) {
    if (record.rep_max == null || record.load_kg == null) continue;
    const key = `${record.movement_id}:${record.rep_max}`;
    if (used.has(key)) continue;
    const location = parts.flatMap((part) =>
      part.sets.map((set, set_index) => ({
        part,
        set,
        set_index,
      })),
    ).find(
      ({ part, set }) =>
        part.movement_id === record.movement_id &&
        set.done &&
        set.reps === record.rep_max &&
        set.load_kg != null &&
        Math.abs(set.load_kg - record.load_kg!) < 0.005,
    );
    if (location) {
      used.add(key);
      locations.push({
        position: location.part.position,
        set_index: location.set_index,
      });
    }
  }
  return locations;
}

function displayWeight(loadKg: number, units: Units) {
  return String(fromKg(loadKg, units));
}

function displayTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function partsSummary(parts: ResultPart[], units: Units): string {
  return parts
    .map((part) => {
      if (part.sets.length) {
        const done = part.sets.filter((set) => set.done);
        const sameReps =
          done.length > 0 &&
          done[0].reps != null &&
          done.every((set) => set.reps === done[0].reps);
        const setLabel = sameReps
          ? `${done.length}x${done[0].reps}`
          : `${done.length}/${part.sets.length} sets`;
        const loads = done
          .map((set) => (set.load_kg == null ? null : displayWeight(set.load_kg, units)))
          .filter((load): load is string => load != null);
        const missed = part.sets.length - done.length;
        return [
          `${part.name} ${setLabel}`,
          loads.length ? `@ ${loads.join(", ")} ${units}` : "",
          missed ? `${missed} missed` : "",
        ]
          .filter(Boolean)
          .join(" ");
      }

      const score = part.score;
      if (!score) return part.name;
      const values = [
        score.time_seconds == null ? "" : displayTime(score.time_seconds),
        score.rounds == null && score.reps == null
          ? ""
          : `${score.rounds ?? 0} rounds${score.reps == null ? "" : ` + ${score.reps} reps`}`,
        score.calories == null ? "" : `${score.calories} cal`,
        score.distance_m == null ? "" : `${score.distance_m} m`,
      ].filter(Boolean);
      return values.length ? `${part.name} ${values.join(", ")}` : part.name;
    })
    .join(" · ");
}
