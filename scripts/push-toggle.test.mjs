import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const categories = ["messages", "schedule", "updates", "reminders", "alerts"];
const exports = {};
const source = ts.transpileModule(readFileSync(new URL("../src/components/notifications/push-toggle.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(source, { exports, require: (id) => {
  if (id === "@/app/push-actions") return {};
  if (id === "@/lib/push/payload") return { PUSH_CATEGORIES: categories };
  if (id === "@/components/ui/button") return { Button: "button" };
  if (id === "@/components/ui/card") return { Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h2" };
  return require(id);
} });
const render = (role, initialCategories = categories, loadError = false) => renderToStaticMarkup(createElement(exports.PushToggle, { role, initialCategories, loadError, publicKey: "test" }));

test("athletes see messages, schedule, updates and reminders but never coach alerts", () => {
  const html = render("athlete");
  for (const label of ["Messages", "Schedule &amp; WOD changes", "Coach approvals &amp; reports", "Reminders"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("Coach alerts"));
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 4);
});
test("coaches see only messages and coach alerts", () => {
  const html = render("coach");
  assert.ok(html.includes("Messages")); assert.ok(html.includes("Coach alerts"));
  for (const label of ["Schedule &amp; WOD changes", "Coach approvals &amp; reports", "Reminders"]) assert.ok(!html.includes(label), label);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
});
test("empty preferences leave categories unchecked and load errors prevent edits", () => {
  assert.ok(!render("athlete", []).includes("checked="));
  const html = render("coach", [], true);
  assert.ok(html.includes("Reload before changing categories"));
  assert.ok(!html.includes('type="checkbox"'));
});
