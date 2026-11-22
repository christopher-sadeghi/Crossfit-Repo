import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/lib/notifications.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ athletes = [], schedules = {}, results = [], drifting = [], driftError, suggestion = { suggestion_type: "scale_workout", status: "approved" }, messageError, existingMessage = null, rpcError, queryError, thrown = false } = {}) {
  const calls = [];
  const errors = [];
  const queries = [];
  const messages = [];
  const driftCalls = [];
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
        insert: async (value) => { messages.push(value); return { error: messageError }; },
        maybeSingle: async () => ({ data: table === "ai_suggestions" ? suggestion : table === "messages" ? existingMessage : athletes[0] ?? null, error: queryError }),
        then: (resolve) => resolve({ data: table === "athletes" ? athletes : results, error: queryError }),
      };
      return builder;
    },
  };
  vm.runInNewContext(source, {
    exports,
    console: { error: (...args) => errors.push(args) },
    require: (name) => {
      if (name === "next/server") return { after: () => {} };
      if (name.endsWith("consistency-data")) return { loadDriftingAthletes: async (...args) => {
        driftCalls.push(args);
        if (driftError) throw driftError;
        return drifting;
      } };
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
  return { helpers: exports, client, calls, errors, queries, messages, driftCalls };
}

test("drifting notifications include unlinked athletes, coach settings, reasons and episode keys", async () => {
  const athlete = { id: "a", first_name: "Alex", last_name: "A", user_id: null };
  const row = { athlete, stats: { lastActivityDate: "2026-11-01" }, reasons: ["inactive", "declining"], daysSinceActivity: 20, last30Rate: 25, prev30Rate: 75 };
  const f = fixture({ drifting: [row] });
  await f.helpers.checkDriftingAthletes(f.client, { id: "coach", driftDays: 7 });
  assert.deepEqual(f.driftCalls[0], [f.client, "coach", "2026-11-21", 7]);
  assert.equal(f.calls.length, 2);
  for (const { args } of f.calls) {
    assert.equal(args.p_kind, "missed_workouts");
    assert.equal(args.p_athlete_id, "a");
    assert.equal(args.p_link, "/athletes/a?tab=consistency");
  }
  assert.match(f.calls[0].args.p_title, /Alex A: drifting.*no activity in 20 days/);
  assert.equal(f.calls[0].args.p_dedupe_key, "drifting:inactive:a:2026-11-01");
  assert.match(f.calls[1].args.p_title, /completion down from 75% to 25%/);
  assert.equal(f.calls[1].args.p_dedupe_key, "drifting:declining:a:2026-11");
  const never = fixture({ drifting: [{ ...row, reasons: ["inactive"], stats: { lastActivityDate: null }, daysSinceActivity: null }] });
  await never.helpers.checkDriftingAthletes(never.client, { id: "coach" });
  assert.equal(never.calls[0].args.p_dedupe_key, "drifting:inactive:a:never");
  assert.match(never.calls[0].args.p_title, /no activity recorded/);
});

test("drifting check handles no flags and swallows loader and notification errors", async () => {
  const empty = fixture();
  await empty.helpers.checkDriftingAthletes(empty.client, { id: "coach" });
  assert.equal(empty.calls.length, 0);
  const failed = fixture({ driftError: new Error("unavailable") });
  await failed.helpers.checkDriftingAthletes(failed.client, { id: "coach" });
  assert.equal(failed.errors.length, 1);
  const offline = fixture({ thrown: true, drifting: [{ athlete: { id: "a" }, stats: { lastActivityDate: null }, reasons: ["inactive"], daysSinceActivity: null }] });
  await offline.helpers.checkDriftingAthletes(offline.client, { id: "coach" });
  assert.equal(offline.errors.length, 1);
});

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
  assert.equal(calls[3].args.p_link, "/athletes/a?tab=check-ins");
  assert.deepEqual(calls.slice(2).map(({ args }) => args.p_kind), ["workout_adjusted", "low_readiness", "schedule_changed", "suggestion_approved", "progress_report"]);
});

test("approval notifications use recipient-openable nutrition/workout links and require a decided suggestion", async () => {
  for (const [type, link] of [["adjust_macros", "/athlete/nutrition"], ["write_workout", "/athlete"], ["scale_workout", "/athlete"]]) {
    const { helpers, client, calls } = fixture({ suggestion: { suggestion_type: type, status: "edited" } });
    await helpers.notifySuggestionApproved(client, "a", "s");
    assert.equal(calls[0].args.p_link, link);
    assert.equal(calls[0].args.p_dedupe_key, "approved:s");
  }
  for (const suggestion of [null, { status: "pending" }, { status: "rejected" }]) {
    const { helpers, client, calls } = fixture({ suggestion });
    await helpers.notifySuggestionApproved(client, "a", "s");
    assert.equal(calls.length, 0);
  }
});

