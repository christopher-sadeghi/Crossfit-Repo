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
const { draftProgramSchema, draftProgramStoredSchema, validateDraftProgram } = load("src/lib/ai/draft-program-schema.ts");
const movementId = "35000000-0000-4000-8000-000000000021";
const context = { units: "lb", days_per_week: 1, library: [{ id: movementId, name: "Squat" }] };
function proposal() {
  return { name: "First four weeks", rationale: "Build gradually.", start_date: "2026-11-23", weeks: [1, 2, 3, 4].map((week_number) => ({ week_number, workouts: [{ day_number: 1, title: "Strength", workout_type: "strength", time_cap_minutes: 30, rounds: null, description: "Warm up, then squat.", notes: null, sections: [], movements: [{ movement_id: movementId, sets: 3, reps: 5, load: 100, distance_m: null, calories: null, duration_seconds: null, notes: "Conservative load.", section: null }] }] })) };
}
function legacyProposal() {
  const program = proposal();
  for (const week of program.weeks) {
    for (const workout of week.workouts) {
      delete workout.sections;
      for (const movement of workout.movements) delete movement.section;
    }
  }
  return program;
}
test("inline previews show workout prescriptions and scheduled program days", () => {
  const inline = createLoader({ "server-only": {} })("src/lib/ai/inline-suggestion.ts").inlineSuggestion;
  const program = proposal();
  const workout = { ...program.weeks[0].workouts[0], workout_type: "amrap", rounds: 3, notes: "Pace the first round.", rationale: "Build gradually." };
  const preview = inline({
    status: "pending", suggestion_type: "write_workout", proposal: workout,
    input: { ...context, mode: "write", request: "Write a workout", library: [{ ...context.library[0], category: "weightlifting", measure: "reps" }] },
  });
  assert.deepEqual([preview.format, preview.rounds, preview.timeCapMinutes, preview.notes], ["AMRAP", 3, 30, workout.notes]);
  assert.deepEqual(preview.movements, ["Squat · 3 sets · 5 reps · 100 lb · Conservative load."]);
  const schedule = inline({ status: "pending", suggestion_type: "draft_program", proposal: { ...program, weeks: [...program.weeks].reverse() } });
  assert.deepEqual(schedule.workouts, [1, 2, 3, 4].map((week) => ({ week, day: 1, title: "Strength" })));
});
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
test("legacy draft programs default sections and movement assignments before application", async () => {
  const f = fixture();
  const old = legacyProposal();
  assert.equal(draftProgramSchema.safeParse(old).success, false);
  assert.equal(draftProgramStoredSchema.safeParse(old).success, true);
  validateDraftProgram(old, context);
  await f.entry.apply(f.db, { athlete_id: "athlete", input: context }, old);
  const workout = f.calls[0].args.p_program.weeks[0].workouts[0];
  assert.deepEqual(workout.sections, []);
  assert.equal(workout.movements[0].section, null);
});

