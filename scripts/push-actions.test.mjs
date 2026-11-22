import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function fixture({ anonymous = false, error = null, found = true } = {}) {
  const calls = [];
  const query = { eq: (...args) => { calls.push(["eq", ...args]); return query; }, select: () => query, delete: () => query, upsert: (value) => { calls.push(["upsert", value]); return query; }, maybeSingle: async () => ({ data: found ? { id: "device" } : null, error }), then: (resolve) => resolve({ error }) };
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: anonymous ? null : "user" } } }) }, rpc: async (...args) => { calls.push(["rpc", ...args]); return { error }; }, from: (table) => { calls.push(["from", table]); return query; } };
  const payloadExports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/push/payload.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: payloadExports, URL });
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../src/app/push-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: (id) => id === "@/lib/supabase/server" ? { createClient: async () => client } : id === "@/lib/push/payload" ? payloadExports : require(id) });
  return { ...exports, calls };
}
const sub = { endpoint: "https://fcm.googleapis.com/device", keys: { p256dh: "key", auth: "auth" }, userAgent: "test" };
test("subscription actions register with the RPC and restrict reads/deletes to current user", async () => {
  const f = fixture();
  assert.equal((await f.savePushSubscription(sub)).error, undefined);
  assert.equal(f.calls[0][1], "register_push_subscription");
  assert.equal(f.calls[0][2].p_endpoint, sub.endpoint);
  assert.equal((await f.hasPushSubscription(sub.endpoint)).enabled, true);
  assert.equal((await f.deletePushSubscription(sub.endpoint)).error, undefined);
  assert.equal(f.calls.filter((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === "user").length, 2);
  assert.equal((await fixture({ found: false }).hasPushSubscription(sub.endpoint)).enabled, false);
});
test("category saves allow none or all and upsert only own settings", async () => {
  const f = fixture();
  for (const categories of [[], ["messages", "schedule", "updates", "reminders", "alerts"]]) {
    assert.equal((await f.savePushCategories(categories)).error, undefined);
    assert.equal(f.calls.at(-1)[1].user_id, "user");
    assert.deepEqual(Array.from(f.calls.at(-1)[1].push_categories), categories);
  }
});
test("malformed, unauthenticated and failed actions return errors", async () => {
  const f = fixture();
  for (const input of [null, {}, { ...sub, endpoint: "http://insecure.test" }, { ...sub, keys: {} }]) assert.ok((await f.savePushSubscription(input)).error);
  assert.ok((await f.deletePushSubscription("")).error);
  assert.ok((await f.savePushSubscription({ ...sub, endpoint: "https://127.0.0.1/private" })).error);
  assert.ok((await f.hasPushSubscription("//evil.test")).error);
  assert.ok((await f.savePushCategories(["unknown"])).error);
  assert.equal(f.calls.length, 0);
  for (const options of [{ anonymous: true }, { error: new Error("offline") }]) {
    const f = fixture(options);
    assert.ok((await f.savePushSubscription(sub)).error);
    assert.ok((await f.deletePushSubscription(sub.endpoint)).error);
    assert.ok((await f.hasPushSubscription(sub.endpoint)).error);
    assert.ok((await f.savePushCategories([])).error);
  }
});
