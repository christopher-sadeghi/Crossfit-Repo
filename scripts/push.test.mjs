import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}, env = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, process: { env }, console: { error() {} }, require: (id) => {
    if (id in imports) return imports[id];
    throw new Error(`Unexpected import ${id}`);
  } });
  return exports;
}
const payload = load("src/lib/push/payload.ts");
test("categories cover notification kinds and future alerts", () => {
  for (const [category, kinds] of Object.entries({ messages: ["message", "coach_message"], schedule: ["schedule_changed"], updates: ["suggestion_approved", "progress_report"], reminders: ["progress_check_in", "check_in_reminder"], alerts: ["result_logged", "workout_adjusted", "low_readiness", "missed_workouts", "future", ""] })) {
    for (const kind of kinds) assert.equal(payload.pushCategory(kind), category);
  }
});
test("payload preserves safe paths, truncates text and rejects unsafe links", () => {
  for (const link of [undefined, null, "", "https://evil.test", "//evil.test", "/\\evil.test", "/\n/evil.test", "javascript:alert(1)"]) assert.equal(payload.safePushLink(link), "/");
  assert.equal(payload.safePushLink("/athlete/messages?q=1#latest"), "/athlete/messages?q=1#latest");
  const row = payload.buildPushPayload({ id: "id", title: "t".repeat(200), body: "b".repeat(500) });
  assert.equal(row.title.length, 100); assert.equal(row.body.length, 300); assert.equal(row.tag, "id"); assert.equal(row.link, "/");
  assert.equal(payload.buildPushPayload({ id: "id", title: "", body: null }).body, "");
});
const configured = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private", VAPID_SUBJECT: "mailto:coach@test.local", SUPABASE_SERVICE_ROLE_KEY: "test" };
function sender({ rows = [], categories, subscriptions = [], status, claimError, env = configured } = {}) {
  const calls = [], sends = [];
  const admin = { from(table) {
    const query = { select() { return query; }, update(value) { calls.push([table, "update", value]); return query; }, delete() { calls.push([table, "delete"]); return query; }, eq(...args) { calls.push([table, "eq", ...args]); return query; }, is(...args) { calls.push([table, "is", ...args]); return query; }, gt(...args) { calls.push([table, "gt", ...args]); return query; }, maybeSingle() { return Promise.resolve({ data: categories === undefined ? null : { push_categories: categories } }); }, then(resolve) { resolve({ data: table === "notifications" ? rows : subscriptions, error: table === "notifications" ? claimError : null }); } };
    return query;
  } };
  const helpers = load("src/lib/push/send.ts", { "server-only": {}, "./payload": payload, "@/lib/supabase/admin": { createAdminClient: () => admin }, "web-push": { sendNotification: async (...args) => { sends.push(args); if (status) throw { statusCode: status }; } } }, env);
  return { ...helpers, calls, sends };
}
const row = { id: "notification", recipient_id: "user", kind: "message", title: "Hi", body: null, link: "/athlete" };
const subscription = { id: "device", endpoint: "https://push.test/device", p256dh: "key", auth: "auth" };
test("unconfigured push is a silent no-op and fallback key works", async () => {
  const f = sender({ env: {} }); await f.pushNewNotifications({ athleteId: "a", kind: "message" }); assert.equal(f.calls.length, 0);
  const fallback = sender({ env: { ...configured, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "", VAPID_PUBLIC_KEY: "fallback" } }); assert.equal(fallback.pushConfig().publicKey, "fallback");
});
test("claims only fresh unpushed rows, sends default categories and records success", async () => {
  const f = sender({ rows: [row], subscriptions: [subscription] }); await f.pushNewNotifications({ athleteId: "a", kind: "message" });
  assert.equal(f.sends.length, 1); assert.equal(f.sends[0][2].TTL, 86400);
  assert.ok(f.calls.some((c) => c[1] === "is" && c[2] === "pushed_at" && c[3] === null));
  assert.ok(f.calls.some((c) => c[1] === "gt" && c[2] === "created_at"));
  assert.ok(f.calls.some((c) => c[0] === "push_subscriptions" && c[1] === "update" && c[2].last_used_at));
});
test("empty claims, disabled categories and no subscriptions send nothing", async () => {
  for (const options of [{}, { rows: [row], categories: [], subscriptions: [subscription] }, { rows: [row] }]) {
    const f = sender(options); await f.pushNewNotifications({ athleteId: "a", kind: "message" }); assert.equal(f.sends.length, 0);
  }
});
test("expired endpoints are deleted; other failures and claim errors never throw", async () => {
  for (const status of [404, 410, 500]) {
    const f = sender({ rows: [row], subscriptions: [subscription], status }); await f.pushNewNotifications({ athleteId: "a", kind: "message" });
    assert.equal(f.calls.some((c) => c[1] === "delete"), status !== 500);
  }
  const f = sender({ claimError: new Error("offline") }); await f.pushNewNotifications({ athleteId: "a", kind: "message" }); assert.equal(f.sends.length, 0);
});