function fixture({ status = "completed", athleteStatus = "active", rpcError = null, library = context.library, location = "gym", equipment = ["Barbell"] } = {}) {
  const calls = [];
  const db = { from(table) {
    const data = table === "athlete_intakes" ? { status, answers: { days_per_week: 1, session_minutes: 60, location, equipment, eating_habits: "Regular meals" } }
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
  return {
    db,
    calls,
    entry: loader("src/lib/ai/draft-program.ts").draftProgramEntry,
    ApprovalError: loader("src/lib/ai/errors.ts").ApprovalError,
  };
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
  assert.equal(request.schema.safeParse(legacyProposal()).success, false);
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
test("draft apply returns a friendly approval error for invalid section assignments", async () => {
  const f = fixture();
  const invalid = proposal();
  invalid.weeks[0].workouts[0].sections = [{ title: "Block A", format: "strength", time_cap_minutes: null, rounds: null }];
  invalid.weeks[0].workouts[0].movements[0].section = 2;
  await assert.rejects(
    f.entry.apply(f.db, { athlete_id: "athlete", input: context }, invalid),
    (error) => error instanceof f.ApprovalError && error.message === "This WOD's sections don't line up. Ask for a new suggestion.",
  );
  assert.equal(f.calls.length, 0);
});
test("legacy write-workout proposals backfill section fields for the save payload", () => {
  const loader = createLoader({ "server-only": {} });
  const { ApprovalError, SUGGESTION_REGISTRY, writeWorkoutProposalSchema, writeWorkoutSchema } = loader("src/lib/ai/suggestions.ts");
  const { prepareWorkoutSavePayload } = loader("src/lib/ai/workout-save-payload.ts");
  const old = {
    title: "Legacy WOD",
    workout_type: "amrap",
    time_cap_minutes: 20,
    rounds: null,
    description: null,
    notes: null,
    movements: [{
      movement_id: movementId, sets: null, reps: 8, load: 40, distance_m: null,
      calories: null, duration_seconds: null, notes: null,
    }],
    rationale: "A simple AMRAP.",
  };
  assert.equal(writeWorkoutSchema.safeParse(old).success, false);
  const parsed = writeWorkoutProposalSchema.parse(old);
  assert.deepEqual(parsed.sections, []);
  assert.equal(parsed.movements[0].section, null);
  const payload = prepareWorkoutSavePayload(parsed, "lb");
  assert.deepEqual(payload.workout.sections, []);
  assert.equal(payload.movements[0].section, null);
  assert.equal(payload.movements[0].load_kg, 18.14);

  const invalid = {
    ...parsed,
    sections: [{ title: "Block A", format: "strength", time_cap_minutes: null, rounds: null }],
    movements: [{ ...parsed.movements[0], section: 1 }],
  };
  const input = {
    mode: "write", request: "Write an AMRAP", units: "kg",
    library: [{ id: movementId, name: "Squat", category: "weightlifting", measure: "reps", easier_movement_id: null, harder_movement_id: null }],
  };
  const supabase = { rpc: async () => { throw new Error("The save RPC should not run."); } };
  return assert.rejects(
    SUGGESTION_REGISTRY.write_workout.apply(supabase, { input }, invalid),
    (error) => error instanceof ApprovalError && error.message === "This WOD's sections don't line up. Ask for a new suggestion.",
  );
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
  assert.deepEqual(request.input.library, library.map((movement) => ({ ...movement, equipment_status: "equipment unknown" })));
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

test("equipment mapping covers the seeded library and only uses intake checklist keys", () => {
  const { MOVEMENT_EQUIPMENT } = load("src/lib/movement-equipment.ts");
  const { EQUIPMENT } = load("src/lib/athlete-intake.ts");
  const seed = readFileSync(path.join(root, "supabase/migrations/20261121000100_seed_movement_library.sql"), "utf8");
  const names = [...seed.matchAll(/\('([^']+)', '(?:weightlifting|gymnastics|monostructural|other)'/g)].map((match) => match[1]);
  assert.ok(names.length >= 62);
  assert.deepEqual(Object.keys(MOVEMENT_EQUIPMENT).sort(), names.sort());
  for (const alternatives of Object.values(MOVEMENT_EQUIPMENT)) {
    for (const items of alternatives ?? []) for (const item of items) assert.ok(EQUIPMENT.includes(item), item);
  }
});

test("shared suggestion requests preserve intake errors and catch schedule query failures", async () => {
  let failure;
  const loader = createLoader({
    "./suggestions": { SUGGESTION_REGISTRY: { draft_program: { buildRequest: async () => { if (failure) throw failure; return { input: {}, schema: "generation schema" }; }, proposalSchema: "proposal schema" } } },
    "./service-core": { runSuggestionWithClient: async (_, options) => { assert.equal(options.generationSchema, "generation schema"); return { id: "pending" }; } },
  });
  const { requestRegisteredSuggestion } = loader("src/lib/ai/request.ts");
  const { ApprovalError } = loader("src/lib/ai/errors.ts");
  assert.deepEqual(await requestRegisteredSuggestion({}, "draft_program", { athleteId: "athlete" }), { id: "pending" });
  failure = new ApprovalError("Complete the athlete's intake before drafting their first four weeks.");
  assert.deepEqual(await requestRegisteredSuggestion({}, "draft_program", { athleteId: "athlete" }), { error: failure.message });
  failure = new Error("Couldn't load athlete program assignments.");
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await requestRegisteredSuggestion({}, "draft_program", { athleteId: "athlete" }), { error: "The AI couldn't make a suggestion right now. Please try again in a minute." });
  } finally { console.error = original; }
});

test("equipment filter handles bodyweight, alternatives, specialty gear, empty checklists and unknown custom movements", () => {
  const { filterMovementsByEquipment } = load("src/lib/movement-equipment.ts");
  const names = ["Air Squat", "Goblet Squat", "Back Squat", "Row", "Wall Ball", "Custom movement", "toString"];
  const library = names.map((name, index) => ({ id: String(index), name }));
  const selected = (location, equipment) => filterMovementsByEquipment(library, location, equipment).map((m) => m.name);
  assert.deepEqual(selected("home", ["None"]), ["Air Squat", "Custom movement", "toString"]);
  assert.deepEqual(selected("travel", []), ["Air Squat", "Custom movement", "toString"]);
  assert.deepEqual(selected("gym", []), names);
  assert.ok(!selected("gym", ["None"]).includes("Row"));
  assert.ok(selected("home", ["Rower"]).includes("Row"));
  assert.ok(!selected("home", ["Barbell", "Plates"]).includes("Back Squat"));
  assert.ok(selected("home", ["Barbell", "Plates", "Rack"]).includes("Back Squat"));
  for (const equipment of [["Dumbbells"], ["Kettlebells"]]) assert.ok(selected("home", equipment).includes("Goblet Squat"));
  assert.equal(filterMovementsByEquipment(library, "home", [])[1].equipment_status, "equipment unknown");
  assert.deepEqual(filterMovementsByEquipment([], "gym", []), []);
});

test("off-equipment ids are removed from prompt, variation links and generation enum and rejected on validation and approval", async () => {
  const library = [
    { id: movementId, name: "Air Squat", harder_movement_id: "wall-ball" },
    { id: "row", name: "Row" }, { id: "wall-ball", name: "Wall Ball" },
    { id: "custom", name: "Custom movement" },
  ];
  const f = fixture({ library, location: "home", equipment: ["Dumbbells"] });
  const request = await f.entry.buildRequest(f.db, { athleteId: "athlete" });
  assert.deepEqual(request.input.library.map((m) => m.id), [movementId, "custom"]);
  assert.equal(request.input.library[0].harder_movement_id, null);
  assert.equal(request.input.library[1].equipment_status, "equipment unknown");
  assert.ok(!request.prompt.includes('"name":"Row"'));
  assert.ok(!request.prompt.includes('"name":"Wall Ball"'));
  f.entry.validate(proposal(), request.input);
  for (const movement of ["row", "wall-ball"]) {
    const draft = proposal(); draft.weeks[0].workouts[0].movements[0].movement_id = movement;
    assert.equal(request.schema.safeParse(draft).success, false);
    assert.throws(() => f.entry.validate(draft, request.input), /Unknown movement/);
    await assert.rejects(f.entry.apply(f.db, { athlete_id: "athlete", input: request.input }, draft), /movement library/);
  }
  assert.equal(f.calls.some(({ name }) => name === "apply_draft_program"), false);
  const gym = fixture({ library, equipment: [] });
  const gymRequest = await gym.entry.buildRequest(gym.db, { athleteId: "athlete" });
  assert.deepEqual(gymRequest.input.library.map((m) => m.id), library.map((m) => m.id));
  const wallBall = proposal(); wallBall.weeks[0].workouts[0].movements[0].movement_id = "wall-ball";
  assert.equal(gymRequest.schema.safeParse(wallBall).success, true);
  gym.entry.validate(wallBall, gymRequest.input);
  const none = fixture({ library: library.slice(1, 3), location: "travel", equipment: [] });
  await assert.rejects(none.entry.buildRequest(none.db, { athleteId: "athlete" }), /No library movements match/);
});
