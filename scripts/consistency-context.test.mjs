import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative, overrides = {}) {
  const filename = path.resolve(root, relative);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => overrides[id] ?? (id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, overrides) : require(id));
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { computeConsistency } = load("src/lib/consistency.ts");
const asOf = "2026-11-22";
test("training load context summarizes both training sources and limits recent activity details", async () => {
  const instance = {};
  const activities = Array.from({ length: 7 }, () => ({
    performed_on: asOf, activity_type: "hike", custom_label: "Hill hike", duration_minutes: 180, rpe: 5, notes: "Not needed in prompt",
  }));
  const { trainingLoadContext } = load("src/lib/ai/athlete-context.ts", {
    "@/lib/consistency-data": {},
    "@/lib/training-load-data": { loadTrainingLoad: async (...args) => {
      assert.deepEqual(args, [instance, "athlete", asOf, 4]);
      return { weekly: [{}, {}, {}, { gym: 200.2, outside: 900, estimatedGymSessions: 1 }],
        acute: 1100.2, chronic: 700.1, ratio: 1.5714, estimatedGymSessions28: 2, activities };
    } },
  });
  const context = await trainingLoadContext(instance, "athlete", asOf);
  assert.equal(context.gym_load_last_7_days, 200);
  assert.equal(context.outside_load_last_7_days, 900);
  assert.equal(context.acute_chronic_ratio, 1.57);
  assert.equal(context.estimated_gym_sessions_last_28_days, 2);
  assert.equal(context.recent_outside_activities.length, 5);
  assert.deepEqual(context.recent_outside_activities[0], {
    date: asOf, type: "hike", label: "Hill hike", duration_minutes: 180, rpe: 5, session_load: 900,
  });
});

function fixture({ input = {}, attendance = [], driftDays = 5, errorTable, loadError } = {}) {
  const stats = computeConsistency({ today: asOf, scheduled: [], results: [], attendance, ...input });
  const calls = [];
  const { consistencyContext } = load("src/lib/ai/athlete-context.ts", {
    "@/lib/consistency-data": { loadConsistency: async (...args) => {
      calls.push(args);
      if (loadError) throw loadError;
      return { stats, attendance };
    } },
  });
  const filters = [];
  const client = { from(table) { return {
    select() { return this; }, eq(...args) { filters.push([table, ...args]); return this; },
    async single() { return { data: table === "athletes" ? { coach_id: "coach" } : { drift_days: driftDays }, error: table === errorTable ? new Error("query failed") : null }; },
  }; } };
  return { run: () => consistencyContext(client, "athlete", asOf), stats, calls, filters, client };
}
test("compact context includes rates, counts, streaks and inclusive attendance boundaries", async () => {
  const f = fixture({ attendance: ["2026-10-23", "2026-10-24", asOf, asOf, "2026-11-23"].map((attended_on) => ({ attended_on, kind: "class" })),
    input: { scheduled: [{ date: "2026-11-21", workoutId: "a" }], results: [{ performed_on: "2026-11-21", workout_id: "a" }] } });
  const context = await f.run();
  assert.deepEqual(context.last_7_days, { scheduled_days: 1, completed: 1, partial: 0, missed: 0, completion_rate_percent: 100 });
  assert.equal(context.last_30_days.completion_rate_percent, 100);
  assert.equal(context.last_90_days.completion_rate_percent, 100);
  assert.equal(context.previous_30_days.completion_rate_percent, null);
  assert.ok(!("windows" in context));
  assert.equal(context.current_streak, 1);
  assert.equal(context.best_streak, 1);
  assert.equal(context.last_activity_date, asOf);
  assert.equal(context.days_since_activity, 0);
  assert.equal(context.attendance_count_last_30_days, 3);
  assert.equal(context.drifting, false);
  assert.deepEqual(context.reasons, []);
  assert.equal(context.as_of, asOf);
  assert.deepEqual(f.calls, [[f.client, "athlete", asOf]]);
  assert.ok(f.filters.some((args) => args.join() === "coaches,id,coach"));
  assert.ok(!("days" in context));
  assert.deepEqual(JSON.parse(JSON.stringify(context)), context);
});
test("empty history keeps missing rates and activity null without flagging drift", async () => {
  const context = await fixture().run();
  for (const key of ["last_7_days", "last_30_days", "last_90_days", "previous_30_days"]) {
    assert.deepEqual(context[key], { scheduled_days: 0, completed: 0, partial: 0, missed: 0, completion_rate_percent: null });
  }
  assert.equal(context.days_since_activity, null);
  assert.equal(context.last_activity_date, null);
  assert.equal(context.attendance_count_last_30_days, 0);
  assert.equal(context.current_streak, 0);
  assert.equal(context.drifting, false);
});
test("named windows preserve distinct counts and separate the previous month", async () => {
  const f = fixture({ input: {
    scheduled: ["2026-11-21", "2026-11-10", "2026-11-09", "2026-10-10", "2026-09-10"].map((date) => ({ date, workoutId: date })),
  } });
  const context = await f.run();
  assert.deepEqual(context.last_7_days, { scheduled_days: 1, completed: 0, partial: 0, missed: 1, completion_rate_percent: 0 });
  assert.deepEqual(context.last_30_days, { scheduled_days: 3, completed: 0, partial: 0, missed: 3, completion_rate_percent: 0 });
  assert.deepEqual(context.last_90_days, { scheduled_days: 5, completed: 0, partial: 0, missed: 5, completion_rate_percent: 0 });
  assert.deepEqual(context.previous_30_days, { scheduled_days: 1, completed: 0, partial: 0, missed: 1, completion_rate_percent: 0 });
});
test("coach drift threshold is respected rather than the default", async () => {
  const input = { results: [{ performed_on: "2026-11-16", workout_id: "a" }] };
  assert.equal((await fixture({ input, driftDays: 7 }).run()).drifting, false);
  const context = await fixture({ input, driftDays: 3 }).run();
  assert.equal(context.drift_days, 3);
  assert.equal(context.drifting, true);
  assert.deepEqual(context.reasons, ["inactive"]);
});
test("database and loader errors propagate instead of inventing healthy consistency", async () => {
  for (const errorTable of ["athletes", "coaches"]) await assert.rejects(fixture({ errorTable }).run(), /query failed/);
  await assert.rejects(fixture({ loadError: new Error("activity failed") }).run(), /activity failed/);
});
