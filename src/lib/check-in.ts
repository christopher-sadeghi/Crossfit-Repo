import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays } from "@/lib/nutrition";
import type { Database, Tables } from "@/lib/supabase/database.types";

export const SORENESS_AREAS = [
  "neck", "shoulders", "upper back", "lower back", "chest", "arms", "wrists", "core",
  "hips", "glutes", "quads", "hamstrings", "knees", "calves", "ankles/feet",
] as const;

export const CHECK_IN_SCALES = {
  sleep_quality: ["Poor", "Fair", "Okay", "Good", "Great"],
  soreness: ["None", "Mild", "Moderate", "Very sore", "Extremely sore"],
  stress: ["Very calm", "Calm", "Moderate", "Stressed", "Very stressed"],
  energy: ["Exhausted", "Low", "Okay", "Good", "Great"],
  mood: ["Very low", "Low", "Okay", "Good", "Great"],
} as const;

export const CHECK_IN_LABELS = {
  readiness: "Readiness",
  sleep_hours: "Sleep (h)",
  sleep_quality: "Sleep quality",
  soreness: "Soreness",
  stress: "Stress",
  energy: "Energy",
  mood: "Mood",
} as const;

export const CHECK_IN_COLUMNS =
  "athlete_id, entry_on, sleep_hours, sleep_quality, soreness, soreness_areas, stress, energy, mood, readiness, notes";

export type CheckIn = Pick<
  Tables<"athlete_journal_entries">,
  | "athlete_id"
  | "entry_on"
  | "sleep_hours"
  | "sleep_quality"
  | "soreness"
  | "soreness_areas"
  | "stress"
  | "energy"
  | "mood"
  | "readiness"
  | "notes"
>;

export const LOW_READINESS = 40;
export const HIGH_SORENESS = 4;

/** Matches SQL: average six normalized recovery parts, then round 1 + 99 * average. Incomplete inputs have no score. */
export function readinessScore(
  entry: Pick<CheckIn, "sleep_hours" | "sleep_quality" | "soreness" | "stress" | "energy" | "mood">,
) {
  const { sleep_hours, sleep_quality, soreness, stress, energy, mood } = entry;
  if (sleep_hours == null || sleep_quality == null || soreness == null || stress == null || energy == null || mood == null) {
    return null;
  }
  const parts = [
    Math.min(sleep_hours, 8) / 8,
    (sleep_quality - 1) / 4,
    (5 - soreness) / 4,
    (5 - stress) / 4,
    (energy - 1) / 4,
    (mood - 1) / 4,
  ];
  return Math.round(1 + 99 * parts.reduce((sum, part) => sum + part, 0) / parts.length);
}

export function readinessLabel(score: number | null) {
  return score == null ? "Incomplete" : score < 40 ? "Low" : score < 70 ? "Moderate" : "Good";
}

type AttentionEntry = Pick<CheckIn, "entry_on" | "readiness" | "soreness">;

export function checkInAttention(checkIns: AttentionEntry[], todayIso: string) {
  const recent = checkIns
    .filter((entry) => entry.entry_on <= todayIso && (entry.readiness != null || entry.soreness != null))
    .sort((a, b) => b.entry_on.localeCompare(a.entry_on));
  const latest = recent[0];
  const yesterday = addDays(todayIso, -1);
  const reasons: string[] = [];

  if (latest && latest.entry_on >= yesterday && latest.readiness != null && latest.readiness < LOW_READINESS) {
    reasons.push("Low readiness on the latest check-in");
  }
  const consecutiveSoreness = recent.some((later) =>
    later.entry_on >= yesterday &&
    later.soreness != null &&
    later.soreness >= HIGH_SORENESS &&
    recent.some((earlier) =>
      earlier.entry_on === addDays(later.entry_on, -1) &&
      earlier.soreness != null &&
      earlier.soreness >= HIGH_SORENESS,
    ),
  );
  if (consecutiveSoreness) reasons.push("High soreness on two consecutive days");

  return { flagged: reasons.length > 0, reasons };
}

export async function loadCheckInAttention(
  supabase: SupabaseClient<Database>,
  todayIso: string,
  athleteIds?: string[],
) {
  const result = new Map<string, ReturnType<typeof checkInAttention>>();
  for (const id of athleteIds ?? []) {
    result.set(id, { flagged: false, reasons: [] });
  }
  if (athleteIds?.length === 0) return result;

  let query = supabase
    .from("athlete_journal_entries")
    .select("athlete_id, entry_on, soreness, readiness")
    .gte("entry_on", addDays(todayIso, -2))
    .lte("entry_on", todayIso);
  if (athleteIds) query = query.in("athlete_id", athleteIds);

  const { data, error } = await query;
  if (error) throw error;
  for (const id of new Set((data ?? []).map((entry) => entry.athlete_id))) {
    const entries = (data ?? []).filter((entry) => entry.athlete_id === id);
    result.set(id, checkInAttention(entries, todayIso));
  }
  return result;
}

export async function loadRecentCheckIns(
  supabase: SupabaseClient<Database>,
  athleteId: string,
  asOf: string,
  days: number,
) {
  if (days <= 0) return [];
  const { data, error } = await supabase
    .from("athlete_journal_entries")
    .select(CHECK_IN_COLUMNS)
    .eq("athlete_id", athleteId)
    .gte("entry_on", addDays(asOf, 1 - days))
    .lte("entry_on", asOf)
    .order("entry_on", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((entry) => ({
    date: entry.entry_on,
    sleep_hours: entry.sleep_hours,
    sleep_quality: entry.sleep_quality,
    soreness: entry.soreness,
    soreness_areas: entry.soreness_areas,
    stress: entry.stress,
    energy: entry.energy,
    mood: entry.mood,
    readiness: entry.readiness,
    note: entry.notes?.trim().slice(0, 300) || null,
  }));
}
