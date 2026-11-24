import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { toKg } from "@/lib/units";
import type { AthleteViewer } from "@/lib/viewer";
import type { AthleteAccountChange } from "./account-change";

export function accountChangeTopic(change: AthleteAccountChange): "training" | "nutrition" {
  return change.kind === "food_preferences" || change.kind === "macros" ? "nutrition" : "training";
}

export async function snapshotAthleteAccountChange(
  client: SupabaseClient<Database>,
  viewer: AthleteViewer,
  change: AthleteAccountChange,
  today: string,
  timeZone: string,
) {
  if (change.kind === "goal") {
    if (change.action === "create") {
      const { count, error } = await client.from("goals").select("id", { count: "exact", head: true })
        .eq("athlete_id", viewer.athleteId).eq("status", "active");
      if (error) throw error;
      return { active_goal_count: count ?? 0 };
    }
    const { data, error } = await client.from("goals")
      .select("id, title, goal_type, target_value, unit, target_date, status")
      .eq("id", change.goal_id!).eq("athlete_id", viewer.athleteId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("That goal is no longer available.");
    return { goal: data };
  }
  if (change.kind === "injuries") {
    const { data, error } = await client.from("athletes").select("injuries").eq("id", viewer.athleteId).maybeSingle();
    if (error) throw error;
    return { injuries: data?.injuries ?? null };
  }
  if (change.kind === "body_weight") {
    if (toKg(change.value, viewer.units) >= 1000) throw new Error("Enter a body weight below 1,000 kg.");
    const { data, error } = await client.from("body_metrics").select("weight_kg, measured_on")
      .eq("athlete_id", viewer.athleteId).not("weight_kg", "is", null)
      .order("measured_on", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return { weight_kg: data?.weight_kg ?? null, measured_on: data?.measured_on ?? null, units: viewer.units };
  }
  if (change.kind === "food_preferences") {
    const { data, error } = await client.from("athlete_food_preferences")
      .select("diet_type, allergies, dislikes, cooking_minutes").eq("athlete_id", viewer.athleteId).maybeSingle();
    if (error) throw error;
    return data ?? { diet_type: "none", allergies: [], dislikes: [], cooking_minutes: null };
  }
  if (change.kind === "reminder_time") {
    const { data, error } = await client.from("check_in_reminders").select("remind_at, time_zone")
      .eq("athlete_id", viewer.athleteId).maybeSingle();
    if (error) throw error;
    return data ?? { remind_at: null, time_zone: timeZone };
  }
  const { data, error } = await client.from("nutrition_targets")
    .select("id, calories, protein_g, carbs_g, fat_g, start_date, end_date, notes")
    .eq("athlete_id", viewer.athleteId).lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`).maybeSingle();
  if (error) throw error;
  return { target: data ?? null };
}
