"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { checkTrainingLoad } from "@/lib/activity-training-warning";
import { failure, type FormState } from "@/lib/auth/form-state";
import { notifyResultLogged } from "@/lib/notifications";
import { buildScore, feedbackFields, scoreFields } from "@/lib/result-score";
import { createClient } from "@/lib/supabase/server";
import { fromKgPrecise } from "@/lib/units";
import { getViewer } from "@/lib/viewer";

const resultSchema = z.object({
  result_id: z.preprocess((v) => (v == null || v === "" ? null : v), z.string().uuid().nullable()),
  workout_id: z.string().uuid(),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  ...scoreFields,
  is_rx: z.enum(["rx", "scaled"], { message: "Choose Rx or Scaled." }),
  notes: z.string().trim().max(500).transform((v) => v || null),
  ...feedbackFields,
  return_to: z.enum(["/athlete", "/athlete/history"]).catch("/athlete/history"),
});

const uuidSchema = z.string().uuid();

function revalidateResultPaths(workoutId: string, athleteId: string) {
  revalidatePath("/athlete");
  revalidatePath("/athlete/history");
  revalidatePath("/athlete/prs");
  revalidatePath(`/programs/workouts/${workoutId}`);
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath("/athletes");
}

async function getAthleteUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return typeof userId === "string" ? userId : null;
}

export async function saveAthleteResult(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");

  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return failure(formData, "Only athletes can save results here.");

  const supabase = await createClient();
  const loggedBy = await getAthleteUserId();
  if (!loggedBy) return failure(formData, "Please log in again to save your result.");

  const r = parsed.data;
  const { data: canView } = await supabase.rpc("athlete_can_view_workout", { p_workout_id: r.workout_id });
  if (!canView) return failure(formData, "That WOD is no longer available.");
  const { data: workout } = await supabase
    .from("workouts")
    .select("workout_type")
    .eq("id", r.workout_id)
    .maybeSingle();
  if (!workout) return failure(formData, "That WOD is no longer available.");

  const scoreResult = buildScore(r, workout.workout_type, viewer.units);
  if ("error" in scoreResult) return failure(formData, scoreResult.error);
  const score = { ...scoreResult.score };
  if (r.result_id && score.load_kg != null) {
    // Keep the stored load when the athlete didn't change the value the edit form showed.
    const { data: existing } = await supabase.from("workout_results").select("load_kg").eq("id", r.result_id).maybeSingle();
    const existingKg = existing?.load_kg == null ? null : Number(existing.load_kg);
    if (existingKg != null && Number(formData.get("load")) === fromKgPrecise(existingKg, viewer.units))
      score.load_kg = existingKg;
  }

  const values = {
    workout_id: r.workout_id,
    athlete_id: viewer.athleteId,
    coach_id: viewer.coachId,
    logged_by: loggedBy,
    performed_on: r.performed_on,
    ...score,
    is_rx: r.is_rx === "rx",
    notes: r.notes,
    rpe: r.rpe,
    energy: r.energy,
    soreness: r.soreness,
  };

  if (r.result_id) {
    const { data, error } = await supabase
      .from("workout_results")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", r.result_id)
      .eq("logged_by", loggedBy)
      .select("workout_id, athlete_id")
      .maybeSingle();
    if (error || !data) return failure(formData, "Couldn't update the result. Please try again.");
    await checkTrainingLoad(supabase, data.athlete_id);
    revalidateResultPaths(data.workout_id, data.athlete_id);
  } else {
    const { data, error } = await supabase
      .from("workout_results")
      .insert(values)
      .select("id, workout_id, athlete_id")
      .maybeSingle();
    if (error || !data) return failure(formData, "Couldn't save the result. Please try again.");
    await Promise.all([notifyResultLogged(supabase, data.athlete_id, data.id), checkTrainingLoad(supabase, data.athlete_id)]);
    revalidateResultPaths(data.workout_id, data.athlete_id);
  }

  redirect(r.return_to === "/athlete" ? `/athlete?saved=${r.workout_id}` : r.return_to);
}

export async function deleteAthleteResult(id: string): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Only athletes can delete results here." };

  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return { error: "That result could not be found." };

  const supabase = await createClient();
  const loggedBy = await getAthleteUserId();
  if (!loggedBy) return { error: "Please log in again to delete your result." };

  const { data, error } = await supabase
    .from("workout_results")
    .delete()
    .eq("id", parsedId.data)
    .eq("logged_by", loggedBy)
    .select("workout_id, athlete_id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't delete the result. Please try again." };

  await checkTrainingLoad(supabase, data.athlete_id);
  revalidateResultPaths(data.workout_id, data.athlete_id);
  return { message: "Result deleted." };
}
