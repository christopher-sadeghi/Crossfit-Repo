"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { addDays, MEALS } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const grams = (label: string) =>
  z.coerce.number({ message: `${label} must be a number.` }).min(0, `${label} can't be negative.`).max(2000, `${label} looks too high.`);

const targetSchema = z.object({
  athlete_id: z.string().uuid(),
  calories: z.coerce.number().int("Calories must be a whole number.").min(500, "Calories must be 500–10,000.").max(10_000, "Calories must be 500–10,000."),
  protein_g: grams("Protein").int("Use whole grams."),
  carbs_g: grams("Carbs").int("Use whole grams."),
  fat_g: grams("Fat").int("Use whole grams."),
  start_date: date,
  notes: z.string().trim().max(500).transform((v) => v || null),
});

function revalidateAthlete(athleteId: string) {
  revalidatePath("/nutrition");
  revalidatePath(`/nutrition/${athleteId}`);
  revalidatePath(`/athletes/${athleteId}`);
}

/** Sets a new current target. The previous one is closed the day before, so it stays in history. */
export async function saveTarget(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = targetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const t = parsed.data;
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("nutrition_targets")
    .select("id, start_date")
    .eq("athlete_id", t.athlete_id)
    .is("end_date", null)
    .maybeSingle();

  if (current && t.start_date < current.start_date)
    return failure(formData, `The new target must start on or after the current one (${current.start_date}).`);

  if (current && t.start_date === current.start_date) {
    const { calories, protein_g, carbs_g, fat_g, notes } = t;
    const { error } = await supabase
      .from("nutrition_targets")
      .update({ calories, protein_g, carbs_g, fat_g, notes })
      .eq("id", current.id);
    if (error) return failure(formData, "Couldn't save the target. Please try again.");
  } else {
    if (current) {
      const { error } = await supabase.from("nutrition_targets").update({ end_date: addDays(t.start_date, -1) }).eq("id", current.id);
      if (error) return failure(formData, "Couldn't save the target. Please try again.");
    }
    const { error } = await supabase.from("nutrition_targets").insert(t);
    if (error) {
      if (current) await supabase.from("nutrition_targets").update({ end_date: null }).eq("id", current.id);
      return failure(formData, "Couldn't save the target. Please try again.");
    }
  }

  revalidateAthlete(t.athlete_id);
  return { message: "Target saved." };
}

const foodSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  athlete_id: z.string().uuid(),
  logged_on: date,
  meal: z.enum(MEALS, { message: "Choose a meal." }),
  food_name: z.string().trim().min(1, "Name the food.").max(120),
  calories: z.coerce.number().int("Calories must be a whole number.").min(0, "Calories can't be negative.").max(10_000),
  protein_g: grams("Protein"),
  carbs_g: grams("Carbs"),
  fat_g: grams("Fat"),
});

export async function saveFood(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = foodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");
  const { id, ...food } = parsed.data;
  const supabase = await createClient();

  const { error } = id
    ? await supabase.from("food_logs").update(food).eq("id", id).select("id").single()
    : await supabase.from("food_logs").insert(food);
  if (error) return failure(formData, "Couldn't save the entry. Please try again.");

  revalidateAthlete(food.athlete_id);
  return { message: id ? "Entry updated." : "Entry added." };
}

export async function deleteFood(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("food_logs").delete().eq("id", id).select("athlete_id").maybeSingle();
  if (data) revalidateAthlete(data.athlete_id);
}
