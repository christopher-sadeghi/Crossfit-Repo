import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function createLoader(mocks = {}) {
  const cache = new Map();
  return function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const js = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const localRequire = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith(".")) return load(path.resolve(path.dirname(filename), `${id}.ts`));
      return require(id);
    };
    new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  };
}

const athleteId = "00000000-0000-4000-8000-0000000000a1";
const program = { id: "personal", name: "Group — Alex", athlete_id: athleteId };
const workout = (id, day) => ({ id, source_workout_id: `group-${id}`, title: id, week_number: 1, day_number: day });
const fixtures = {
  assignments: [{ start_date: "2026-11-30", programs: program }],
  programWorkouts: [workout("removed-copy", 1), workout("edited-copy", 2), workout("unchanged-copy", 3)].map((w) => ({ ...w, program_id: program.id })),
  oneOffs: [{ ...workout("replacement", null), scheduled_on: "2026-12-01" }],
  overrides: [{ workout_id: "removed-copy", replacement_workout_id: null }, { workout_id: "edited-copy", replacement_workout_id: "replacement" }],
};

function scheduleClient(data = fixtures, overrideError = null, calls = []) {
  return {
    from(table) {
      let rows = table === "program_assignments" ? data.assignments : table === "athlete_workout_overrides" ? data.overrides : [];
      const query = {
        select() { return query; }, eq(...args) { calls.push([table, "eq", ...args]); return query; },
        gte(...args) { calls.push([table, "gte", ...args]); return query; },
        lte(...args) { calls.push([table, "lte", ...args]); return query; },
        in() { rows = data.programWorkouts; return query; },
        is() { rows = data.oneOffs; return query; },
        then(resolve, reject) { return Promise.resolve({ data: rows, error: table === "athlete_workout_overrides" ? overrideError : null }).then(resolve, reject); },
      };
      return query;
    },
  };
}

const { loadAthleteSchedule } = createLoader()("src/lib/athlete-schedule.ts");
const range = { from: "2026-11-30", to: "2026-12-06" };
test("transferred personal overrides suppress removed and edited copies, preserving replacement provenance", async () => {
  const items = await loadAthleteSchedule(scheduleClient(), athleteId, range, "id, source_workout_id, title, week_number, day_number");
  assert.deepEqual(items.map((item) => item.workout.id), ["replacement", "unchanged-copy"]);
  assert.deepEqual(items[0].overrides, { workoutId: "edited-copy", programId: program.id, programName: program.name, source: "personal" });
  const removed = await loadAthleteSchedule(scheduleClient(), athleteId, range, "id", { includeRemoved: true });
  assert.deepEqual(removed.filter((item) => item.removed).map((item) => item.workout.id), ["removed-copy"]);
});

