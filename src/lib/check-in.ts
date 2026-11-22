import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { addDays } from "@/lib/nutrition";

export const SORENESS_AREAS = ["neck", "shoulders", "upper back", "lower back", "chest", "arms", "wrists", "core", "hips", "glutes", "quads", "hamstrings", "knees", "calves", "ankles/feet"] as const;
export const CHECK_IN_SCALES = {
  sleep_quality: ["Poor", "Fair", "Okay", "Good", "Great"],
  soreness: ["None", "Mild", "Moderate", "Very sore", "Extremely sore"],
  stress: ["Very calm", "Calm", "Moderate", "Stressed", "Very stressed"],
  energy: ["Exhausted", "Low", "Okay", "Good", "Great"],
  mood: ["Very low", "Low", "Okay", "Good", "Great"],
} as const;
export const CHECK_IN_COLUMNS = "athlete_id, entry_on, sleep_hours, sleep_quality, soreness, soreness_areas, stress, energy, mood, readiness, notes";
export type CheckIn = Pick<Tables<"athlete_journal_entries">, "athlete_id" | "entry_on" | "sleep_hours" | "sleep_quality" | "soreness" | "soreness_areas" | "stress" | "energy" | "mood" | "readiness" | "notes">;
export const LOW_READINESS = 40;
export const HIGH_SORENESS = 4;

/** Matches SQL: average six normalized recovery parts, then round 1 + 99 * average. Incomplete inputs have no score. */
export function readinessScore(entry: Pick<CheckIn, "sleep_hours" | "sleep_quality" | "soreness" | "stress" | "energy" | "mood">) {
  const { sleep_hours: h, sleep_quality: q, soreness: s, stress: t, energy: e, mood: m } = entry;
  if (h == null || q == null || s == null || t == null || e == null || m == null) return null;
  return Math.round(1 + 99 * (Math.min(h, 8) / 8 + (q - 1) / 4 + (5 - s) / 4 + (5 - t) / 4 + (e - 1) / 4 + (m - 1) / 4) / 6);
}
export function readinessLabel(score: number | null) {
  return score == null ? "Incomplete" : score < 40 ? "Low" : score < 70 ? "Moderate" : "Good";
}
type AttentionEntry = Pick<CheckIn, "entry_on" | "readiness" | "soreness">;
export function checkInAttention(checkIns: AttentionEntry[], todayIso: string) {
  const recent = checkIns.filter((c) => c.entry_on <= todayIso && (c.readiness != null || c.soreness != null)).sort((a, b) => b.entry_on.localeCompare(a.entry_on));
  const latest = recent[0];
  const reasons: string[] = [];
  if (latest && latest.entry_on >= addDays(todayIso, -1)) {
    if (latest.readiness != null && latest.readiness < LOW_READINESS) reasons.push("Low readiness on the latest check-in");
  }
  if (recent.some((later) => later.entry_on >= addDays(todayIso, -1) && later.soreness != null && later.soreness >= HIGH_SORENESS && recent.some((earlier) => earlier.entry_on === addDays(later.entry_on, -1) && earlier.soreness != null && earlier.soreness >= HIGH_SORENESS))) reasons.push("High soreness on two consecutive days");
  return { flagged: reasons.length > 0, reasons };
}
export async function loadCheckInAttention(supabase: SupabaseClient<Database>, todayIso: string, athleteIds?: string[]) {
  const result = new Map<string, ReturnType<typeof checkInAttention>>();
  for (const id of athleteIds ?? []) result.set(id, { flagged: false, reasons: [] });
  if (athleteIds?.length === 0) return result;
  let query = supabase.from("athlete_journal_entries").select("athlete_id, entry_on, soreness, readiness").gte("entry_on", addDays(todayIso, -2)).lte("entry_on", todayIso);
  if (athleteIds) query = query.in("athlete_id", athleteIds);
  const { data, error } = await query;
  if (error) throw error;
  for (const id of new Set((data ?? []).map((c) => c.athlete_id))) result.set(id, checkInAttention((data ?? []).filter((c) => c.athlete_id === id), todayIso));
  return result;
}
export async function loadRecentCheckIns(supabase: SupabaseClient<Database>, athleteId: string, asOf: string, days: number) {
  if (days <= 0) return [];
  const { data, error } = await supabase.from("athlete_journal_entries").select(CHECK_IN_COLUMNS).eq("athlete_id", athleteId).gte("entry_on", addDays(asOf, 1 - days)).lte("entry_on", asOf).order("entry_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(({ entry_on, notes, sleep_hours, sleep_quality, soreness, soreness_areas, stress, energy, mood, readiness }) => ({ date: entry_on, sleep_hours, sleep_quality, soreness, soreness_areas, stress, energy, mood, readiness, note: notes?.trim().slice(0, 300) || null }));
}
