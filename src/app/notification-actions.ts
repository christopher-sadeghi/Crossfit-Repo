"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };
export type NotificationFeed = { items: NotificationItem[]; count: number; error?: string };

export async function getNotifications(): Promise<NotificationFeed> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (typeof userId !== "string") return { items: [], count: 0, error: "Sign in to view notifications." };
    const [rows, unread] = await Promise.all([
      supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null),
    ]);
    if (rows.error || unread.error) throw rows.error ?? unread.error;
    return { items: rows.data ?? [], count: unread.count ?? 0 };
  } catch {
    return { items: [], count: 0, error: "Couldn't load notifications. Please try again." };
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
