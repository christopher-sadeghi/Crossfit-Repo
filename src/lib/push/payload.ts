import type { NotificationKind } from "@/lib/notifications";

export const PUSH_CATEGORIES = ["messages", "schedule", "updates", "reminders", "alerts"] as const;
export type PushCategory = typeof PUSH_CATEGORIES[number];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
    if (!/^https:\/\/[^/:@?#]+(?:[/?#]|$)/i.test(endpoint)) return false;
    return url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com"
      || ["push.services.mozilla.com", "notify.windows.com", "push.apple.com"].some((host) => url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export function pushCategory(kind: NotificationKind | string): PushCategory {
  switch (kind) {
    case "coach_message": case "message": return "messages";
    case "schedule_changed": return "schedule";
    case "suggestion_approved": case "progress_report": case "form_reviewed": return "updates";
    case "progress_check_in": case "check_in_reminder": return "reminders";
    case "high_training_load": case "form_check": case "payment_failed": case "health_flag":
    case "athlete_profile_changed": return "alerts";
    default: return "alerts";
  }
}

export function safePushLink(link?: string | null): string {
  return link?.startsWith("/") && !link.startsWith("//") && !link.includes("\\") && !/[\u0000-\u0020]/.test(link) ? link : "/";
}

export function buildPushPayload(row: { id: string; title: string; body?: string | null; link?: string | null }) {
  return { title: row.title.slice(0, 100), body: (row.body ?? "").slice(0, 300), link: safePushLink(row.link), tag: row.id };
}
