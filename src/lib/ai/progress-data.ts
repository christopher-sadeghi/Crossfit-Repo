import type { SupabaseClient } from "@supabase/supabase-js";

import { loadLiftMaxes } from "@/lib/benchmarks";
import { CHECK_IN_LABELS, loadRecentCheckIns } from "@/lib/check-in";
import { addDays } from "@/lib/nutrition";
import { formatGoalValue, goalProgress, TRACKING_LABELS } from "@/lib/progress";
import { gymOwnerRow } from "@/lib/gym-owner";
import type { Database } from "@/lib/supabase/database.types";
import { getTimeZone } from "@/lib/time-zone";
import { loadMeasurementTrendRows, measurementTrends } from "@/lib/measurements";

/** Shared goal tracking and result data for progress notes and weekly reports. */
export async function loadProgressData(supabase: SupabaseClient<Database>, athleteId: string, asOf: string) {
  const [liftMaxes, coachRows, athlete, goals, metrics, results, timeZone, measurements] = await Promise.all([
    loadLiftMaxes(supabase, athleteId, asOf),
    supabase.from("coaches").select("id, gym_id, units"),
    supabase.from("athletes").select("first_name, experience_level").eq("id", athleteId).single(),
    supabase
      .from("goals")
      .select("id, title, goal_type, movement_id, metric, unit, start_value, target_value, target_date, status, achieved_at, created_at, movements(name)")
      .eq("athlete_id", athleteId)
      .or(`status.eq.active,and(status.eq.achieved,achieved_at.gte.${addDays(asOf, -91)})`)
      .order("target_date", { nullsFirst: false }),
    supabase.from("body_metrics")
      .select("measured_on, weight_kg, body_fat_pct")
      .eq("athlete_id", athleteId)
      .lte("measured_on", asOf)
      .order("measured_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("workout_results")
      .select("id, workout_id, performed_on, created_at, time_seconds, load_kg, reps, rounds, is_rx, workouts(title, workout_type, workout_movements(movement_id))")
      .eq("athlete_id", athleteId)
      .lte("performed_on", asOf)
      .order("performed_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    getTimeZone(),
    loadMeasurementTrendRows(supabase, athleteId, asOf),
  ]);
  for (const response of [coachRows, athlete, goals, metrics, results]) if (response.error) throw response.error;
  const coach = gymOwnerRow(coachRows.data ?? []);
  if (!coach || !athlete.data) throw new Error("Athlete or coach not found.");

  const units = coach.units;
  const data = { metrics: metrics.data ?? [], results: results.data ?? [], liftMaxes };
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const localDate = (stamp: string) => formatter.format(new Date(stamp));
  const goalInputs = (goals.data ?? []).flatMap((goal) => {
    if (localDate(goal.created_at) > asOf) return [];
    const achievedOn = goal.achieved_at ? localDate(goal.achieved_at) : null;
    const achievedByEnd = achievedOn && achievedOn <= asOf;
    if (achievedByEnd && achievedOn < addDays(asOf, -90)) return [];
    const status = goal.status === "achieved" && !achievedByEnd ? "active" : goal.status;
    const progress = goalProgress({ ...goal, status }, data);
    const value = (v: number | null) => v == null ? null : formatGoalValue(Number(v), goal.unit, units);
    return [{
      id: goal.id,
      title: goal.title,
      type: goal.goal_type,
      movement: goal.movements?.name ?? null,
      status,
      achieved_on: achievedByEnd ? achievedOn : null,
      tracked_from: TRACKING_LABELS[progress.tracking],
      start: value(goal.start_value),
      current: value(progress.current),
      target: value(goal.target_value),
      target_date: goal.target_date,
      percent_complete: progress.pct,
      target_met: progress.reached,
    }];
  });
  return { athlete: athlete.data, units, goals: goalInputs, measurementTrends: measurementTrends(measurements, units, asOf), ...data };
}

export const RECOVERY_FIELDS = Object.keys(CHECK_IN_LABELS) as (keyof typeof CHECK_IN_LABELS)[];

export function averageCheckIns(checkIns: Awaited<ReturnType<typeof loadRecentCheckIns>>) {
  return Object.fromEntries(RECOVERY_FIELDS.map((key) => {
    const values = checkIns.flatMap((entry) => entry[key] == null ? [] : [Number(entry[key])]);
    const average = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
    return [key, average];
  })) as Record<(typeof RECOVERY_FIELDS)[number], number | null>;
}
