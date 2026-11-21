"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { approveSuggestionWithClient, rejectSuggestionWithClient } from "@/lib/ai/decisions";
import { runSuggestion } from "@/lib/ai/service";
import { SUGGESTION_REGISTRY } from "@/lib/ai/suggestions";
import type { SuggestionApplyOptions } from "@/lib/ai/suggestions";
import { failure, type FormState } from "@/lib/auth/form-state";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const typeSchema = z.enum(["write_workout", "scale_workout", "adjust_macros", "progress_summary"]);

function revalidateSuggestion(id: string, athleteId?: string | null) {
  revalidatePath("/suggestions");
  revalidatePath(`/suggestions/${id}`);
  if (athleteId) {
    revalidatePath(`/nutrition/${athleteId}`);
    revalidatePath(`/athletes/${athleteId}`);
  }
}

export async function requestSuggestion(type: Enums<"suggestion_type">, athleteId: string): Promise<FormState> {
  const parsedType = typeSchema.safeParse(type);
  const parsedAthleteId = idSchema.safeParse(athleteId);
  if (!parsedType.success || !parsedAthleteId.success) return { error: "Couldn't request an AI suggestion. Please try again." };

  const entry = SUGGESTION_REGISTRY[parsedType.data];
  if (!entry.buildRequest) return { error: "This suggestion type isn't ready yet." };

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof runSuggestion>>;
  try {
    const request = await entry.buildRequest(supabase, { athleteId: parsedAthleteId.data });
    result = await runSuggestion({
      type: parsedType.data,
      athleteId: parsedAthleteId.data,
      ...request,
      schema: entry.proposalSchema,
      validate: entry.validate,
    });
  } catch {
    return { error: "The AI couldn't make a suggestion right now. Please try again in a minute." };
  }
  if ("error" in result) return { error: result.error };

  revalidatePath("/suggestions");
  redirect(`/suggestions/${result.id}`);
}

export async function requestWorkoutSuggestion(_: FormState, formData: FormData): Promise<FormState> {
  const request = z.string().trim().min(3).max(500).safeParse(formData.get("request"));
  const rawWorkoutId = formData.get("workout_id");
  const workoutId = z.union([z.literal(""), z.string().uuid()]).safeParse(typeof rawWorkoutId === "string" ? rawWorkoutId : "");
  if (!request.success) return failure(formData, "Enter a workout request between 3 and 500 characters.");
  if (!workoutId.success) return failure(formData, "This workout could not be found.");

  const entry = SUGGESTION_REGISTRY.write_workout;
  if (!entry.buildRequest) return failure(formData, "This suggestion type isn't ready yet.");

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof runSuggestion>>;
  try {
    const requestContext = await entry.buildRequest(supabase, {
      athleteId: null,
      workoutId: workoutId.data || null,
      request: request.data,
    });
    result = await runSuggestion({
      type: "write_workout",
      athleteId: null,
      ...requestContext,
      schema: entry.proposalSchema,
      validate: entry.validate,
    });
  } catch {
    return failure(formData, "The AI couldn't make a suggestion right now. Please try again in a minute.");
  }
  if ("error" in result) return failure(formData, result.error);

  revalidatePath("/programs/workouts");
  redirect(`/suggestions/${result.id}`);
}

export async function requestScaleSuggestion(_: FormState, formData: FormData): Promise<FormState> {
  const workoutId = idSchema.safeParse(formData.get("workout_id"));
  const athleteId = idSchema.safeParse(formData.get("athlete_id"));
  const scheduledOn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("scheduled_on"));
  const rawRequest = formData.get("request");
  const request = z.string().trim().max(300).safeParse(typeof rawRequest === "string" ? rawRequest : "");
  if (!workoutId.success) return failure(formData, "This workout could not be found.");
  if (!athleteId.success) return failure(formData, "Choose an athlete.");
  if (!scheduledOn.success) return failure(formData, "Choose the date the athlete will do this WOD.");
  if (!request.success) return failure(formData, "Keep the note under 300 characters.");

  const entry = SUGGESTION_REGISTRY.scale_workout;
  if (!entry.buildRequest) return failure(formData, "This suggestion type isn't ready yet.");

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof runSuggestion>>;
  try {
    const requestContext = await entry.buildRequest(supabase, {
      athleteId: athleteId.data,
      workoutId: workoutId.data,
      scheduledOn: scheduledOn.data,
      request: request.data || null,
    });
    result = await runSuggestion({
      type: "scale_workout",
      athleteId: athleteId.data,
      ...requestContext,
      schema: entry.proposalSchema,
      validate: entry.validate,
      normalize: entry.normalize,
    });
  } catch {
    return failure(formData, "The AI couldn't make a suggestion right now. Please try again in a minute.");
  }
  if ("error" in result) return failure(formData, result.error);

  revalidatePath("/suggestions");
  redirect(`/suggestions/${result.id}`);
}

