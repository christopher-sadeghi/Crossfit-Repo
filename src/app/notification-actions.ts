"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/lib/auth/form-state";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
export type NotificationFeed = { items: NotificationItem[]; count: number; unreadMessages: number; error?: string };

export async function getNotifications(): Promise<NotificationFeed> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (typeof userId !== "string") return { items: [], count: 0, unreadMessages: 0, error: "Sign in to view notifications." };
    const viewer = await getViewer();
    if (!viewer || viewer.kind === "none") return { items: [], count: 0, unreadMessages: 0, error: "Sign in to view notifications." };
    const messagesQuery = viewer.kind === "coach"
      ? (async () => {
          const { data: athletes, error } = await supabase.from("athletes").select("user_id").eq("coach_id", viewer.gymId);
          if (error) return { count: null, error };
          const senderIds = [...new Set((athletes ?? []).flatMap(({ user_id }) => user_id ? [user_id] : []))];
          return senderIds.length
            ? supabase.from("messages").select("id", { count: "exact", head: true }).in("sender_id", senderIds).is("read_at", null)
            : { count: 0, error: null };
        })()
      : supabase.from("messages").select("id", { count: "exact", head: true }).neq("sender_id", userId).is("read_at", null);
    const [rows, unread, messages] = await Promise.all([
      supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null),
      messagesQuery,
    ]);
    if (rows.error || unread.error || messages.error) throw rows.error ?? unread.error ?? messages.error;
    return { items: rows.data ?? [], count: unread.count ?? 0, unreadMessages: messages.count ?? 0 };
  } catch {
    return { items: [], count: 0, unreadMessages: 0, error: "Couldn't load notifications. Please try again." };
  }
}

export async function markNotificationRead(id?: string): Promise<{ error?: string }> {
  if (id !== undefined && !z.string().uuid().safeParse(id).success) return { error: "Invalid notification." };
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (typeof userId !== "string") return { error: "Sign in to update notifications." };
    let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).is("read_at", null);
    if (id !== undefined) query = query.eq("id", id);
    const { error } = await query;
    if (error) throw error;
    return {};
  } catch {
    return { error: "Couldn't mark notifications read. Please try again." };
  }
}

export async function markAllNotificationsRead(): Promise<{ error?: string }> {
  return markNotificationRead();
}

export async function saveNotificationSettings(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({
    email_enabled: z.enum(["on"]).nullable().transform((value) => value === "on"),
    email_frequency: z.enum(["instant", "daily"]),
  }).safeParse({ email_enabled: formData.get("email_enabled"), email_frequency: formData.get("email_frequency") });
  if (!parsed.success) return { error: "Choose instant alerts or a daily digest." };
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (typeof userId !== "string") return { error: "Sign in to save notification settings." };
    const { error } = await supabase.from("notification_settings").upsert({ user_id: userId, ...parsed.data }, { onConflict: "user_id" });
    if (error) throw error;
    revalidatePath("/settings");
    revalidatePath("/athlete/messages");
    return { message: "Notification preferences saved." };
  } catch {
    return { error: "Couldn't save notification settings. Please try again." };
  }
}
