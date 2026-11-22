import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

import { computeConsistency, drifting, type ConsistencyInput } from "./consistency";

const today = "2026-11-21";
const compute = (input: Partial<ConsistencyInput> = {}) => computeConsistency({
  today, scheduled: [], results: [], attendance: [], ...input,
});
const scheduled = (date: string, workoutId = date) => ({ date, workoutId });

test("day statuses, any-date workout matching, same-date results, and pending streak", () => {
  const stats = compute({
    scheduled: [scheduled("2026-11-16"), scheduled("2026-11-17", "a"), scheduled("2026-11-17", "b"), scheduled("2026-11-18"), scheduled("2026-11-20"), scheduled(today), scheduled("2026-11-22")],
    results: [{ performed_on: "2026-11-15", workout_id: "a" }, { performed_on: "2026-11-19", workout_id: "2026-11-18" }, { performed_on: "2026-11-20", workout_id: "other" }],
  });
  const statuses = Object.fromEntries(stats.days.map((d) => [d.date, d.status]));
  assert.equal(statuses["2026-11-16"], "missed");
  assert.equal(statuses["2026-11-17"], "partial");
  assert.equal(statuses["2026-11-18"], "completed");
  assert.equal(statuses[today], "pending");
  assert.equal(statuses["2026-11-19"], "extra");
  assert.equal(statuses["2026-11-14"], "rest");
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.bestStreak, 3);
  assert.deepEqual(stats.windows[7], { scheduled: 4, completed: 2, partial: 1, missed: 1, rate: 63 });
  assert.equal(stats.days.length, 90);
});

test("same-day results cover at most one scheduled workout each", () => {
  const input = {
    scheduled: [scheduled(today, "a"), scheduled(today, "b")],
    results: [{ performed_on: today, workout_id: "a" }],
  };
  assert.equal(compute(input).days.at(-1)?.status, "partial");
  assert.equal(compute({ ...input, results: [...input.results, { performed_on: today, workout_id: "other" }] }).days.at(-1)?.status, "completed");
  assert.equal(compute({ ...input, results: [{ performed_on: today, workout_id: "other" }] }).days.at(-1)?.status, "partial");
});

test("attendance completes all workouts; extras do not enter rate; future activity ignored", () => {
  const stats = compute({
    scheduled: [scheduled(today, "a"), scheduled(today, "b")],
    attendance: [{ attended_on: today, kind: "class" }, { attended_on: "2026-11-20", kind: "open_gym" }, { attended_on: "2026-11-22", kind: "class" }],
    results: [{ performed_on: "2026-11-22", workout_id: "a" }],
  });
  assert.equal(stats.windows[7].rate, 100);
  assert.equal(stats.windows[7].scheduled, 1);
  assert.equal(stats.lastActivityDate, today);
  assert.equal(stats.daysSinceActivity, 0);
  assert.equal(stats.days.at(-2)?.status, "extra");
});

test("inclusive 7/30/90 boundaries and previous 30 days", () => {
  const stats = compute({
    scheduled: ["2026-11-15", "2026-11-14", "2026-10-23", "2026-10-22", "2026-09-23", "2026-08-24", "2026-08-23"].map((d) => scheduled(d)),
  });
  assert.equal(stats.windows[7].scheduled, 1);
  assert.equal(stats.windows[30].scheduled, 3);
  assert.equal(stats.windows[90].scheduled, 6);
  assert.equal(stats.prev30.scheduled, 2);
  assert.equal(stats.windows[90].rate, 0);
});

test("missed resets current but preserves best streak across rest days", () => {
  const stats = compute({
    scheduled: ["2026-11-10", "2026-11-12", "2026-11-14"].map((d) => scheduled(d)),
    attendance: ["2026-11-10", "2026-11-12"].map((attended_on) => ({ attended_on, kind: "class" })),
  });
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.bestStreak, 2);
});

test("inactive threshold and no drift with recent activity", () => {
  const stats = compute({ attendance: [{ attended_on: "2026-11-16", kind: "class" }] });
  assert.deepEqual(drifting(stats).reasons, ["inactive"]);
  assert.equal(drifting(stats, { driftDays: 6 }).drifting, false);
  assert.equal(stats.daysSinceActivity, 5);
});

