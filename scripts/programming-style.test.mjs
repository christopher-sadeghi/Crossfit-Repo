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
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", js)((id) => require(id), loaded, loaded.exports);
  return loaded.exports;
}

const { programmingStyleSchema, programmingStyleNote, writeWorkoutSystem, PROGRAMMING_STYLE_GUIDANCE } =
  load("src/lib/programming-style.ts");

test("programming style schema accepts optional selections and caps free text", () => {
  assert.deepEqual(programmingStyleSchema.parse({}), {
    athlete_types: [], components: [], metcon_formats: [], time_domains: [],
  });
  assert.equal(programmingStyleSchema.safeParse({ days_per_week: 2 }).success, false);
  assert.equal(programmingStyleSchema.safeParse({ format: "hybrid" }).success, false);
  assert.equal(programmingStyleSchema.safeParse({ strength_notes: "x".repeat(501) }).success, false);
  assert.equal(programmingStyleSchema.safeParse({ favorite_movements: "x".repeat(501) }).success, false);
  assert.equal(programmingStyleSchema.safeParse({ avoid_movements: "x".repeat(501) }).success, false);
  assert.equal(programmingStyleSchema.safeParse({ style_description: "x".repeat(1501) }).success, false);
  assert.equal(programmingStyleSchema.safeParse({ example_wod: "x".repeat(1501) }).success, false);
});

test("programmingStyleNote is compact, uses labels, and is absent for empty answers", () => {
  assert.equal(programmingStyleNote(null), null);
  assert.equal(programmingStyleNote({}), null);
  const note = programmingStyleNote({ athlete_types: ["beginners"], strength_method: "rpe", days_per_week: 4 });
  assert.match(note, /^Coach programming style:/);
  assert.match(note, /Athletes: Beginners/);
  assert.match(note, /Strength approach: RPE-based/);
  assert.doesNotMatch(note, /strength_method/);
});

test("generated library WOD system prompt includes the coach style block", () => {
  const style = programmingStyleNote({ intensity: "mixed", style_description: "Steady pacing and simple progressions." });
  const source = readFileSync(path.join(root, "src/lib/ai/suggestions.ts"), "utf8");
  assert.match(source, /system:\s*writeWorkoutSystem\(WRITE_WORKOUT_SYSTEM, units, programmingStyle\)/);
  const system = writeWorkoutSystem("Write in <units>. Follow safety and equipment rules.", "lb", style);
  assert.ok(system.includes(style));
  assert.ok(system.endsWith(`${style}\n${PROGRAMMING_STYLE_GUIDANCE}`));
  assert.ok(!writeWorkoutSystem("Write in <units>.", "kg", null).includes(PROGRAMMING_STYLE_GUIDANCE));
});
