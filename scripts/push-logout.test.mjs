import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function fixture({ endpoint = "https://fcm.googleapis.com/device", userId = "user", fail = false } = {}) {
  const calls = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: userId } } }), signOut: async () => { calls.push(["signOut"]); return {}; } },
    from: (table) => { calls.push(["from", table]); if (fail) throw new Error("offline"); const q = { delete: () => q, eq: (...args) => { calls.push(["eq", ...args]); return q; } }; return q; },
  };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../src/app/(auth)/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, console: { error() {} }, require: (id) => {
    if (id === "next/headers") return { cookies: async () => ({ get: () => endpoint ? { value: endpoint } : undefined, delete: (name) => calls.push(["cookie-delete", name]) }) };
    if (id === "next/navigation") return { redirect: (path) => calls.push(["redirect", path]) };
    if (id === "@/lib/supabase/server") return { createClient: async () => client };
    if (id.startsWith("@/lib/auth/")) return {};
    return require(id);
  } });
  return { ...exports, calls };
}
test("logout deletes only the cookie-bound device for the signed-in user before signOut", async () => {
  const f = fixture(); await f.logout();
  assert.deepEqual(f.calls, [["from", "push_subscriptions"], ["eq", "user_id", "user"], ["eq", "endpoint", "https://fcm.googleapis.com/device"], ["cookie-delete", "fitcoach-push-endpoint"], ["signOut"], ["redirect", "/login"]]);
});
test("logout works with no subscription, no authenticated user or failed cleanup", async () => {
  for (const options of [{ endpoint: null }, { userId: null }, { fail: true }]) {
    const f = fixture(options); await f.logout();
    assert.ok(f.calls.some((c) => c[0] === "cookie-delete"));
    assert.ok(f.calls.some((c) => c[0] === "signOut"));
    assert.deepEqual(f.calls.at(-1), ["redirect", "/login"]);
  }
});
