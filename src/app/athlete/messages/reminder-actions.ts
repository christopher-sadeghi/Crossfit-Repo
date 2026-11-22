"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/auth/form-state";
import { isReminderTime, isReminderTimeZone } from "@/lib/check-in-reminders";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function saveCheckInReminder(_: FormState, data: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "athlete") return { error: "Only athletes can set a check-in reminder." };
  const enabled = data.get("enabled");
  const time = data.get("remind_at");
  const zone = data.get("time_zone");
  if ((enabled !== null && enabled !== "on") || (enabled === "on" && (typeof time !== "string" || !isReminderTime(time)))) {
    return { error: "Choose a time on a 15-minute boundary." };
  }
  if (typeof zone !== "string" || !isReminderTimeZone(zone)) return { error: "Your device time zone is invalid. Please check your device settings." };
  const supabase = await createClient();
  const { error } = await supabase.from("check_in_reminders").upsert({
    athlete_id: viewer.athleteId, remind_at: enabled === "on" ? time as string : null, time_zone: zone,
  }, { onConflict: "athlete_id" });
  if (error) return { error: "Couldn't save your reminder. Please try again." };
  revalidatePath("/athlete/messages");
  return { message: "Check-in reminder saved." };
}
