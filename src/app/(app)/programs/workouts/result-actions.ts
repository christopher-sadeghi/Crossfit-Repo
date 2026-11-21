"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { getCoach } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { toKg } from "@/lib/units";

const count = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v == null || (Number.isInteger(v) && v >= 0 && v <= 100_000), "Rounds and reps must be whole numbers.");

const resultSchema = z.object({
  workout_id: z.string().uuid(),
  athlete_id: z.string().uuid("Choose an athlete."),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  minutes: count,
  seconds: count.refine((v) => v == null || v < 60, "Seconds must be 0–59."),
  rounds: count,
  reps: count,
  load: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v == null || (Number.isFinite(v) && v > 0 && v < 2000), "Load must be a positive number."),
  is_rx: z.enum(["rx", "scaled"], { message: "Choose Rx or Scaled." }),
  notes: z.string().trim().max(500).transform((v) => v || null),
});

export async function logResult(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const r = parsed.data;

  const supabase = await createClient();
  const [{ data: workout }, coach] = await Promise.all([
    supabase.from("workouts").select("workout_type").eq("id", r.workout_id).maybeSingle(),
    getCoach(),
  ]);
  if (!workout) return failure(formData, "That WOD no longer exists.");

  const time = r.minutes != null || r.seconds != null ? (r.minutes ?? 0) * 60 + (r.seconds ?? 0) : null;
  const score = {
    time_seconds: time || null,
    rounds: r.rounds,
    reps: r.reps,
    load_kg: r.load == null ? null : toKg(r.load, coach?.units ?? "lb"),
  };
  const missing = {
    for_time: !score.time_seconds && "Enter the finish time.",
    amrap: score.rounds == null && score.reps == null && "Enter rounds and/or reps.",
    emom: score.rounds == null && score.reps == null && "Enter rounds completed and/or reps.",
    strength: score.load_kg == null && "Enter the load lifted.",
    other: Object.values(score).every((v) => v == null) && "Enter a score.",
  }[workout.workout_type];
  if (missing) return failure(formData, missing);

  const { error } = await supabase.from("workout_results").insert({
    workout_id: r.workout_id,
    athlete_id: r.athlete_id,
    performed_on: r.performed_on,
    ...score,
    is_rx: r.is_rx === "rx",
    notes: r.notes,
  });
  if (error) return failure(formData, "Couldn't save the result. Please try again.");

  revalidatePath(`/programs/workouts/${r.workout_id}`);
  revalidatePath(`/athletes/${r.athlete_id}`);
  return { message: "Result logged." };
}

export async function deleteResult(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("workout_results").delete().eq("id", id).select("workout_id, athlete_id").maybeSingle();
  if (data) {
    revalidatePath(`/programs/workouts/${data.workout_id}`);
    revalidatePath(`/athletes/${data.athlete_id}`);
  }
}
