"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/lib/auth/form-state";
import { foodPreferencesFormSchema, readPreferences } from "@/lib/food-preferences";
import { MEALS } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

import { matchedAllergies } from "./food-safety";
import { runSuggestion } from "./service";
import { buildFoodRequest, foodIdeasInputSchema, foodIdeasSchema, ideaText, removeAllergens } from "./suggest-food";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const NOT_ALLOWED = "You can't change food for this athlete.";

/** Coaches act for their athletes (RLS checks ownership); athletes only for themselves. */
async function actor(athleteId: string) {
  const viewer = await getViewer();
  if (!idSchema.safeParse(athleteId).success) return null;
  if (viewer?.kind === "coach") return { athleteId, coachId: viewer.id, isAthlete: false };
  if (viewer?.kind === "athlete" && viewer.athleteId === athleteId) return { athleteId, coachId: viewer.coachId, isAthlete: true };
  return null;
}

function revalidateFood(athleteId: string, suggestionId?: string) {
  revalidatePath(`/nutrition/${athleteId}`);
  revalidatePath("/nutrition");
  revalidatePath(`/athletes/${athleteId}`);
  revalidatePath("/athlete/nutrition");
  revalidatePath("/suggestions");
  if (suggestionId) revalidatePath(`/suggestions/${suggestionId}`);
}

export async function saveFoodPreferences(athleteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const who = await actor(athleteId);
  if (!who) return { error: NOT_ALLOWED };
  const parsed = foodPreferencesFormSchema.safeParse({
    diet_type: formData.get("diet_type"),
    allergies: formData.get("allergies") ?? "",
    dislikes: formData.get("dislikes") ?? "",
    cooking_minutes: formData.get("cooking_minutes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const supabase = await createClient();
  const { data: athlete } = await supabase.from("athletes").select("coach_id").eq("id", who.athleteId).maybeSingle();
  if (!athlete) return { error: NOT_ALLOWED };
  const { error } = await supabase
    .from("athlete_food_preferences")
    .upsert({ athlete_id: who.athleteId, coach_id: athlete.coach_id, ...parsed.data }, { onConflict: "athlete_id" });
  if (error) {
    console.error("Could not save food preferences:", error);
    return { error: "Couldn't save the food preferences. Please try again." };
  }
  revalidateFood(who.athleteId);
  return { message: "Food preferences saved." };
}

export async function requestFoodIdeas(athleteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const who = await actor(athleteId);
  if (!who) return { error: NOT_ALLOWED };
  const rawMeal = formData.get("meal");
  const meal = MEALS.find((m) => m === rawMeal) ?? null;
  const today = await getToday();
  const rawDate = dateSchema.safeParse(formData.get("date"));
  // Athletes always plan for today; coaches can plan the day they're looking at.
  const date = !who.isAthlete && rawDate.success ? rawDate.data : today;

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof runSuggestion>>;
  try {
    const { schema: generationSchema, ...request } = await buildFoodRequest(supabase, { athleteId: who.athleteId, date, meal });
    result = await runSuggestion({
      type: "suggest_food",
      athleteId: who.athleteId,
      coachId: who.isAthlete ? who.coachId : undefined,
      ...request,
      schema: foodIdeasSchema,
      generationSchema,
      finalize: removeAllergens,
      successStatus: "idea",
    });
  } catch (error) {
    console.error("Could not request food ideas:", error);
    return { error: "The AI couldn't make a suggestion right now. Please try again in a minute." };
  }
  if ("error" in result) return { error: result.error };
  revalidateFood(who.athleteId, result.id);
  return {};
}

export async function addFoodIdea(suggestionId: string, index: number): Promise<FormState> {
  if (!idSchema.safeParse(suggestionId).success || !Number.isInteger(index) || index < 0) return { error: "This idea couldn't be found." };
  const supabase = await createClient();
  const { data: suggestion } = await supabase
    .from("ai_suggestions")
    .select("id, athlete_id, coach_id, suggestion_type, status, input, proposal")
    .eq("id", suggestionId)
    .maybeSingle();
  if (!suggestion?.athlete_id || suggestion.suggestion_type !== "suggest_food" || suggestion.status !== "idea")
    return { error: "This idea couldn't be found." };
  const who = await actor(suggestion.athlete_id);
  if (!who) return { error: NOT_ALLOWED };

  const proposal = foodIdeasSchema.safeParse(suggestion.proposal);
  const input = foodIdeasInputSchema.safeParse(suggestion.input);
  const idea = proposal.success ? proposal.data.ideas[index] : undefined;
  if (!idea || !input.success) return { error: "This idea couldn't be found." };

  // Check again against today's allergy list, in case it changed since the idea was made.
  const { data: prefsRow } = await supabase
    .from("athlete_food_preferences")
    .select("diet_type, allergies, dislikes, cooking_minutes")
    .eq("athlete_id", suggestion.athlete_id)
    .maybeSingle();
  const hits = matchedAllergies(ideaText(idea), [...new Set([...readPreferences(prefsRow).allergies, ...input.data.allergies])]);
  if (hits.length) return { error: `Not added: this idea may contain ${hits.join(", ")}.` };

  const { data: existing } = await supabase
    .from("food_logs")
    .select("id")
    .eq("ai_suggestion_id", suggestion.id)
    .eq("food_name", idea.name)
    .limit(1);
  if (existing?.length) return { message: "Already in the food log." };

  const { error } = await supabase.from("food_logs").insert({
    athlete_id: suggestion.athlete_id,
    coach_id: suggestion.coach_id,
    logged_on: input.data.date,
    meal: idea.meal,
    food_name: idea.name,
    calories: idea.calories,
    protein_g: idea.protein_g,
    carbs_g: idea.carbs_g,
    fat_g: idea.fat_g,
    ai_suggestion_id: suggestion.id,
  });
  if (error) {
    console.error("Could not add food idea:", error);
    return { error: "Couldn't add this to the food log. Please try again." };
  }
  revalidateFood(suggestion.athlete_id, suggestion.id);
  return { message: `Added to the food log.` };
}

/** Lets athletes remove entries from their own log (coaches use the full nutrition page). */
export async function deleteOwnFood(id: string): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete" || !idSchema.safeParse(id).success) return { error: NOT_ALLOWED };
  const supabase = await createClient();
  const { error } = await supabase.from("food_logs").delete().eq("id", id).eq("athlete_id", viewer.athleteId);
  if (error) return { error: "Couldn't remove this entry. Please try again." };
  revalidateFood(viewer.athleteId);
  return {};
}
