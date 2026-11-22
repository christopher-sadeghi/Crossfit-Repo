"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { messageAthlete, parseMessageLink, validateMessageLink } from "@/lib/messages";
import { notifyMessage } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export type MessageState = { error?: string; sentId?: string };

export async function sendMessage(athleteId: string, _: MessageState, formData: FormData): Promise<MessageState> {
  const body = z.string().trim().min(1).max(2000).safeParse(formData.get("body"));
  if (!body.success) return { error: "Enter a message between 1 and 2000 characters." };
  const rawLink = formData.get("link");
  const link = typeof rawLink === "string" && rawLink ? parseMessageLink(rawLink) : null;
  if (rawLink && !link) return { error: "Choose a valid linked item." };
  const viewer = await getViewer();
  if (!viewer || viewer.kind === "none") return { error: "Sign in to send a message." };
  const supabase = await createClient();
  try {
    const athlete = await messageAthlete(supabase, viewer, athleteId);
    if (!athlete) return { error: "This conversation is unavailable." };
    if (link && !await validateMessageLink(supabase, athleteId, link, viewer.kind === "coach")) return { error: "That item isn't available for this athlete." };
    const { data, error } = await supabase.from("messages").insert({
      athlete_id: athlete.id, coach_id: athlete.coach_id, body: body.data,
      link_type: link?.type ?? null, link_id: link?.id ?? null,
    }).select("id").single();
    if (error || !data) return { error: "Couldn't send your message. Please try again." };
    await notifyMessage(supabase, athlete.id, data.id, viewer.kind);
    revalidatePath(`/messages/${athlete.id}`);
    revalidatePath("/messages");
    revalidatePath("/athlete/messages");
    return { sentId: data.id };
  } catch {
    return { error: "Couldn't send your message. Please try again." };
  }
}

export async function markThreadRead(athleteId: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer || viewer.kind === "none") return { error: "Sign in to read messages." };
  const supabase = await createClient();
  try {
    if (!await messageAthlete(supabase, viewer, athleteId)) return { error: "Conversation unavailable." };
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (typeof userId !== "string") return { error: "Sign in to read messages." };
    const { error } = await supabase.from("messages").update({ read_at: new Date().toISOString() })
      .eq("athlete_id", athleteId).neq("sender_id", userId).is("read_at", null);
    if (error) return { error: "Couldn't mark messages read." };
    return {};
  } catch {
    return { error: "Couldn't mark messages read." };
  }
}
