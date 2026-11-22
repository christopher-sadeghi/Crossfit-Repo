import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AthleteViewer } from "@/lib/viewer";
import { assistantCardSchema } from "./assistant-schema";

export const assistantCardIdentitySchema = z.object({
  assistantMessageId: z.string().uuid(),
  cardIndex: z.number().int().min(0).max(5),
}).strict();
export type AssistantCardIdentity = z.infer<typeof assistantCardIdentitySchema>;
export type AssistantCardAction = { card_index: number; action: "sent" | "saved"; ref_id: string };

export async function loadAssistantCard(client: SupabaseClient<Database>, viewer: AthleteViewer, identity: AssistantCardIdentity) {
  const parsed = assistantCardIdentitySchema.safeParse(identity);
  if (!parsed.success) return null;
  const { data, error } = await client.from("athlete_ai_messages").select("metadata")
    .eq("id", parsed.data.assistantMessageId).eq("athlete_id", viewer.athleteId).eq("coach_id", viewer.coachId).eq("role", "assistant").maybeSingle();
  if (error) throw error;
  const metadata = data?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !Array.isArray(metadata.cards)) return null;
  const card = assistantCardSchema.safeParse(metadata.cards[parsed.data.cardIndex]);
  return card.success ? card.data : null;
}
