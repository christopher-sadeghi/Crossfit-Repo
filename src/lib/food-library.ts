import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays } from "@/lib/nutrition";
import type { Database } from "@/lib/supabase/database.types";

export async function loadFoodLibrary(supabase: SupabaseClient<Database>, athleteId: string, today: string) {
  const since = addDays(today, -30);
  const [logs, saved] = await Promise.all([
    supabase.from("food_logs").select("id, food_name, serving, calories, protein_g, carbs_g, fat_g, logged_on, created_at").eq("athlete_id", athleteId).gte("logged_on", since).order("logged_on", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    supabase.from("saved_foods").select("*").eq("athlete_id", athleteId).order("name"),
  ]);
  if (logs.error || saved.error) throw new Error("Couldn't load the food library.");
  const seen = new Set<string>();
  const recent = (logs.data ?? []).filter(row => {
    const key = JSON.stringify([row.food_name.toLowerCase(), row.serving ?? ""]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 15);
  return { recent, saved: saved.data ?? [] };
}
