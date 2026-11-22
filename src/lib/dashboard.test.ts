import assert from "node:assert/strict";
import test from "node:test";

import type { AthleteScheduleItem } from "./athlete-schedule";
import { todaysWorkouts, weekCompletion } from "./dashboard";

const today = "2026-11-23";
const session = (id: string, source: AthleteScheduleItem["source"], date = today): AthleteScheduleItem => ({
  workout: { id, source_workout_id: null, title: id, week_number: 1, day_number: 1 },
  date,
  source,
  programId: source === "one_off" ? null : source,
  programName: source === "one_off" ? null : source,
});

test("today's WODs use the supplied local date, include each schedule type, and group shared workouts", () => {
  const group = session("Group workout", "group");
  const rows = todaysWorkouts([
    { athlete: { fullName: "Athlete A" }, schedule: [group, session("Personal workout", "personal"), session("Tomorrow", "group", "2026-11-24")] },
    { athlete: { fullName: "Athlete B" }, schedule: [group, session("One-off", "one_off"), { ...session("Removed", "group"), removed: true }] },
  ], today);
  assert.deepEqual(rows.map(({ item, athleteNames }) => [item.source, athleteNames]), [
    ["group", ["Athlete A", "Athlete B"]], ["one_off", ["Athlete B"]], ["personal", ["Athlete A"]],
  ]);
  assert.deepEqual(todaysWorkouts([], today), []);
});

test("week completion uses scheduled athlete-days from local Monday and excludes pending days", () => {
  assert.equal(weekCompletion([{
    days: [
      { date: "2026-11-22", status: "missed" },
      { date: "2026-11-23", status: "completed" },
      { date: "2026-11-24", status: "pending" },
      { date: "2026-11-25", status: "completed" },
    ],
  }, {
    days: [{ date: "2026-11-23", status: "partial" }, { date: "2026-11-24", status: "rest" }],
  }], "2026-11-24"), 75);
  assert.equal(weekCompletion([{ days: [{ date: today, status: "pending" }] }], today), null);
});
