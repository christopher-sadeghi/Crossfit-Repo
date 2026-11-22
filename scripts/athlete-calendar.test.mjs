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

const athleteId = "00000000-0000-0000-0000-0000000000a1";
const program = { id: "personal", name: "Group — Alex", athlete_id: athleteId };
const workout = (id, day) => ({ id, source_workout_id: `group-${id}`, title: id, week_number: 1, day_number: day });
const fixtures = {
  assignments: [{ start_date: "2026-11-30", programs: program }],
  programWorkouts: [workout("removed-copy", 1), workout("edited-copy", 2), workout("unchanged-copy", 3)].map((w) => ({ ...w, program_id: program.id })),
  oneOffs: [{ ...workout("replacement", null), scheduled_on: "2026-12-01" }],
  overrides: [{ workout_id: "removed-copy", replacement_workout_id: null }, { workout_id: "edited-copy", replacement_workout_id: "replacement" }],
};

function scheduleClient(data = fixtures, overrideError = null) {
  return {
    from(table) {
      let rows = table === "program_assignments" ? data.assignments : table === "athlete_workout_overrides" ? data.overrides : [];
      const query = {
        select() { return query; }, eq() { return query; }, gte() { return query; }, lte() { return query; },
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
