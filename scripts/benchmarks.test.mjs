import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(path.resolve(path.dirname(filename), `${id}.ts`)) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { estimateOneRepMax, normalizeBenchmarkHistory, retestDue, loadAthleteBenchmarks, loadLiftMaxes } = load("src/lib/benchmarks.ts");
const { liftBestsFromHistory } = load("src/lib/result-part-prs.ts");
const { liftPrCandidates } = load("src/lib/result-parts.ts");
const { bestForMovement, goalProgress } = load("src/lib/progress.ts");
const { formatLiftMaxes, liftMaxContextSchema, LIFT_LOAD_RULE } = load("src/lib/ai/lift-context.ts");
const benchmark = { id: "b", name: "Fran", kind: "girl", workout_type: "for_time", movement_id: null };
const lift = { ...benchmark, name: "Squat", kind: "lift", workout_type: "strength", movement_id: "m" };
const result = (id, date, extra = {}) => ({ id, benchmark_id: "b", performed_on: date, created_at: date, time_seconds: 300, rounds: null, reps: null, load_kg: null, rep_max: null, is_rx: true, notes: null, ...extra });
const scheduled = (id, date, extra = {}) => result(id, date, { workouts: { title: "  fRAn ", workout_type: "for_time", workout_movements: [] }, ...extra });
function client(tables = {}, errorTable) {
  return { from(table) {
    const response = { data: tables[table] ?? [], error: table === errorTable ? new Error("query failed") : null };
    const query = { select() { return this; }, order() { return this; }, eq() { return this; }, single() { return Promise.resolve({ ...response, data: { coach_id: "coach" } }); }, then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); } };
    return query;
  } };
}
test("Epley supports trusted reps only and handles invalid/empty inputs", () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.equal(estimateOneRepMax(100, 3), 110.00000000000001);
  for (const reps of [null, 0, 11, 20, 1.5, NaN]) assert.equal(estimateOneRepMax(100, reps), null);
  for (const kg of [null, -1, Infinity, NaN]) assert.equal(estimateOneRepMax(kg, 1), null);
});
test("WOD history merges sources, matches normalized type/title and flags strict improvements only", () => {
  const attempts = normalizeBenchmarkHistory(benchmark, [result("d", "2026-01-02", { time_seconds: 290 }), result("tie", "2026-01-03", { time_seconds: 290 }), result("scaled", "2026-01-04", { is_rx: false, time_seconds: 100 })], [scheduled("w", "2026-01-01"), scheduled("wrong", "2026-01-01", { workouts: { title: "Fran", workout_type: "amrap", workout_movements: [] } })]);
  assert.deepEqual(attempts.map((a) => [a.id, a.isPr]), [["w", false], ["d", true], ["tie", false], ["scaled", false]]);
  assert.deepEqual(normalizeBenchmarkHistory(benchmark, [], []), []);
});
test("lifts match movements and use movement reps, result reps, then one", () => {
  const w = (id, movementReps, resultReps) => scheduled(id, `2026-01-0${id}`, { load_kg: 100, reps: resultReps, workouts: { title: "Strength", workout_type: "strength", workout_movements: [{ movement_id: "m", reps: movementReps }] } });
  const attempts = normalizeBenchmarkHistory(lift, [], [w("1", 5, 9), w("2", null, 3), w("3", null, null)]);
  assert.deepEqual(attempts.map((a) => a.rep_max), [5, 3, 1]);
  assert.deepEqual(attempts.map((a) => a.isPr), [false, false, false]);
});
test("scheduled lift parts use the heaviest completed set for each valid rep count", () => {
  const movementId = "10000000-0000-4000-8000-000000000001";
  const result = strengthResult({
    parts: [
      {
        position: 0,
        movement_id: movementId,
        name: "Squat",
        sets: [
          { reps: 5, load_kg: 100, done: true },
          { reps: 5, load_kg: 105, done: true },
          { reps: 3, load_kg: 110, done: true },
          { reps: 3, load_kg: 150, done: false },
          { reps: 21, load_kg: 200, done: true },
          { reps: 1, load_kg: 0, done: true },
        ],
      },
      {
        position: 1,
        movement_id: "10000000-0000-4000-8000-000000000002",
        name: "Other lift",
        sets: [{ reps: 1, load_kg: 500, done: true }],
      },
    ],
  });
  const attempts = normalizeBenchmarkHistory(
    { ...lift, movement_id: movementId },
    [],
    [result],
  );
  assert.deepEqual(
    attempts.map(({ rep_max, load_kg }) => [rep_max, load_kg]),
    [
      [5, 105],
      [3, 110],
    ],
  );
});
test("generated direct lift rows are skipped when their scheduled result is present", () => {
  const scheduledResult = strengthResult({ parts: [] });
  const generated = result("generated", "2026-01-01", {
    benchmark_id: lift.id,
    load_kg: 105,
    rep_max: 5,
    source_result_id: scheduledResult.id,
  });
  const attempts = normalizeBenchmarkHistory(lift, [generated], [scheduledResult]);
  assert.deepEqual(attempts.map((attempt) => attempt.id), [scheduledResult.id]);
});
test("PR history includes legacy strength results", () => {
  const parts = [
    {
      position: 0,
      movement_id: "m",
      name: "Squat",
      sets: [{ reps: 5, load_kg: 115, done: true }],
    },
  ];
  const current = {
    id: "current",
    performed_on: "2026-01-02",
    created_at: "2026-01-02T10:00:00.000Z",
  };
  const legacy = strengthResult({
    id: "legacy",
    performed_on: "2026-01-01",
    created_at: "2026-01-01T10:00:00.000Z",
    parts: [],
    load_kg: 110,
  });
  const bests = liftBestsFromHistory([lift], [], [legacy], current, parts);
  assert.deepEqual(bests, [
    { benchmark_id: "b", movement_id: "m", rep_max: 5, load_kg: 110 },
  ]);
  assert.equal(liftPrCandidates(parts, bests).length, 1);
});
test("editing an older PR ignores current, same-day later, and future attempts", () => {
  const current = {
    id: "older-pr",
    performed_on: "2026-01-02",
    created_at: "2026-01-02T10:00:00.000Z",
  };
  const parts = [
    {
      position: 0,
      movement_id: "m",
      name: "Squat",
      sets: [{ reps: 5, load_kg: 115, done: true }],
    },
  ];
  const prior = result("prior", "2026-01-01", {
    benchmark_id: lift.id,
    load_kg: 100,
    rep_max: 5,
    created_at: "2026-01-01T10:00:00.000Z",
  });
  const currentGenerated = result("generated", current.performed_on, {
    benchmark_id: lift.id,
    load_kg: 115,
    rep_max: 5,
    source_result_id: current.id,
    created_at: "2026-01-02T10:01:00.000Z",
  });
  const laterSameDay = result("later-same-day", current.performed_on, {
    benchmark_id: lift.id,
    load_kg: 120,
    rep_max: 5,
    created_at: "2026-01-02T11:00:00.000Z",
  });
  const later = result("later", "2026-01-03", {
    benchmark_id: lift.id,
    load_kg: 130,
    rep_max: 5,
    created_at: "2026-01-03T10:00:00.000Z",
  });
  const currentScheduled = strengthResult({
    id: current.id,
    performed_on: current.performed_on,
    created_at: current.created_at,
    parts,
  });
  const bests = liftBestsFromHistory(
    [lift],
    [prior, currentGenerated, laterSameDay, later],
    [currentScheduled],
    current,
    parts,
  );
  assert.deepEqual(bests, [
    { benchmark_id: "b", movement_id: "m", rep_max: 5, load_kg: 100 },
  ]);
  assert.equal(liftPrCandidates(parts, bests).length, 1);
});
test("high-rep lifts fall back to actual loads for bests and PRs while preserving Rx priority", async () => {
  const direct = [
    result("first", "2026-01-01", { load_kg: 100, rep_max: 12 }),
    result("pr", "2026-01-02", { load_kg: 110, rep_max: 12 }),
    result("tie", "2026-01-03", { load_kg: 110, rep_max: 12 }),
    result("scaled", "2026-01-04", { load_kg: 150, rep_max: 12, is_rx: false }),
    result("lower", "2026-01-05", { load_kg: 105, rep_max: 12 }),
  ];
  const attempts = normalizeBenchmarkHistory(lift, direct, []);
  assert.deepEqual(attempts.map((a) => a.estimatedOneRmKg), [null, null, null, null, null]);
  assert.deepEqual(attempts.map((a) => a.isPr), [false, true, false, false, false]);
  const [b] = await loadAthleteBenchmarks(client({ benchmarks: [lift], benchmark_results: direct }), "a", "2026-01-06");
  assert.equal(b.best.id, "pr");
  const trusted = normalizeBenchmarkHistory(lift, [result("one", "2026-01-01", { load_kg: 110, rep_max: 1 }), result("five", "2026-01-02", { load_kg: 100, rep_max: 5 })], []);
  assert.equal(trusted[1].isPr, true);
});
test("retest uses explicit calendar date and is due strictly after interval", () => {
  assert.equal(retestDue("2026-01-01", 2, "2026-01-15"), false);
  assert.equal(retestDue("2026-01-01", 2, "2026-01-16"), true);
  assert.equal(retestDue(null, 2, "2026-01-16"), false);
  assert.equal(retestDue("2026-01-01", null, "2026-01-16"), false);
});
test("loaders return best/last/trends, actual rep maxes and highest actual or estimated lift", async () => {
  const db = client({ benchmarks: [lift], benchmark_results: [result("one", "2026-01-01", { load_kg: 100, rep_max: 1 }), result("three", "2026-01-02", { load_kg: 95, rep_max: 3 }), result("five", "2026-01-03", { load_kg: 90, rep_max: 5 })], benchmark_settings: [{ benchmark_id: "b", retest_weeks: 2 }] });
  const [b] = await loadAthleteBenchmarks(db, "a", "2026-02-01");
  assert.equal(b.best.id, "five");
  assert.equal(b.last.id, "five");
  assert.equal(b.bestActual.one.id, "one");
  assert.equal(b.bestActual.three.id, "three");
  assert.equal(b.bestActual.five.id, "five");
  assert.equal(b.trendPoints.length, 3);
  assert.equal(b.retestDue, true);
  const [max] = await loadLiftMaxes(db, "a");
  assert.equal(max.actualOneRmKg, 100);
  assert.equal(max.oneRmKg, 105);
  assert.equal(max.estimatedReps, 5);
  assert.equal(max.isEstimated, true);
  assert.equal(bestForMovement([], "m", "load", [max]), 100);
  assert.equal(bestForMovement([], "m", "reps", [max]), null);
  assert.equal(goalProgress({ movement_id: "m", unit: "kg", metric: null, start_value: 50, target_value: 100, status: "active" }, { metrics: [], results: [], liftMaxes: [max] }).reached, true);
});
test("loaders handle empty history and propagate query errors", async () => {
  assert.deepEqual(await loadLiftMaxes(client(), "a"), []);
  assert.deepEqual(await loadAthleteBenchmarks(client(), "a", "2026-01-01"), []);
  const [empty] = await loadAthleteBenchmarks(client({ benchmarks: [lift] }), "a", "2026-01-01");
  assert.equal(empty.best, null);
  assert.equal(empty.last, null);
  assert.equal(empty.retestDue, false);
  for (const table of ["benchmarks", "benchmark_results", "workout_results", "athlete_workout_scalings"]) await assert.rejects(loadLiftMaxes(client({}, table), "a"), /query failed/);
  for (const table of ["athletes", "benchmark_settings"]) await assert.rejects(loadAthleteBenchmarks(client({}, table), "a", "2026-01-01"), /query failed/);
});

