import type { Tables } from "@/lib/supabase/database.types";

export const JOURNAL_LOOKBACK_DAYS = 14;

export const JOURNAL_QUESTIONS = [
  { key: "alcohol", label: "Had alcohol" },
  { key: "late_caffeine", label: "Caffeine after 2pm" },
  { key: "hit_water_goal", label: "Hit water goal" },
  { key: "late_meal", label: "Ate within 2h of bed" },
  { key: "screens_in_bed", label: "Screens in bed" },
  { key: "mobility", label: "Stretching / mobility" },
] as const;

export const JOURNAL_COLUMNS =
  "entry_on, sleep_hours, sleep_quality, notes, alcohol, late_caffeine, hit_water_goal, late_meal, screens_in_bed, mobility";

export type JournalQuestionKey = (typeof JOURNAL_QUESTIONS)[number]["key"];

export const SLEEP_QUALITY_LABELS = ["Poor", "Fair", "Okay", "Good", "Great"] as const;

export type JournalEntry = Pick<
  Tables<"athlete_journal_entries">,
  "entry_on" | "sleep_hours" | "sleep_quality" | "notes" | JournalQuestionKey
>;

export function journalSleepSummary(entry: Pick<JournalEntry, "sleep_hours" | "sleep_quality">) {
  return [
    entry.sleep_hours != null && `Slept ${entry.sleep_hours}h`,
    entry.sleep_quality != null && `Quality ${SLEEP_QUALITY_LABELS[entry.sleep_quality - 1]}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function journalYesAnswers(entry: Pick<JournalEntry, JournalQuestionKey>) {
  return JOURNAL_QUESTIONS.filter((q) => entry[q.key]).map((q) => q.label);
}