test("approved progress summary is posted unlinked to messages before notifying, with safe retries", async () => {
  for (const retry of [false, true]) {
    const { helpers, client, calls, messages, errors } = fixture({
      suggestion: { suggestion_type: "progress_summary", status: "approved", coach_id: "c", final: { summary: "Edited progress report" } },
      ...(retry ? { messageError: { code: "23505" }, existingMessage: { id: "s" } } : {}),
    });
    await helpers.notifySuggestionApproved(client, "a", "s");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, "s");
    assert.equal(messages[0].body, "Edited progress report");
    assert.equal(messages[0].coach_id, "c");
    assert.equal(messages[0].athlete_id, "a");
    assert.equal(messages[0].link_id, undefined);
    assert.equal(calls[0].args.p_kind, "progress_report");
    assert.equal(calls[0].args.p_link, "/athlete/messages");
    assert.equal(errors.length, 0);
  }
});

test("a shared weekly report notification opens its report without posting a message", async () => {
  const { helpers, client, calls, messages } = fixture({ suggestion: { suggestion_type: "weekly_report", status: "edited" } });
  await helpers.notifySuggestionApproved(client, "a", "s");
  assert.equal(messages.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_kind, "progress_report");
  assert.equal(calls[0].args.p_link, "/athlete/reports?report=s#report-s");
  assert.equal(calls[0].args.p_dedupe_key, "report:s");
});

test("failed/malformed report delivery and approval queries never throw or send a broken report link", async () => {
  const suggestion = { suggestion_type: "progress_summary", status: "approved", coach_id: "c", final: { summary: "Report" } };
  for (const options of [
    { queryError: new Error("offline") },
    { suggestion, messageError: new Error("denied") },
    { suggestion, messageError: { code: "23505" } },
    { suggestion: { ...suggestion, final: null } },
    { suggestion: { ...suggestion, final: { summary: "" } } },
  ]) {
    const { helpers, client, calls, errors } = fixture(options);
    await helpers.notifySuggestionApproved(client, "a", "s");
    assert.equal(calls.length, 0);
    assert.equal(errors.length, 1);
  }
});

test("schedule dates and pain notifications include actionable details", async () => {
  const { helpers, client, calls } = fixture();
  await helpers.notifyScheduleChanged(client, "a", { action: "moved", date: "2026-11-22" });
  await helpers.notifyWorkoutAdjusted(client, "a", "s", { applied: false, checkWithCoach: true });
  assert.match(calls[0].args.p_body, /moved.*2026-11-22/);
  assert.equal(calls[0].args.p_dedupe_key, null);
  assert.match(calls[1].args.p_body, /reported pain.*No adjustment was applied/);
  assert.equal(calls[1].args.p_link, "/suggestions/s");
});

const items = [18, 19, 20].map((day) => ({ date: `2026-11-${day}`, workout: { id: `w${day}`, source_workout_id: null } }));

test("missed workouts uses one results batch and dedupes by latest missed day", async () => {
  const { helpers, client, calls, queries } = fixture({
    athletes: [{ id: "a", first_name: "Alex", last_name: "A" }, { id: "b" }],
    schedules: { a: [...items, { date: "2026-11-20", removed: true, workout: { id: "removed" } }], b: items },
    results: [{ athlete_id: "b", workout_id: "w19", performed_on: "2026-11-19" }],
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
    { athletes: [{ id: "a" }], schedules: { a: items.map((item) => ({ ...item, workout: { ...item.workout, source_workout_id: "source" } })) }, results: [{ athlete_id: "a", workout_id: "source", performed_on: "2026-11-19" }] },
    { queryError: { message: "denied" } },
  ]) {
    const { helpers, client, calls, errors } = fixture(options);
    await helpers.checkMissedWorkouts(client, { id: "coach" });
    assert.equal(calls.length, 0);
    assert.equal(errors.length, options.queryError ? 1 : 0);
  }
});

test("missed-workout results must be on or after the scheduled date, including late completions and copied WOD sources", async () => {
  for (const [index, performedOn, expected] of [[2, "2026-11-17", 1], [2, "2026-11-20", 0], [2, "2026-11-21", 0], [0, "2026-11-19", 0], [0, "2026-11-20", 0], [0, "2026-11-18", 0]]) {
    for (const source of [false, true]) {
      const schedule = items.map((item, i) => i === index && source ? { ...item, workout: { ...item.workout, source_workout_id: "source" } } : item);
      const { helpers, client, calls } = fixture({
        athletes: [{ id: "a" }], schedules: { a: schedule },
        results: [{ athlete_id: "a", workout_id: source ? "source" : items[index].workout.id, performed_on: performedOn }],
      });
      await helpers.checkMissedWorkouts(client, { id: "coach" });
      assert.equal(calls.length, expected, `${source ? "source" : "copy"}: ${index} / ${performedOn}`);
    }
  }
});
