import { matchedAllergies } from "@/lib/ai/food-safety";

type IngredientEntry = { name: string; ingredients: string | null; allergens?: string[] };
const commonAllergens = ["peanut", "tree nut", "milk", "egg", "fish", "shellfish", "soy", "gluten", "sesame", "mustard", "celery", "lupin", "sulphite"];

export function foodIngredients(entries: IngredientEntry[], limit: number): string | null {
  const allergens = new Set<string>();
  const names = new Set<string>();
  for (const entry of entries) {
    names.add(entry.name);
    const text = [entry.name, entry.ingredients, ...(entry.allergens ?? [])].filter(Boolean).join(" ");
    for (const allergen of [...matchedAllergies(text, commonAllergens), ...(entry.allergens ?? [])]) allergens.add(allergen.toLowerCase());
    for (const match of (entry.ingredients ?? "").matchAll(/(?:^|[;\n])\s*(allergens|foods):\s*([^;\n]+)/gi)) {
      for (const value of match[2].split(",").map(value => value.trim()).filter(Boolean)) {
        if (match[1].toLowerCase() === "allergens") allergens.add(value.toLowerCase());
        else names.add(value);
      }
    }
  }
  const priority = [allergens.size ? `Allergens: ${[...allergens].join(", ")}` : null, names.size ? `Foods: ${[...names].join(", ")}` : null].filter(Boolean).join("; ");
  if (priority.length > limit) return null;
  const plain = entries.map(entry => entry.ingredients).filter(Boolean).join("; ");
  return (priority + (plain && limit - priority.length > 2 ? `; ${plain.slice(0, limit - priority.length - 2)}` : ""));
}
