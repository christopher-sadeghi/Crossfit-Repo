import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { CHECK_IN_COLUMNS, isCheckIn } from "@/lib/check-in";
import { checkInReminderDecision, reminderDue } from "@/lib/check-in-reminders";
import { pushNewNotifications } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Reminder scheduler is not configured." }, { status: 503 });
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(request.headers.get("authorization") ?? ""), hash(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const counts = { scanned: 0, invalid: 0, due: 0, suppressed: 0, alreadySent: 0, sent: 0 };
  try {
    const admin = createAdminClient();
    const now = new Date();
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const reminders = await admin.from("check_in_reminders")
        .select("athlete_id, remind_at, time_zone, athletes!inner(user_id, status)")
        .not("remind_at", "is", null).eq("athletes.status", "active").not("athletes.user_id", "is", null)
        .order("athlete_id").range(offset, offset + pageSize - 1);
      if (reminders.error) throw reminders.error;
      const rows = reminders.data ?? [];
      counts.scanned += rows.length;
      const byDate = new Map<string, typeof rows>();
      for (const row of rows) {
        try {
          const { due, localDate } = reminderDue(now, row.remind_at!, row.time_zone);
          if (!due) continue;
          counts.due++;
          byDate.set(localDate, [...(byDate.get(localDate) ?? []), row]);
        } catch {
          counts.invalid++;
          console.warn("Skipping invalid check-in reminder schedule");
        }
      }
      for (const [localDate, dueRows] of byDate) {
        const ids = dueRows.map((row) => row.athlete_id);
        const [journals, skips] = await Promise.all([
          admin.from("athlete_journal_entries").select(CHECK_IN_COLUMNS).in("athlete_id", ids).eq("entry_on", localDate),
          admin.from("check_in_skips").select("athlete_id").in("athlete_id", ids).eq("skipped_on", localDate),
        ]);
        if (journals.error || skips.error) throw journals.error ?? skips.error;
        const checkedIn = new Set((journals.data ?? []).filter(isCheckIn).map((row) => row.athlete_id));
        const skipped = new Set((skips.data ?? []).map((row) => row.athlete_id));
        const eligible = dueRows.filter((row) => checkInReminderDecision({
          reminder: row, now, hasCheckedIn: checkedIn.has(row.athlete_id), hasSkipped: skipped.has(row.athlete_id),
        }).send);
        counts.suppressed += dueRows.length - eligible.length;
        if (!eligible.length) continue;
        const reserved = await admin.from("check_in_reminder_sends").upsert(
          eligible.map((row) => ({ athlete_id: row.athlete_id, local_date: localDate })),
          { onConflict: "athlete_id,local_date", ignoreDuplicates: true },
        ).select("athlete_id");
        if (reserved.error) throw reserved.error;
        const created = new Set((reserved.data ?? []).map((row) => row.athlete_id));
        counts.alreadySent += eligible.length - created.size;
        const recipients = eligible.filter((row) => checkInReminderDecision({
          reminder: row, now, alreadySent: !created.has(row.athlete_id),
        }).send);
        if (!recipients.length) continue;
        const notifications = await admin.from("notifications").insert(recipients.map((row) => ({
          recipient_id: row.athletes.user_id!, athlete_id: row.athlete_id, kind: "check_in_reminder",
          title: "Time for your daily check-in",
          body: "How are you feeling today? Take a moment to check in.",
          link: "/athlete", dedupe_key: `check-in-reminder:${row.athlete_id}:${localDate}`,
        })));
        if (notifications.error) {
          const cleanup = await admin.from("check_in_reminder_sends").delete()
            .in("athlete_id", [...created]).eq("local_date", localDate);
          if (cleanup.error) console.error("Check-in reminder reservation cleanup failed");
          throw notifications.error;
        }
        counts.sent += recipients.length;
        await Promise.all(recipients.map((row) => pushNewNotifications({ athleteId: row.athlete_id, kind: "check_in_reminder" })));
      }
      if (rows.length < pageSize) break;
    }
    return NextResponse.json(counts);
  } catch {
    console.error("Check-in reminder dispatch failed");
    return NextResponse.json({ error: "Could not dispatch check-in reminders.", ...counts }, { status: 500 });
  }
}
