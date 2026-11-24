import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(filename) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  new Function("require", "module", "exports", js)(
    (id) =>
      id.startsWith(".")
        ? load(path.resolve(path.dirname(filename), `${id}.ts`))
        : id.startsWith("@/")
          ? load(`src/${id.slice(2)}.ts`)
          : require(id),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const {
  formatSectionHeadline,
  groupBySection,
  normalizeSections,
} = load("src/lib/workout-sections.ts");
const { defaultParts, liftPrCandidates } = load("src/lib/result-parts.ts");
const { prepareWorkoutSavePayload } = load("src/lib/ai/workout-save-payload.ts");

const sections = [
  { title: "A. Back Squat", format: "strength", time_cap_seconds: null, rounds: null },
  { title: "B. Front Rack Lunge", format: "strength", time_cap_seconds: null, rounds: null },
  { title: "C. 20-min AMRAP", format: "amrap", time_cap_seconds: 1200, rounds: null },
];
const movementIds = {
  squat: "10000000-0000-4000-8000-000000000001",
  lunge: "10000000-0000-4000-8000-000000000002",
  row: "10000000-0000-4000-8000-000000000003",
  clean: "10000000-0000-4000-8000-000000000004",
  chestToBar: "10000000-0000-4000-8000-000000000005",
};
const movement = (id, section, values = {}) => ({
  movement_id: id,
  section,
  ...values,
});

test("normalizeSections clears assignments for an unsectioned workout", () => {
  const normalized = normalizeSections([], [movement(movementIds.squat, 3)]);
  assert.deepEqual(normalized.sections, []);
  assert.equal(normalized.movements[0].section, null);
});

test("normalizeSections assigns null to the first section and inherits thereafter", () => {
  const normalized = normalizeSections(sections, [
    movement(movementIds.squat, null),
    movement(movementIds.lunge, null),
  ]);
  assert.deepEqual(normalized.movements.map((item) => item.section), [0, 0]);
});

test("normalizeSections rejects out-of-range movement sections", () => {
  assert.throws(
    () => normalizeSections(sections, [movement(movementIds.squat, 3)]),
    /existing section/,
  );
});

test("normalizeSections stably groups movements by section", () => {
  const normalized = normalizeSections(sections, [
    movement(movementIds.row, 2),
    movement(movementIds.squat, 0),
    movement(movementIds.clean, 2),
  ]);
  assert.deepEqual(
    normalized.movements.map((item) => item.movement_id),
    [movementIds.squat, movementIds.row, movementIds.clean],
  );
});

test("normalizeSections drops empty sections and remaps movement indexes", () => {
  const normalized = normalizeSections(sections, [
    movement(movementIds.squat, 0),
    movement(movementIds.row, 2),
  ]);
  assert.deepEqual(normalized.sections.map(({ title }) => title), [
    sections[0].title,
    sections[2].title,
  ]);
  assert.deepEqual(normalized.movements.map(({ section }) => section), [0, 1]);
});

test("groupBySection falls back to one untitled group for malformed data", () => {
  const groups = groupBySection(
    [movement(movementIds.squat, 5)],
    sections,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].section, null);
  assert.equal(groups[0].index, null);
  assert.equal(groups[0].items[0].movement.movement_id, movementIds.squat);
});

test("formatSectionHeadline describes the section format and cap", () => {
  assert.equal(formatSectionHeadline(sections[2]), "AMRAP 20 min");
  assert.equal(formatSectionHeadline({ ...sections[2], time_cap_seconds: null, rounds: 3, format: "for_time" }), "3 Rounds For Time");
  assert.equal(formatSectionHeadline({ ...sections[2], time_cap_seconds: null, rounds: null, format: "for_time" }), "For Time");
  assert.equal(formatSectionHeadline({ ...sections[2], format: "emom" }), "EMOM 20 min");
  assert.equal(formatSectionHeadline(sections[0]), "Strength");
});

test("defaultParts creates separate strength and conditioning rows for each section movement", () => {
  const parts = defaultParts(
    {
      workout_type: "other",
      sections,
      movements: [
        movement(movementIds.squat, 0, { name: "Back Squat", sets: 5, reps: 5, load_kg: null }),
        movement(movementIds.lunge, 1, { name: "Front Rack Lunge", sets: 4, reps: 10, load_kg: 29.48 }),
        movement(movementIds.row, 2, { name: "Row", sets: null, reps: 12, load_kg: null, calories: 12 }),
        movement(movementIds.clean, 2, { name: "Power Clean", sets: null, reps: 6, load_kg: 43.09 }),
        movement(movementIds.chestToBar, 2, { name: "Chest-to-Bar", sets: null, reps: 8, load_kg: null }),
      ],
    },
    "kg",
  );
  assert.equal(parts.length, 5);
  assert.deepEqual(parts.map(({ movement_id }) => movement_id), Object.values(movementIds));
  assert.equal(parts[0].sets.length, 5);
  assert.equal(parts[1].sets.length, 4);
  assert.deepEqual(parts[2].sets, []);
  assert.equal(parts[2].score, undefined);
  assert.equal(parts[2].load_kg, null);
  assert.deepEqual(parts[3].sets, []);
  assert.equal(parts[3].score, undefined);
  assert.equal(parts[3].load_kg, 43.09);
  assert.equal(parts[4].load_kg, null);
});

test("a conditioning part load does not create a lift PR candidate", () => {
  const parts = defaultParts(
    {
      workout_type: "other",
      sections: [sections[2]],
      movements: [
        movement(movementIds.clean, 0, { name: "Power Clean", sets: null, reps: 6, load_kg: 43.09 }),
      ],
    },
    "kg",
  );
  assert.deepEqual(
    liftPrCandidates(parts, [{ movement_id: movementIds.clean, benchmark_id: "b" }]),
    [],
  );
});

test("AI save payload keeps every exercise as its own section-indexed movement", () => {
  const payload = prepareWorkoutSavePayload(
    {
      title: "Three blocks",
      workout_type: "other",
      time_cap_minutes: null,
      rounds: null,
      description: null,
      notes: null,
      sections: sections.map(({ time_cap_seconds, ...section }) => ({
        ...section,
        time_cap_minutes: time_cap_seconds == null ? null : time_cap_seconds / 60,
      })),
      movements: [
        { movement_id: movementIds.squat, section: 0, sets: 5, reps: 5, load: null, distance_m: null, calories: null, duration_seconds: null, notes: null },
        { movement_id: movementIds.lunge, section: 1, sets: 4, reps: 10, load: 65, distance_m: null, calories: null, duration_seconds: null, notes: null },
        { movement_id: movementIds.row, section: 2, sets: null, reps: 12, load: null, distance_m: null, calories: null, duration_seconds: null, notes: null },
        { movement_id: movementIds.clean, section: 2, sets: null, reps: 6, load: 95, distance_m: null, calories: null, duration_seconds: null, notes: null },
        { movement_id: movementIds.chestToBar, section: 2, sets: null, reps: 8, load: null, distance_m: null, calories: null, duration_seconds: null, notes: null },
      ],
    },
    "lb",
  );
  assert.deepEqual(
    payload.movements.map(({ movement_id, section }) => [movement_id, section]),
    [
      [movementIds.squat, 0],
      [movementIds.lunge, 1],
      [movementIds.row, 2],
      [movementIds.clean, 2],
      [movementIds.chestToBar, 2],
    ],
  );
  assert.equal(payload.workout.sections[2].time_cap_seconds, 1200);
});
