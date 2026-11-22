"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { approveSuggestionWithClient } from "@/lib/ai/decisions";
import { notifyScheduleChanged, notifySuggestionApproved } from "@/lib/notifications";
import { runSuggestion } from "@/lib/ai/service";
import {
  applyScaleWorkoutLoadEdits,
  deleteWorkoutScalingWithClient,
  scaleWorkoutSchema,
  scaleWorkoutInputSchema,
} from "@/lib/ai/scale-workout";
import { SUGGESTION_REGISTRY } from "@/lib/ai/suggestions";
import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export async function requestScaleSuggestion(_: FormState, formData: FormData): Promise<FormState> {
  const athleteId = idSchema.safeParse(formData.get("athlete_id"));
  const workoutId = idSchema.safeParse(formData.get("workout_id"));
  const rawNote = formData.get("note");
  const note = z.string().trim().max(300).safeParse(typeof rawNote === "string" ? rawNote : "");
  if (!athleteId.success || !workoutId.success)
    return failure(formData, "Choose an athlete and WOD to scale.");
  if (!note.success) return failure(formData, "Keep the note to 300 characters or fewer.");

  const supabase = await createClient();
  const [{ data: athlete }, { data: workout }] = await Promise.all([
    supabase.from("athletes").select("id, status").eq("id", athleteId.data).maybeSingle(),
    supabase.from("workouts").select("id, athlete_id").eq("id", workoutId.data).maybeSingle(),
  ]);
  if (!athlete || !workout) return failure(formData, "This athlete or WOD could not be found.");
  if (workout.athlete_id ? workout.athlete_id !== athlete.id : athlete.status !== "active")
    return failure(formData, "Choose an active athlete assigned to this WOD.");

  const entry = SUGGESTION_REGISTRY.scale_workout;
  if (!entry.buildRequest) return failure(formData, "This suggestion type isn't ready yet.");
  let result: Awaited<ReturnType<typeof runSuggestion>>;
  try {
    const request = await entry.buildRequest(supabase, {
      athleteId: athlete.id,
      workoutId: workout.id,
      request: note.data || null,
    });
    const { schema: generationSchema, ...context } = request;
    result = await runSuggestion({
      type: "scale_workout",
      athleteId: athlete.id,
      ...context,
      schema: entry.proposalSchema,
      generationSchema,
      validate: entry.validate,
    });
  } catch {
    return failure(formData, "The AI couldn't make a suggestion right now. Please try again in a minute.");
  }
  if ("error" in result) return failure(formData, result.error);

  revalidatePath("/suggestions");
  redirect(`/suggestions/${result.id}`);
}

export async function approveScaleSuggestion(_: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("id"));
  const summary = z.string().trim().min(1).max(300).safeParse(formData.get("summary"));
  if (!id.success) return failure(formData, "This suggestion could not be found.");
  if (!summary.success) return failure(formData, "Enter a summary of 1–300 characters.");

  const supabase = await createClient();
  const { data: suggestion, error } = await supabase
    .from("ai_suggestions")
    .select("*")
    .eq("id", id.data)
    .eq("suggestion_type", "scale_workout")
    .eq("status", "pending")
    .maybeSingle();
  if (error) return failure(formData, "Couldn't load this suggestion. Please try again.");
  if (!suggestion) return failure(formData, "This suggestion was already decided.");

  const proposal = scaleWorkoutSchema.safeParse(suggestion.proposal);
  const input = scaleWorkoutInputSchema.safeParse(suggestion.input);
  if (!proposal.success || !input.success) return failure(formData, "This scaling suggestion is incomplete. Ask again.");
  const final = applyScaleWorkoutLoadEdits(proposal.data, input.data, formData, summary.data);
  if ("error" in final) return failure(formData, final.error);
  const result = await approveSuggestionWithClient(supabase, suggestion, final.data);
  if ("error" in result) return failure(formData, result.error);
  if (suggestion.athlete_id) await notifySuggestionApproved(supabase, suggestion.athlete_id, suggestion.id);

  revalidatePath("/suggestions");
  revalidatePath(`/suggestions/${id.data}`);
  revalidatePath(`/programs/workouts/${input.data.workout_id}`);
  revalidatePath(`/athletes/${suggestion.athlete_id}`);
  revalidatePath("/athlete");
  return { message: result.status === "edited" ? "Edited scaling approved." : "Scaling approved." };
}

export async function removeWorkoutScaling(_: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return failure(formData, "This scaling could not be found.");
  const supabase = await createClient();
  try {
    const scaling = await deleteWorkoutScalingWithClient(supabase, id.data);
    if (!scaling) return failure(formData, "This scaling was already removed.");
    await notifyScheduleChanged(supabase, scaling.athlete_id, { action: "restored" });
    revalidatePath(`/programs/workouts/${scaling.workout_id}`);
    revalidatePath(`/athletes/${scaling.athlete_id}`);
    revalidatePath("/athlete");
    return { message: "Scaling removed." };
  } catch {
    return failure(formData, "Couldn't remove this scaling. Please try again.");
  }
}
