import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const athleteId = "33000000-0000-4000-8000-000000000011";
const liveStatuses = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"];

function fixture({ membership = null, membershipError = null, updateError = null } = {}) {
  const calls = [];
  const filters = [];
  const invalidations = [];
  const client = {
    from(table) {
      let operation = "select";
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([table, "eq", key, value]); return query; },
        in(key, values) { filters.push([table, "in", key, values]); return query; },
        limit(value) { filters.push([table, "limit", value]); return query; },
        update(value) { operation = "update"; calls.push([table, "update", value]); return query; },
        maybeSingle: async () => ({ data: membership, error: membershipError }),
        then(resolve, reject) {
          const error = table === "athletes" && operation === "update" ? updateError : null;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const overrides = {
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
    "next/navigation": { redirect() {} },
    "@/lib/auth/form-state": { failure() { return {}; } },
    "@/lib/email/origin": { siteOrigin: () => "https://example.test" },
    "@/lib/height": { ftInToCm: () => 0 },
    "@/lib/payments/athlete-core": { LIVE_MEMBERSHIP_STATUSES: liveStatuses },
    "@/lib/supabase/server": { createClient: async () => client },
    "./options": { LEVELS: ["beginner"], SEXES: ["male"] },
  };
  const filename = path.resolve(root, "src/app/(app)/athletes/actions.ts");
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => id in overrides ? overrides[id] : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return { action: loaded.exports.setAthleteStatus, calls, filters, invalidations };
}

test("archiving is blocked while a live membership exists", async () => {
  const f = fixture({ membership: { id: "membership" } });
  assert.deepEqual(await f.action(athleteId, "archived"), {
    error: "This athlete has an active membership. Cancel it in your Stripe dashboard before archiving.",
  });
  assert.ok(f.filters.some(([table, operator, key, value]) =>
    table === "athlete_memberships" && operator === "eq" && key === "athlete_id" && value === athleteId));
  assert.ok(f.filters.some(([table, operator, key, value]) =>
    table === "athlete_memberships" && operator === "in" && key === "status" && JSON.stringify(value) === JSON.stringify(liveStatuses)));
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.invalidations, []);
});

test("archiving proceeds when there is no live membership and revalidates the athlete", async () => {
  const f = fixture();
  assert.deepEqual(await f.action(athleteId, "archived"), {});
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], "athletes");
  assert.equal(f.calls[0][1], "update");
  assert.equal(f.calls[0][2].status, "archived");
  assert.ok(Number.isFinite(Date.parse(f.calls[0][2].updated_at)));
  assert.deepEqual(f.invalidations, [["/athletes"], [`/athletes/${athleteId}`]]);
});

test("membership lookup failures prevent archiving", async () => {
  const f = fixture({ membershipError: new Error("database unavailable") });
  assert.match((await f.action(athleteId, "archived")).error, /Couldn't check/);
  assert.deepEqual(f.calls, []);
});
