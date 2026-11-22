export type FoodServing = {
  label: string;
  grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type FoodItem = {
  key: `usda:${string}` | `off:${string}`;
  source: "usda" | "off";
  sourceId: string;
  name: string;
  brand: string | null;
  ingredients: string | null;
  allergens: string[];
  servings: FoodServing[];
};

export type LookupResult = { ok: true; items: FoodItem[] } | { ok: false; reason: "rate_limit" | "unavailable" };
