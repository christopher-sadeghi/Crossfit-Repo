import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const filename = path.resolve(root, "src/lib/waivers.ts");
const loaded = { exports: {} };
const js = ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename,
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
new Function("require", "module", "exports", js)((id) => require(id), loaded, loaded.exports);
const { WAIVER_TEMPLATE, renderWaiverBody, waiverStatus } = loaded.exports;

test("waiver status asks only when a request is pending", () => {
  const latestWaiver = { id: "waiver-current", version: 3 };
  const request = "2026-11-21T10:00:00.000Z";
  assert.deepEqual(waiverStatus({ waiverRequestedAt: request, latestWaiver, signatures: [] }), {
    status: "needs_sign",
    latestWaiver,
  });
  assert.deepEqual(waiverStatus({
    waiverRequestedAt: request,
    latestWaiver,
    signatures: [{ signedAt: "2026-11-21T09:59:59.000Z", signedName: "Alex Athlete", version: 2 }],
  }), { status: "needs_sign", latestWaiver });
  assert.deepEqual(waiverStatus({
    waiverRequestedAt: request,
    latestWaiver,
    signatures: [{ signedAt: request, signedName: "Alex Athlete", version: 3 }],
  }), {
    status: "signed",
    signature: { signedAt: request, signedName: "Alex Athlete", version: 3 },
  });
});

test("unrequested athletes remain unprompted and prior signatures stay visible", () => {
  assert.deepEqual(waiverStatus({ waiverRequestedAt: null, latestWaiver: { id: "current", version: 2 }, signatures: [] }), {
    status: "not_requested",
  });
  assert.deepEqual(waiverStatus({ waiverRequestedAt: "2026-11-21", latestWaiver: null, signatures: [] }), {
    status: "not_requested",
  });
  const signature = { signedAt: "2026-11-20T10:00:00.000Z", signedName: "Alex Athlete", version: 1 };
  assert.deepEqual(waiverStatus({ waiverRequestedAt: null, latestWaiver: { id: "current", version: 2 }, signatures: [signature] }), {
    status: "signed",
    signature,
  });
});

test("waiver template keeps its coach placeholder until display time", () => {
  assert.match(WAIVER_TEMPLATE, /with \{\{coach_name\}\}/);
  assert.match(WAIVER_TEMPLATE, /8\. Agreement\./);
  assert.equal(renderWaiverBody(WAIVER_TEMPLATE, "Jordan Coach").includes("{{coach_name}}"), false);
  assert.equal(renderWaiverBody("Signed by {{coach_name}} and {{coach_name}}", ""), "Signed by your coach and your coach");
});
