"use server";

import { openai } from "@ai-sdk/openai";
import { z } from "zod";

import { getActivityActor } from "@/lib/activity-actor";
import type { ActivityDraft } from "@/lib/athlete-activities";
import { getToday } from "@/lib/time-zone";

import { extractActivityDraft } from "./activity-extraction";
import { aiDailyLimit, aiLimitMessage, countAiUsageToday } from "./service-core";

const draftUnavailable = "AI couldn't draft this activity. You can still fill out the form by hand.";

export async function draftActivity(athleteId: string, description: string): Promise<{ draft: ActivityDraft } | { error: string }> {
  const parsed = z.string().trim().min(1).max(1000).safeParse(description);
  if (!parsed.success) return { error: "Describe your activity in 1–1000 characters." };
  const actor = await getActivityActor(athleteId);
  if (!actor) return { error: "You don't have access to this athlete's activity log." };
  if (!process.env.OPENAI_API_KEY) return { error: "AI drafting isn't available right now. You can still fill out the form by hand." };
  const { supabase } = actor;
  const limit = aiDailyLimit();
  try {
    const [today, usage] = await Promise.all([getToday(), countAiUsageToday(supabase)]);
    if (usage.error) return { error: draftUnavailable };
    if (usage.count >= limit) return { error: aiLimitMessage(limit) };

    const { error: reservationError } = await supabase.from("ai_activity_draft_requests").insert({ id: crypto.randomUUID() });
    if (reservationError) return { error: draftUnavailable };
    const reserved = await countAiUsageToday(supabase);
    if (reserved.error) return { error: draftUnavailable };
    if (reserved.count > limit) return { error: aiLimitMessage(limit) };

    return { draft: await extractActivityDraft(parsed.data, today, actor.units, openai(process.env.OPENAI_MODEL ?? "gpt-5.4-mini")) };
  } catch {
    return { error: draftUnavailable };
  }
}
