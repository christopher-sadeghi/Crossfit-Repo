"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { sendMessage, type MessageState } from "@/app/messages-actions";
import { COACH_SESSION_ERROR } from "@/lib/ai/coach-session";
import { runChatWithClient } from "@/lib/ai/chat";
import { messageAthlete } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

export type AskAthleteAIState = { error?: string; draft?: string; suggestionIds?: string[] };

export async function askAthleteMessageAI(athleteId: string, messageId: string): Promise<AskAthleteAIState> {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach") return { error: COACH_SESSION_ERROR };
  if (!z.uuid().safeParse(messageId).success) return { error: "This athlete message is unavailable." };
  const supabase = await createClient();
  try {
    const athlete = await messageAthlete(supabase, viewer, athleteId);
    if (!athlete) return { error: "This athlete message is unavailable." };
    const { data: message } = await supabase.from("messages").select("body, link_type, link_id")
      .eq("id", messageId).eq("athlete_id", athlete.id).eq("coach_id", viewer.gymId).neq("sender_id", viewer.id).maybeSingle();
    if (!message) return { error: "This athlete message is unavailable." };
    const result = await runChatWithClient(supabase, {
      message: `Help me with this athlete message: ${JSON.stringify(message.body)}${message.link_type === "workout" && message.link_id ? `\nLinked workout ID: ${message.link_id}` : ""}`,
      context: { athleteId: athlete.id },
      thread: { athleteId: athlete.id, messageId },
      today: await getToday(),
      coachId: viewer.id,
    });
    if ("error" in result) return result;
    if (result.suggestionIds.length) {
      revalidatePath(`/messages/${athlete.id}`);
      revalidatePath("/settings/ai-history");
      return { suggestionIds: result.suggestionIds };
    }
    return { draft: result.reply.slice(0, 2000) };
  } catch (error) {
    console.error("Could not ask AI about athlete message:", error);
    return { error: "The AI coach couldn't answer right now. Please try again in a minute." };
  }
}

export async function sendAthleteAIDraft(athleteId: string, state: MessageState, formData: FormData) {
  if ((await getViewer())?.kind !== "coach") return { error: COACH_SESSION_ERROR };
  return sendMessage(athleteId, state, formData);
}
