"use server";

import { z } from "zod";

import type { FormState } from "@/lib/auth/form-state";
import { actor, revalidateFood } from "@/lib/food-actor";
import { MEALS } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";

const id = z.string().uuid();
const date = z.iso.date();
const name = z.string().trim().min(1).max(120);
const macros = {
  calories: z.number().int().min(0).max(10000),
  protein_g: z.number().min(0).max(99999.9),
  carbs_g: z.number().min(0).max(99999.9),
  fat_g: z.number().min(0).max(99999.9),
};
const librarySchema = z.object({
  kind: z.enum(["custom", "meal", "food"]),
  is_favorite: z.boolean(),
  name,
  brand: z.string().trim().max(120).nullable().default(null),
  serving_label: z.string().trim().min(1).max(80),
  ...macros,
  ingredients: z.string().trim().max(2000).nullable().default(null),
  source: z.enum(["custom", "usda", "off", "log"]),
  source_id: z.string().trim().min(1).max(64).nullable().default(null),
}).refine(v => v.kind !== "food" || v.is_favorite, "Database foods must be favorites.");
export type LibraryFoodInput = z.input<typeof librarySchema>;
const logSchema = z.object({ date, meal: z.enum(MEALS), name, serving: z.string().trim().max(120).nullable().default(null), ingredients: z.string().trim().max(2000).nullable().default(null), ...macros });
export type LogFoodInput = z.input<typeof logSchema>;
const denied = { error: "You can't change food for this athlete." };

export async function logFood(athleteId: string, data: LogFoodInput): Promise<FormState> {
  const who = await actor(athleteId);
  if (!who) return denied;
  const parsed = logSchema.safeParse(who.isAthlete ? { ...data, date: await getToday() } : data);
  if (!parsed.success) return { error: "Please check the food, serving and macros." };
  const { name, date, ...food } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("food_logs").insert({ ...food, athlete_id: athleteId, coach_id: who.coachId, food_name: name, logged_on: date });
  if (error) return { error: "Couldn't add the food. Please try again." };
  revalidateFood(athleteId);
  return { message: "Added to the food log." };
}

export async function saveFoodToLibrary(athleteId: string, item: LibraryFoodInput): Promise<FormState> {
  const who = await actor(athleteId);
  if (!who) return denied;
  const parsed = librarySchema.safeParse(item);
  if (!parsed.success) return { error: "Please check the food, serving and macros." };
  const supabase = await createClient();
  const food = parsed.data;
  // PostgREST cannot infer a partial unique index as an upsert conflict target.
  let query = supabase.from("saved_foods").select("id").eq("athlete_id", athleteId);
  query = food.source_id ? query.eq("source", food.source).eq("source_id", food.source_id) : query.is("source_id", null).eq("kind", food.kind).eq("name", food.name).eq("serving_label", food.serving_label);
  if (!food.source_id && food.kind === "food") query = query.eq("calories", food.calories).eq("protein_g", food.protein_g).eq("carbs_g", food.carbs_g).eq("fat_g", food.fat_g);
  const { data: existing, error: readError } = await query.limit(1).maybeSingle();
  if (readError) return { error: "Couldn't save the food. Please try again." };
  const row = { ...food, athlete_id: athleteId, coach_id: who.coachId };
  const result = existing ? await supabase.from("saved_foods").update(row).eq("id", existing.id).select("id").single() : await supabase.from("saved_foods").insert(row);
  if (result.error) {
    if (!existing && food.source_id && result.error.code === "23505") {
      const retry = await supabase.from("saved_foods").update(row).eq("athlete_id", athleteId).eq("source", food.source).eq("source_id", food.source_id).select("id").single();
      if (retry.error) return { error: "Couldn't save the food. Please try again." };
    } else return { error: "Couldn't save the food. Please try again." };
  }
  revalidateFood(athleteId);
  return { message: "Food saved." };
}

export async function setFavorite(savedFoodId: string, on: boolean): Promise<FormState> {
  if (!id.safeParse(savedFoodId).success || !z.boolean().safeParse(on).success) return denied;
  const supabase = await createClient();
  const { data: food } = await supabase.from("saved_foods").select("athlete_id, kind").eq("id", savedFoodId).maybeSingle();
  if (!food || !await actor(food.athlete_id)) return denied;
  const result = food.kind === "food" && !on ? await supabase.from("saved_foods").delete().eq("id", savedFoodId) : await supabase.from("saved_foods").update({ is_favorite: on }).eq("id", savedFoodId);
  if (result.error) return { error: "Couldn't update the favorite. Please try again." };
  revalidateFood(food.athlete_id);
  return {};
}

export async function deleteSavedFood(savedFoodId: string): Promise<FormState> {
  if (!id.safeParse(savedFoodId).success) return denied;
  const supabase = await createClient();
  const { data: food } = await supabase.from("saved_foods").select("athlete_id").eq("id", savedFoodId).maybeSingle();
  if (!food || !await actor(food.athlete_id)) return denied;
  const { error } = await supabase.from("saved_foods").delete().eq("id", savedFoodId);
  if (error) return { error: "Couldn't delete the food. Please try again." };
  revalidateFood(food.athlete_id);
  return {};
}

export async function saveMealFromLog(athleteId: string, day: string, mealName: string, entryIds: string[]): Promise<FormState> {
  const who = await actor(athleteId);
  if (!who) return denied;
  const parsed = z.object({ day: date, name, ids: z.array(id).min(1).max(100) }).safeParse({ day, name: mealName, ids: entryIds });
  if (!parsed.success) return { error: "Choose a date, name and food entries for the meal." };
  const supabase = await createClient();
  const ids = [...new Set(parsed.data.ids)];
  const { data: entries, error } = await supabase.from("food_logs").select("food_name, ingredients, calories, protein_g, carbs_g, fat_g").eq("athlete_id", athleteId).eq("logged_on", day).in("id", ids);
  if (error || !entries || entries.length !== ids.length) return { error: "Some entries couldn't be found for this athlete and date." };
  const totals = entries.reduce((a, e) => ({ calories: a.calories + Number(e.calories), protein_g: a.protein_g + Number(e.protein_g), carbs_g: a.carbs_g + Number(e.carbs_g), fat_g: a.fat_g + Number(e.fat_g) }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  if (totals.calories > 10000) return { error: "This meal exceeds 10,000 calories. Choose fewer food entries and try again." };
  totals.protein_g = Math.round(totals.protein_g * 10) / 10;
  totals.carbs_g = Math.round(totals.carbs_g * 10) / 10;
  totals.fat_g = Math.round(totals.fat_g * 10) / 10;
  return saveFoodToLibrary(athleteId, { ...totals, name: parsed.data.name, kind: "meal", is_favorite: false, serving_label: "1 meal", ingredients: entries.map(e => [e.food_name, e.ingredients].filter(Boolean).join(": ")).join(", ").slice(0, 2000), source: "log" });
}
