import { effectiveScaling } from "./workout-scaling";
import { scaleWorkoutDetailsSchema } from "./ai/scale-workout-schema";
import type { WorkoutSection } from "./workout-sections";

export type WorkoutMovement = {
  movement_id: string; name: string; sets: number | null; reps: number | null;
  load_kg: number | null; notes: string | null;
  reason?: string;
  section?: number | null;
  distance_m?: number | null; calories?: number | null; duration_seconds?: number | null;
};
type BaseWorkout = { movements: WorkoutMovement[]; rounds: number | null; time_cap_seconds: number | null; sections?: WorkoutSection[] };
type Scaling = Parameters<typeof effectiveScaling>[0];

export function workoutVersion<T extends BaseWorkout>(base: T, row: Scaling, date: string) {
  const scaling = effectiveScaling(row, date);
  const details = scaling ? scaleWorkoutDetailsSchema.safeParse(scaling.details) : null;
  if (!details?.success) return { ...base, isScaled: !!scaling, modifications: scaling?.modifications ?? "" };
  return {
    ...base,
    movements: details.data.movements.map((m, index) => ({
      ...m,
      name: m.movement_name,
      section: base.movements[index]?.section ?? null,
      notes: base.movements.find((original) => original.movement_id === m.original_movement_id)?.notes ?? null,
    })),
    rounds: details.data.rounds === undefined ? base.rounds : details.data.rounds,
    time_cap_seconds: details.data.time_cap_seconds === undefined ? base.time_cap_seconds : details.data.time_cap_seconds,
    isScaled: true,
    modifications: scaling!.modifications,
  };
}
