import { z } from "zod";

import type { Tables } from "@/lib/supabase/database.types";
import type { Units } from "@/lib/units";

export const ACTIVITY_TYPES = ["run", "hike", "bike", "swim", "row", "sport", "walk", "other"] as const;
export type AthleteActivity = Tables<"athlete_activities">;

export const activityDraftSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  custom_label: z.string().nullable(),
  duration_minutes: z.number().int().min(1).max(1440).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
  distance_m: z.number().positive().nullable(),
  performed_on: z.iso.date().nullable(),
});
export type ActivityDraft = z.infer<typeof activityDraftSchema>;

export const distanceUnit = (units: Units) => units === "kg" ? "km" : "mi";
const metersPerUnit = (units: Units) => units === "kg" ? 1000 : 1609.344;
export const toActivityMeters = (amount: number, units: Units) => amount * metersPerUnit(units);
export const fromActivityMeters = (meters: number, units: Units) => meters / metersPerUnit(units);

export function activityLabel(activity: Pick<AthleteActivity, "custom_label" | "activity_type">) {
  return activity.custom_label || activity.activity_type[0].toUpperCase() + activity.activity_type.slice(1);
}
