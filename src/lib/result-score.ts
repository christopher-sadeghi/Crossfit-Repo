import { z } from "zod";

import type { Enums } from "@/lib/supabase/database.types";
import { toKg, type Units } from "@/lib/units";

const count = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v == null || (Number.isInteger(v) && v >= 0 && v <= 100_000), "Rounds and reps must be whole numbers.");

const load = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v == null || (Number.isFinite(v) && v >= 0 && v < 2000), "Load must be a non-negative number.");

const optionalCount = z.preprocess((v) => v ?? "", count);
const optionalLoad = z.preprocess((v) => v ?? "", load);

export const scoreFields = {
  minutes: optionalCount,
  seconds: optionalCount.refine((v) => v == null || v < 60, "Seconds must be 0–59."),
  rounds: optionalCount,
  reps: optionalCount,
  load: optionalLoad,
};
export const scoreSchema = z.object(scoreFields);

export const feedbackFields = {
  rpe: z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v == null || (Number.isInteger(v) && v >= 1 && v <= 10), "RPE must be between 1 and 10."),
  ),
  energy: z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v == null || (Number.isInteger(v) && v >= 1 && v <= 5), "Energy must be between 1 and 5."),
  ),
  soreness: z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v == null || (Number.isInteger(v) && v >= 1 && v <= 5), "Soreness must be between 1 and 5."),
  ),
};

export const feedbackSchema = z.object(feedbackFields);
export type ScoreInput = z.infer<typeof scoreSchema>;

export function buildScore(
  input: ScoreInput,
  workoutType: Enums<"workout_type">,
  units: Units,
): { score: { time_seconds: number | null; rounds: number | null; reps: number | null; load_kg: number | null } } | { error: string } {
  const time = input.minutes != null || input.seconds != null ? (input.minutes ?? 0) * 60 + (input.seconds ?? 0) : null;
  const score = {
    time_seconds: time || null,
    rounds: input.rounds,
    reps: input.reps,
    load_kg: input.load == null ? null : toKg(input.load, units),
  };
  const missing = {
    for_time: !score.time_seconds && "Enter the finish time.",
    amrap: score.rounds == null && score.reps == null && "Enter rounds and/or reps.",
    emom: score.rounds == null && score.reps == null && "Enter rounds completed and/or reps.",
    strength: score.load_kg == null && "Enter the load lifted.",
    other: Object.values(score).every((v) => v == null) && "Enter a score.",
  }[workoutType];

  return missing ? { error: missing } : { score };
}
