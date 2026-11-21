"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, type FormState } from "@/lib/auth/form-state";
import { JOURNAL_LOOKBACK_DAYS } from "@/lib/journal";
import { getToday } from "@/lib/time-zone";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const optionalNumber = (min: number, max: number, message: string, integer: boolean) =>
  z.preprocess(
    (v) => v ?? "",
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine(
        (v) => v == null || (Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v))),
        message,
      ),
  );

const checkbox = z.preprocess((v) => v === "on", z.boolean());

const journalSchema = z.object({
  entry_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  sleep_hours: optionalNumber(0, 24, "Sleep must be between 0 and 24 hours.", false).transform((v) =>
    v == null ? null : Math.round(v * 10) / 10,
  ),
  sleep_quality: optionalNumber(1, 5, "Sleep quality must be between 1 and 5.", true),
  alcohol: checkbox,
  late_caffeine: checkbox,
  hit_water_goal: checkbox,
  late_meal: checkbox,
  screens_in_bed: checkbox,
  mobility: checkbox,
  high_stress: checkbox,
  notes: z.preprocess(
    (v) => v ?? "",
    z.string().trim().max(500, "Notes must be 500 characters or fewer.").transform((v) => v || null),
  ),
});

export async function saveJournalEntry(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = journalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Please check the form.");

  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return failure(formData, "Only athletes can fill in a journal.");

  const todayIso = await getToday();
  const earliest = new Date(`${todayIso}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - JOURNAL_LOOKBACK_DAYS);
  const entry = parsed.data;
  if (entry.entry_on > todayIso || entry.entry_on < earliest.toISOString().slice(0, 10)) {
    return failure(formData, `You can fill in the last ${JOURNAL_LOOKBACK_DAYS} days only.`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("athlete_journal_entries")
    .upsert(
      { ...entry, athlete_id: viewer.athleteId, coach_id: viewer.coachId },
      { onConflict: "athlete_id,entry_on" },
    );
  if (error) return failure(formData, "Couldn't save your journal. Please try again.");

  revalidatePath("/athlete");
  revalidatePath("/athlete/journal");
  revalidatePath(`/athletes/${viewer.athleteId}`);
  return { message: "Journal saved." };
}
