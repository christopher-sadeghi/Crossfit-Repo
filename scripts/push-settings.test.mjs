import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../src/components/notifications/push-settings.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(config, { userId = "user", categories, error = null } = {}) {
  const exports = {};
  const calls = [];
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: categories ? { push_categories: categories } : null, error }) };
  vm.runInNewContext(source, { exports, require: (id) => {
    if (id === "@/lib/push/config") return { pushConfig: () => config };
    if (id === "@/lib/push/payload") return { PUSH_CATEGORIES: ["messages", "schedule", "updates", "reminders", "alerts"] };
    if (id === "./push-toggle") return { PushToggle: () => null };
    if (id === "@/lib/supabase/server") return { createClient: async () => { calls.push("client"); return { auth: { getClaims: async () => ({ data: { claims: { sub: userId } } }) }, from: () => q }; } };
    return require(id);
  } });
  return { ...exports, calls };
}
test("push settings remain hidden without full configuration and avoid querying", async () => {
  const f = fixture(null); assert.equal(await f.PushSettings({ role: "athlete" }), null); assert.equal(f.calls.length, 0);
});
test("configured UI passes only the public key and handles defaults and load errors", async () => {
  const config = { publicKey: "public", privateKey: "private", subject: "mailto:test@example.com" };
  for (const options of [{}, { categories: [] }, { error: new Error("offline") }]) {
    const view = await fixture(config, options).PushSettings({ role: "coach" });
    assert.equal(view.props.publicKey, "public"); assert.equal(view.props.privateKey, undefined);
    assert.equal(view.props.loadError, !!options.error);
    assert.equal(view.props.initialCategories.length, options.categories ? 0 : 5);
  }
  assert.equal(await fixture(config, { userId: null }).PushSettings({ role: "coach" }), null);
});
