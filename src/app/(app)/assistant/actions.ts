"use server";

import { revalidatePath } from "next/cache";

import { chatContextSchema, chatMessageSchema, runChatWithClient, type ChatContext } from "@/lib/ai/chat";
import { COACH_SESSION_ERROR } from "@/lib/ai/coach-session";
import { inlineSuggestion, type InlineSuggestion } from "@/lib/ai/inline-suggestion";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; suggestions: InlineSuggestion[] };

async function loadSuggestions(supabase: SupabaseClient<Database>, ids: string[]) {
  if (!ids.length) return new Map<string, InlineSuggestion>();
  const { data } = await supabase
    .from("ai_suggestions")
    .select("*, athletes(first_name, last_name)")
    .in("id", ids);
  return new Map((data ?? []).map((row) => [
    row.id,
    inlineSuggestion(row, row.athletes && `${row.athletes.first_name} ${row.athletes.last_name}`),
  ]));
}

export async function loadChat(): Promise<ChatMessage[]> {
  if ((await getViewer())?.kind !== "coach") throw new Error(COACH_SESSION_ERROR);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, suggestion_ids")
    .eq("cleared", false)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load chat history.");
  const rows = (data ?? []).reverse();
  const suggestions = await loadSuggestions(supabase, rows.flatMap((r) => r.suggestion_ids));
  return rows.map((r) => ({
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
    suggestions: r.suggestion_ids.flatMap((id) => suggestions.get(id) ?? []),
  }));
}

export async function sendChatMessage(
  message: string,
  context: ChatContext,
): Promise<{ reply: ChatMessage } | { error: string }> {
  if ((await getViewer())?.kind !== "coach") return { error: COACH_SESSION_ERROR };
  const text = chatMessageSchema.safeParse(message);
  if (!text.success) return { error: "Type a message of up to 2000 characters." };
  const parsedContext = chatContextSchema.safeParse(context);

  const supabase = await createClient();
  try {
    const result = await runChatWithClient(supabase, {
      message: text.data,
      context: parsedContext.success ? parsedContext.data : {},
      today: await getToday(),
    });
    if ("error" in result) return result;
    if (result.suggestionIds.length) revalidatePath("/settings/ai-history");
    const suggestions = await loadSuggestions(supabase, result.suggestionIds);
    return {
      reply: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply,
        suggestions: result.suggestionIds.flatMap((id) => suggestions.get(id) ?? []),
      },
    };
  } catch (error) {
    console.error("AI chat action failed:", error);
    return { error: "The AI coach couldn't answer right now. Please try again in a minute." };
  }
}

export async function clearChat(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("ai_chat_messages").update({ cleared: true }).eq("cleared", false);
  return error ? { error: "Could not clear the chat." } : {};
}
