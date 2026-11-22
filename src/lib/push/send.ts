import "server-only";
import { sendNotification } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPushPayload, PUSH_CATEGORIES, pushCategory } from "./payload";

export function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject?.startsWith("mailto:") && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? { publicKey, privateKey, subject } : null;
}

export async function pushNewNotifications({ athleteId, kind }: { athleteId: string; kind: string }) {
  const config = pushConfig();
  if (!config) return;
  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin.from("notifications")
      .update({ pushed_at: new Date().toISOString() }).eq("athlete_id", athleteId).eq("kind", kind)
      .is("pushed_at", null).gt("created_at", new Date(Date.now() - 120_000).toISOString())
      .select("id, recipient_id, kind, title, body, link");
    if (error) throw error;
    for (const row of rows ?? []) {
      try {
        const settings = await admin.from("notification_settings").select("push_categories").eq("user_id", row.recipient_id).maybeSingle();
        if (settings.error) throw settings.error;
        if (!(settings.data?.push_categories ?? PUSH_CATEGORIES).includes(pushCategory(row.kind))) continue;
        const subscriptions = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", row.recipient_id);
        if (subscriptions.error) throw subscriptions.error;
        for (const sub of subscriptions.data ?? []) {
          try {
            await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(buildPushPayload(row)), { TTL: 86400, vapidDetails: config });
            const result = await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
            if (result.error) throw result.error;
          } catch (error) {
            const status = (error as { statusCode?: number })?.statusCode;
            if (status === 404 || status === 410) {
              const result = await admin.from("push_subscriptions").delete().eq("id", sub.id);
              if (result.error) console.error("Push subscription cleanup failed");
            } else console.error("Push delivery failed");
          }
        }
      } catch { console.error("Push recipient processing failed"); }
    }
  } catch { console.error("Push dispatch failed"); }
}
