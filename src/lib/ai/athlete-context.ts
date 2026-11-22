import type { SupabaseClient } from "@supabase/supabase-js";

import { drifting } from "@/lib/consistency";
import { loadConsistency } from "@/lib/consistency-data";
import { addDays, totals } from "@/lib/nutrition";
import type { Database } from "@/lib/supabase/database.types";

export const TRAINING_DAYS = 28;

type FoodRow = Parameters<typeof totals>[0][number];

/** Compact, RLS-scoped attendance and scheduled-day consistency for AI prompts. */
export async function consistencyContext(supabase: SupabaseClient<Database>, athleteId: string, asOf: string) {
  const { data: athlete, error: athleteError } = await supabase.from("athletes").select("coach_id").eq("id", athleteId).single();
  if (athleteError || !athlete) throw athleteError ?? new Error("Athlete not found.");
  const [{ stats, attendance }, { data: coach, error: coachError }] = await Promise.all([
    loadConsistency(supabase, athleteId, asOf),
    supabase.from("coaches").select("drift_days").eq("id", athlete.coach_id).single(),
  ]);
  if (coachError || !coach) throw coachError ?? new Error("Coach not found.");
  const drift = drifting(stats, { driftDays: coach.drift_days });
  return {
    as_of: asOf,
    windows: stats.windows,
    current_streak: stats.currentStreak,
    best_streak: stats.bestStreak,
    days_since_activity: stats.daysSinceActivity,
    last_activity_date: stats.lastActivityDate,
    attendance_count_last_30_days: attendance.filter((row) => row.attended_on >= addDays(asOf, -29) && row.attended_on <= asOf).length,
    drift_days: coach.drift_days,
    drifting: drift.drifting,
    reasons: drift.reasons,
  };
}

/** Average daily intake over the days that have any food logged. */
export function foodAverages(food: FoodRow[]) {
  const days = new Map<string, FoodRow[]>();
  for (const row of food) days.set(row.logged_on, [...(days.get(row.logged_on) ?? []), row]);
  const daily = [...days.values()].map((rows) => totals(rows));
  const n = daily.length;
  const avg = (key: keyof (typeof daily)[number]) =>
    n ? Math.round(daily.reduce((sum, day) => sum + day[key], 0) / n) : null;
  return {
    days_logged: n,
    avg_calories: avg("calories"),
    avg_protein_g: avg("protein"),
    avg_carbs_g: avg("carbs"),
    avg_fat_g: avg("fat"),
  };
}

/** First vs latest weigh-in, oldest first input. */
export function weightTrend(weights: { measured_on: string; weight_kg: number | null }[]) {
  const rows = weights.filter((row) => row.weight_kg != null);
  if (!rows.length) return null;
  const first = rows[0];
  const latest = rows[rows.length - 1];
  const days = Math.round((Date.parse(latest.measured_on) - Date.parse(first.measured_on)) / 86_400_000);
  const change = Number(latest.weight_kg) - Number(first.weight_kg);
  return {
    first: { date: first.measured_on, kg: Number(first.weight_kg) },
    latest: { date: latest.measured_on, kg: Number(latest.weight_kg) },
    weeks_between: Math.round((days / 7) * 10) / 10,
    change_kg: Math.round(change * 10) / 10,
    change_kg_per_week: days >= 7 ? Math.round((change / (days / 7)) * 100) / 100 : null,
  };
}

/** Logged sessions over the last TRAINING_DAYS days. */
export async function trainingVolume(supabase: SupabaseClient<Database>, athleteId: string, asOf: string) {
  const { data, error } = await supabase
    .from("workout_results")
    .select("performed_on, rpe, workouts(workout_type)")
    .eq("athlete_id", athleteId)
    .gte("performed_on", addDays(asOf, -(TRAINING_DAYS - 1)))
    .lte("performed_on", asOf);
  if (error) throw error;
  const rows = data ?? [];
  const rpes = rows.map((row) => row.rpe).filter((rpe): rpe is number => rpe != null);
  const byType: Record<string, number> = {};
  for (const row of rows) {
    const type = row.workouts?.workout_type ?? "other";
    byType[type] = (byType[type] ?? 0) + 1;
  }
  return {
    days: TRAINING_DAYS,
    sessions_logged: rows.length,
    training_days: new Set(rows.map((row) => row.performed_on)).size,
    sessions_per_week: Math.round((rows.length / (TRAINING_DAYS / 7)) * 10) / 10,
    avg_rpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    sessions_by_type: byType,
  };
}
