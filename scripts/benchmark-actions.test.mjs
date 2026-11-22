import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const athleteId = "32000000-0000-4000-8000-000000000011";
const benchmarkId = "32000000-0000-4000-8000-000000000021";
const userId = "32000000-0000-4000-8000-000000000001";
function fixture({ kind = "coach", workoutType = "strength", benchmarkKind = "lift", dbError = false, isPr = true } = {}) {
  const writes = [];
  const filters = [];
  const invalidations = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from(table) {
      let mutation = false;
      const response = () => ({ data: dbError ? null : table === "athletes" ? { coach_id: userId } : table === "benchmarks" && !mutation ? { coach_id: null, kind: benchmarkKind, workout_type: workoutType } : { id: benchmarkId, athlete_id: athleteId }, error: dbError ? new Error("db failure") : null });
      return {
        select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
        insert(row) { mutation = true; writes.push(row); return this; },
        update(row) { mutation = true; writes.push(row); return this; },
        upsert(row) { mutation = true; writes.push(row); return this; },
        delete() { mutation = true; return this; },
        single: async () => response(), maybeSingle: async () => response(),
        then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); },
      };
    },
  };
  const overrides = {
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
    "@/lib/viewer": { getViewer: async () => kind == null ? null : { kind, id: userId, athleteId, coachId: userId, units: "lb" } },
    "@/lib/time-zone": { getToday: async () => "2026-11-21" },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/benchmarks": { loadAthleteBenchmarks: async () => [{ id: benchmarkId, attempts: [{ id: benchmarkId, source: "direct", isPr }] }] },
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const js = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = (id) => overrides[id] ?? (id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : require(id));
    new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return { actions: load("src/app/(app)/athletes/[id]/benchmark-actions.ts"), writes, filters, invalidations };
}
function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ athlete_id: athleteId, benchmark_id: benchmarkId, performed_on: "2026-11-21", load: "220.462262", rep_max: "3", notes: "A good set", is_rx: "on", ...extra })) data.set(key, value);
  return data;
}
test("coach and athlete logging convert lb to kg, use server ownership and return New PR", async () => {
  for (const kind of ["coach", "athlete"]) {
    const { actions, writes, invalidations } = fixture({ kind });
    const result = await actions.saveBenchmarkResult({}, form());
    assert.equal(result.message, "Result saved. New PR!");
    assert.ok(Math.abs(writes[0].load_kg - 100) < 0.01);
    assert.equal(writes[0].coach_id, userId);
    assert.equal(writes[0].rep_max, 3);
    assert.equal(writes[0].is_rx, true);
    assert.ok(invalidations.some(([route]) => route === "/athlete/prs"));
  }
  const f = fixture({ isPr: false });
  assert.equal((await f.actions.saveBenchmarkResult({}, form())).message, "Result saved.");
});
test("invalid, empty, future and unauthorized log requests never write", async () => {
  for (const extra of [{ load: "" }, { load: "-1" }, { rep_max: "21" }, { rep_max: "" }, { performed_on: "2026-02-30" }, { performed_on: "2026-11-22" }, { benchmark_id: "bad" }]) {
    const f = fixture();
    assert.ok((await f.actions.saveBenchmarkResult({}, form(extra))).error);
    assert.equal(f.writes.length, 0);
  }
  const f = fixture({ kind: "athlete" });
  assert.ok((await f.actions.saveBenchmarkResult({}, form({ athlete_id: benchmarkId }))).error);
  assert.equal(f.writes.length, 0);
  assert.ok((await fixture({ kind: null }).actions.saveBenchmarkResult({}, form())).error);
});
test("WOD logging requires the right score and does not retain lift reps", async () => {
  const f = fixture({ workoutType: "for_time", benchmarkKind: "girl" });
  assert.ok((await f.actions.saveBenchmarkResult({}, form())).error);
  assert.ok((await f.actions.saveBenchmarkResult({}, form({ minutes: "5", seconds: "12" }))).message);
  assert.equal(f.writes[0].time_seconds, 312);
  assert.equal(f.writes[0].rep_max, null);
});
test("delete scopes to logged_by; database errors are surfaced", async () => {
  const f = fixture();
  assert.equal((await f.actions.deleteBenchmarkResult({}, form({ id: benchmarkId }))).message, "Result deleted.");
  assert.ok(f.filters.some(([key, value]) => key === "logged_by" && value === userId));
  assert.ok((await fixture({ dbError: true }).actions.deleteBenchmarkResult({}, form({ id: benchmarkId }))).error);
  assert.ok((await fixture({ dbError: true }).actions.saveBenchmarkResult({}, form())).error);
});
test("custom benchmark mutations and intervals validate role, lift type and range", async () => {
  const f = fixture();
  const custom = form({ id: "", name: "My test", description: "A test", workout_type: "strength", movement_id: benchmarkId });
  assert.ok((await f.actions.saveCustomBenchmark({}, custom)).message);
  assert.equal(f.writes[0].kind, "lift");
  custom.set("workout_type", "amrap");
  assert.ok((await f.actions.saveCustomBenchmark({}, custom)).error);
  assert.ok((await fixture({ kind: "athlete" }).actions.saveCustomBenchmark({}, custom)).error);
  for (const interval of ["0", "105", "1.5"]) assert.ok((await f.actions.saveRetestInterval({}, form({ retest_weeks: interval }))).error);
  assert.ok((await f.actions.saveRetestInterval({}, form({ retest_weeks: "" }))).message);
  assert.equal(f.writes.at(-1).retest_weeks, null);
  assert.ok((await f.actions.saveRetestInterval({}, form({ retest_weeks: "6" }))).message);
  assert.equal(f.writes.at(-1).retest_weeks, 6);
  assert.ok((await f.actions.deleteCustomBenchmark({}, form({ id: benchmarkId }))).message);
  assert.ok(f.filters.some(([key, value]) => key === "coach_id" && value === userId));
});
