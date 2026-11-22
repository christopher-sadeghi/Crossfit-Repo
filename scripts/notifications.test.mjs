import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/lib/notifications.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ athletes = [], schedules = {}, results = [], rpcError, queryError, thrown = false } = {}) {
  const calls = [];
  const errors = [];
  const queries = [];
  const exports = {};
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (thrown) throw new Error("offline");
      return { error: rpcError };
    },
    from: (table) => {
      queries.push(table);
      const builder = {
        select: () => builder, eq: () => builder, not: () => builder, in: () => builder,
        maybeSingle: async () => ({ data: athletes[0] ?? null, error: queryError }),
        then: (resolve) => resolve({ data: table === "athletes" ? athletes : results, error: queryError }),
      };
      return builder;
    },
  };
  vm.runInNewContext(source, {
    exports,
    console: { error: (...args) => errors.push(args) },
    require: (name) => {
      if (name.endsWith("athlete-schedule")) return { loadAthleteSchedule: async (_, id, range) => {
        assert.equal(range.to, "2026-11-20");
        return schedules[id] ?? [];
      } };
      if (name.endsWith("time-zone")) return { getToday: async () => "2026-11-21" };
      if (name.endsWith("program-dates")) return { programDate: (date, week, day) => {
        const value = new Date(`${date}T00:00:00Z`);
        value.setUTCDate(value.getUTCDate() + (week - 1) * 7 + day - 1);
        return value.toISOString().slice(0, 10);
      } };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { helpers: exports, client, calls, errors, queries };
}

test("notify sends RPC parameters and null optional values", async () => {
  const { helpers, client, calls } = fixture();
  await helpers.notify(client, { athleteId: "a", kind: "message", title: "Hello" });
  assert.equal(calls[0].name, "create_notification");
  assert.equal(calls[0].args.p_athlete_id, "a");
  assert.equal(calls[0].args.p_body, null);
  assert.equal(calls[0].args.p_dedupe_key, null);
});

test("notification RPC errors and thrown failures never escape", async () => {
  for (const options of [{ rpcError: { message: "denied" } }, { thrown: true }]) {
    const { helpers, client, errors } = fixture(options);
    await helpers.notifyResultLogged(client, "a", "r");
    assert.equal(errors.length, 1);
  }
});

test("coach-facing notifications name the athlete in titles and bodies", async () => {
  const { helpers, client, calls } = fixture({ athletes: [{ first_name: "Sam", last_name: "Athlete" }] });
  await helpers.notifyResultLogged(client, "a", "r");
  await helpers.notifyMessage(client, "a", "m", "athlete");
  for (const { args } of calls) {
    assert.ok(args.p_title.includes("Sam Athlete"));
    assert.ok(args.p_body.includes("Sam Athlete"));
    assert.ok(!args.p_body.includes("Your athlete"));
  }
});

test("wrappers use the appropriate audience and kinds", async () => {
  const { helpers, client, calls } = fixture();
  await helpers.notifyMessage(client, "a", "m1", "coach");
  await helpers.notifyMessage(client, "a", "m2", "athlete");
  await helpers.notifyWorkoutAdjusted(client, "a", "s");
  await helpers.notifyLowReadiness(client, "a", "2026-11-21");
  await helpers.notifyScheduleChanged(client, "a");
  await helpers.notifySuggestionApproved(client, "a", "s");
  await helpers.notifyProgressReport(client, "a", "r");
  assert.equal(calls[0].args.p_link, "/athlete/messages");
  assert.equal(calls[0].args.p_kind, "coach_message");
  assert.equal(calls[1].args.p_link, "/messages/a");
  assert.equal(calls[1].args.p_kind, "message");
  assert.equal(calls[4].args.p_dedupe_key, null);
  assert.deepEqual(calls.slice(2).map(({ args }) => args.p_kind), ["workout_adjusted", "low_readiness", "schedule_changed", "suggestion_approved", "progress_report"]);
});

const items = [18, 19, 20].map((day) => ({ date: `2026-11-${day}`, workout: { id: `w${day}`, source_workout_id: null } }));

test("missed workouts uses one results batch and dedupes by latest missed day", async () => {
  const { helpers, client, calls, queries } = fixture({
    athletes: [{ id: "a", first_name: "Alex", last_name: "A" }, { id: "b" }],
    schedules: { a: [...items, { date: "2026-11-20", removed: true, workout: { id: "removed" } }], b: items },
    results: [{ athlete_id: "b", workout_id: "w19" }],
  });
  await helpers.checkMissedWorkouts(client, { id: "coach" });
  assert.equal(queries.filter((table) => table === "workout_results").length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_dedupe_key, "missed:a:2026-11-20");
});

test("no athletes, insufficient schedule, completed source workouts and query errors do not notify", async () => {
  for (const options of [
    {},
    { athletes: [{ id: "a" }], schedules: { a: items.slice(1) } },
    { athletes: [{ id: "a" }], schedules: { a: items.map((item) => ({ ...item, workout: { ...item.workout, source_workout_id: "source" } })) }, results: [{ athlete_id: "a", workout_id: "source" }] },
    { queryError: { message: "denied" } },
  ]) {
    const { helpers, client, calls, errors } = fixture(options);
    await helpers.checkMissedWorkouts(client, { id: "coach" });
    assert.equal(calls.length, 0);
    assert.equal(errors.length, options.queryError ? 1 : 0);
  }
});
