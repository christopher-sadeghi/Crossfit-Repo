"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MEASUREMENT_SITES, PHOTO_POSES, PROGRESS_PHOTO_BUCKET, progressDateSchema } from "@/lib/measurements";
import { progressAccess } from "@/lib/progress-access";
import { getToday } from "@/lib/time-zone";
import { toCm } from "@/lib/units";

export type ProgressResult = { error?: string; message?: string; saved?: boolean };

function refresh(athleteId: string) {
  revalidatePath(`/athletes/${athleteId}/progress`);
  revalidatePath("/athlete/progress");
}

async function perform(work: () => Promise<ProgressResult>): Promise<ProgressResult> {
  try { return await work(); } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : "Something went wrong. Please try again." };
  }
}

export async function saveMeasurements(athleteId: string, date: string, values: Record<string, string>) {
  return perform(async () => {
    const { supabase, viewer, athlete } = await progressAccess(athleteId);
    progressDateSchema(await getToday()).parse(date);
    const entries = Object.entries(z.record(z.string(), z.string()).parse(values)).filter(([, value]) => value.trim() !== "");
    if (!entries.length) return { error: "Enter at least one measurement." };
    const rows = entries.map(([site, value]) => {
      z.enum(MEASUREMENT_SITES).parse(site);
      const number = z.coerce.number().finite().positive("Measurements must be positive.").parse(value);
      const value_cm = toCm(number, viewer.units);
      if (value_cm <= 0 || value_cm >= 400) throw new Error("Measurements must be greater than 0 and less than 400 cm (157.5 in).");
      return { coach_id: athlete.coach_id, athlete_id: athleteId, measured_on: date, site, value_cm };
    });
    const { error } = await supabase.from("body_measurements").upsert(rows, { onConflict: "athlete_id,measured_on,site" });
    if (error) throw new Error("Couldn't save your measurements. Please try again.");
    refresh(athleteId);
    return { message: "Measurements saved." };
  });
}

export async function deleteMeasurement(athleteId: string, id: string) {
  return perform(async () => {
    const { supabase } = await progressAccess(athleteId);
    z.uuid().parse(id);
    const { error } = await supabase.from("body_measurements").delete().eq("athlete_id", athleteId).eq("id", id);
    if (error) throw new Error("Couldn't delete the measurement.");
    refresh(athleteId);
    return { message: "Measurement deleted." };
  });
}

export async function saveProgressPhoto(athleteId: string, date: string, pose: string, path: string) {
  return perform(async () => {
    const { supabase, athlete } = await progressAccess(athleteId);
    progressDateSchema(await getToday()).parse(date);
    z.enum(PHOTO_POSES).parse(pose);
    const prefix = `${athlete.coach_id}/${athleteId}/`;
    if (!path.startsWith(prefix) || !z.uuid().safeParse(path.slice(prefix.length, -4)).success || !path.endsWith(".jpg")) throw new Error("Invalid photo path.");
    const bucket = supabase.storage.from(PROGRESS_PHOTO_BUCKET);
    const { data: object, error: objectError } = await bucket.info(path);
    if (objectError || !object || object.contentType !== "image/jpeg") throw new Error("Upload a JPEG photo before saving.");
    const { data: old, error: readError } = await supabase.from("progress_photos").select("id, storage_path")
      .eq("athlete_id", athleteId).eq("taken_on", date).eq("pose", pose).maybeSingle();
    if (readError) throw new Error("Couldn't check existing photos.");
    if (old?.storage_path === path) return { message: "Photo saved.", saved: true };
    const row = { coach_id: athlete.coach_id, athlete_id: athleteId, taken_on: date, pose, storage_path: path };
    const result = old
      ? await supabase.from("progress_photos").update(row).eq("id", old.id).eq("storage_path", old.storage_path).select("id").single()
      : await supabase.from("progress_photos").insert(row).select("id").single();
    if (result.error) throw new Error("Couldn't save the photo. Please refresh and try again.");
    let cleanupError = false;
    if (old) cleanupError = !!(await bucket.remove([old.storage_path])).error;
    refresh(athleteId);
    return { saved: true, ...(cleanupError ? { error: "Your new photo is saved, but the previous file couldn't be removed. Please contact your coach." } : { message: "Photo saved privately." }) };
  });
}

export async function deleteProgressPhoto(athleteId: string, id: string) {
  return perform(async () => {
    const { supabase } = await progressAccess(athleteId);
    z.uuid().parse(id);
    const { data: photo, error } = await supabase.from("progress_photos").select("storage_path").eq("athlete_id", athleteId).eq("id", id).single();
    if (error || !photo) throw new Error("Couldn't find that photo. Refresh and try again.");
    const { error: storageError } = await supabase.storage.from(PROGRESS_PHOTO_BUCKET).remove([photo.storage_path]);
    if (storageError) throw new Error("Couldn't remove the photo file. Nothing was deleted; please try again.");
    const { error: rowError } = await supabase.from("progress_photos").delete().eq("athlete_id", athleteId).eq("id", id).eq("storage_path", photo.storage_path);
    if (rowError) throw new Error("The file was removed, but its entry couldn't be deleted. Please try deleting it again.");
    refresh(athleteId);
    return { message: "Photo and file deleted." };
  });
}

export async function saveProgressReminder(athleteId: string, cadence: string) {
  return perform(async () => {
    const { supabase, viewer, athlete } = await progressAccess(athleteId);
    if (viewer.kind !== "coach") throw new Error("Only your coach can change reminders.");
    z.enum(["off", "2", "4"]).parse(cadence);
    if (cadence !== "off") {
      const { data: current, error } = await supabase.from("progress_reminders").select("cadence_weeks").eq("athlete_id", athleteId).maybeSingle();
      if (error) throw new Error("Couldn't load the reminder setting.");
      if (current?.cadence_weeks === Number(cadence)) return { message: "Reminder setting saved." };
    }
    const result = cadence === "off"
      ? await supabase.from("progress_reminders").delete().eq("athlete_id", athleteId)
      : await supabase.from("progress_reminders").upsert({ athlete_id: athleteId, coach_id: athlete.coach_id, cadence_weeks: Number(cadence), starts_on: await getToday() });
    if (result.error) throw new Error("Couldn't save the reminder setting.");
    refresh(athleteId);
    return { message: "Reminder setting saved." };
  });
}
