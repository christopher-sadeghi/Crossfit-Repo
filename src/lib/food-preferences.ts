import { z } from "zod";

export const DIET_TYPES = [
  ["none", "No specific diet"],
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["pescatarian", "Pescatarian"],
  ["gluten_free", "Gluten-free"],
  ["dairy_free", "Dairy-free"],
  ["low_carb", "Low-carb"],
  ["paleo", "Paleo"],
  ["halal", "Halal"],
  ["kosher", "Kosher"],
] as const;
export type DietType = (typeof DIET_TYPES)[number][0];
export const DIET_LABELS = Object.fromEntries(DIET_TYPES) as Record<DietType, string>;

export const COOKING_OPTIONS = [
  ["", "Any amount of time"],
  ["0", "No cooking"],
  ["15", "Up to 15 minutes"],
  ["30", "Up to 30 minutes"],
  ["60", "Up to an hour"],
] as const;

export function cookingLabel(minutes: number | null) {
  return COOKING_OPTIONS.find(([value]) => value === (minutes == null ? "" : String(minutes)))?.[1] ?? "Any amount of time";
}

export type FoodPreferences = {
  diet_type: DietType;
  allergies: string[];
  dislikes: string[];
  cooking_minutes: number | null;
};

export const EMPTY_PREFERENCES: FoodPreferences = { diet_type: "none", allergies: [], dislikes: [], cooking_minutes: null };

const list = (max: number, label: string) =>
  z
    .string()
    .max(1000)
    .transform((value) => [...new Set(value.split(/[,\n]/).map((item) => item.trim().replace(/\s+/g, " ")).filter(Boolean))])
    .refine((items) => items.length <= max, `List up to ${max} ${label}.`)
    .refine((items) => items.every((item) => item.length <= 60), `Keep each of the ${label} under 60 characters.`);

export const foodPreferencesFormSchema = z.object({
  diet_type: z.enum(DIET_TYPES.map(([value]) => value) as [DietType, ...DietType[]], { message: "Choose a diet type." }),
  allergies: list(20, "allergies"),
  dislikes: list(30, "foods they dislike"),
  cooking_minutes: z
    .enum(["", "0", "15", "30", "60"], { message: "Choose how much time there is to cook." })
    .transform((value) => (value === "" ? null : Number(value))),
});

/** Reads a preferences row (or nothing) into safe values. */
export function readPreferences(row: { diet_type: string; allergies: string[]; dislikes: string[]; cooking_minutes: number | null } | null): FoodPreferences {
  if (!row) return EMPTY_PREFERENCES;
  const diet = DIET_TYPES.some(([value]) => value === row.diet_type) ? (row.diet_type as DietType) : "none";
  return { diet_type: diet, allergies: row.allergies ?? [], dislikes: row.dislikes ?? [], cooking_minutes: row.cooking_minutes };
}
