import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { buildDailyDigestEmail, buildNotificationEmail } from "./builders";
import { siteOrigin } from "./origin";

type AdminClient = SupabaseClient<Database>;
type EmailMessage = { to: string; subject: string; text: string; html: string };
type SendEmail = (message: EmailMessage) => Promise<{ sent: boolean }>;
type Dependencies = {
  admin?: AdminClient;
  sendEmail?: SendEmail;
  configured?: () => boolean;
  now?: () => Date;
};
type Services = { admin: AdminClient; sendEmail: SendEmail; now: () => Date };
type NotificationRow = {
  id: string;
  recipient_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

async function getServices(dependencies: Dependencies): Promise<Services | null> {
  const config = !dependencies.sendEmail || !dependencies.configured ? await import("./config") : null;
  if (!(dependencies.configured?.() ?? !!config?.emailConfig())) return null;
  const admin = dependencies.admin ?? (await import("@/lib/supabase/admin")).createAdminClient();
  return {
    admin,
    sendEmail: dependencies.sendEmail ?? config!.sendEmail,
    now: dependencies.now ?? (() => new Date()),
  };
}

async function releaseClaim(admin: AdminClient, id: string, claimedAt: string) {
  try {
    await admin.from("notifications").update({ emailed_at: null }).eq("id", id).eq("emailed_at", claimedAt);
  } catch {}
}

export async function emailNewNotifications(
  { athleteId, kind }: { athleteId: string; kind: string },
  dependencies: Dependencies = {},
) {
  const counts = { emailed: 0, skipped: 0, failed: 0 };
  let services: Services | null;
  try {
    services = await getServices(dependencies);
  } catch {
    counts.failed++;
    return counts;
  }
  if (!services) return counts;

  const now = services.now();
  try {
    const { data: notifications, error } = await services.admin.from("notifications")
      .select("id, recipient_id, kind, title, body, link, created_at")
      .eq("athlete_id", athleteId).eq("kind", kind).is("emailed_at", null)
      .gt("created_at", new Date(now.getTime() - 120_000).toISOString()).lte("created_at", now.toISOString());
    if (error) throw error;
    const rows = notifications ?? [];
    if (!rows.length) return counts;

    const recipientIds = [...new Set(rows.map((row) => row.recipient_id))];
    const { data: settings, error: settingsError } = await services.admin.from("notification_settings")
      .select("user_id, email_enabled, email_frequency").in("user_id", recipientIds);
    if (settingsError) throw settingsError;
    const byUser = new Map((settings ?? []).map((setting) => [setting.user_id, setting]));

    for (const row of rows as NotificationRow[]) {
      const preference = byUser.get(row.recipient_id);
      if (!preference?.email_enabled || preference.email_frequency !== "instant") {
        counts.skipped++;
        continue;
      }

      let claimedAt: string | null = null;
      try {
        const { data: userResult, error: userError } = await services.admin.auth.admin.getUserById(row.recipient_id);
        const email = userResult.user?.email;
        if (userError) {
          counts.failed++;
          continue;
        }
        if (!email) {
          counts.skipped++;
          continue;
        }

        claimedAt = now.toISOString();
        const { data: claimed, error: claimError } = await services.admin.from("notifications")
          .update({ emailed_at: claimedAt }).eq("id", row.id).is("emailed_at", null)
          .select("id, recipient_id, kind, title, body, link, created_at").maybeSingle();
        if (claimError) {
          counts.failed++;
          claimedAt = null;
          continue;
        }
        if (!claimed) {
          counts.skipped++;
          claimedAt = null;
          continue;
        }

        const result = await services.sendEmail({ to: email, ...buildNotificationEmail(claimed, siteOrigin()) });
        if (!result.sent) {
          await releaseClaim(services.admin, row.id, claimedAt);
          claimedAt = null;
          counts.failed++;
          continue;
        }
        counts.emailed++;
      } catch {
        if (claimedAt) await releaseClaim(services.admin, row.id, claimedAt);
        counts.failed++;
      }
    }
  } catch {
    counts.failed++;
  }
  return counts;
}

export async function emailDailyDigests(
  { origin }: { origin: string },
  dependencies: Dependencies = {},
) {
  const counts = { users: 0, emailed: 0, skipped: 0, failed: 0 };
  let services: Services | null;
  try {
    services = await getServices(dependencies);
  } catch {
    counts.failed++;
    return counts;
  }
  if (!services) return counts;

  const now = services.now();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const pageSize = 500;
  try {
    const settings = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await services.admin.from("notification_settings")
        .select("user_id, email_enabled, email_frequency")
        .eq("email_enabled", true).eq("email_frequency", "daily")
        .order("user_id").range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows = data ?? [];
      settings.push(...rows);
      if (rows.length < pageSize) break;
    }
    counts.users = settings.length;

    for (const setting of settings) {
      try {
        const notifications: NotificationRow[] = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await services.admin.from("notifications")
            .select("id, recipient_id, kind, title, body, link, created_at")
            .eq("recipient_id", setting.user_id).is("emailed_at", null).is("read_at", null)
            .gte("created_at", cutoff).lte("created_at", nowIso)
            .order("created_at", { ascending: false }).range(offset, offset + pageSize - 1);
          if (error) throw error;
          const rows = data ?? [];
          notifications.push(...rows);
          if (rows.length < pageSize) break;
        }
        if (!notifications.length) {
          counts.skipped++;
          continue;
        }

        const { data: userResult, error: userError } = await services.admin.auth.admin.getUserById(setting.user_id);
        if (userError) {
          counts.failed++;
          continue;
        }
        const email = userResult.user?.email;
        if (!email) {
          counts.skipped++;
          continue;
        }

        const result = await services.sendEmail({ to: email, ...buildDailyDigestEmail(notifications, origin) });
        if (!result.sent) {
          counts.failed++;
          continue;
        }
        counts.emailed++;

        const ids = notifications.map((notification) => notification.id);
        for (let offset = 0; offset < ids.length; offset += 200) {
          const { error } = await services.admin.from("notifications").update({ emailed_at: nowIso })
            .in("id", ids.slice(offset, offset + 200)).is("emailed_at", null);
          if (error) throw error;
        }
      } catch {
        counts.failed++;
      }
    }
  } catch {
    counts.failed++;
  }
  return counts;
}
