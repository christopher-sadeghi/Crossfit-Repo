import type { NotificationKind } from "@/lib/notifications";

export const PUSH_CATEGORIES = ["messages", "schedule", "updates", "reminders", "alerts"] as const;
export type PushCategory = typeof PUSH_CATEGORIES[number];

export function pushCategory(kind: NotificationKind | string): PushCategory {
  switch (kind) {
    case "coach_message": case "message": return "messages";
    case "schedule_changed": return "schedule";
    case "suggestion_approved": case "progress_report": return "updates";
    case "progress_check_in": case "check_in_reminder": return "reminders";
    default: return "alerts";
  }
}

export function safePushLink(link?: string | null): string {
  return link?.startsWith("/") && !link.startsWith("//") && !link.includes("\\") && !/[\u0000-\u0020]/.test(link) ? link : "/";
}

export function buildPushPayload(row: { id: string; title: string; body?: string | null; link?: string | null }) {
  return { title: row.title.slice(0, 100), body: (row.body ?? "").slice(0, 300), link: safePushLink(row.link), tag: row.id };
}
