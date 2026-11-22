"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isAllowedPushEndpoint, PUSH_CATEGORIES } from "@/lib/push/payload";

const endpointSchema = z.string().url().max(2000).startsWith("https://");
const subscriptionSchema = z.object({
  endpoint: endpointSchema.refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
  userAgent: z.string().max(500),
});

async function context() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") throw new Error("Sign in to manage push notifications.");
  return { supabase, userId };
}

export async function savePushSubscription(input: unknown) {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid push subscription." };
  try {
    const { supabase } = await context();
    const { endpoint, keys, userAgent } = parsed.data;
    const { error } = await supabase.rpc("register_push_subscription", { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_user_agent: userAgent });
    if (error) throw error;
    (await cookies()).set("fitcoach-push-endpoint", endpoint, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return {};
  } catch { return { error: "Couldn't enable push notifications. Please try again." }; }
}

export async function deletePushSubscription(endpoint: unknown) {
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return { error: "Invalid push subscription." };
  try {
    const { supabase, userId } = await context();
    const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", parsed.data);
    if (error) throw error;
    (await cookies()).delete("fitcoach-push-endpoint");
    return {};
  } catch { return { error: "Couldn't disable push notifications. Please try again." }; }
}

export async function hasPushSubscription(endpoint: unknown) {
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return { enabled: false, error: "Invalid push subscription." };
  try {
    const { supabase, userId } = await context();
    const { data, error } = await supabase.from("push_subscriptions").select("id").eq("user_id", userId).eq("endpoint", parsed.data).maybeSingle();
    if (error) throw error;
    return { enabled: !!data };
  } catch { return { enabled: false, error: "Couldn't check this device. Please reload." }; }
}

export async function savePushCategories(input: unknown) {
  const parsed = z.array(z.enum(PUSH_CATEGORIES)).max(5).safeParse(input);
  if (!parsed.success) return { error: "Invalid notification categories." };
  try {
    const { supabase, userId } = await context();
    const { error } = await supabase.from("notification_settings").upsert({ user_id: userId, push_categories: parsed.data }, { onConflict: "user_id" });
    if (error) throw error;
    return {};
  } catch { return { error: "Couldn't save push preferences. Please try again." }; }
}
