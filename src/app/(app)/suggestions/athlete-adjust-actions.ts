"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { athleteAdjustInputSchema, athleteAdjustSchema } from "@/lib/ai/athlete-adjust-schema";
import { scaleWorkoutDetailsSchema } from "@/lib/ai/scale-workout";
import { failure, type FormState } from "@/lib/auth/form-state";
import { notifyScheduleChanged } from "@/lib/notifications";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { toKg, type Units } from "@/lib/units";

const idSchema = z.string().uuid();

async function loadActiveAdjustment(supabase: SupabaseClient<Database>, id: string) {
  const [{ data: suggestion, error }, { data: scaling, error: scalingError }] = await Promise.all([
    supabase.from("ai_suggestions").select("*").eq("id", id).eq("suggestion_type", "athlete_adjust_workout").maybeSingle(),
    supabase.from("athlete_workout_scalings").select("*").eq("athlete_suggestion_id", id).maybeSingle(),
  ]);
  if (error || scalingError) throw error ?? scalingError;
  return { suggestion, scaling };
}

function revalidateAdjustment(id: string, workoutId: string | null, athleteId: string | null) {
  revalidatePath("/", "layout");
  revalidatePath("/settings/ai-history");
  revalidatePath(`/suggestions/${id}`);
  if (workoutId) revalidatePath(`/programs/workouts/${workoutId}`);
  if (athleteId) {
    revalidatePath(`/athletes/${athleteId}`);
    revalidatePath(`/messages/${athleteId}`);
  }
  revalidatePath("/athlete");
}

export async function markAthleteAdjustmentReviewed(_: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return failure(formData, "This adjustment could not be found.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_suggestions")
    .update({ coach_reviewed_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("suggestion_type", "athlete_adjust_workout")
    .is("coach_reviewed_at", null)
    .select("athlete_id, input")
    .maybeSingle();
  if (error) return failure(formData, "Couldn't save. Please try again.");
  if (!data) return failure(formData, "This adjustment was already reviewed.");
  const input = athleteAdjustInputSchema.safeParse(data.input);
  revalidateAdjustment(id.data, input.success ? input.data.workout_id : null, data.athlete_id);
  return { message: "Marked as reviewed." };
}

export async function editAthleteAdjustment(_: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("id"));
  const summary = z.string().trim().min(1).max(600).safeParse(formData.get("summary"));
  if (!id.success) return failure(formData, "This adjustment could not be found.");
  if (!summary.success) return failure(formData, "Enter a summary of 1–600 characters.");

  const supabase = await createClient();
  let loaded: Awaited<ReturnType<typeof loadActiveAdjustment>>;
  try {
    loaded = await loadActiveAdjustment(supabase, id.data);
  } catch {
    return failure(formData, "Couldn't load this adjustment. Please try again.");
  }
  const { suggestion, scaling } = loaded;
  if (!suggestion || !scaling) return failure(formData, "This adjustment is no longer active, so it can't be edited.");
  const input = athleteAdjustInputSchema.safeParse(suggestion.input);
  const details = scaleWorkoutDetailsSchema.safeParse(scaling.details);
  const final = athleteAdjustSchema.safeParse(suggestion.final);
  if (!input.success || !details.success || !final.success)
    return failure(formData, "This adjustment is incomplete and can't be edited. You can undo it instead.");
  const units = input.data.units as Units;

  const movements = [];
  const changes = [];
  for (const [index, movement] of details.data.movements.entries()) {
    const raw = formData.get(`load_${index}`);
    const change = final.data.changes[index];
    if (raw === null || typeof raw !== "string") {
      movements.push(movement);
      if (change) changes.push(change);
      continue;
    }
    const text = raw.trim();
    const load = text ? Number(text) : null;
    if (load != null && (!Number.isFinite(load) || load < 0 || load > 2000))
      return failure(formData, `Enter a valid weight for ${movement.movement_name || `movement ${index + 1}`}.`);
    movements.push({ ...movement, load_kg: load == null ? null : toKg(load, units) });
    if (change) changes.push({ ...change, load });
  }

  const { data: updated, error } = await supabase
    .from("athlete_workout_scalings")
    .update({ modifications: summary.data, details: { ...details.data, movements } as Json })
    .eq("id", scaling.id)
    .eq("athlete_suggestion_id", id.data)
    .select("id")
    .maybeSingle();
  if (error) return failure(formData, "Couldn't save your changes. Please try again.");
  if (!updated) return failure(formData, "This adjustment is no longer active, so it can't be edited.");

  const { error: suggestionError } = await supabase
    .from("ai_suggestions")
    .update({
      status: "edited",
      final: { ...final.data, summary: summary.data.slice(0, 300), changes } as Json,
      coach_reviewed_at: new Date().toISOString(),
    })
    .eq("id", id.data);
  if (suggestionError) console.error("Could not log coach edit of athlete adjustment:", suggestionError);
  await notifyScheduleChanged(supabase, scaling.athlete_id, { action: "updated", date: input.data.scheduled_on });
  revalidateAdjustment(id.data, scaling.workout_id, scaling.athlete_id);
  return { message: "Saved. The athlete now sees your edited version." };
}

export async function undoAthleteAdjustment(_: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return failure(formData, "This adjustment could not be found.");
  const supabase = await createClient();
  let loaded: Awaited<ReturnType<typeof loadActiveAdjustment>>;
  try {
    loaded = await loadActiveAdjustment(supabase, id.data);
  } catch {
    return failure(formData, "Couldn't load this adjustment. Please try again.");
  }
  const { suggestion, scaling } = loaded;
  if (!suggestion || !scaling) return failure(formData, "This adjustment is no longer active.");

  const restore = scaling.coach_modifications != null;
  const { data: changed, error } = restore
    ? await supabase
        .from("athlete_workout_scalings")
        .update({
          modifications: scaling.coach_modifications!,
          details: scaling.coach_details,
          athlete_suggestion_id: null,
          athlete_adjusted_at: null,
          coach_modifications: null,
          coach_details: null,
        })
        .eq("id", scaling.id)
        .eq("athlete_suggestion_id", id.data)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("athlete_workout_scalings")
        .delete()
        .eq("id", scaling.id)
        .eq("athlete_suggestion_id", id.data)
        .select("id")
        .maybeSingle();
  if (error) return failure(formData, "Couldn't undo this adjustment. Please try again.");
  if (!changed) return failure(formData, "This adjustment is no longer active.");

  const { error: suggestionError } = await supabase
    .from("ai_suggestions")
    .update({ status: "rejected", coach_reviewed_at: new Date().toISOString() })
    .eq("id", id.data);
  if (suggestionError) console.error("Could not log undo of athlete adjustment:", suggestionError);
  await notifyScheduleChanged(supabase, scaling.athlete_id, { action: "restored" });
  revalidateAdjustment(id.data, scaling.workout_id, scaling.athlete_id);
  return {
    message: restore
      ? "Undone. The athlete is back to the scaling you gave them."
      : "Undone. The athlete is back to the original WOD.",
  };
}
