"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type FormState } from "@/lib/auth/form-state";
import { SORENESS_AREAS } from "@/lib/check-in";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const scale = z.coerce.number().int().min(1).max(5);
const schema = z.object({
  sleep_hours: z.preprocess((v) => v === "" || v == null ? NaN : v, z.coerce.number().min(0).max(24).multipleOf(0.1)),
  sleep_quality: scale, soreness: scale, stress: scale, energy: scale, mood: scale,
  soreness_areas: z.array(z.enum(SORENESS_AREAS)).max(12),
  notes: z.string().trim().max(500).transform((v) => v || null),
});
export async function saveCheckIn(_: FormState, data: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return failure(data, "Only athletes can save a check-in.");
  const parsed = schema.safeParse({ ...Object.fromEntries(data), soreness_areas: data.getAll("soreness_areas") });
  if (!parsed.success) return failure(data, "Complete all six ratings. Sleep must be 0–24 hours, notes at most 500 characters, and at most 12 areas.");
  const entry_on = await getToday();
  const supabase = await createClient();
  const { error } = await supabase.from("athlete_journal_entries").upsert({ ...parsed.data, athlete_id: viewer.athleteId, coach_id: viewer.coachId, entry_on }, { onConflict: "athlete_id,entry_on" });
  if (error) return failure(data, "Couldn't save your check-in. Please try again.");
  revalidatePath("/athlete");
  revalidatePath("/athlete/journal");
  revalidatePath(`/athletes/${viewer.athleteId}`);
  return { message: "Check-in saved." };
}
