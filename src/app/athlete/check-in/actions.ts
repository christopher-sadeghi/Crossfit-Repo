"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { checkTrainingLoad } from "@/lib/activity-training-warning";
import { failure, type FormState } from "@/lib/auth/form-state";
import { isCheckIn, LOW_READINESS, readinessScore, SORENESS_AREAS } from "@/lib/check-in";
import { notifyLowReadiness } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const scale = z.coerce.number().int().min(1).max(5);
const optionalScale = z.preprocess(
  (value) => value === "" || value == null ? undefined : value,
  scale.optional().transform((value) => value ?? null),
);
const optionalSleepHours = z.preprocess(
  (value) => value === "" || value == null ? undefined : value,
  z.coerce.number().min(0).max(24)
    .transform((value) => Math.round(value * 10) / 10)
    .optional()
    .transform((value) => value ?? null),
);
const schema = z.object({
  sleep_hours: optionalSleepHours,
  sleep_quality: optionalScale,
  soreness: optionalScale,
  stress: optionalScale,
  energy: optionalScale,
  mood: optionalScale,
  soreness_areas: z.array(z.enum(SORENESS_AREAS)).max(12),
  notes: z.preprocess(
    (value) => value == null ? "" : value,
    z.string().trim().max(500).transform((value) => value || null),
  ),
});

export async function saveCheckIn(_: FormState, data: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return failure(data, "Only athletes can save a check-in.");

  const parsed = schema.safeParse({
    ...Object.fromEntries(data),
    soreness_areas: data.getAll("soreness_areas"),
  });
  if (!parsed.success) {
    return failure(data, "Check your answers: sleep must be 0–24 hours, ratings 1–5, notes at most 500 characters, and at most 12 areas.");
  }
  if (!isCheckIn(parsed.data)) return failure(data, "Fill in at least one answer, or tap Skip today.");

  const entry_on = await getToday();
  if (data.get("expected_date") !== entry_on) {
    return failure(data, "A new day has started — reload to do today's check-in.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("athlete_journal_entries")
    .upsert(
      { ...parsed.data, athlete_id: viewer.athleteId, coach_id: viewer.coachId, entry_on },
      { onConflict: "athlete_id,entry_on" },
    );
  if (error) return failure(data, "Couldn't save your check-in. Please try again.");
  const { error: skipError } = await supabase.from("check_in_skips").delete()
    .eq("athlete_id", viewer.athleteId).eq("skipped_on", entry_on);
  if (skipError) return failure(data, "Check-in saved, but couldn't clear today's skip. Please try again.");
  if ((readinessScore(parsed.data) ?? 100) < LOW_READINESS) {
    await Promise.all([
      notifyLowReadiness(supabase, viewer.athleteId, entry_on),
      checkTrainingLoad(supabase, viewer.athleteId, entry_on),
    ]);
  }

  revalidatePath("/athlete");
  revalidatePath("/athlete/journal");
  revalidatePath(`/athletes/${viewer.athleteId}`);
  return { message: "Check-in saved." };
}

export async function setCheckInSkipped(expectedDate: string, skipped: boolean): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Only athletes can skip a check-in." };
  const today = await getToday();
  if (expectedDate !== today) return { error: "A new day has started — reload to do today's check-in." };
  if (typeof skipped !== "boolean") return { error: "Invalid skip preference." };
  const supabase = await createClient();
  const { error } = skipped
    ? await supabase.from("check_in_skips").upsert({ athlete_id: viewer.athleteId, skipped_on: today }, { onConflict: "athlete_id,skipped_on", ignoreDuplicates: true })
    : await supabase.from("check_in_skips").delete().eq("athlete_id", viewer.athleteId).eq("skipped_on", today);
  if (error) return { error: "Couldn't update today's skip. Please try again." };
  revalidatePath("/athlete");
  return {};
}
