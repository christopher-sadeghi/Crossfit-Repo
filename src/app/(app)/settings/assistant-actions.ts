"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { COACH_SESSION_ERROR } from "@/lib/ai/coach-session";
import { assistantSettingsSchema, athleteOverrideSchema } from "@/lib/ai/assistant-schema";
import { failure, type FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { getViewer } from "@/lib/viewer";

export async function loadAthleteAssistantTranscript(athleteId: string) {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return { error: COACH_SESSION_ERROR };
  if (!z.string().uuid().safeParse(athleteId).success) return { error: "Choose an athlete." };
  const supabase = await createClient();
  const messages: Tables<"athlete_ai_messages">[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("athlete_ai_messages").select("*")
      .eq("athlete_id", athleteId).eq("coach_id", viewer.id).order("created_at").order("id").range(offset, offset + 499);
    if (error) return { error: "Couldn't load the conversation." };
    messages.push(...data);
    if (data.length < 500) return { messages };
  }
}

export async function saveAssistantSettings(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return { error: COACH_SESSION_ERROR };
  const parsed = assistantSettingsSchema.safeParse({
    assistant_rules: formData.get("assistant_rules") || null,
    assistant_training: formData.get("assistant_training") === "on",
    assistant_nutrition: formData.get("assistant_nutrition") === "on",
    assistant_recovery: formData.get("assistant_recovery") === "on",
    athlete_ai_daily_limit: Number(formData.get("athlete_ai_daily_limit")),
  });
  if (!parsed.success) return failure(formData, parsed.error.issues[0]?.message ?? "Check your settings.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("coaches").update(parsed.data).eq("id", viewer.id).select("id").single();
  if (error || !data) return failure(formData, "Couldn't save assistant settings.");
  revalidatePath("/settings");
  return { message: "Assistant settings saved." };
}

export async function saveAthleteAssistantRules(athleteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return { error: COACH_SESSION_ERROR };
  const rules = athleteOverrideSchema.safeParse(formData.get("assistant_rules") || null);
  if (!z.string().uuid().safeParse(athleteId).success || !rules.success)
    return failure(formData, "Choose an athlete and enter at most 2000 characters.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("athletes").update({ assistant_rules: rules.data })
    .eq("id", athleteId).eq("coach_id", viewer.id).select("id").single();
  if (error || !data) return failure(formData, "Couldn't save athlete assistant rules.");
  revalidatePath(`/athletes/${athleteId}`);
  return { message: "Athlete assistant rules saved." };
}
