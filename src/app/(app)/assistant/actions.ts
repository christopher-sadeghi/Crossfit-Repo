"use server";

import { revalidatePath } from "next/cache";

import { chatContextSchema, chatMessageSchema, runChatWithClient, type ChatContext } from "@/lib/ai/chat";
import { SUGGESTION_LABELS } from "@/lib/ai/suggestions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getToday } from "@/lib/time-zone";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatSuggestion = { id: string; label: string; title: string | null; status: string; detail: string | null };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; suggestions: ChatSuggestion[] };

async function loadSuggestions(supabase: SupabaseClient<Database>, ids: string[]) {
  if (!ids.length) return new Map<string, ChatSuggestion>();
  const { data } = await supabase
    .from("ai_suggestions")
    .select("id, suggestion_type, status, proposal, input, athletes(first_name)")
    .in("id", ids);
  return new Map(
    (data ?? []).map((s) => {
      const proposal = s.proposal as { title?: unknown } | null;
      const input = s.input as { scheduled_on?: unknown; mode?: unknown } | null;
      const parts = [
        s.athletes?.first_name,
        typeof input?.scheduled_on === "string" ? input.scheduled_on : null,
        input?.mode === "adjust" ? "change to existing WOD" : null,
      ].filter(Boolean);
      return [
        s.id,
        {
          id: s.id,
          label: SUGGESTION_LABELS[s.suggestion_type],
          title: typeof proposal?.title === "string" ? proposal.title : null,
          status: s.status,
          detail: parts.join(" · ") || null,
        },
      ];
    }),
  );
}

export async function loadChat(): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, suggestion_ids")
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
    if (result.suggestionIds.length) revalidatePath("/suggestions");
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
  const { error } = await supabase.from("ai_chat_messages").delete().not("id", "is", null);
  return error ? { error: "Could not clear the chat." } : {};
}
