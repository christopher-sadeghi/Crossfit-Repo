import "server-only";

import { unstable_cache } from "next/cache";

import { normalizeOff, normalizeUsda, record } from "./normalize";
import type { LookupResult } from "./types";

const fields = "code,product_name,product_name_en,brands,ingredients_text,allergens_tags,nutriments,serving_size,serving_quantity,serving_quantity_unit";
const headers = { "User-Agent": "FitCoachAI/1.0 (https://github.com/christopher-sadeghi/Crossfit-Repo)" };

async function lookup(url: URL, source: "usda" | "off", barcode = false): Promise<LookupResult> {
  try {
    const response = await fetch(url.href.replace(/\+/g, "%20"), { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 429) return { ok: false, reason: "rate_limit" };
    if (barcode && response.status === 404) return { ok: true, items: [] };
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const data = record(await response.json());
    const raw = barcode ? (data.status === 0 ? [] : [data.product]) : data[source === "usda" ? "foods" : "products"];
    if (!Array.isArray(raw)) return { ok: false, reason: "unavailable" };
    return { ok: true, items: raw.flatMap(v => { const item = source === "usda" ? normalizeUsda(v) : normalizeOff(v); return item ? [item] : []; }) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

class LookupFailure extends Error {
  constructor(readonly reason: "rate_limit" | "unavailable") { super("Food source unavailable"); }
}

const cachedLookup = unstable_cache(async (source: "usda" | "off", term: string, barcode: boolean) => {
  let url: URL;
  if (source === "usda") {
    url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.search = new URLSearchParams({ api_key: process.env.USDA_FDC_API_KEY || "DEMO_KEY", query: term, pageSize: "15" }).toString();
    for (const type of ["Foundation", "SR Legacy", "Survey (FNDDS)"]) url.searchParams.append("dataType", type);
  } else if (barcode) {
    url = new URL(`https://world.openfoodfacts.org/api/v2/product/${term}.json`);
    url.searchParams.set("fields", fields);
  } else {
    url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.search = new URLSearchParams({ search_terms: term, json: "1", page_size: "15", fields }).toString();
  }
  const result = await lookup(url, source, barcode);
  if (!result.ok) throw new LookupFailure(result.reason);
  return result.items;
}, ["food-db-v1"], { revalidate: 86400 });

async function search(source: "usda" | "off", term: string, barcode = false): Promise<LookupResult> {
  try {
    return { ok: true, items: await cachedLookup(source, term.trim().toLowerCase(), barcode) };
  } catch (error) {
    return { ok: false, reason: error instanceof LookupFailure ? error.reason : "unavailable" };
  }
}

export const searchUsda = (query: string) => search("usda", query);
export const searchOff = (query: string) => search("off", query);
export const lookupBarcode = (code: string) => search("off", code, true);
