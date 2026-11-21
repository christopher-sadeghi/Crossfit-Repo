export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABELS: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

export type Macros = { calories: number; protein: number; carbs: number; fat: number };
export type Target = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  start_date: string;
  end_date: string | null;
};
type FoodRow = { logged_on: string; calories: number; protein_g: number | string; carbs_g: number | string; fat_g: number | string };

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function totals(rows: FoodRow[]): Macros {
  return rows.reduce(
    (t, f) => ({
      calories: t.calories + f.calories,
      protein: t.protein + Number(f.protein_g),
      carbs: t.carbs + Number(f.carbs_g),
      fat: t.fat + Number(f.fat_g),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** The target that applied on a given day (targets are kept as history). */
export function targetOn<T extends Target>(targets: T[], date: string) {
  return targets.find((t) => t.start_date <= date && (t.end_date == null || t.end_date >= date)) ?? null;
}

/** A day is on target when calories are within ±10% and protein reaches at least 90%. */
export function onTarget(day: Macros, target: Target) {
  return Math.abs(day.calories - target.calories) <= target.calories * 0.1 && day.protein >= target.protein_g * 0.9;
}
