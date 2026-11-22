import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

import { matchedAllergies } from "./ai/food-safety";
import { FOOD_INGREDIENTS_LIMIT, foodIngredients } from "./food-ingredients";

test("joins names, ingredients and tags in their original order without losing text", () => {
  assert.equal(foodIngredients([
    { name: " First ", ingredients: "Sugar,\npalm oil; salt", allergens: ["tree\nnuts", "milk"] },
    { name: "Second", ingredients: "almonds, almonds" },
  ]), "First: Sugar, palm oil; salt; allergens: tree nuts, milk; Second: almonds, almonds");
});

test("preserves wrapped phrases and newline-delimited declarations", () => {
  for (const [text, allergies] of [
    ["Sugar\nContains: tree\nnuts", ["tree nuts"]],
    ["Contains: hazelnuts\nMay contain: almonds", ["hazelnut", "almond"]],
    ["peanut\n butter, roasted tree\nnuts", ["peanut butter", "tree nuts"]],
  ] as const) {
    const ingredients = foodIngredients([{ name: "Snack", ingredients: text }]);
    assert.deepEqual(matchedAllergies(ingredients, [...allergies]), [...allergies]);
  }
});

test("preserves pumpkin seed at either side of the former declaration cutoff", () => {
  for (const count of [0, 280, 290, 295, 300, 305, 1000]) {
    const ingredients = foodIngredients([{ name: "Snack", ingredients: `Contains: ${"x".repeat(count)} pumpkin\nseed, salt` }]);
    assert.deepEqual(matchedAllergies(ingredients, ["pumpkin seed"]), ["pumpkin seed"]);
  }
});

test("keeps specific almond warnings throughout long meals and on reuse", () => {
  const original = `${"sugar, ".repeat(3000)}Contains: almonds`;
  const ingredients = foodIngredients([{ name: "Meal", ingredients: original }]);
  assert.equal(ingredients, `Meal: ${original}`);
  assert.ok(ingredients.length > 8000 && ingredients.length < FOOD_INGREDIENTS_LIMIT);
  assert.deepEqual(matchedAllergies(ingredients, ["almond"]), ["almond"]);
  const reused = foodIngredients([{ name: "Saved meal", ingredients }]);
  assert.deepEqual(matchedAllergies(reused, ["almond"]), ["almond"]);
});

test("does not silently truncate text above the storage limit", () => {
  const original = `${"sugar, ".repeat(8000)}almonds`;
  const ingredients = foodIngredients([{ name: "Meal", ingredients: original }]);
  assert.ok(ingredients.length > FOOD_INGREDIENTS_LIMIT);
  assert.equal(ingredients, `Meal: ${original}`);
});

test("handles empty and ingredient-free inputs", () => {
  assert.equal(foodIngredients([]), "");
  assert.equal(foodIngredients([{ name: "Snack", ingredients: null }]), "Snack");
});

test("over-limit meals and single food logs return clear errors without writing", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const entries = [{ food_name: "Meal", ingredients: "x".repeat(FOOD_INGREDIENTS_LIMIT), calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1 }];
  let writes = 0;
  const query = {
    select: () => query,
    eq: () => query,
    in: async () => ({ data: entries, error: null }),
    insert: async () => { writes++; return { error: null }; },
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/food-actor": { actor: async () => ({ coachId: id, isAthlete: false }), revalidateFood: () => {} },
    "@/lib/food-ingredients": { foodIngredients, FOOD_INGREDIENTS_LIMIT },
    "@/lib/nutrition": { MEALS: ["lunch"] },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) },
    "@/lib/time-zone": { getToday: async () => "2026-11-22" },
  };
  const require = createRequire(`${process.cwd()}/package.json`);
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync("src/lib/food-log-actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", code)((key: string) => key in dependencies ? dependencies[key] : require(key), loaded, loaded.exports);
  const actions = loaded.exports as {
    saveMealFromLog: (athleteId: string, date: string, name: string, ids: string[]) => Promise<{ error?: string }>;
    logFood: (athleteId: string, food: object) => Promise<{ error?: string }>;
  };
  assert.deepEqual(await actions.saveMealFromLog(id, "2026-11-22", "Lunch", [id]), { error: "This meal has too many ingredients to save — try fewer foods." });
  const result = await actions.logFood(id, { date: "2026-11-22", meal: "lunch", name: "Meal", calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1, ingredients: "x".repeat(FOOD_INGREDIENTS_LIMIT + 1) });
  assert.match(result.error ?? "", /too many ingredients to log/);
  assert.equal(writes, 0);
});
