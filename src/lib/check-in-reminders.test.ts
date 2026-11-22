import assert from "node:assert/strict";
import test from "node:test";

import { checkInReminderDecision, isReminderTime, isReminderTimeZone, reminderDue } from "./check-in-reminders";

test("quarter-hour window includes start and excludes end", () => {
  for (const [instant, due] of [
    ["2026-01-15T13:00:00Z", true], ["2026-01-15T13:14:59Z", true],
    ["2026-01-15T13:15:00Z", false], ["2026-01-15T12:59:59Z", false],
  ] as const) {
    assert.deepEqual(reminderDue(new Date(instant), "07:00:00", "America/Chicago"), { due, localDate: "2026-01-15" });
  }
});

test("fractional offsets and local dates ahead of UTC", () => {
  assert.deepEqual(reminderDue(new Date("2026-01-15T01:30:00Z"), "07:00", "Asia/Kolkata"), { due: true, localDate: "2026-01-15" });
  assert.deepEqual(reminderDue(new Date("2026-01-15T17:00:00Z"), "07:00", "Pacific/Kiritimati"), { due: true, localDate: "2026-01-16" });
});

test("spring-forward gap shifts 02:30 to 03:30", () => {
  assert.equal(reminderDue(new Date("2026-03-08T07:00:00Z"), "02:30", "America/New_York").due, false);
  assert.equal(reminderDue(new Date("2026-03-08T07:30:00Z"), "02:30", "America/New_York").due, true);
  assert.equal(reminderDue(new Date("2026-03-08T07:45:00Z"), "02:30", "America/New_York").due, false);
});

test("fall-back overlap fires at first 01:30 only", () => {
  assert.equal(reminderDue(new Date("2026-11-01T05:30:00Z"), "01:30", "America/New_York").due, true);
  assert.equal(reminderDue(new Date("2026-11-01T05:45:00Z"), "01:30", "America/New_York").due, false);
  assert.equal(reminderDue(new Date("2026-11-01T06:30:00Z"), "01:30", "America/New_York").due, false);
});

test("decision suppresses off, checked-in, skipped, sent and not-yet-due reminders", () => {
  const input = { reminder: { remind_at: "07:00", time_zone: "UTC" }, now: new Date("2026-01-15T07:00:00Z") };
  assert.deepEqual(checkInReminderDecision(input), { send: true, push: true });
  for (const overrides of [
    { hasCheckedIn: true }, { hasSkipped: true }, { alreadySent: true },
    { reminder: { remind_at: null, time_zone: "UTC" } }, { now: new Date("2026-01-15T06:00:00Z") },
  ]) assert.deepEqual(checkInReminderDecision({ ...input, ...overrides }), { send: false, push: false });
  assert.deepEqual(checkInReminderDecision({ ...input, pushCategories: [] }), { send: true, push: false });
  assert.deepEqual(checkInReminderDecision({ ...input, pushCategories: ["reminders"] }), { send: true, push: true });
});

test("validates times and zones", () => {
  for (const time of ["00:00", "07:15", "23:45:00"]) assert.equal(isReminderTime(time), true);
  for (const time of ["", "7:00", "24:00", "07:16", "07:15:01"]) assert.equal(isReminderTime(time), false);
  assert.equal(isReminderTimeZone("America/Chicago"), true);
  assert.equal(isReminderTimeZone(""), false);
  assert.equal(isReminderTimeZone("Not/A_Zone"), false);
});
