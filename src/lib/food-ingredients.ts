type IngredientEntry = { name: string; ingredients: string | null; allergens?: string[] };

export const FOOD_INGREDIENTS_LIMIT = 50000;

export function foodIngredients(entries: IngredientEntry[]): string {
  const whitespace = (text: string) => text.replace(/\s+/g, " ").trim();
  return entries.map(entry => [
    [whitespace(entry.name), entry.ingredients ? whitespace(entry.ingredients) : ""].filter(Boolean).join(": "),
    entry.allergens?.length ? `allergens: ${entry.allergens.map(whitespace).join(", ")}` : "",
  ].filter(Boolean).join("; ")).join("; ");
}
