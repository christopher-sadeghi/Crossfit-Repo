import type { SupabaseClient } from "@supabase/supabase-js";

import { foodIdeasSchema, type FoodIdeas } from "@/lib/ai/suggest-food";
import type { Database } from "@/lib/supabase/database.types";

export type LatestFoodIdeas = { id: string; ideas: FoodIdeas; addedNames: string[] } | null;

/** The newest food ideas made for this athlete and day, plus which ones were already logged. */
export async function latestFoodIdeas(supabase: SupabaseClient<Database>, athleteId: string, date: string): Promise<LatestFoodIdeas> {
  const { data } = await supabase
    .from("ai_suggestions")
    .select("id, proposal")
    .eq("athlete_id", athleteId)
    .eq("suggestion_type", "suggest_food")
    .eq("status", "idea")
    .eq("input->>date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const parsed = foodIdeasSchema.safeParse(data?.proposal);
  if (!data || !parsed.success) return null;
  return { id: data.id, ideas: parsed.data, addedNames: await addedIdeaNames(supabase, data.id) };
}

export async function addedIdeaNames(supabase: SupabaseClient<Database>, suggestionId: string) {
  const { data } = await supabase.from("food_logs").select("food_name").eq("ai_suggestion_id", suggestionId);
  return (data ?? []).map((row) => row.food_name);
}
