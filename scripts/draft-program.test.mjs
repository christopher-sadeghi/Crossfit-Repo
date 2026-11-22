import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
export function createLoader(overrides = {}) {
  const cache = new Map();
  return function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const js = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = (id) => id in overrides ? overrides[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : id.startsWith(".") ? load(path.resolve(path.dirname(filename), `${id}.ts`)) : require(id);
    new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  };
}
const load = createLoader();
const { draftProgramSchema, validateDraftProgram } = load("src/lib/ai/draft-program-schema.ts");
const movementId = "35000000-0000-4000-8000-000000000021";
const context = { units: "lb", days_per_week: 1, library: [{ id: movementId, name: "Squat" }] };
function proposal() {
  return { name: "First four weeks", rationale: "Build gradually.", start_date: "2026-11-23", weeks: [1, 2, 3, 4].map((week_number) => ({ week_number, workouts: [{ day_number: 1, title: "Strength", workout_type: "strength", time_cap_minutes: 30, rounds: null, description: "Warm up, then squat.", notes: null, movements: [{ movement_id: movementId, sets: 3, reps: 5, load: 100, distance_m: null, calories: null, duration_seconds: null, notes: "Conservative load." }] }] })) };
}
test("draft validation accepts four weeks and rejects empty, unknown movements, too many/few days, wrong weeks and duplicate placement", () => {
  validateDraftProgram(proposal(), context);
  assert.equal(draftProgramSchema.safeParse({}).success, false);
  const mutations = [
    (p) => { p.weeks[0].workouts[0].movements[0].movement_id = "unknown"; },
    (p) => { p.weeks[0].workouts.push({ ...p.weeks[0].workouts[0], day_number: 2 }); },
    (p) => { p.weeks.pop(); },
    (p) => { p.weeks[0].week_number = 5; },
    (p) => { p.weeks[0].workouts[0].day_number = 8; },
    (p) => { p.weeks[1].week_number = 1; },
    (p) => { p.weeks[0].workouts = []; },
  ];
  for (const mutate of mutations) { const p = proposal(); mutate(p); assert.throws(() => validateDraftProgram(p, context)); }
  const p = proposal(); p.weeks.forEach((w) => w.workouts.push(structuredClone(w.workouts[0])));
  assert.throws(() => validateDraftProgram(p, { ...context, days_per_week: 2 }), /Duplicate day/);
});

function fixture({ status = "completed", athleteStatus = "active", rpcError = null, library = context.library } = {}) {
  const calls = [];
  const db = { from(table) {
    const data = table === "athlete_intakes" ? { status, answers: { days_per_week: 1, session_minutes: 60, location: "gym", equipment: ["Barbell"], eating_habits: "Regular meals" } }
      : table === "athletes" ? { first_name: "Alex", birth_date: "1990-01-01", status: athleteStatus }
      : table === "goals" ? [] : null;
    const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data, error: null }), then(resolve) { return Promise.resolve({ data, error: null }).then(resolve); } };
    return q;
  }, rpc: async (name, args) => { calls.push({ name, args }); return { data: "program-id", error: rpcError }; } };
  const loader = createLoader({
    "@/lib/time-zone": { getToday: async () => "2026-11-21" },
    "@/lib/benchmarks": { loadLiftMaxes: async () => [] },
    "./workout-context": { ageOn: () => 36, loadWorkoutContext: async () => ({ units: "lb", library }) },
  });
  return { db, calls, entry: loader("src/lib/ai/draft-program.ts").draftProgramEntry };
}
test("draft name and rationale fit the program editor limits", () => {
  assert.equal(draftProgramSchema.safeParse({ ...proposal(), name: "x".repeat(80), rationale: "x".repeat(1000) }).success, true);
  assert.equal(draftProgramSchema.safeParse({ ...proposal(), name: "x".repeat(81) }).success, false);
  assert.equal(draftProgramSchema.safeParse({ ...proposal(), rationale: "x".repeat(1001) }).success, false);
  assert.equal(draftProgramSchema.safeParse({ ...proposal(), name: "", rationale: "" }).success, false);
});
test("build requires completed intake, sets next Monday, includes profile/context and constrains movement ids", async () => {
  const f = fixture();
  const request = await f.entry.buildRequest(f.db, { athleteId: "athlete" });
  assert.equal(request.input.default_start_date, "2026-11-23");
  assert.equal(request.input.athlete.age, 36);
  assert.equal(request.input.intake.session_minutes, 60);
  assert.equal(request.schema.safeParse(proposal()).success, true);
  const bad = proposal(); bad.weeks[0].workouts[0].movements[0].movement_id = "unknown";
  assert.equal(request.schema.safeParse(bad).success, false);
  const missing = fixture({ status: "requested" });
  await assert.rejects(missing.entry.buildRequest(missing.db, { athleteId: "athlete" }), /Complete.*intake/);
  const archived = fixture({ athleteStatus: "archived" });
  await assert.rejects(archived.entry.buildRequest(archived.db, { athleteId: "athlete" }), /active athlete/);
});
test("apply validates current library, converts lb, returns target and handles stale dates/conflicts", async () => {
  const f = fixture(); const suggestion = { athlete_id: "athlete", input: context };
  assert.deepEqual(await f.entry.apply(f.db, suggestion, proposal()), { target_table: "programs", target_id: "program-id" });
  assert.equal(f.calls[0].args.p_program.weeks[0].workouts[0].movements[0].load_kg, 45.36);
  assert.equal(f.calls[0].args.p_today, "2026-11-21");
  await assert.rejects(f.entry.apply(f.db, suggestion, { ...proposal(), start_date: "2026-11-20" }), /today or later/);
  const deleted = fixture({ library: [] });
  await assert.rejects(deleted.entry.apply(deleted.db, suggestion, proposal()), /movement library/);
  for (const [message, expected] of [["athlete_unavailable", /archived/], ["intake_changed", /schedule changed/], ["unknown_movement", /no longer available/]]) {
    const failed = fixture({ rpcError: { message } });
    await assert.rejects(failed.entry.apply(failed.db, suggestion, proposal()), expected);
  }
});
test("draft context exposes shared movement variations and prefers appropriate scaling without relaxing ids", async () => {
  const easierId = "35000000-0000-4000-8000-000000000022";
  const harderId = "35000000-0000-4000-8000-000000000023";
  const library = [
    { ...context.library[0], easier_movement_id: easierId, harder_movement_id: harderId },
    { id: easierId, name: "Air squat", easier_movement_id: null, harder_movement_id: movementId },
    { id: harderId, name: "Overhead squat", easier_movement_id: movementId, harder_movement_id: null },
  ];
  const f = fixture({ library });
  const request = await f.entry.buildRequest(f.db, { athleteId: "athlete" });
  assert.deepEqual(request.input.library, library);
  assert.match(request.system, /prefer its library easier_movement_id or harder_movement_id/i);
  assert.match(request.system, /Prefer easier variations for beginners or limitations/);
  const draft = proposal();
  draft.weeks[0].workouts[0].movements[0].movement_id = easierId;
  assert.equal(request.schema.safeParse(draft).success, true);
  f.entry.validate(draft, request.input);
  draft.weeks[0].workouts[0].movements[0].movement_id = "unknown-variation";
  assert.equal(request.schema.safeParse(draft).success, false);
  assert.throws(() => f.entry.validate(draft, request.input), /Unknown movement/);
});
