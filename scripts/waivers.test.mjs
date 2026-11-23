import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative, overrides = {}) {
  const filename = path.resolve(root, relative);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => id in overrides ? overrides[id] : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { WAIVER_TEMPLATE, renderWaiverBody, waiverStatus } = load("src/lib/waivers.ts");

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

test("waiver template is rendered before publishing and published text stays fixed", () => {
  assert.match(WAIVER_TEMPLATE, /with \{\{coach_name\}\}/);
  assert.match(WAIVER_TEMPLATE, /8\. Agreement\./);
  const publishedBody = renderWaiverBody(WAIVER_TEMPLATE, "Jordan Coach");
  assert.match(publishedBody, /with Jordan Coach/);
  assert.equal(publishedBody.includes("{{coach_name}}"), false);
  assert.equal(renderWaiverBody(publishedBody, "Another Coach"), publishedBody);
  assert.equal(renderWaiverBody("Signed by {{coach_name}} and {{coach_name}}", ""), "Signed by your coach and your coach");
});

test("waiver publishing stores the coach name in the published body", async () => {
  let published;
  const { publishWaiver } = load("src/app/(app)/settings/waiver-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/form-state": { failure: (_formData, error) => ({ error }) },
    "@/lib/coach": { getCoach: async () => ({ role: "owner", gymId: "coach-id" }) },
    "@/lib/waivers": { renderWaiverBody },
    "@/lib/supabase/server": {
      createClient: async () => ({
        from: () => {
          const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { full_name: "Jordan Coach" }, error: null }) };
          return query;
        },
        rpc: async (name, args) => { published = { name, args }; return { error: null }; },
      }),
    },
  });
  const formData = new FormData();
  const body = "Waiver terms from {{coach_name}}. ".repeat(4);
  formData.set("body", body);

  assert.deepEqual(await publishWaiver({}, formData), { message: "Waiver published." });
  assert.equal(published.name, "publish_coach_waiver");
  assert.equal(published.args.p_body, renderWaiverBody(body.trim(), "Jordan Coach"));
});
