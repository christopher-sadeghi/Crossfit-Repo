// Post-checks AI food ideas against an athlete's allergies, so safety doesn't rely on the prompt alone.
// Matching is deliberately broad: a false alarm drops one idea, a miss could hurt someone.

const GROUPS: { names: string[]; terms: string[] }[] = [
  {
    names: ["peanut", "groundnut"],
    terms: ["peanut", "groundnut", "satay", "arachis", "monkey nut"],
  },
  {
    names: ["tree nut", "nut"],
    terms: [
      "nut", "almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut",
      "chestnut", "praline", "marzipan", "nutella", "pesto", "frangipane", "nougat", "gianduja", "peanut", "satay",
    ],
  },
  {
    names: ["milk", "dairy", "lactose", "casein", "whey"],
    terms: [
      "milk", "dairy", "cheese", "butter", "yogurt", "yoghurt", "cream", "whey", "casein", "ghee", "kefir", "skyr",
      "ricotta", "mozzarella", "parmesan", "feta", "cheddar", "paneer", "halloumi", "cottage", "curd", "lactose",
      "latte", "custard", "ice cream", "quark", "labneh", "tzatziki", "raita", "queso", "brie", "gouda",
    ],
  },
  {
    names: ["egg"],
    terms: ["egg", "omelet", "omelette", "frittata", "quiche", "mayo", "mayonnaise", "aioli", "meringue", "shakshuka", "custard", "hollandaise", "carbonara"],
  },
  {
    names: ["fish", "seafood"],
    terms: [
      "fish", "salmon", "tuna", "cod", "tilapia", "sardine", "anchovy", "anchovies", "mackerel", "trout", "halibut",
      "haddock", "pollock", "bass", "snapper", "swordfish", "herring", "caesar", "fish sauce", "worcestershire", "sushi", "poke", "lox",
    ],
  },
  {
    names: ["shellfish", "crustacean", "mollusc", "mollusk", "seafood"],
    terms: [
      "shellfish", "shrimp", "prawn", "crab", "lobster", "crayfish", "crawfish", "langoustine", "clam", "mussel",
      "oyster", "scallop", "squid", "calamari", "octopus", "cuttlefish", "oyster sauce",
    ],
  },
  {
    names: ["soy", "soya", "soybean"],
    terms: ["soy", "soya", "soybean", "tofu", "tempeh", "edamame", "miso", "tamari", "natto", "teriyaki"],
  },
  {
    names: ["gluten", "wheat", "coeliac", "celiac"],
    terms: [
      "gluten", "wheat", "flour", "bread", "toast", "sandwich", "wrap", "tortilla", "pita", "bagel", "pasta", "noodle",
      "couscous", "bulgur", "seitan", "barley", "rye", "spelt", "semolina", "cracker", "crouton", "panko", "breadcrumb",
      "muffin", "pancake", "waffle", "granola", "cereal", "oat", "pizza", "burrito", "dumpling", "soy sauce", "teriyaki", "farro",
    ],
  },
  { names: ["sesame"], terms: ["sesame", "tahini", "hummus", "houmous", "halva", "za'atar", "zaatar"] },
  { names: ["mustard"], terms: ["mustard", "dijon"] },
  { names: ["celery"], terms: ["celery", "celeriac"] },
  { names: ["lupin"], terms: ["lupin", "lupine"] },
  { names: ["sulphite", "sulfite"], terms: ["sulphite", "sulfite", "wine", "dried apricot", "dried fruit"] },
];

export function normalizeTerm(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(allergy|allergies|allergic|intolerance|intolerant|free)\b/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(word: string) {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(sh|ch|x|s)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

function singularPhrase(value: string) {
  return value.split(" ").map(singular).join(" ");
}

/** Every word or phrase that counts as this allergy, including common foods made from it. */
export function allergyTerms(allergy: string) {
  const normalized = singularPhrase(normalizeTerm(allergy));
  if (!normalized) return [];
  const terms = new Set([normalized]);
  for (const group of GROUPS) {
    if (group.names.some((name) => normalized === name || normalized.split(" ").includes(name)))
      for (const term of group.terms) terms.add(singularPhrase(term));
  }
  return [...terms];
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a term in text as whole words, allowing plurals ("egg" matches "eggs", not "eggplant"). */
export function containsTerm(text: string, term: string) {
  const haystack = singularPhrase(normalizeTerm(text));
  const needle = singularPhrase(normalizeTerm(term));
  if (!needle) return false;
  return new RegExp(`(^| )${escape(needle)}( |$)`).test(haystack);
}

/** The allergies (as the athlete wrote them) that this text appears to contain. */
export function matchedAllergies(text: string, allergies: string[]) {
  return allergies.filter((allergy) => allergyTerms(allergy).some((term) => containsTerm(text, term)));
}
