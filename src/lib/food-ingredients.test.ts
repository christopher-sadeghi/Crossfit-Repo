import assert from "node:assert/strict";
import { test } from "node:test";

import { matchedAllergies } from "./ai/food-safety";
import { foodIngredients } from "./food-ingredients";

test("preserves specific almond warnings when plain ingredients exceed the limit", () => {
  const ingredients = foodIngredients([{ name: "Snack", ingredients: `${"sugar, ".repeat(1200)}roasted almonds, salt` }], 8000);
  assert.ok(ingredients);
  assert.ok(ingredients.length <= 8000);
  assert.ok(ingredients.includes("roasted almonds"));
  assert.deepEqual(matchedAllergies(ingredients, ["almond"]), ["almond"]);
  const logged = foodIngredients([{ name: "Saved snack", ingredients }], 8000);
  assert.ok(logged);
  assert.deepEqual(matchedAllergies(logged, ["almond"]), ["almond"]);
});

test("keeps explicit allergen tags and deduplicates full allergen-bearing text", () => {
  const ingredients = foodIngredients([{ name: "Snack", ingredients: "almonds; almonds; Allergens: unusual seed, MILK", allergens: ["milk"] }], 8000);
  assert.ok(ingredients);
  assert.deepEqual(matchedAllergies(ingredients, ["almond", "unusual seed", "milk"]), ["almond", "unusual seed", "milk"]);
  assert.equal(ingredients.split("; almonds").length - 1, 1);
});

test("rejects oversized allergy text instead of truncating it", () => {
  assert.equal(foodIngredients([{ name: "Snack", ingredients: `${"x".repeat(8000)} almonds` }], 8000), null);
});

test("handles empty and ingredient-free inputs", () => {
  assert.equal(foodIngredients([], 8000), "");
  assert.equal(foodIngredients([{ name: "Snack", ingredients: null }], 8000), "Foods: Snack");
});