const scalingDetails = (movementId, reps) => ({ source: "ai", suggestion_id: "32000000-0000-4000-8000-000000000021", movements: [{ original_movement_id: "m", movement_id: movementId, movement_name: "Movement", sets: 3, reps, load_kg: 100, distance_m: null, calories: null, duration_seconds: null, reason: "Easier" }] });
const scaling = (details, extra = {}) => ({ modifications: "Scaled", details, athlete_adjusted_at: null, coach_modifications: null, coach_details: null, ...extra });
const strengthResult = (extra = {}) => scheduled("w", "2026-01-01", { workout_id: "workout", load_kg: 100, workouts: { title: "Strength", workout_type: "strength", workout_movements: [{ movement_id: "m", reps: 5 }] }, ...extra });

test("scheduled lifts use effective coach scaling movements and reps, with original fallback for invalid details", () => {
  const history = (value) => normalizeBenchmarkHistory(lift, [], [strengthResult({ scaling: value })]);
  assert.equal(history(null)[0].rep_max, 5);
  assert.equal(history(scaling(scalingDetails("m", 3)))[0].rep_max, 3);
  assert.equal(history(scaling({}))[0].rep_max, 5);
  assert.deepEqual(history(scaling(scalingDetails("substitute", 3))), []);
  assert.equal(normalizeBenchmarkHistory({ ...lift, movement_id: "substitute" }, [], [strengthResult({ scaling: scaling(scalingDetails("substitute", 3)) })])[0].rep_max, 3);
});

