import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("public PWA assets bypass auth middleware but private routes remain protected", () => {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, require: () => ({}) });
  const matcher = new RegExp(`^${exports.config.matcher[0]}$`);
  for (const path of ["/sw.js", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"]) assert.equal(matcher.test(path), false, path);
  for (const path of ["/", "/settings", "/athlete/messages", "/api/private"]) assert.equal(matcher.test(path), true, path);
});

function fixture({ offline = false, windows = [] } = {}) {
  const listeners = {}, calls = [], notifications = [];
  const cache = { add: async (url) => calls.push(["add", url]), match: async (url) => { calls.push(["match", url]); return "offline"; } };
  const self = { location: { origin: "https://fit.test" }, addEventListener: (name, callback) => { listeners[name] = callback; }, registration: { showNotification: async (...args) => notifications.push(args) }, clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (url) => calls.push(["open", url]) } };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, URL, caches: { open: async () => cache, keys: async () => ["fitcoach-offline-v0", "fitcoach-offline-v1", "unrelated"], delete: async (name) => calls.push(["delete", name]) }, fetch: async () => { if (offline) throw new Error("offline"); return "network"; } });
  async function dispatch(name, props = {}) {
    let promise;
    listeners[name]({ ...props, waitUntil: (value) => { promise = value; }, respondWith: (value) => { promise = value; } });
    return await promise;
  }
  return { dispatch, calls, notifications };
}
test("worker caches only offline document, navigates network-first and drops only old app caches", async () => {
  const f = fixture();
  await f.dispatch("install"); await f.dispatch("activate");
  assert.deepEqual(f.calls, [["add", "/offline.html"], ["delete", "fitcoach-offline-v0"]]);
  assert.equal(await f.dispatch("fetch", { request: { mode: "navigate" } }), "network");
  assert.equal(await f.dispatch("fetch", { request: { mode: "cors" } }), undefined);
  const offline = fixture({ offline: true });
  assert.equal(await offline.dispatch("fetch", { request: { mode: "navigate" } }), "offline");
  assert.deepEqual(offline.calls, [["match", "/offline.html"]]);
});
test("worker handles empty/malformed pushes and displays valid safe payloads", async () => {
  const f = fixture(); await f.dispatch("push");
  await f.dispatch("push", { data: { json() { throw new Error("bad json"); } } });
  assert.equal(f.notifications.length, 0);
  await f.dispatch("push", { data: { json: () => ({ title: "Hello", body: "Message", tag: "id", link: "https://evil.test" }) } });
  assert.equal(f.notifications[0][0], "Hello");
  assert.equal(f.notifications[0][1].data.link, "https://fit.test/");
});
test("notification clicks reuse same-origin clients or open a sanitized window", async () => {
  const calls = [];
  const f = fixture({ windows: [{ url: "https://fit.test/athlete", navigate: async (url) => calls.push(["navigate", url]), focus: async () => calls.push(["focus"]) }] });
  await f.dispatch("notificationclick", { notification: { close() {}, data: { link: "/athlete/messages" } } });
  assert.deepEqual(calls, [["navigate", "https://fit.test/athlete/messages"], ["focus"]]);
  const empty = fixture();
  await empty.dispatch("notificationclick", { notification: { close() {}, data: { link: "//evil.test" } } });
  assert.deepEqual(empty.calls, [["open", "https://fit.test/"]]);
});
