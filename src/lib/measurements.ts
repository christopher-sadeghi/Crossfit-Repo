import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Tables } from "@/lib/supabase/database.types";
import { fromCm, type Units } from "@/lib/units";

export const MEASUREMENT_SITES = ["waist", "hips", "chest", "arms", "thighs", "neck"] as const;
export const SITE_LABELS: Record<(typeof MEASUREMENT_SITES)[number], string> = {
  waist: "Waist", hips: "Hips", chest: "Chest", arms: "Arms", thighs: "Thighs", neck: "Neck",
};
export const PHOTO_POSES = ["front", "side", "back"] as const;
export const PROGRESS_PHOTO_BUCKET = "progress-photos";
export type Measurement = Tables<"body_measurements">;
export type ProgressPhoto = Tables<"progress_photos"> & { url: string | null };

export function progressDateSchema(today: string) {
  return z.iso.date("Choose a valid date.").refine((date) => date <= today, "Choose today or an earlier date.");
}

export function measurementTrend(rows: Measurement[], site: string, units: Units) {
  const entries = rows.filter((row) => row.site === site).sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const latest = entries.at(-1);
  if (!latest) return null;
  const display = (row: Measurement) => fromCm(Number(row.value_cm), units);
  const change = (row: Measurement) => Math.round((display(latest) - display(row)) * 10) / 10;
  return {
    latest: display(latest), date: latest.measured_on,
    sinceFirst: entries.length > 1 ? change(entries[0]) : null,
    sincePrevious: entries.length > 1 ? change(entries.at(-2)!) : null,
  };
}

export function checkInDates(measurements: Measurement[], photos: ProgressPhoto[]) {
  return [...new Set([...measurements.map((row) => row.measured_on), ...photos.map((row) => row.taken_on)])].sort();
}

export async function loadProgressCheckIns(supabase: SupabaseClient<Database>, athleteId: string) {
  const measurements: Measurement[] = [];
  const photos: Tables<"progress_photos">[] = [];
  for (let offset = 0; ; offset += 1000) {
    const [m, p] = await Promise.all([
      supabase.from("body_measurements").select("*").eq("athlete_id", athleteId).order("measured_on").order("id").range(offset, offset + 999),
      supabase.from("progress_photos").select("*").eq("athlete_id", athleteId).order("taken_on").order("id").range(offset, offset + 999),
    ]);
    if (m.error || p.error) throw new Error("Couldn't load progress. Please refresh and try again.");
    measurements.push(...m.data);
    photos.push(...p.data);
    if (m.data.length < 1000 && p.data.length < 1000) break;
  }
  const urls = new Map<string, string>();
  for (let offset = 0; offset < photos.length; offset += 100) {
    const { data } = await supabase.storage.from(PROGRESS_PHOTO_BUCKET)
      .createSignedUrls(photos.slice(offset, offset + 100).map((photo) => photo.storage_path), 3600);
    for (const signed of data ?? []) if (signed.path && signed.signedUrl && !signed.error) urls.set(signed.path, signed.signedUrl);
  }
  return { measurements, photos: photos.map((photo): ProgressPhoto => ({ ...photo, url: urls.get(photo.storage_path) ?? null })) };
}