test("athlete adjustments apply on the result's date, otherwise restoring coach scaling or original movements", () => {
  const adjusted = scaling({ ...scalingDetails("substitute", 2), scheduled_on: "2026-01-01" }, { athlete_adjusted_at: "2026-01-01T12:00:00Z", coach_modifications: "Coach scaling", coach_details: scalingDetails("m", 3) });
  assert.deepEqual(normalizeBenchmarkHistory(lift, [], [strengthResult({ scaling: adjusted })]), []);
  const later = strengthResult({ performed_on: "2026-01-02", scaling: adjusted });
  assert.equal(normalizeBenchmarkHistory(lift, [], [later])[0].rep_max, 3);
  const noCoach = { ...adjusted, coach_modifications: null, coach_details: null };
  assert.equal(normalizeBenchmarkHistory(lift, [], [{ ...later, scaling: noCoach }])[0].rep_max, 5);
});

test("lift loader joins this athlete's workout scaling before calculating maxes", async () => {
  const db = client({ benchmarks: [lift], workout_results: [strengthResult()], athlete_workout_scalings: [{ workout_id: "workout", ...scaling(scalingDetails("m", 1)) }] });
  const [max] = await loadLiftMaxes(db, "a");
  assert.equal(max.actualOneRmKg, 100);
  assert.equal(max.actualDate, "2026-01-01");
  const substituted = client({ benchmarks: [lift], workout_results: [strengthResult()], athlete_workout_scalings: [{ workout_id: "workout", ...scaling(scalingDetails("substitute", 1)) }] });
  assert.equal((await loadLiftMaxes(substituted, "a"))[0].oneRmKg, null);
});

