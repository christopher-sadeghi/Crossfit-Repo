import { safePushLink } from "@/lib/push/payload";

const footer = "You can turn these emails off in FitCoach settings.";

type EmailContent = { subject: string; text: string; html: string };
type NotificationEmailInput = { title: string; body?: string | null; link?: string | null };
const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character]);
}

function absoluteLink(link: string | null | undefined, origin: string) {
  return new URL(safePushLink(link), origin).toString();
}

export function buildInviteEmail({ coachName, link, origin }: { coachName?: string | null; link: string; origin: string }): EmailContent {
  const name = coachName?.trim() || "Your coach";
  const url = absoluteLink(link, origin);
  return {
    subject: "Your FitCoach invitation",
    text: `${name} invited you to join FitCoach. Use this link to create your account:\n\n${url}\n\n${footer}`,
    html: `<p>${escapeHtml(name)} invited you to join FitCoach. Use this link to create your account:</p><p><a href="${escapeHtml(url)}">Accept invitation</a></p><p>${footer}</p>`,
  };
}

export function coachInviteEmail({ coachName, gymName, link, origin }: { coachName?: string | null; gymName?: string | null; link: string; origin: string }): EmailContent {
  const name = coachName?.trim() || "A coach";
  const gym = gymName?.trim();
  const url = absoluteLink(link, origin);
  const invitation = gym ? `${name} invited you to coach at ${gym}.` : `${name} invited you to join their gym on FitCoach.`;
  return {
    subject: "Your FitCoach coach invitation",
    text: `${invitation} Use this link to create your new account:\n\n${url}\n\n${footer}`,
    html: `<p>${escapeHtml(invitation)} Use this link to create your new account:</p><p><a href="${escapeHtml(url)}">Accept coach invitation</a></p><p>${footer}</p>`,
  };
}

export function buildNotificationEmail(notification: NotificationEmailInput, origin: string): EmailContent {
  const title = notification.title;
  const body = notification.body ?? "";
  const url = absoluteLink(notification.link, origin);
  return {
    subject: `FitCoach: ${title}`.replace(/\s+/g, " ").trim().slice(0, 120).trimEnd(),
    text: `${title}${body ? `\n\n${body}` : ""}\n\n${url}\n\n${footer}`,
    html: `<h1>${escapeHtml(title)}</h1>${body ? `<p>${escapeHtml(body)}</p>` : ""}<p><a href="${escapeHtml(url)}">View notification</a></p><p>${footer}</p>`,
  };
}

export function buildDailyDigestEmail(notifications: NotificationEmailInput[], origin: string): EmailContent {
  const visible = notifications.slice(0, 20);
  const remaining = notifications.length - visible.length;
  const text = visible.map((notification) => {
    const url = absoluteLink(notification.link, origin);
    return `${notification.title}${notification.body ? `\n${notification.body}` : ""}\n${url}`;
  });
  if (remaining > 0) text.push(`And ${remaining} more notification${remaining === 1 ? "" : "s"}.`);
  const items = visible.map((notification) => {
    const url = absoluteLink(notification.link, origin);
    return `<li><a href="${escapeHtml(url)}">${escapeHtml(notification.title)}</a>${notification.body ? `<p>${escapeHtml(notification.body)}</p>` : ""}</li>`;
  });
  if (remaining > 0) items.push(`<li>And ${remaining} more notification${remaining === 1 ? "" : "s"}.</li>`);
  return {
    subject: "Your FitCoach daily digest",
    text: `Your daily FitCoach notifications:\n\n${text.join("\n\n")}\n\n${footer}`,
    html: `<p>Your daily FitCoach notifications:</p><ul>${items.join("")}</ul><p>${footer}</p>`,
  };
}
