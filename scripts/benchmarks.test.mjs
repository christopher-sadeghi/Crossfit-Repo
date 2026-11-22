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
  const localRequire = (id) => id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { estimateOneRepMax, normalizeBenchmarkHistory, retestDue, loadAthleteBenchmarks, loadLiftMaxes } = load("src/lib/benchmarks.ts");
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
  for (const table of ["benchmarks", "benchmark_results", "workout_results"]) await assert.rejects(loadLiftMaxes(client({}, table), "a"), /query failed/);
  for (const table of ["athletes", "benchmark_settings"]) await assert.rejects(loadAthleteBenchmarks(client({}, table), "a", "2026-01-01"), /query failed/);
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