test("AI lift context converts units and keeps the chosen max's source and date", () => {
  const actual = { name: "Back Squat", movement_id: "squat", oneRmKg: 100, isEstimated: false, actualDate: "2026-01-01", estimatedDate: "2026-01-02" };
  const estimated = { ...actual, name: "Deadlift", movement_id: "deadlift", oneRmKg: 150, isEstimated: true };
  const kg = formatLiftMaxes([actual, estimated, { ...actual, oneRmKg: null }], "kg");
  assert.deepEqual(kg, [
    { name: "Back Squat", movement_id: "squat", one_rm: 100, units: "kg", estimated: false, date: "2026-01-01" },
    { name: "Deadlift", movement_id: "deadlift", one_rm: 150, units: "kg", estimated: true, date: "2026-01-02" },
  ]);
  assert.equal(formatLiftMaxes([actual], "lb")[0].one_rm, 220.5);
  assert.equal(liftMaxContextSchema.safeParse(kg).success, true);
  assert.match(LIFT_LOAD_RULE, /75%/);
  assert.match(LIFT_LOAD_RULE, /Never invent/);
});

test("AI max context handles empty history and its optional schema accepts legacy missing fields", () => {
  assert.deepEqual(formatLiftMaxes([], "lb"), []);
  assert.deepEqual(formatLiftMaxes([{ oneRmKg: null }], "kg"), []);
  assert.equal(liftMaxContextSchema.optional().safeParse(undefined).success, true);
  assert.equal(liftMaxContextSchema.safeParse([{ one_rm: "unknown" }]).success, false);
});

test("scaling and benchmark modules initialize in any entry order, preserving schema and resolver exports", () => {
  for (const entry of ["src/lib/ai/scale-workout.ts", "src/lib/benchmarks.ts", "src/lib/ai/athlete-adjust-schema.ts"]) {
    cache.clear();
    load(entry);
    const scale = load("src/lib/ai/scale-workout.ts");
    const schemas = load("src/lib/ai/scale-workout-schema.ts");
    const adjust = load("src/lib/ai/athlete-adjust-schema.ts");
    assert.equal(scale.scaleWorkoutChangeSchema, schemas.scaleWorkoutChangeSchema);
    assert.equal(scale.scaleWorkoutDetailsSchema, schemas.scaleWorkoutDetailsSchema);
    assert.equal(adjust.effectiveScaling, load("src/lib/workout-scaling.ts").effectiveScaling);
    assert.equal(scale.scaleWorkoutDetailsSchema.safeParse(scalingDetails("m", 3)).success, true);
    assert.equal(scale.scaleWorkoutDetailsSchema.safeParse({}).success, false);
    assert.equal(typeof adjust.athleteAdjustSchema.parse, "function");
    assert.equal(typeof load("src/lib/benchmarks.ts").loadLiftMaxes, "function");
  }
});
