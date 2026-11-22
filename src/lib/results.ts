import type { AthleteScheduleItem } from "@/lib/athlete-schedule";
import type { Enums } from "@/lib/supabase/database.types";

export type Score = {
  time_seconds: number | null;
  rounds: number | null;
  reps: number | null;
  load_kg: number | null;
  is_rx: boolean;
};

/** A copied workout or replacement inherits the original's result on that scheduled date. */
export function scheduledWorkoutResultMatcher(results: { workout_id: string; performed_on: string }[]) {
  const logged = new Set(results.map((result) => result.workout_id));
  const loggedDates = new Set(results.map((result) => `${result.workout_id}:${result.performed_on}`));
  return ({ workout, date, overrides }: AthleteScheduleItem) =>
    logged.has(workout.id) ||
    [workout.source_workout_id, overrides?.workoutId].some((id) => id && loggedDates.has(`${id}:${date}`));
}

const asc = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);
const desc = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);

/** Sorts best first: Rx ahead of scaled, then by the score that matters for the WOD type. */
export function compareScores(type: Enums<"workout_type">) {
  return (a: Score, b: Score) => {
    if (a.is_rx !== b.is_rx) return a.is_rx ? -1 : 1;
    switch (type) {
      case "for_time":
        return asc(a.time_seconds, b.time_seconds) || desc(a.reps, b.reps);
      case "strength":
        return desc(a.load_kg, b.load_kg);
      default:
        return (
          desc(a.rounds, b.rounds) ||
          desc(a.reps, b.reps) ||
          desc(a.load_kg, b.load_kg) ||
          asc(a.time_seconds, b.time_seconds)
        );
    }
  };
}

export function workoutRecordKey(workout: { title: string; workout_type: Enums<"workout_type"> }) {
  return `${workout.workout_type}:${workout.title.trim().toLowerCase()}`;
}

/** Best result per workout title (benchmarks repeat under the same name). */
export function personalRecords<
  R extends Score & { workouts: { title: string; workout_type: Enums<"workout_type"> } | null },
>(results: R[]) {
  const best = new Map<string, R & { attempts: number }>();
  for (const r of results) {
    if (!r.workouts) continue;
    const key = workoutRecordKey(r.workouts);
    const current = best.get(key);
    const attempts = (current?.attempts ?? 0) + 1;
    const better = !current || compareScores(r.workouts.workout_type)(r, current) < 0;
    best.set(key, { ...(better ? r : current), attempts });
  }
  return [...best.values()].sort((a, b) => a.workouts!.title.localeCompare(b.workouts!.title));
}
