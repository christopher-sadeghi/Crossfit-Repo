import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./supabase/database.types";
import { loadAthleteSchedule } from "./athlete-schedule";
import { computeConsistency, DEFAULT_DRIFT_DAYS, drifting } from "./consistency";
import { addDays } from "./nutrition";

/** Load a year of RLS-scoped activity for either the coach or athlete viewer. */
export async function loadConsistency(
  supabase: SupabaseClient<Database>, athleteId: string, today: string, { closeToday = false } = {},
) {
  const from = addDays(today, -364);
  const [schedule, results, attendance] = await Promise.all([
    loadAthleteSchedule(supabase, athleteId, { from, to: today }, "id,source_workout_id,title,week_number,day_number"),
    supabase.from("workout_results").select("performed_on,workout_id").eq("athlete_id", athleteId).gte("performed_on", from).lte("performed_on", today),
    supabase.from("attendance").select("*").eq("athlete_id", athleteId).gte("attended_on", from).lte("attended_on", today).order("attended_on"),
  ]);
  if (results.error) throw new Error("Couldn't load workout results.", { cause: results.error });
  if (attendance.error) throw new Error("Couldn't load attendance.", { cause: attendance.error });
  return {
    stats: computeConsistency({
      today,
      closeToday,
      scheduled: schedule.map((item) => ({ date: item.date, workoutId: item.workout.id })),
      results: results.data ?? [],
      attendance: attendance.data ?? [],
    }),
    attendance: attendance.data ?? [],
    schedule,
  };
}

export async function loadCoachConsistency(
  supabase: SupabaseClient<Database>,
  coachId: string,
  today: string,
  driftDays?: number,
) {
  if (driftDays === undefined) {
    const { data, error } = await supabase.from("coaches").select("drift_days").eq("id", coachId).single();
    if (error) throw new Error("Couldn't load consistency settings.", { cause: error });
    driftDays = data.drift_days ?? DEFAULT_DRIFT_DAYS;
  }
  const { data, error } = await supabase.from("athletes").select("id,first_name,last_name").eq("coach_id", coachId).eq("status", "active");
  if (error) throw new Error("Couldn't load active athletes.", { cause: error });
  const athletes = [];
  for (let index = 0; index < data.length; index += 10) {
    athletes.push(...await Promise.all(data.slice(index, index + 10).map(async (athlete) => {
      const { stats, schedule } = await loadConsistency(supabase, athlete.id, today);
      return { athlete, stats, schedule, ...drifting(stats, { driftDays }) };
    })));
  }
  return athletes;
}

/** Return only active athletes requiring the coach's attention. */
export async function loadDriftingAthletes(
  ...args: Parameters<typeof loadCoachConsistency>
) {
  return (await loadCoachConsistency(...args)).filter((athlete) => athlete.drifting);
}
