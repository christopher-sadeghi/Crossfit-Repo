"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { getCoach } from "@/lib/coach";
import { buildScore, scoreFields } from "@/lib/result-score";
import { createClient } from "@/lib/supabase/server";

const resultSchema = z.object({
  workout_id: z.string().uuid(),
  athlete_id: z.string().uuid("Choose an athlete."),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  ...scoreFields,
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

  const scoreResult = buildScore(r, workout.workout_type, coach?.units ?? "lb");
  if ("error" in scoreResult) return failure(formData, scoreResult.error);

  const { error } = await supabase.from("workout_results").insert({
    workout_id: r.workout_id,
    athlete_id: r.athlete_id,
    performed_on: r.performed_on,
    ...scoreResult.score,
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
