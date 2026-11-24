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
  new Function(
    "require",
    "module",
    "exports",
    js,
  )(
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
  defaultParts,
  initialPartsDirty,
  liftPrCandidates,
  liftPrSetLocations,
  partsForVersion,
  partsSummary,
  resultPartsSchema,
  samePartsContent,
  shouldResetParts,
} = load("src/lib/result-parts.ts");
const { maxDoneSetLoad, submittedParts } = load("src/lib/result-part-prs.ts");
const { buildScore, scoreSchema } = load("src/lib/result-score.ts");
const movementId = "10000000-0000-4000-8000-000000000001";
const benchmarkId = "20000000-0000-4000-8000-000000000001";

test("result parts schema is strict and enforces part, set, and value limits", () => {
  const valid = {
    position: 0,
    movement_id: movementId,
    name: "Back Squat",
    sets: [{ reps: 5, load_kg: 100, done: true }],
  };
  assert.equal(resultPartsSchema.safeParse([valid]).success, true);
  assert.equal(
    resultPartsSchema.safeParse([{ ...valid, unexpected: true }]).success,
    false,
  );
  assert.equal(
    resultPartsSchema.safeParse([{ ...valid, sets: [{ ...valid.sets[0], reps: 1001 }] }]).success,
    false,
  );
  assert.equal(
    resultPartsSchema.safeParse([{ ...valid, sets: Array(101).fill(valid.sets[0]) }]).success,
    false,
  );
  assert.equal(resultPartsSchema.safeParse(Array(41).fill(valid)).success, false);
});

test("defaultParts prefill strength, conditioning, and scaled movements", () => {
  const strength = defaultParts(
    {
      workout_type: "strength",
      movements: [
        {
          movement_id: movementId,
          name: "Back Squat",
          sets: 3,
          reps: 5,
          load_kg: 100,
        },
      ],
    },
    "kg",
  );
  assert.deepEqual(strength[0].sets, [
    { reps: 5, load_kg: 100, done: true },
    { reps: 5, load_kg: 100, done: true },
    { reps: 5, load_kg: 100, done: true },
  ]);
  const unspecifiedStrength = defaultParts(
    {
      workout_type: "strength",
      movements: [
        {
          movement_id: movementId,
          name: "Deadlift",
          sets: null,
          reps: null,
          load_kg: null,
        },
      ],
    },
    "kg",
  );
  assert.deepEqual(unspecifiedStrength[0].sets, [
    { reps: null, load_kg: null, done: true },
  ]);
  const cappedStrength = defaultParts(
    {
      workout_type: "strength",
      movements: [
        {
          movement_id: movementId,
          name: "Deadlift",
          sets: 150,
          reps: 1,
          load_kg: null,
        },
      ],
    },
    "kg",
  );
  assert.equal(cappedStrength[0].sets.length, 100);

  const conditioning = defaultParts(
    {
      workout_type: "for_time",
      movements: [
        {
          movement_id: movementId,
          name: "Row",
          sets: null,
          reps: null,
          load_kg: null,
          distance_m: 500,
          calories: null,
          duration_seconds: 120,
        },
      ],
    },
    "lb",
  );
  assert.deepEqual(conditioning[0].sets, []);
  assert.deepEqual(conditioning[0].score, {});

  const scaled = defaultParts(
    {
      movements: [
        {
          movement_id: "10000000-0000-4000-8000-000000000002",
          name: "Goblet Squat",
          sets: 2,
          reps: 8,
          load_kg: 16,
        },
      ],
    },
    "lb",
  );
  assert.equal(scaled[0].name, "Goblet Squat");
  assert.deepEqual(scaled[0].sets[0], { reps: 8, load_kg: 16.01, done: true });
});

test("partsForVersion validates order and movement identity", () => {
  const version = {
    movements: [
      { movement_id: movementId, name: "Back Squat", sets: 3, reps: 5, load_kg: null },
    ],
  };
  const parts = defaultParts(version, "kg");
  assert.deepEqual(partsForVersion(parts, version), parts);
  assert.deepEqual(partsForVersion([], version), []);
  assert.equal(
    partsForVersion(
      [{ ...parts[0], movement_id: "10000000-0000-4000-8000-000000000002" }],
      version,
    ),
    null,
  );
});

test("saved parts remain dirty when their same-movement template changes", () => {
  const saved = [
    {
      position: 0,
      movement_id: movementId,
      name: "Back Squat",
      sets: [{ reps: 5, load_kg: 115, done: true }],
    },
  ];
  const firstTemplate = [
    {
      ...saved[0],
      sets: [{ reps: 5, load_kg: 100, done: true }],
    },
  ];
  const otherDateTemplate = [
    {
      ...firstTemplate[0],
      sets: [{ reps: 3, load_kg: 105, done: true }],
    },
  ];
  const changedMovement = [
    {
      ...otherDateTemplate[0],
      movement_id: "10000000-0000-4000-8000-000000000002",
    },
  ];
  assert.equal(initialPartsDirty(saved), false);
  assert.equal(initialPartsDirty(saved, saved), false);
  assert.equal(initialPartsDirty(saved, firstTemplate), true);
  assert.equal(
    shouldResetParts(
      saved,
      otherDateTemplate,
      initialPartsDirty(saved, firstTemplate),
    ),
    false,
  );
  assert.equal(
    shouldResetParts(
      saved,
      changedMovement,
      initialPartsDirty(saved, firstTemplate),
    ),
    true,
  );
  assert.equal(samePartsContent(saved, saved), true);
});

