"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { approveSuggestionWithClient, rejectSuggestionWithClient } from "@/lib/ai/decisions";
import { runSuggestion } from "@/lib/ai/service";
import { SUGGESTION_REGISTRY } from "@/lib/ai/suggestions";
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
    const request = await entry.buildRequest(supabase, parsedAthleteId.data);
    result = await runSuggestion({ type: parsedType.data, athleteId: parsedAthleteId.data, ...request, schema: entry.proposalSchema });
  } catch {
    return { error: "The AI couldn't make a suggestion right now. Please try again in a minute." };
  }
  if ("error" in result) return { error: result.error };

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
  const values: Record<string, unknown> = Object.fromEntries(formData);
  for (const key of ["calories", "protein_g", "carbs_g", "fat_g"]) {
    if (typeof values[key] === "string" && values[key] !== "") values[key] = Number(values[key]);
  }
  const final = entry.proposalSchema.safeParse(values);
  if (!final.success) return failure(formData, final.error.issues[0]?.message ?? "Please check the suggested values.");

  const result = await approveSuggestionWithClient(supabase, suggestion, final.data);
  if ("error" in result) return failure(formData, result.error);

  revalidateSuggestion(suggestion.id, suggestion.athlete_id);
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
