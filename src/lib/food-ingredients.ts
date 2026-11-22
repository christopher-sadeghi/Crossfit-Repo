import { matchedAllergies } from "@/lib/ai/food-safety";

type IngredientEntry = { name: string; ingredients: string | null; allergens?: string[] };
const commonAllergens = ["peanut", "tree nut", "milk", "egg", "fish", "shellfish", "soy", "gluten", "sesame", "mustard", "celery", "lupin", "sulphite"];

export function foodIngredients(entries: IngredientEntry[], limit: number): string | null {
  const allergens = new Set<string>();
  const names = new Set<string>();
  const safety = new Set<string>();
  const plain: string[] = [];
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
  for (const entry of entries) {
    for (const section of (entry.ingredients ?? "").split(/[;\n]/)) {
      if (/^\s*(allergens|foods):/i.test(section)) continue;
      for (const part of section.split(",").map(value => value.trim()).filter(Boolean)) {
        if (matchedAllergies(part, [...commonAllergens, ...allergens]).length) safety.add(part);
        else plain.push(part);
      }
    }
  }
  const priority = [allergens.size ? `Allergens: ${[...allergens].join(", ")}` : null, names.size ? `Foods: ${[...names].join(", ")}` : null, ...safety].filter(Boolean).join("; ");
  if (priority.length > limit) return null;
  const text = plain.join(", ");
  return priority + (text && limit - priority.length > 2 ? `; ${text.slice(0, limit - priority.length - 2)}` : "");
}