test("empty schedules stay empty and override loading errors do not expose hidden workouts", async () => {
  assert.deepEqual(await loadAthleteSchedule(scheduleClient({ assignments: [], oneOffs: [], overrides: [] }), athleteId, range, "id"), []);
  await assert.rejects(loadAthleteSchedule(scheduleClient(fixtures, new Error("DB unavailable")), athleteId, range, "id"), /Couldn't load athlete schedule overrides/);
});

function dayRequestHarness(data = fixtures, options = {}) {
  const calls = { queries: [], builds: [], runs: [], revalidated: [] };
  const load = createLoader({
    "next/cache": { revalidatePath: (value) => calls.revalidated.push(value) },
    "next/navigation": { redirect: (value) => { throw new Error(`redirect:${value}`); } },
    "@/app/(app)/programs/actions": { placeWorkout: () => assert.fail("must not place a workout") },
    "@/lib/supabase/server": { createClient: async () => scheduleClient(data, options.scheduleError, calls.queries) },
    "@/lib/ai/suggestions": { SUGGESTION_REGISTRY: { write_workout: {
      buildRequest: async (_, params) => { calls.builds.push(params); return { input: params, prompt: params.request, system: "existing builder", schema: "generation schema" }; },
      proposalSchema: "proposal schema",
      apply: () => assert.fail("must not apply a pending suggestion"),
    } } },
    "@/lib/ai/service": { runSuggestion: async (params) => { calls.runs.push(params); return options.result ?? { id: "pending-suggestion" }; } },
  });
  const action = load("src/app/(app)/athletes/[id]/calendar-actions.ts").requestAthleteDayWorkout;
  const submit = (request = "", date = "2026-12-06") => {
    const form = new FormData();
    form.set("athlete_id", athleteId);
    form.set("date", date);
    form.set("request", request);
    return action({}, form);
  };
  return { calls, submit };
}

test("day AI request passes the requested week's labeled, override-aware WODs to the existing builder, without applying", async () => {
  const group = { id: "group", name: "Shared plan", athlete_id: null };
  const data = {
    ...fixtures,
    assignments: [...fixtures.assignments, { start_date: "2026-11-30", programs: group }],
    programWorkouts: [...fixtures.programWorkouts, { ...workout("Group session", 4), program_id: group.id }],
    oneOffs: [...fixtures.oneOffs, { ...workout("Extra session", null), scheduled_on: "2026-12-04" }],
  };
  const { submit, calls } = dayRequestHarness(data);
  await assert.rejects(submit("More strength please"), /redirect:\/suggestions\/pending-suggestion/);
  assert.equal(calls.builds.length, 1);
  const input = calls.builds[0];
  assert.equal(input.athleteId, athleteId);
  assert.equal(input.scheduledOn, "2026-12-06");
  assert.equal(input.workoutId, null);
  assert.match(input.request, /^More strength please/);
  assert.match(input.request, /2026-11-30 through 2026-12-06/);
  assert.match(input.request, /Edited from Personal · Group — Alex/);
  assert.match(input.request, /Personal · Group — Alex/);
  assert.match(input.request, /Group · Shared plan/);
  assert.match(input.request, /Just this athlete/);
  assert.match(input.request, /replacement/);
  assert.match(input.request, /unchanged-copy/);
  assert.doesNotMatch(input.request, /removed-copy|edited-copy/);
  assert.ok(calls.queries.some((query) => query.join() === "workouts,gte,scheduled_on,2026-11-30"));
  assert.ok(calls.queries.some((query) => query.join() === "workouts,lte,scheduled_on,2026-12-06"));
  assert.ok(calls.queries.some((query) => query.join() === `program_assignments,eq,athlete_id,${athleteId}`));
  assert.equal(calls.runs.length, 1);
  assert.equal(calls.runs[0].type, "write_workout");
  assert.equal(calls.runs[0].schema, "proposal schema");
  assert.equal(calls.runs[0].generationSchema, "generation schema");
  assert.equal(calls.runs[0].input, input);
});

test("day AI request handles an empty week and default instructions", async () => {
  const { submit, calls } = dayRequestHarness({ assignments: [], overrides: [], oneOffs: [] });
  await assert.rejects(submit(), /redirect:\/suggestions\/pending-suggestion/);
  assert.match(calls.builds[0].request, /^Write a WOD for this athlete on 2026-12-06/);
  assert.match(calls.builds[0].request, /empty means no scheduled WODs\):\n\[\]/);
});

test("invalid input, schedule errors and generator errors return errors rather than applying or redirecting", async () => {
  const invalid = dayRequestHarness();
  assert.ok((await invalid.submit("", "not-a-date")).error);
  assert.equal(invalid.calls.builds.length, 0);
  const unavailable = dayRequestHarness(fixtures, { scheduleError: new Error("DB unavailable") });
  assert.match((await unavailable.submit()).error, /couldn't make a suggestion/);
  assert.equal(unavailable.calls.builds.length, 0);
  assert.equal(unavailable.calls.runs.length, 0);
  const rejected = dayRequestHarness(fixtures, { result: { error: "AI unavailable" } });
  assert.equal((await rejected.submit()).error, "AI unavailable");
  assert.equal(rejected.calls.revalidated.length, 0);
});
