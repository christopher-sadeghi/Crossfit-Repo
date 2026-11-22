import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", "process", source)(
    (id) => id in overrides ? overrides[id] : require(id), loaded, loaded.exports,
    { env: { OPENAI_API_KEY: "test-key", AI_DAILY_LIMIT: "3" } },
  );
  return loaded.exports;
}

const nextDraft = { activity_type: "sport", custom_label: "Basketball", duration_minutes: 90, rpe: 8, distance_m: null, performed_on: null };
function fixture({ suggestions = 0, chats = 0, drafts = 0, concurrentDraft = false, reservationError = null, providerError = null } = {}) {
  const events = [];
  const supabase = { from(table) {
    return {
      select: () => ({ eq: () => ({ gte }), gte }),
      async insert(row) {
        assert.equal(table, "ai_activity_draft_requests");
        assert.deepEqual(Object.keys(row), ["id"]);
        events.push("reserve");
        if (!reservationError) drafts += concurrentDraft ? 2 : 1;
        return { error: reservationError };
      },
    };
    async function gte(column) {
      assert.equal(column, "created_at");
      return { count: { ai_suggestions: suggestions, ai_chat_messages: chats, ai_activity_draft_requests: drafts }[table], error: null };
    }
  } };
  const ai = {
    Output: { object: (value) => value },
    async generateText() {
      events.push("generate");
      if (providerError) throw providerError;
      return { output: nextDraft };
    },
  };
  const dependencies = { ai, "@ai-sdk/openai": { openai: () => ({}) } };
  const { draftActivity } = load("ai/activity-draft", {
    ...dependencies,
    "./activity-extraction": load("ai/activity-extraction", { ...dependencies, "@/lib/athlete-activities": load("athlete-activities") }),
    "./service-core": load("ai/service-core", dependencies),
    "@/lib/activity-actor": { getActivityActor: async () => ({ supabase, units: "kg" }) },
    "@/lib/athlete-activities": load("athlete-activities"),
    "@/lib/time-zone": { getToday: async () => "2026-11-22" },
  });
  return { events, draft: () => draftActivity("athlete", "Played 90 minutes of basketball, pretty intense") };
}

test("activity drafts record usage before the provider call, without storing activity details", async () => {
  const f = fixture({ suggestions: 1, chats: 1 });
  assert.deepEqual(await f.draft(), { draft: nextDraft });
  assert.deepEqual(f.events, ["reserve", "generate"]);
  assert.match((await f.draft()).error, /today's 3 AI requests/);
  assert.deepEqual(f.events, ["reserve", "generate"]);
});

test("activity drafts fail closed before generation when the reservation fails or another request fills the quota", async () => {
  const unavailable = fixture({ reservationError: new Error("unavailable") });
  assert.match((await unavailable.draft()).error, /fill out the form by hand/);
  assert.deepEqual(unavailable.events, ["reserve"]);
  const concurrent = fixture({ suggestions: 2, concurrentDraft: true });
  assert.match((await concurrent.draft()).error, /today's 3 AI requests/);
  assert.deepEqual(concurrent.events, ["reserve"]);
});

test("a failed provider attempt still counts towards the quota", async () => {
  const f = fixture({ drafts: 2, providerError: new Error("offline") });
  assert.match((await f.draft()).error, /fill out the form by hand/);
  assert.match((await f.draft()).error, /today's 3 AI requests/);
  assert.deepEqual(f.events, ["reserve", "generate"]);
});