test("never-active stays flagged after any non-pending scheduled day in loaded history", () => {
  assert.equal(drifting(compute()).drifting, false);
  assert.equal(drifting(compute({ scheduled: [scheduled(today)] })).drifting, false);
  assert.equal(drifting(compute({ scheduled: [scheduled("2026-11-16")] })).drifting, true);
  assert.equal(drifting(compute({ scheduled: [scheduled("2026-11-01")] }), { driftDays: 5 }).drifting, true);
  const oldHistory = compute({ scheduled: [scheduled("2026-01-01")] });
  assert.equal(oldHistory.scheduledDaysTotal, 1);
  assert.equal(drifting(oldHistory).drifting, true);
  assert.deepEqual(drifting(compute({ scheduled: [scheduled("2026-11-17")] })).reasons, ["inactive"]);
  assert.equal(compute().windows[30].rate, null);
});

test("declining requires sufficient previous days and a 25 point drop", () => {
  const previous = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
  const base = {
    scheduled: [...previous, "2026-11-20"].map((d) => scheduled(d)),
    attendance: previous.map((attended_on) => ({ attended_on, kind: "class" })),
  };
  assert.deepEqual(drifting(compute(base), { driftDays: 60 }).reasons, ["declining"]);
  assert.equal(drifting(compute({ ...base, scheduled: base.scheduled.slice(1) }), { driftDays: 60 }).drifting, false);
  assert.equal(drifting(compute({ ...base, attendance: [...base.attendance, { attended_on: "2026-11-20", kind: "class" }] })).drifting, false);
  assert.equal(drifting(compute({ ...base, scheduled: base.scheduled.slice(0, 4) }), { driftDays: 60 }).drifting, false);
});

function loaderFixture(rows: Record<string, unknown[]>, failedTable?: string) {
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      calls.push(table);
      const result = { data: rows[table] ?? [], error: failedTable === table ? { message: "unavailable" } : null };
      const query = {
        select: () => query, eq: () => query, gte: () => query, lte: () => query, order: () => query,
        single: async () => ({ ...result, data: result.data[0] }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    },
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src/lib/consistency-data.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "./athlete-schedule": { loadAthleteSchedule: async () => [{ date: today, workout: { id: "w" } }] },
    "./consistency": { computeConsistency, drifting, DEFAULT_DRIFT_DAYS: 5 },
    "./nutrition": { addDays: () => "2025-11-22" },
  };
  new Function("require", "module", "exports", code)((id: string) => dependencies[id], loaded, loaded.exports);
  return { supabase, calls, ...loaded.exports as {
    loadConsistency: (client: unknown, id: string, today: string) => Promise<{ stats: ReturnType<typeof computeConsistency>; attendance: unknown[] }>;
    loadDriftingAthletes: (client: unknown, id: string, today: string, driftDays?: number) => Promise<unknown[]>;
  } };
}

test("loader handles activity, empty results, and query errors", async () => {
  const fixture = loaderFixture({ attendance: [{ attended_on: today, kind: "class" }] });
  const loaded = await fixture.loadConsistency(fixture.supabase, "a", today);
  assert.equal(loaded.stats.windows[7].rate, 100);
  assert.equal(loaded.attendance.length, 1);
  const empty = loaderFixture({});
  assert.equal((await empty.loadConsistency(empty.supabase, "a", today)).stats.windows[7].rate, null);
  for (const table of ["attendance", "workout_results"]) {
    const failure = loaderFixture({}, table);
    await assert.rejects(failure.loadConsistency(failure.supabase, "a", today), /Couldn't load/);
  }
});

test("drifting loader reads settings unless supplied and propagates failures", async () => {
  const fixture = loaderFixture({ coaches: [{ drift_days: 5 }], athletes: [] });
  assert.deepEqual(await fixture.loadDriftingAthletes(fixture.supabase, "c", today), []);
  assert.ok(fixture.calls.includes("coaches"));
  const supplied = loaderFixture({ athletes: [{ id: "a", first_name: "A", last_name: "B" }] });
  assert.deepEqual(await supplied.loadDriftingAthletes(supplied.supabase, "c", today, 5), []);
  assert.ok(!supplied.calls.includes("coaches"));
  for (const table of ["coaches", "athletes"]) {
    const failure = loaderFixture({ coaches: [{ drift_days: 5 }] }, table);
    await assert.rejects(failure.loadDriftingAthletes(failure.supabase, "c", today), /Couldn't load/);
  }
});
