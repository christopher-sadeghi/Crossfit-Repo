import assert from "node:assert/strict";
import { test } from "node:test";

import { GET } from "@/app/api/cron/email-digest/route";

import { buildDailyDigestEmail, buildInviteEmail, buildNotificationEmail } from "./builders";
import { emailDailyDigests, emailNewNotifications } from "./notifications";

test("email builders escape user text and make relative links absolute", () => {
  const invite = buildInviteEmail({
    coachName: `<Coach & "Name">`,
    link: "/join/token?source=coach&active=1",
    origin: "https://fitcoach.example",
  });
  assert.match(invite.html, /&lt;Coach &amp; &quot;Name&quot;&gt;/);
  assert.match(invite.html, /https:\/\/fitcoach\.example\/join\/token\?source=coach&amp;active=1/);

  const notification = buildNotificationEmail(
    { title: "<Workout>", body: "Keep & breathe", link: "/athlete" },
    "https://fitcoach.example",
  );
  assert.match(notification.html, /&lt;Workout&gt;/);
  assert.match(notification.html, /Keep &amp; breathe/);
  assert.match(notification.html, /href="https:\/\/fitcoach\.example\/athlete"/);
  assert.match(notification.text, /https:\/\/fitcoach\.example\/athlete/);
  assert.match(notification.text, /You can turn these emails off in FitCoach settings\./);
});

test("daily digest shows at most 20 notifications and reports the remainder", () => {
  const notifications = Array.from({ length: 22 }, (_, index) => ({
    title: `Workout ${index + 1}`,
    link: `/athlete/workouts/${index + 1}`,
  }));
  const digest = buildDailyDigestEmail(notifications, "https://fitcoach.example");

  assert.equal((digest.html.match(/<li>/g) ?? []).length, 21);
  assert.match(digest.html, /Workout 20/);
  assert.doesNotMatch(digest.html, /Workout 21/);
  assert.match(digest.html, /And 2 more notifications\./);
  assert.match(digest.text, /And 2 more notifications\./);
});

function mockAdmin({
  notifications = [],
  settings = [],
  updates = { count: 0 },
  getUserById = async () => ({ data: { user: { email: "daily@example.com" } }, error: null }),
}: {
  notifications?: object[];
  settings?: object[];
  updates?: { count: number };
  getUserById?: (id: string) => Promise<unknown>;
} = {}) {
  const admin = {
    from(table: string) {
      const data = table === "notification_settings" ? settings : notifications;
      const query = {
        select() { return query; },
        update() {
          if (table === "notifications") updates.count++;
          return query;
        },
        eq() { return query; },
        is() { return query; },
        gt() { return query; },
        gte() { return query; },
        lte() { return query; },
        in() { return query; },
        order() { return query; },
        range() { return query; },
        then(onfulfilled: (value: { data: object[]; error: null }) => unknown, onrejected?: (reason: unknown) => unknown) {
          return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
    auth: { admin: { getUserById } },
  };
  return admin;
}

test("instant emails never claim daily or disabled users' notifications", async () => {
  const updates = { count: 0 };
  let sendCount = 0;
  const admin = mockAdmin({
    notifications: [
      { id: "daily-row", recipient_id: "daily", kind: "message", title: "Daily", body: null, link: null, created_at: new Date().toISOString() },
      { id: "disabled-row", recipient_id: "disabled", kind: "message", title: "Disabled", body: null, link: null, created_at: new Date().toISOString() },
    ],
    settings: [
      { user_id: "daily", email_enabled: true, email_frequency: "daily" },
      { user_id: "disabled", email_enabled: false, email_frequency: "instant" },
    ],
    updates,
  });

  const result = await emailNewNotifications(
    { athleteId: "athlete", kind: "message", origin: "https://fitcoach.example" },
    {
      admin: admin as never,
      configured: () => true,
      sendEmail: async () => {
        sendCount++;
        return { sent: true };
      },
    },
  );

  assert.deepEqual(result, { emailed: 0, skipped: 2, failed: 0 });
  assert.equal(updates.count, 0);
  assert.equal(sendCount, 0);
});

test("daily digest send failure leaves notifications unmarked", async () => {
  const updates = { count: 0 };
  const admin = mockAdmin({
    notifications: [
      { id: "unread-row", recipient_id: "daily", kind: "message", title: "Unread", body: null, link: "/athlete", created_at: new Date().toISOString() },
    ],
    settings: [{ user_id: "daily", email_enabled: true, email_frequency: "daily" }],
    updates,
  });
  const result = await emailDailyDigests(
    { origin: "https://fitcoach.example" },
    {
      admin: admin as never,
      configured: () => true,
      sendEmail: async () => ({ sent: false }),
      now: () => new Date(),
    },
  );

  assert.deepEqual(result, { users: 1, emailed: 0, skipped: 0, failed: 1 });
  assert.equal(updates.count, 0);
});

test("email digest cron rejects an invalid bearer token", async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "expected-secret";
  try {
    const response = await GET(new Request("https://fitcoach.example/api/cron/email-digest", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    assert.equal(response.status, 401);
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});