export async function approveSuggestion(_: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return failure(formData, "This suggestion could not be found.");

  const supabase = await createClient();
  const { data: suggestion, error } = await supabase
    .from("ai_suggestions")
    .select("*")
    .eq("id", id.data)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return failure(formData, "Couldn't load this suggestion. Please try again.");
  if (!suggestion) return failure(formData, "This suggestion was already decided.");

  const entry = SUGGESTION_REGISTRY[suggestion.suggestion_type];
  if (!entry.apply) return failure(formData, "This suggestion type isn't ready to approve yet.");
  const isWorkout = suggestion.suggestion_type === "write_workout";
  const isScale = suggestion.suggestion_type === "scale_workout";
  let finalInput: unknown;
  let applyOptions: SuggestionApplyOptions | undefined;
  if (isScale) {
    const proposal = entry.proposalSchema.safeParse(suggestion.proposal);
    if (!proposal.success) return failure(formData, "Couldn't approve this suggestion. Please ask again.");
    finalInput = proposal.data;
  } else if (isWorkout) {
    const proposal = entry.proposalSchema.safeParse(suggestion.proposal);
    if (!proposal.success) return failure(formData, "Couldn't approve this suggestion. Please ask for a new WOD.");
    finalInput = proposal.data;
    const input = z.object({ mode: z.enum(["write", "adjust"]) }).safeParse(suggestion.input);
    if (!input.success) return failure(formData, "This suggestion is missing its workout details.");
    if (input.data.mode === "adjust") {
      const saveAs = z.enum(["update", "new"]).safeParse(formData.get("save_as"));
      if (!saveAs.success) return failure(formData, "Choose whether to update the WOD or save it as a new WOD.");
      applyOptions = { saveAs: saveAs.data };
    }
  } else {
    const values: Record<string, unknown> = Object.fromEntries(formData);
    for (const key of ["calories", "protein_g", "carbs_g", "fat_g"]) {
      if (typeof values[key] === "string" && values[key] !== "") values[key] = Number(values[key]);
    }
    const final = entry.proposalSchema.safeParse(values);
    if (!final.success) return failure(formData, final.error.issues[0]?.message ?? "Please check the suggested values.");
    finalInput = final.data;
  }

  const result = await approveSuggestionWithClient(supabase, suggestion, finalInput, applyOptions);
  if ("error" in result) return failure(formData, result.error);

  revalidateSuggestion(suggestion.id, suggestion.athlete_id);
  if (isWorkout || isScale) {
    revalidatePath("/programs/workouts");
    revalidatePath("/athlete");
    const { data: savedSuggestion } = await supabase
      .from("ai_suggestions")
      .select("target_id")
      .eq("id", suggestion.id)
      .maybeSingle();
    if (savedSuggestion?.target_id) {
      revalidatePath(`/programs/workouts/${savedSuggestion.target_id}`);
      if (formData.get("intent") === "edit") redirect(`/programs/workouts/${savedSuggestion.target_id}/edit`);
    }
    return { message: isScale ? "Scaled WOD saved for this athlete." : "WOD saved." };
  }
  return { message: result.status === "edited" ? "Your edited targets are approved." : "Targets approved." };
}

export async function rejectSuggestion(id: string): Promise<FormState> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "This suggestion could not be found." };

  const supabase = await createClient();
  const { data: suggestion } = await supabase
    .from("ai_suggestions")
    .select("athlete_id")
    .eq("id", parsedId.data)
    .eq("status", "pending")
    .maybeSingle();
  if (!suggestion) return { error: "This suggestion was already decided." };

  const result = await rejectSuggestionWithClient(supabase, parsedId.data);
  if ("error" in result) return { error: result.error };
  revalidateSuggestion(parsedId.data, suggestion.athlete_id);
  return { message: "Suggestion rejected." };
}
