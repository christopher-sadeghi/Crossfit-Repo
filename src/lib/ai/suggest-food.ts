import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { cookingLabel, DIET_LABELS, readPreferences, type FoodPreferences } from "@/lib/food-preferences";
import { MEALS, targetOn, totals, type Meal } from "@/lib/nutrition";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";

import { ideaText, matchedAllergies } from "./food-safety";
import { ALLERGEN_ERROR } from "./service-core";

export const FOOD_DISCLAIMER =
  "Food ideas are general fitness guidance, not medical or dietetic advice. Macros are rough estimates. Always check labels and ingredients for allergies, and talk to a doctor or registered dietitian about medical conditions, eating disorders, pregnancy, or other health concerns.";

const IDEA_COUNT = 3;

const foodIdeaSchema = z.object({
  name: z.string().trim().min(2).max(80),
  meal: z.enum(MEALS),
  description: z.string().trim().min(1).max(240),
  ingredients: z.array(z.string().trim().min(1).max(60)).min(1).max(15),
  prep_minutes: z.number().int().min(0).max(240),
  calories: z.number().min(0).max(3000),
  protein_g: z.number().min(0).max(300),
  carbs_g: z.number().min(0).max(400),
  fat_g: z.number().min(0).max(200),
});
export type FoodIdea = z.infer<typeof foodIdeaSchema>;

const generatedSchema = z.object({
  ideas: z.array(foodIdeaSchema).min(1).max(5),
  note: z.string().trim().max(300),
});

export const foodIdeasSchema = generatedSchema.extend({
  /** Ideas dropped after the AI answered because they matched an allergy. */
  removed: z.array(z.object({ name: z.string(), allergies: z.array(z.string()) })).max(10).optional(),
});
export type FoodIdeas = z.infer<typeof foodIdeasSchema>;

const macrosSchema = z.object({ calories: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() });
export const foodIdeasInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: z.enum(MEALS).nullable(),
  allergies: z.array(z.string()),
  target: macrosSchema.nullable(),
  eaten: macrosSchema,
  remaining: macrosSchema.nullable(),
});

/** Constrains meal type to what was asked for, so the model can't drift. */
function generationSchema(meal: Meal | null) {
  if (!meal) return generatedSchema;
  return generatedSchema.extend({ ideas: z.array(foodIdeaSchema.extend({ meal: z.literal(meal) })).min(1).max(5) });
}

const SYSTEM = `You suggest meal and snack ideas for one CrossFit athlete. They are ideas only; nothing is logged unless someone taps to add one.
Rules:
- Suggest exactly ${IDEA_COUNT} different, realistic ideas made from common supermarket foods.
- Fit the remaining macros for the day. A single meal should use roughly a third to a half of what's left; a snack should be small (usually 100–300 kcal). If almost nothing is left, suggest light, high-protein options. If no target is set, size portions for the athlete's goals.
- Give approximate calories, protein, carbs and fat for each idea's portion. Make calories roughly match 4×protein + 4×carbs + 9×fat.
- NEVER include any allergy food, or anything made from it (for example, no pesto or satay for nut allergies, no soy sauce for wheat or soy allergies). List every ingredient, including sauces and oils.
- Respect the diet type, avoid disliked foods, and keep prep_minutes within the cooking time available.
- Name each idea plainly with its portion (e.g. "Chicken & rice bowl (150 g chicken)"). The description is one short sentence on how to make it.
- The note is one plain-English sentence on how the ideas fit the day. This is not medical advice; never diagnose.`;

type BuildParams = { athleteId: string | null; date?: string; meal?: string | null };

