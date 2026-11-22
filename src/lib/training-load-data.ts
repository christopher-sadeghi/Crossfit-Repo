import type { SupabaseClient } from "@supabase/supabase-js";

import type { AthleteActivity } from "@/lib/athlete-activities";
import type { Database } from "@/lib/supabase/database.types";
import { gymSessionLoad, loadDate, sessionLoad, summarizeLoad, type LoadSession } from "@/lib/training-load";

type Client = SupabaseClient<Database>;
const PAGE_SIZE = 500;

export async function loadActivities(supabase: Client, athleteId: string, dates?: { from: string; to: string }) {
  const rows: AthleteActivity[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from("athlete_activities").select("*").eq("athlete_id", athleteId);
    if (dates) query = query.gte("performed_on", dates.from).lte("performed_on", dates.to);
    const { data, error } = await query.order("performed_on", { ascending: false })
      .order("created_at", { ascending: false }).order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function loadGymSessions(supabase: Client, athleteId: string, from: string, to: string) {
  const sessions: LoadSession[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from("workout_results")
      .select("performed_on, time_seconds, rpe, workouts(time_cap_seconds, workout_type)")
      .eq("athlete_id", athleteId).gte("performed_on", from).lte("performed_on", to)
      .order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const result of data) {
      sessions.push({ date: result.performed_on, kind: "gym", ...gymSessionLoad(result, result.workouts) });
    }
    if (data.length < PAGE_SIZE) return sessions;
  }
}

export async function loadTrainingLoad(supabase: Client, athleteId: string, asOf: string, weeks = 8) {
  const from = loadDate(asOf, Math.max(weeks * 7, 28) - 1);
  const [activities, gym] = await Promise.all([
    loadActivities(supabase, athleteId, { from, to: asOf }),
    loadGymSessions(supabase, athleteId, from, asOf),
  ]);
  const outside = activities.map((activity): LoadSession => ({
    date: activity.performed_on,
    kind: "outside",
    load: sessionLoad(activity.duration_minutes, activity.rpe),
  }));
  return { ...summarizeLoad([...gym, ...outside], asOf, weeks), activities };
}
