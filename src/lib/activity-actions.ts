"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActivityActor } from "@/lib/activity-actor";
import { checkTrainingLoad } from "@/lib/activity-training-warning";
import { ACTIVITY_TYPES, toActivityMeters } from "@/lib/athlete-activities";
import { failure, type FormState } from "@/lib/auth/form-state";
import { getToday } from "@/lib/time-zone";
import type { AssistantCardIdentity } from "@/lib/ai/assistant-card-actions";

const schema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES, { message: "Choose an activity type." }),
  custom_label: z.string().trim().transform((value) => value || null),
  performed_on: z.iso.date("Choose a valid date."),
  duration_minutes: z.coerce.number().int().min(1).max(1440),
  rpe: z.coerce.number().int().min(1).max(10),
  distance: z.preprocess((value) => value === "" ? null : value, z.coerce.number().positive().nullable()),
  notes: z.string().trim().max(500).transform((value) => value || null),
  source: z.enum(["manual", "ai"]),
});

function refreshViews(athleteId: string) {
  revalidatePath("/");
  revalidatePath("/athlete");
  revalidatePath("/athlete/history");
  revalidatePath(`/athletes/${athleteId}`);
}

export async function saveActivity(athleteId: string, activityId: string | null, _: FormState, formData: FormData, card?: AssistantCardIdentity): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, "Check the date, activity type, duration (1–1440 min), RPE (1–10), distance, and notes (up to 500 characters).");
  if (activityId !== null && !z.uuid().safeParse(activityId).success) return { error: "Activity not found." };
  if (card && activityId) return { error: "An assistant draft can only create a new activity." };
  const actor = await getActivityActor(athleteId);
  if (!actor) return { error: "You don't have access to this athlete's activity log." };
  const { distance, source, ...fields } = parsed.data;
  const distance_m = distance === null ? null : toActivityMeters(distance, actor.units);
  if (distance_m !== null && !Number.isFinite(distance_m)) return failure(formData, "Enter a valid distance.");
  const { supabase, coachId } = actor;
  const today = await getToday();
  if (fields.performed_on > today) return failure(formData, "Choose today or an earlier date.");
  const values = { ...fields, distance_m };
  const completion = card ? await supabase.rpc("complete_athlete_ai_card", {
    p_message_id: card.assistantMessageId, p_card_index: card.cardIndex, p_action: "saved", p_values: values,
  }) : null;
  const query = completion ? null : activityId
    ? supabase.from("athlete_activities").update(values).eq("id", activityId).eq("athlete_id", athleteId)
    : supabase.from("athlete_activities").insert({ ...values, athlete_id: athleteId, coach_id: coachId, source });
  const { data, error } = completion ? { data: completion.data?.[0] ? { id: completion.data[0].ref_id } : null, error: completion.error }
    : await query!.select("id").maybeSingle();
  if (error || !data) return failure(formData, "Couldn't save the activity. Please try again.");
  if (completion?.data?.[0]?.already_completed) return { message: "Already saved." };
  await checkTrainingLoad(supabase, athleteId, today);
  refreshViews(athleteId);
  if (card) revalidatePath("/athlete/assistant");
  return { message: "Activity saved." };
}

export async function deleteActivity(athleteId: string, activityId: string): Promise<FormState> {
  if (!z.uuid().safeParse(activityId).success) return { error: "Activity not found." };
  const actor = await getActivityActor(athleteId);
  if (!actor) return { error: "You don't have access to this athlete's activity log." };
  const { supabase } = actor;
  const { data, error } = await supabase.from("athlete_activities").delete()
    .eq("id", activityId).eq("athlete_id", athleteId).select("id").maybeSingle();
  if (error || !data) return { error: "Couldn't delete the activity. Please try again." };
  await checkTrainingLoad(supabase, athleteId);
  refreshViews(athleteId);
  return { message: "Activity deleted." };
}
