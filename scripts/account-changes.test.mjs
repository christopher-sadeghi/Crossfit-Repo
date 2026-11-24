import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative) {
  const filename = path.resolve(root, relative);
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", js)((id) => id.startsWith("@/")
    ? load(`src/${id.slice(2)}.ts`)
    : require(id), loaded, loaded.exports);
  return loaded.exports;
}
const { athleteAccountChangeSchema, coachAccountChangeSchema, accountChangeSummaryLines, accountChangeWeightKg } =
  load("src/lib/ai/account-change.ts");

test("coach account changes accept supported strict variants and reject empty profile edits", () => {
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "profile", injuries: null }).success, true);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "profile", notes: "Training notes" }).success, true);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "profile" }).success, false);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "assigned_coach", coach_id: null }).success, true);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "program", action: "assign", program_id: "00000000-0000-4000-8000-000000000001", start_date: "2026-11-21" }).success, true);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "program", action: "unassign", program_id: "00000000-0000-4000-8000-000000000001" }).success, true);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "body_weight", value: 180, measured_on: "2026-11-21", unexpected: true }).success, false);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "goal", action: "create", title: "Run 5K", goal_type: "performance" }).success, true);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "goal", action: "update", goal_id: "00000000-0000-4000-8000-000000000001" }).success, false);
  assert.equal(coachAccountChangeSchema.safeParse({ kind: "goal", action: "set_status", goal_id: "00000000-0000-4000-8000-000000000001", status: "active" }).success, true);
});

test("athlete account changes validate goals, injuries, food, weight, reminders and macros", () => {
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "goal", action: "update", goal_id: "00000000-0000-4000-8000-000000000001", target_value: 100 }).success, true);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "injuries", injuries: null }).success, true);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "food_preferences", diet_type: "vegan", allergies: ["peanuts"], cooking_minutes: 15 }).success, true);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "food_preferences", diet_type: "carnivore" }).success, false);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "body_weight", value: 180, measured_on: "2026-11-21" }).success, true);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "reminder_time", remind_at: "09:45" }).success, true);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "reminder_time", remind_at: "09:10" }).success, false);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "macros", calories: 2200, protein_g: 160, carbs_g: 220, fat_g: 70 }).success, true);
  assert.equal(athleteAccountChangeSchema.safeParse({ kind: "macros", calories: 10, protein_g: 160, carbs_g: 220, fat_g: 70 }).success, false);
});

test("before and after summaries are plain English and use viewer weight units", () => {
  const lines = accountChangeSummaryLines(
    { kind: "injuries", injuries: null },
    { injuries: "Shoulder soreness" },
    "lb",
  );
  assert.deepEqual(lines, [{ label: "Injuries", before: "Shoulder soreness", after: "None recorded" }]);
  const goal = accountChangeSummaryLines(
    { kind: "goal", action: "create", title: "Run a 5K", goal_type: "performance", target_value: 25, unit: "minutes" },
    { active_goal_count: 0 },
    "kg",
  );
  assert.match(goal[0].after, /Run a 5K · Performance · target 25 minutes/);
  const weight = accountChangeSummaryLines(
    { kind: "body_weight", value: 200, measured_on: "2026-11-21" },
    { weight_kg: 90.72, measured_on: "2026-11-01" },
    "lb",
  );
  assert.equal(weight[0].before, "200 lb");
  assert.equal(accountChangeWeightKg(200, "lb"), 90.72);
  assert.equal(accountChangeWeightKg(90.72, "kg"), 90.72);
});
