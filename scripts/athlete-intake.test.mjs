import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative, overrides = {}) {
  const filename = path.resolve(root, relative);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const localRequire = (id) => id in overrides ? overrides[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, overrides) : id.startsWith(".") ? load(path.resolve(path.dirname(filename), `${id}.ts`), overrides) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { intakeSchemas: schemas } = load("src/lib/athlete-intake.ts");
const valid = [
  { birth_date: "1995-01-01", height_ft: 5, height_in: 10, weight: 180, sex: "" },
  { experience_level: "beginner", years_training: 0, crossfit_detail: "", sports_background: "", benchmarks: [] },
  { goals: [{ category: "Strength", target: "", target_value: "", target_date: "" }] },
  { injury_list: [] },
  { days_per_week: 3, session_minutes: 60, location: "gym", equipment: ["Barbell"] },
  { diet_type: "none", allergies: "", dislikes: "", cooking_minutes: "", eating_habits: "" },
  { sleep_hours: 8, stress_level: "low", job_activity: "sedentary" },
];
test("all seven steps accept normal answers and optional empty values", () => {
  schemas.forEach((schema, i) => assert.equal(schema.safeParse(valid[i]).success, true, `step ${i + 1}`));
  const food = schemas[5].parse({ ...valid[5], allergies: "peanuts, peanuts, milk" });
  assert.deepEqual(food.allergies, ["peanuts", "milk"]);
  assert.equal(food.cooking_minutes, null);
});
test("all steps reject missing data", () => schemas.forEach((schema) => assert.equal(schema.safeParse({}).success, false)));
test("invalid height, score, goals, injuries, schedule, nutrition and lifestyle fail", () => {
  const invalid = [
    { ...valid[0], height_ft: 3, height_in: 0 },
    { ...valid[1], benchmarks: [{ benchmark_id: "bad", load: -1 }] },
    { goals: [] },
    { injury_list: [{ area: "Knee", severity: "critical", notes: "" }] },
    { ...valid[4], days_per_week: 8 },
    { ...valid[5], cooking_minutes: "120" },
    { ...valid[6], sleep_hours: 25 },
  ];
  schemas.forEach((schema, i) => assert.equal(schema.safeParse(invalid[i]).success, false));
  assert.equal(schemas[1].safeParse({ ...valid[1], years_training: "" }).success, false);
  assert.equal(schemas[6].safeParse({ ...valid[6], sleep_hours: "" }).success, false);
  assert.equal(schemas[2].safeParse({ goals: [valid[2].goals[0], valid[2].goals[0]] }).success, false);
  assert.equal(schemas[4].safeParse({ ...valid[4], equipment: ["None", "Barbell"] }).success, false);
});

function actionHarness({ kind = "athlete", dbError = null } = {}) {
  const writes = [];
  const { saveIntakeStep } = load("src/app/athlete/onboarding/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/viewer": { getViewer: async () => ({ kind, athleteId: "own-athlete", units: "lb" }) },
    "@/lib/time-zone": { getToday: async () => "2026-11-21" },
    "@/lib/supabase/server": { createClient: async () => ({
      rpc: async (name, args) => { writes.push({ name, ...args }); return { error: dbError }; },
      from: () => ({ select: async () => ({ data: [], error: null }) }),
    }) },
  });
  return { saveIntakeStep, writes };
}
test("server action uses canonical fields, coach units and local today", async () => {
  const { saveIntakeStep, writes } = actionHarness();
  await assert.rejects(saveIntakeStep(1, valid[0]), /REDIRECT:\/athlete\/onboarding\?step=2/);
  assert.equal(writes[0].p_today, "2026-11-21");
  assert.equal(writes[0].p_athlete_id, "own-athlete");
  assert.deepEqual(writes[0].p_data, { birth_date: "1995-01-01", sex: "", height_cm: 177.8, weight_kg: 81.65 });
  await assert.rejects(saveIntakeStep(3, valid[2]), /REDIRECT/);
  assert.equal(writes[1].p_data.goals[0].goal_type, "performance");
  await assert.rejects(saveIntakeStep(7, valid[6]), /REDIRECT:\/athlete$/);
});
test("server action rejects invalid, empty, unauthorized, future and unknown benchmark input; reports database errors", async () => {
  const { saveIntakeStep, writes } = actionHarness();
  for (const [step, data] of [[0, {}], [1, {}], [1, { ...valid[0], birth_date: "2026-11-22" }], [2, { ...valid[1], benchmarks: [{ benchmark_id: "35000000-0000-0000-0000-000000000099", load: 100, time_seconds: "", rounds: "", reps: "" }] }]]) {
    assert.ok((await saveIntakeStep(step, data)).error);
  }
  assert.equal(writes.length, 0);
  assert.ok((await actionHarness({ kind: "coach" }).saveIntakeStep(1, valid[0])).error);
  assert.match((await actionHarness({ dbError: new Error("database unavailable") }).saveIntakeStep(1, valid[0])).error, /Couldn't save/);
});

test("gate redirects requested/in-progress intakes only, permits onboarding and preserves completed/no-row access", async () => {
  for (const [pathName, status, expected] of [["/athlete", "requested", "redirect"], ["/athlete/history", "in_progress", "redirect"], ["/athlete/onboarding", "requested", "next"], ["/athlete", "completed", "next"], ["/athlete", null, "next"]]) {
    const cookies = { getAll: () => [], set() {} };
    const queries = [];
    const { updateSession } = load("src/lib/supabase/middleware.ts", {
      "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "own-user" } } }) }, from: (table) => { queries.push(table); return { select(columns) { assert.equal(columns, "status, athletes!inner(user_id)"); return this; }, eq(column, value) { assert.equal(column, "athletes.user_id"); assert.equal(value, "own-user"); return this; }, maybeSingle: async () => ({ data: status ? { status } : null, error: null }) }; } }) },
      "next/server": { NextResponse: { next: () => ({ kind: "next", cookies }), redirect: (url) => ({ kind: "redirect", url, cookies }) } },
    });
    const url = new URL(`http://localhost${pathName}?other=1`);
    url.clone = () => new URL(url);
    const response = await updateSession({ nextUrl: url, cookies });
    assert.equal(response.kind, expected, `${pathName}: ${status}`);
    assert.deepEqual(queries, pathName === "/athlete/onboarding" ? [] : ["athlete_intakes"]);
    if (expected === "redirect") { assert.equal(response.url.pathname, "/athlete/onboarding"); assert.equal(response.url.search, ""); }
  }
});

test("gate logs lookup errors and rejected queries but allows athlete pages through", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  for (const rejects of [false, true]) {
    const error = new Error("Intake lookup unavailable");
    const cookies = { getAll: () => [], set() {} };
    const { updateSession } = load("src/lib/supabase/middleware.ts", {
      "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "own-user" } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => { if (rejects) throw error; return { data: null, error }; } }) }) },
      "next/server": { NextResponse: { next: () => ({ kind: "next", cookies }), redirect: () => { throw new Error("Unexpected redirect"); } } },
    });
    const url = new URL("http://localhost/athlete/history");
    assert.equal((await updateSession({ nextUrl: url, cookies })).kind, "next");
    assert.deepEqual(log.mock.calls.at(-1).arguments, ["Unable to check athlete intake:", error]);
  }
  assert.equal(log.mock.callCount(), 2);
});
