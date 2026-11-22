import { toKg } from "@/lib/units";
import type { z } from "zod";
import type { scaleWorkoutInputSchema, scaleWorkoutSchema } from "./scale-workout";

export function scaleReviewMovements(shownScale: z.infer<typeof scaleWorkoutSchema> | null, scaleContext: z.infer<typeof scaleWorkoutInputSchema> | null) {
  const scaleUnits = scaleContext?.units ?? "lb";
  const scaleNames = new Map((scaleContext?.library ?? []).map(({ id, name }) => [id, name]));
  return shownScale?.changes.map((change, index) => {
    const original = scaleContext?.workout.movements[index];
    const toWhiteboardMovement = (movement: typeof change, name: string) => ({
      name,
      sets: movement.sets,
      reps: movement.reps,
      load_kg: movement.load == null ? null : toKg(movement.load, scaleUnits),
      distance_m: movement.distance_m,
      calories: movement.calories,
      duration_seconds: movement.duration_seconds,
      notes: null,
    });
    return {
      original: original
        ? {
            name: original.name,
            sets: original.sets,
            reps: original.reps,
            load_kg: original.load == null ? null : toKg(original.load, scaleUnits),
            distance_m: original.distance_m,
            calories: original.calories,
            duration_seconds: original.duration_seconds,
            notes: original.notes,
          }
        : toWhiteboardMovement(change, "Original movement"),
      scaled: toWhiteboardMovement(change, scaleNames.get(change.movement_id) ?? "Unknown movement"),
      load: change.load,
      reason: change.reason,
    };
  }) ?? [];
}
