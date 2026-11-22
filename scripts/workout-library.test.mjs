import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith("@/") && !id.startsWith(".")) return require(id);
    const base = id.startsWith("@/") ? path.resolve(root, `src/${id.slice(2)}`) : path.resolve(path.dirname(filename), id);
    return load(path.relative(root, existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`), mocks);
  };
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

test("workout library labels standalone and program WODs and excludes the current program", async () => {
  const { loadWorkoutLibrary } = load("src/lib/workout-library.ts");
  const calls = [];
  const rows = [
    { id: "standalone", title: "Open WOD", program_id: null, programs: null },
    { id: "other-program", title: "Intervals", program_id: "other", programs: { name: "Engine" } },
    { id: "current-program", title: "Squats", program_id: "current", programs: { name: "Strength" } },
  ];
  const query = {
    select(value) { calls.push(["select", value]); return query; },
    is(...args) { calls.push(["is", ...args]); return query; },
    order(value) { calls.push(["order", value]); return Promise.resolve({ data: rows, error: null }); },
  };
  const library = await loadWorkoutLibrary({ from: (table) => {
    calls.push(["from", table]);
    return query;
  } }, "current");

  assert.deepEqual(library, [
    { id: "standalone", title: "Open WOD" },
    { id: "other-program", title: "Intervals · Engine" },
  ]);
  assert.deepEqual(calls, [
    ["from", "workouts"],
    ["select", "id, title, program_id, programs(name)"],
    ["is", "athlete_id", null],
    ["order", "title"],
  ]);
});

const targetProgramId = "00000000-0000-4000-8000-000000000002";
const sourceWorkoutId = "00000000-0000-4000-8000-000000000003";
const copiedWorkoutId = "00000000-0000-4000-8000-000000000004";
const movement = {
  movement_id: "00000000-0000-4000-8000-000000000005",
  position: 2,
  sets: 3,
  reps: 5,
  load_kg: 60,
  distance_m: null,
  calories: null,
  duration_seconds: null,
  notes: "Scale as needed",
};

function createActionHarness({ source, movementError = null, updateCount = 1 } = {}) {
  const calls = { inserts: [], movementInserts: [], updates: [], deletedIds: [], copies: [], revalidated: [] };
  const copyRows = calls.copies;
  const supabase = {
    from(table) {
      const filters = [];
      let operation = null;
      let payload = null;
      let options = null;
      const query = {
        select(value) {
          calls.selects ??= [];
          calls.selects.push([table, value]);
          if (!operation) operation = "select";
          return query;
        },
        eq(...args) { filters.push(["eq", ...args]); return query; },
        is(...args) { filters.push(["is", ...args]); return query; },
        maybeSingle() {
          return Promise.resolve({ data: table === "programs" ? { weeks: 6 } : source, error: null });
        },
        insert(value) {
          operation = "insert";
          payload = value;
          if (table === "workouts") {
            calls.inserts.push(value);
            copyRows.push({ id: copiedWorkoutId, ...value });
          } else if (table === "workout_movements") {
            calls.movementInserts.push(value);
          }
          return query;
        },
        update(value, opts) {
          operation = "update";
          payload = value;
          options = opts;
          calls.updates.push({ payload, options, filters });
          return query;
        },
        delete() {
          operation = "delete";
          return query;
        },
        single() {
          return Promise.resolve({ data: { id: copiedWorkoutId }, error: null });
        },
        then(resolve, reject) {
          let result = { error: null };
          if (table === "workout_movements" && operation === "insert") {
            result = { error: movementError };
          } else if (table === "workouts" && operation === "update") {
            result = { count: updateCount, error: null };
          } else if (table === "workouts" && operation === "delete") {
            calls.deletedIds.push(filters.find(([kind, column]) => kind === "eq" && column === "id")?.[2]);
            const copyIndex = copyRows.findIndex((copy) => copy.id === copiedWorkoutId);
            if (copyIndex !== -1) copyRows.splice(copyIndex, 1);
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const action = load("src/app/(app)/programs/actions.ts", {
    "next/cache": { revalidatePath: (value) => calls.revalidated.push(value) },
    "next/navigation": { redirect: () => assert.fail("unexpected redirect") },
    "@/lib/auth/form-state": { failure: (_, error) => ({ error }) },
    "@/lib/supabase/server": { createClient: async () => supabase },
  }).placeWorkout;
  const submit = () => {
    const form = new FormData();
    form.set("program_id", targetProgramId);
    form.set("workout_id", sourceWorkoutId);
    form.set("week_number", "2");
    form.set("day_number", "3");
    return action({}, form);
  };
  return { calls, source, submit };
}

function sourceWorkout(overrides = {}) {
  return {
    athlete_id: null,
    program_id: "00000000-0000-4000-8000-000000000006",
    title: "Benchmark WOD",
    workout_type: "for_time",
    time_cap_seconds: 600,
    rounds: 3,
    description: "Three rounds for time",
    notes: "Keep transitions smooth",
    workout_movements: [movement],
    ...overrides,
  };
}

test("placing a program WOD copies its fields and movements without changing the original", async () => {
  const source = sourceWorkout();
  const original = structuredClone(source);
  const { calls, submit } = createActionHarness({ source });

  assert.deepEqual(await submit(), { message: "WOD copied to the calendar." });
  assert.deepEqual(calls.inserts, [{
    title: "Benchmark WOD",
    workout_type: "for_time",
    time_cap_seconds: 600,
    rounds: 3,
    description: "Three rounds for time",
    notes: "Keep transitions smooth",
    program_id: targetProgramId,
    week_number: 2,
    day_number: 3,
    athlete_id: null,
    scheduled_on: null,
    source_workout_id: null,
  }]);
  assert.deepEqual(calls.movementInserts, [[{ ...movement, workout_id: copiedWorkoutId }]]);
  assert.deepEqual(source, original);
  assert.deepEqual(calls.revalidated, [`/programs/${targetProgramId}`, "/programs/workouts"]);
});

test("a program WOD copy rolls back when its movements cannot be copied", async () => {
  const source = sourceWorkout();
  const original = structuredClone(source);
  const { calls, submit } = createActionHarness({ source, movementError: new Error("insert failed") });

  const result = await submit();
  assert.match(result.error, /movements/);
  assert.deepEqual(calls.deletedIds, [copiedWorkoutId]);
  assert.deepEqual(calls.copies, []);
  assert.deepEqual(source, original);
});

test("placing a standalone WOD keeps the existing move behavior", async () => {
  const source = sourceWorkout({ program_id: null });
  const original = structuredClone(source);
  const { calls, submit } = createActionHarness({ source });

  assert.deepEqual(await submit(), { message: "WOD added to the calendar." });
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.movementInserts.length, 0);
  assert.equal(calls.updates.length, 1);
  assert.deepEqual(
    Object.fromEntries(Object.entries(calls.updates[0].payload).filter(([key]) => key !== "updated_at")),
    { program_id: targetProgramId, week_number: 2, day_number: 3, scheduled_on: null },
  );
  assert.deepEqual(calls.updates[0].options, { count: "exact" });
  assert.deepEqual(calls.updates[0].filters, [
    ["eq", "id", sourceWorkoutId],
    ["is", "athlete_id", null],
    ["is", "program_id", null],
  ]);
  assert.deepEqual(source, original);
});

test("program placement still rejects athlete-only one-offs", async () => {
  const { calls, submit } = createActionHarness({ source: sourceWorkout({ athlete_id: "athlete-id", program_id: null }) });
  assert.match((await submit()).error, /One-off WODs/);
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.updates.length, 0);
});

test("program placement labels use generic WOD wording", () => {
  const forms = readFileSync(path.join(root, "src/app/(app)/programs/program-forms.tsx"), "utf8");
  assert.match(forms, /<Label htmlFor="workout_id">WOD<\/Label>/);
  assert.match(forms, /"No WODs yet"/);
  assert.doesNotMatch(forms, /Standalone WOD|No standalone WODs/);
});
