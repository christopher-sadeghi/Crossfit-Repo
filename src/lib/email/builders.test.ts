import assert from "node:assert/strict";
import test from "node:test";

import { coachInviteEmail } from "./builders";

test("coach invite email escapes user text and creates an absolute join link", () => {
  const email = coachInviteEmail({
    coachName: "<Coach>",
    gymName: "A&B",
    link: "/join-coach/token",
    origin: "https://fitcoach.example/",
  });
  assert.match(email.subject, /coach invitation/i);
  assert.match(email.text, /https:\/\/fitcoach\.example\/join-coach\/token/);
  assert.match(email.html, /&lt;Coach&gt;/);
  assert.match(email.html, /A&amp;B/);
  assert.match(email.html, /href="https:\/\/fitcoach\.example\/join-coach\/token"/);
});
