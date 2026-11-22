"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { approveSuggestionWithClient, rejectSuggestionWithClient } from "@/lib/ai/decisions";
import { requestRegisteredSuggestion } from "@/lib/ai/request";
import { runSuggestion } from "@/lib/ai/service";
import { progressSummarySchema } from "@/lib/ai/progress-summary";
import { SUGGESTION_REGISTRY } from "@/lib/ai/suggestions";
import type { SuggestionApplyOptions } from "@/lib/ai/suggestions";
import { failure, type FormState } from "@/lib/auth/form-state";
import { notifySuggestionApproved } from "@/lib/notifications";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { weeklyReportSchema } from "@/lib/weekly-report";

const idSchema = z.string().uuid();
const typeSchema = z.enum(["write_workout", "scale_workout", "adjust_macros", "progress_summary", "weekly_report"]);

function revalidateSuggestion(id: string, athleteId?: string | null) {
  revalidatePath("/suggestions");
  revalidatePath(`/suggestions/${id}`);
  if (athleteId) {
    revalidatePath(`/nutrition/${athleteId}`);
    revalidatePath(`/athletes/${athleteId}`);
    revalidatePath(`/athletes/${athleteId}/progress`);
  }
}

export async function requestSuggestion(type: Enums<"suggestion_type">, athleteId: string): Promise<FormState> {
  const parsedType = typeSchema.safeParse(type);
  const parsedAthleteId = idSchema.safeParse(athleteId);
  if (!parsedType.success || !parsedAthleteId.success) return { error: "Couldn't request an AI suggestion. Please try again." };

  if (parsedType.data === "weekly_report" && (await getViewer())?.kind !== "coach") {
    return { error: "Only a coach can draft a weekly report." };
  }

  const supabase = await createClient();
  const result = await requestRegisteredSuggestion(supabase, parsedType.data, { athleteId: parsedAthleteId.data });
  if ("error" in result) return { error: result.error };

  revalidateSuggestion(result.id, parsedAthleteId.data);
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
    const { schema: generationSchema, ...context } = requestContext;
    result = await runSuggestion({
      type: "write_workout",
      athleteId: null,
      ...context,
      schema: entry.proposalSchema,
      generationSchema,
      validate: entry.validate,
    });
  } catch {
    return failure(formData, "The AI couldn't make a suggestion right now. Please try again in a minute.");
  }
  if ("error" in result) return failure(formData, result.error);

  revalidatePath("/programs/workouts");
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
  const isSummary = suggestion.suggestion_type === "progress_summary";
  const isWeeklyReport = suggestion.suggestion_type === "weekly_report";
  let finalInput: unknown;
  let applyOptions: SuggestionApplyOptions | undefined;
  if (isSummary) {
    const proposal = progressSummarySchema.safeParse(suggestion.proposal);
    if (!proposal.success) return failure(formData, "Couldn't save this summary. Please ask for a new one.");
    const final = progressSummarySchema.safeParse({ ...proposal.data, summary: formData.get("summary") });
    if (!final.success) return failure(formData, "Enter a summary of up to 800 characters.");
    finalInput = final.data;
  } else if (isWeeklyReport) {
    const focus = formData.getAll("focus").filter((point) => typeof point === "string" && point.trim());
    const final = weeklyReportSchema.safeParse({ summary: formData.get("summary"), focus });
    if (!final.success) return failure(formData, "Enter a summary and two or three focus points.");
    finalInput = final.data;
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
  if (suggestion.athlete_id) await notifySuggestionApproved(supabase, suggestion.athlete_id, suggestion.id);

  revalidateSuggestion(suggestion.id, suggestion.athlete_id);
  if (isWorkout) {
    revalidatePath("/programs/workouts");
    const { data: savedSuggestion } = await supabase
      .from("ai_suggestions")
      .select("target_id")
      .eq("id", suggestion.id)
      .maybeSingle();
    if (savedSuggestion?.target_id) {
      revalidatePath(`/programs/workouts/${savedSuggestion.target_id}`);
      if (formData.get("intent") === "edit") redirect(`/programs/workouts/${savedSuggestion.target_id}/edit`);
    }
    return { message: "WOD saved." };
  }
  if (isSummary) return { message: "Saved to the athlete's notes." };
  if (isWeeklyReport) {
    revalidatePath("/athlete/reports");
    return { message: "Weekly report shared with the athlete." };
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
