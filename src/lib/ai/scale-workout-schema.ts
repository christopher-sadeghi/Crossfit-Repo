import { z } from "zod";

export const scaleWorkoutChangeSchema = z.object({
  original_movement_id: z.string(),
  movement_id: z.string(),
  sets: z.number().int().min(1).max(100).nullable(),
  reps: z.number().int().min(1).max(1000).nullable(),
  load: z.number().min(0).max(2000).nullable(),
  distance_m: z.number().min(1).max(100_000).nullable(),
  calories: z.number().int().min(1).max(1000).nullable(),
  duration_seconds: z.number().int().min(1).max(7200).nullable(),
  reason: z.string().min(1).max(200),
});

export const scaleWorkoutDetailsSchema = z.object({
  source: z.literal("ai"),
  suggestion_id: z.string().uuid(),
  movements: z.array(
    z.object({
      original_movement_id: z.string(),
      movement_id: z.string(),
      movement_name: z.string(),
      sets: z.number().nullable(),
      reps: z.number().nullable(),
      load_kg: z.number().nullable(),
      distance_m: z.number().nullable(),
      calories: z.number().nullable(),
      duration_seconds: z.number().nullable(),
      reason: z.string(),
    }),
  ),
  requested_by: z.literal("athlete").optional(),
  rounds: z.number().nullable().optional(),
  time_cap_seconds: z.number().nullable().optional(),
  check_with_coach: z.boolean().optional(),
  scheduled_on: z.string().optional(),
});