export async function buildFoodRequest(supabase: SupabaseClient<Database>, { athleteId, date: requestedDate, meal: requestedMeal }: BuildParams) {
  if (!athleteId) throw new Error("Athlete not found.");
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : await getToday();
  const meal = MEALS.find((m) => m === requestedMeal) ?? null;

  const [{ data: athlete, error: athleteError }, { data: prefsRow, error: prefsError }, { data: targets, error: targetError }, { data: food, error: foodError }, { data: goals, error: goalsError }] =
    await Promise.all([
      supabase.from("athletes").select("id").eq("id", athleteId).maybeSingle(),
      supabase.from("athlete_food_preferences").select("diet_type, allergies, dislikes, cooking_minutes").eq("athlete_id", athleteId).maybeSingle(),
      supabase.from("nutrition_targets").select("calories, protein_g, carbs_g, fat_g, start_date, end_date").eq("athlete_id", athleteId),
      supabase.from("food_logs").select("food_name, meal, logged_on, calories, protein_g, carbs_g, fat_g").eq("athlete_id", athleteId).eq("logged_on", date),
      supabase.from("goals").select("title, goal_type, target_value, unit, target_date").eq("athlete_id", athleteId).eq("status", "active"),
    ]);
  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  for (const error of [prefsError, targetError, foodError, goalsError]) if (error) throw error;

  const prefs = readPreferences(prefsRow);
  const target = targetOn(targets ?? [], date);
  const sum = totals(food ?? []);
  const eaten = { calories: Math.round(sum.calories), protein_g: Math.round(sum.protein), carbs_g: Math.round(sum.carbs), fat_g: Math.round(sum.fat) };
  const targetMacros = target ? { calories: target.calories, protein_g: Number(target.protein_g), carbs_g: Number(target.carbs_g), fat_g: Number(target.fat_g) } : null;
  const remaining = targetMacros
    ? {
        calories: Math.max(0, targetMacros.calories - eaten.calories),
        protein_g: Math.max(0, targetMacros.protein_g - eaten.protein_g),
        carbs_g: Math.max(0, targetMacros.carbs_g - eaten.carbs_g),
        fat_g: Math.max(0, targetMacros.fat_g - eaten.fat_g),
      }
    : null;

  const input = { date, meal, allergies: prefs.allergies, target: targetMacros, eaten, remaining } satisfies z.infer<typeof foodIdeasInputSchema>;
  const context = {
    meal_wanted: meal ?? "any meal or snack that fits",
    daily_target: targetMacros ?? "no target set",
    eaten_so_far: eaten,
    remaining_today: remaining ?? "unknown (no target set)",
    already_logged_today: (food ?? []).map((f) => `${f.meal}: ${f.food_name}`),
    goals: (goals ?? []).map((g) => ({ title: g.title, type: g.goal_type, target: g.target_value == null ? null : `${g.target_value}${g.unit ? ` ${g.unit}` : ""}`, by: g.target_date })),
    preferences: preferenceContext(prefs),
  };

  return {
    input: input as Json,
    system: SYSTEM,
    prompt: `Athlete data (JSON):\n${JSON.stringify(context)}`,
    schema: generationSchema(meal),
  };
}

function preferenceContext(prefs: FoodPreferences) {
  return {
    diet_type: DIET_LABELS[prefs.diet_type],
    allergies_never_include: prefs.allergies.length ? prefs.allergies : "none",
    dislikes_avoid: prefs.dislikes.length ? prefs.dislikes : "none",
    cooking_time: prefs.cooking_minutes === 0 ? "no cooking at all (assemble only)" : cookingLabel(prefs.cooking_minutes),
  };
}

export { ideaText };

/** Checks the AI's answer against the allergies: unsafe ideas are dropped, never shown. */
export function removeAllergens(proposal: z.infer<typeof generatedSchema>, input: Json): FoodIdeas {
  const { allergies } = foodIdeasInputSchema.parse(input);
  const removed: NonNullable<FoodIdeas["removed"]> = [];
  const ideas = proposal.ideas.filter((idea) => {
    const hits = matchedAllergies(ideaText(idea), allergies);
    if (hits.length) removed.push({ name: idea.name, allergies: hits });
    return hits.length === 0;
  });
  if (!ideas.length) throw new Error(ALLERGEN_ERROR);
  return {
    note: proposal.note,
    ideas: ideas.map((idea) => ({
      ...idea,
      calories: Math.round(idea.calories),
      protein_g: Math.round(idea.protein_g),
      carbs_g: Math.round(idea.carbs_g),
      fat_g: Math.round(idea.fat_g),
    })),
    ...(removed.length ? { removed: removed.slice(0, 10) } : {}),
  };
}

export const suggestFoodEntry = { label: "Food ideas", proposalSchema: foodIdeasSchema, buildRequest: buildFoodRequest };