test("submitted part loads convert to kg and the fallback uses completed sets only", () => {
  const submitted = submittedParts(
    JSON.stringify([
      {
        position: 0,
        movement_id: movementId,
        name: "Back Squat",
        sets: [
          { reps: 5, load_kg: 110.23, done: true },
          { reps: 5, load_kg: 150, done: false },
        ],
      },
    ]),
    "lb",
  );
  assert.equal(submitted.value[0].sets[0].load_kg, 50);
  assert.equal(
    maxDoneSetLoad([
      {
        position: 0,
        movement_id: movementId,
        name: "Back Squat",
        sets: [
          { reps: 5, load_kg: 100, done: false },
          { reps: 5, load_kg: 90, done: true },
        ],
      },
    ]),
    90,
  );
  assert.equal(submittedParts("invalid", "kg").error, "Part results must be valid JSON.");
});

test("a zero-load strength score is valid for a completed set fallback", () => {
  assert.deepEqual(buildScore(scoreSchema.parse({ load: "0" }), "strength", "kg"), {
    score: { time_seconds: null, rounds: null, reps: null, load_kg: 0 },
  });
});

test("partsSummary formats loads in lb and kg", () => {
  const parts = [
    {
      position: 0,
      movement_id: movementId,
      name: "Back Squat",
      sets: [
        { reps: 5, load_kg: 83.91, done: true },
        { reps: 5, load_kg: 83.91, done: true },
        { reps: 5, load_kg: 88.45, done: true },
      ],
    },
  ];
  assert.equal(
    partsSummary(parts, "lb"),
    "Back Squat 3x5 @ 185, 185, 195 lb",
  );
  assert.equal(
    partsSummary(parts, "kg"),
    "Back Squat 3x5 @ 83.9, 83.9, 88.5 kg",
  );
});

test("liftPrCandidates requires a strictly heavier load at the same rep count", () => {
  const parts = [
    {
      position: 0,
      movement_id: movementId,
      name: "Back Squat",
      sets: [
        { reps: 1, load_kg: 100, done: true },
        { reps: 5, load_kg: 95, done: true },
      ],
    },
  ];
  const candidates = liftPrCandidates(parts, [
    { benchmark_id: benchmarkId, movement_id: movementId, rep_max: 1, load_kg: 100 },
    { benchmark_id: benchmarkId, movement_id: movementId, rep_max: 5, load_kg: 90 },
  ]);
  assert.deepEqual(candidates, [
    {
      benchmark_id: benchmarkId,
      movement_id: movementId,
      position: 0,
      set_index: 1,
      reps: 5,
      load_kg: 95,
    },
  ]);
});

test("liftPrCandidates records a first lift result without earlier history", () => {
  const parts = [
    {
      position: 0,
      movement_id: movementId,
      name: "Back Squat",
      sets: [{ reps: 5, load_kg: 90, done: true }],
    },
  ];
  assert.deepEqual(
    liftPrCandidates(parts, [
      { benchmark_id: benchmarkId, movement_id: movementId, rep_max: 5, load_kg: null },
    ]),
    [
      {
        benchmark_id: benchmarkId,
        movement_id: movementId,
        position: 0,
        set_index: 0,
        reps: 5,
        load_kg: 90,
      },
    ],
  );
});

test("liftPrCandidates keeps only the heaviest qualifying set per movement and rep count", () => {
  const parts = [
    {
      position: 0,
      movement_id: movementId,
      name: "Back Squat",
      sets: [
        { reps: 5, load_kg: 90, done: true },
        { reps: 5, load_kg: 105, done: true },
        { reps: 5, load_kg: 100, done: true },
        { reps: 5, load_kg: 200, done: false },
        { reps: 21, load_kg: 300, done: true },
      ],
    },
  ];
  assert.deepEqual(
    liftPrCandidates(parts, [
      { benchmark_id: benchmarkId, movement_id: movementId, rep_max: 5, load_kg: 95 },
    ]),
    [
      {
        benchmark_id: benchmarkId,
        movement_id: movementId,
        position: 0,
        set_index: 1,
        reps: 5,
        load_kg: 105,
      },
    ],
  );
});

test("liftPrSetLocations finds the saved PR set", () => {
  const parts = [
    {
      position: 0,
      movement_id: movementId,
      name: "Back Squat",
      sets: [
        { reps: 5, load_kg: 90, done: true },
        { reps: 5, load_kg: 105, done: true },
      ],
    },
  ];
  assert.deepEqual(
    liftPrSetLocations(parts, [
      { movement_id: movementId, rep_max: 5, load_kg: 105 },
    ]),
    [{ position: 0, set_index: 1 }],
  );
});
