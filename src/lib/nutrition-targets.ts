import { addDays } from "@/lib/nutrition";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NutritionTargetInput = {
  athlete_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  start_date: string;
  notes: string | null;
};

const SAVE_ERROR = "Couldn't save the target. Please try again.";

export async function applyTarget(
  supabase: SupabaseClient<Database>,
  target: NutritionTargetInput,
): Promise<{ id: string } | { error: string }> {
  const { data: current, error: currentError } = await supabase
    .from("nutrition_targets")
    .select("id, start_date")
    .eq("athlete_id", target.athlete_id)
    .is("end_date", null)
    .maybeSingle();

  if (currentError) return { error: SAVE_ERROR };
  if (current && target.start_date < current.start_date)
    return { error: `The new target must start on or after the current one (${current.start_date}).` };

  if (current && target.start_date === current.start_date) {
    const { calories, protein_g, carbs_g, fat_g, notes } = target;
    const { data, error } = await supabase
      .from("nutrition_targets")
      .update({ calories, protein_g, carbs_g, fat_g, notes })
      .eq("id", current.id)
      .select("id")
      .single();
    if (error || !data) return { error: SAVE_ERROR };
    return { id: data.id };
  }

  if (current) {
    const { error } = await supabase
      .from("nutrition_targets")
      .update({ end_date: addDays(target.start_date, -1) })
      .eq("id", current.id);
    if (error) return { error: SAVE_ERROR };
  }

  const { data, error } = await supabase.from("nutrition_targets").insert(target).select("id").single();
  if (error || !data) {
    if (current) await supabase.from("nutrition_targets").update({ end_date: null }).eq("id", current.id);
    return { error: SAVE_ERROR };
  }
  return { id: data.id };
}
