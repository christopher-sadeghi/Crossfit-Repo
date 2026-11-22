import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", "globalThis", code)(id => id === "server-only" ? {} : id in dependencies ? dependencies[id] : require(id), loaded.exports, {});
  return loaded.exports;
}
const busy = "You're searching very fast — wait a minute or enter the food manually.";

test("minute limits allow 30 searches, isolate accounts and expire at the boundary", async () => {
  const { foodLookupLimit } = load("src/lib/food-db/rate-limit.ts");
  for (let i = 0; i < 30; i++) assert.equal(foodLookupLimit("coach:a", 1000), null);
  const limited = foodLookupLimit("coach:a", 1000);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: busy });
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal(foodLookupLimit("coach:b", 1000), null);
  assert.equal(foodLookupLimit("coach:a", 60_999).status, 429);
  assert.equal(foodLookupLimit("coach:a", 61_000), null);
});

test("daily limits reject search 301 and expire after 24 hours", async () => {
  const { foodLookupLimit } = load("src/lib/food-db/rate-limit.ts");
  for (let minute = 0; minute < 10; minute++) {
    for (let i = 0; i < 30; i++) assert.equal(foodLookupLimit("athlete:a", 1000 + minute * 60_000), null);
  }
  const limited = foodLookupLimit("athlete:a", 601_000);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "You've reached today's food search limit — try again tomorrow or enter the food manually." });
  assert.equal(foodLookupLimit("athlete:a", 86_401_000), null);
});

test("authenticated search and barcode routes share a quota and stop before providers", async () => {
  const { foodLookupLimit } = load("src/lib/food-db/rate-limit.ts");
  let viewer = { kind: "coach", id: "a" };
  let calls = 0;
  const result = async () => { calls++; return { ok: true, items: [{ name: "Banana" }] }; };
  const dependencies = {
    "@/lib/viewer": { getViewer: async () => viewer },
    "@/lib/food-db/rate-limit": { foodLookupLimit: account => foodLookupLimit(account, 1000) },
    "@/lib/food-db/providers": { searchUsda: result, searchOff: result, lookupBarcode: result },
  };
  const search = load("src/app/api/foods/search/route.ts", dependencies).GET;
  const barcode = load("src/app/api/foods/barcode/[code]/route.ts", dependencies).GET;
  const request = new Request("http://localhost/api/foods/search?q=banana&source=usda");
  const params = { params: Promise.resolve({ code: "3017624010701" }) };
  for (let i = 0; i < 15; i++) {
    assert.equal((await search(request)).status, 200);
    assert.equal((await barcode(request, params)).status, 200);
  }
  for (const response of [await search(request), await barcode(request, params)]) {
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: busy });
  }
  assert.equal(calls, 30);
  viewer = { kind: "athlete", athleteId: "a" };
  assert.equal((await search(request)).status, 200);
  viewer = null;
  assert.equal((await search(request)).status, 401);
  assert.equal((await barcode(request, params)).status, 401);
  assert.equal(calls, 31);
});
