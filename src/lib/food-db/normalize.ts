import type { FoodItem, FoodServing } from "./types";

type RecordValue = Record<string, unknown>;
export const record = (value: unknown): RecordValue => value !== null && typeof value === "object" ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const num = (value: unknown): number | null => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const round = (n: number) => Math.round(n * 10) / 10;

function scaled(base: FoodServing, label: string, grams: number): FoodServing {
  return { label, grams, calories: Math.round(base.calories * grams / 100), protein_g: round(base.protein_g * grams / 100), carbs_g: round(base.carbs_g * grams / 100), fat_g: round(base.fat_g * grams / 100), incomplete: base.incomplete };
}

export function normalizeUsda(value: unknown): FoodItem | null {
  const f = record(value);
  const name = str(f.description);
  const id = num(f.fdcId);
  const nutrients = list(f.foodNutrients).map(record);
  const nutrient = (id: number) => num(nutrients.find(n => n.nutrientId === id)?.value);
  const kj = nutrient(1062);
  const calories = nutrient(1008) ?? nutrient(2047) ?? nutrient(2048) ?? (kj === null ? null : kj / 4.184);
  if (!name || id === null || calories === null) return null;
  const incomplete = [["Protein", 1003], ["Carbohydrates", 1005], ["Fat", 1004]].flatMap(([label, id]) => nutrient(Number(id)) === null ? [String(label)] : []);
  const base: FoodServing = { label: "100 g", grams: 100, calories: Math.round(calories), protein_g: nutrient(1003) ?? 0, carbs_g: nutrient(1005) ?? 0, fat_g: nutrient(1004) ?? 0, incomplete };
  const servings = [base];
  for (const raw of list(f.foodMeasures)) {
    const m = record(raw);
    const grams = num(m.gramWeight);
    const label = str(m.disseminationText) || [m.value, m.measureUnitAbbreviation, m.modifier].filter(Boolean).join(" ");
    if (grams && label) servings.push(scaled(base, label, grams));
  }
  const grams = str(f.servingSizeUnit).toLowerCase() === "g" ? num(f.servingSize) : null;
  if (grams) servings.push(scaled(base, str(f.householdServingFullText) || `${grams} g`, grams));
  return { key: `usda:${id}`, source: "usda", sourceId: String(id), name, brand: str(f.brandOwner) || null, ingredients: str(f.ingredients) || null, allergens: [], servings };
}

export function normalizeOff(value: unknown): FoodItem | null {
  const f = record(value);
  const n = record(f.nutriments);
  const localizedName = record(f.product_name);
  const name = str(f.product_name) || str(f.product_name_en) || str(localizedName.en) || Object.values(localizedName).map(str).find(Boolean) || "";
  const brand = Array.isArray(f.brands) ? f.brands.map(str).filter(Boolean).join(", ") : str(f.brands);
  const code = str(f.code);
  const energy = (suffix: string) => num(n[`energy-kcal_${suffix}`]) ?? (() => { const kj = num(n[`energy-kj_${suffix}`]) ?? num(n[`energy_${suffix}`]); return kj === null ? null : kj / 4.184; })();
  const serving = (suffix: string, label: string, grams: number | null): FoodServing | null => {
    const calories = energy(suffix);
    const incomplete = [["Protein", "proteins"], ["Carbohydrates", "carbohydrates"], ["Fat", "fat"]].flatMap(([label, key]) => num(n[`${key}_${suffix}`]) === null ? [label] : []);
    return calories === null ? null : { label, grams, calories: Math.round(calories), protein_g: num(n[`proteins_${suffix}`]) ?? 0, carbs_g: num(n[`carbohydrates_${suffix}`]) ?? 0, fat_g: num(n[`fat_${suffix}`]) ?? 0, incomplete };
  };
  if (!name || !/^\d{8,14}$/.test(code)) return null;
  const base = serving("100g", "100 g", 100);
  const servings: FoodServing[] = base ? [base] : [];
  const label = str(f.serving_size);
  const quantity = num(f.serving_quantity);
  const grams = (!f.serving_quantity_unit || f.serving_quantity_unit === "g") ? quantity ?? num(label.match(/([\d.]+)\s*g\b/i)?.[1]) : null;
  if (label || grams) {
    const real = serving("serving", label || `${grams} g`, grams) ?? (base && grams ? scaled(base, label || `${grams} g`, grams) : null);
    if (real) servings.push(real);
  }
  if (!servings.length) return null;
  return { key: `off:${code}`, source: "off", sourceId: code, name, brand: brand || null, ingredients: str(f.ingredients_text) || null, allergens: list(f.allergens_tags).filter((v): v is string => typeof v === "string").map(v => v.replace(/^en:/, "")), servings };
}
