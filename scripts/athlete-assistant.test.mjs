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
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => overrides[id] ?? (id.startsWith("@/")
    ? load(`src/${id.slice(2)}.ts`, overrides)
    : id.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)), overrides) : require(id));
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { assistantSafety } = load("src/lib/ai/assistant-safety.ts");
const { assistantDayBounds, assistantLimitReached } = load("src/lib/ai/assistant-limit.ts");
const { buildAssistantPrompt, defaultAssistantSettings } = load("src/lib/ai/assistant-prompt.ts");
const { assistantCardSchema, coachMessageDraftSchema, assistantSettingsSchema } = load("src/lib/ai/assistant-schema.ts");
const athleteId = "44000000-0000-4000-8000-000000000011";
const coachId = "44000000-0000-4000-8000-000000000001";
const messageId = "44000000-0000-4000-8000-000000000021";
const viewer = { kind: "athlete", athleteId, coachId, firstName: "Sam", units: "lb" };
const draft = { kind: "coach_message", body: "Could we change my macros?", change: { type: "adjust_macros", note: "More carbs for training" } };

test("red flags are conservative, with emergency escalation for urgent symptoms", () => {
  for (const text of ["Chest pressure", "pain in my chest", "shortness of breath", "I fainted", "head injury", "concussion",
    "heart palpitations", "blood in my urine", "dark urine", "rhabdo"]) {
    assert.deepEqual(assistantSafety(text), { flagged: true, urgent: true }, text);
  }
  for (const text of ["sharp knee pain", "stabbing pain", "worsening pain", "severe pain", "dizziness", "light-headed",
    "numbness", "tingling", "swelling after injury", "can't bear weight", "unable to walk"]) {
    assert.equal(assistantSafety(text).flagged, true, text);
  }
  for (const text of ["", "How do I squat?", "I ran for 30 minutes", "My legs are sore"]) {
    assert.deepEqual(assistantSafety(text), { flagged: false, urgent: false });
  }
});

test("prompt labels binding coach/override rules, topic restrictions, and safety precedence", () => {
  const prompt = buildAssistantPrompt({ ...defaultAssistantSettings, coach_rules: "No max attempts", athlete_rules: "Avoid jumping",
    assistant_training: false, assistant_nutrition: false, assistant_recovery: false }, "2026-11-22", { flagged: true, urgent: true });
  for (const text of ["COACH RULES", "ATHLETE OVERRIDE RULES", "No max attempts", "Avoid jumping", "add to/override",
    "Training topic: DISABLED", "Nutrition topic: DISABLED", "Recovery topic: DISABLED", "ask your coach",
    "stop and contact your coach or a medical professional", "emergency services", "markdown links", "cannot change"]) assert.ok(prompt.includes(text), text);
  const normal = buildAssistantPrompt(defaultAssistantSettings, "2026-11-22", assistantSafety(""));
  assert.match(normal, /Training topic: enabled/);
  assert.ok(!normal.includes("RED FLAG:"));
  assert.ok(!normal.includes("undefined"));
});

test("local day bounds handle UTC, fractional offsets, and both DST transitions", () => {
  assert.deepEqual(assistantDayBounds("2026-11-22", "UTC"), { start: "2026-11-22T00:00:00.000Z", end: "2026-11-23T00:00:00.000Z" });
  assert.deepEqual(assistantDayBounds("2026-03-08", "America/New_York"), { start: "2026-03-08T05:00:00.000Z", end: "2026-03-09T04:00:00.000Z" });
  assert.deepEqual(assistantDayBounds("2026-11-01", "America/New_York"), { start: "2026-11-01T04:00:00.000Z", end: "2026-11-02T05:00:00.000Z" });
  assert.equal(assistantDayBounds("2026-11-22", "Asia/Kathmandu").start, "2026-11-21T18:15:00.000Z");
  assert.throws(() => assistantDayBounds("", "UTC"));
  assert.throws(() => assistantDayBounds("2026-02-30", "UTC"));
  assert.throws(() => assistantDayBounds("2026-11-22", "Not/AZone"));
  assert.equal(assistantLimitReached(24, 25), false);
  assert.equal(assistantLimitReached(25, 25), true);
  assert.equal(assistantLimitReached(25, 25, true), false);
  assert.equal(assistantLimitReached(26, 25, true), true);
});

test("draft/card schemas accept only bounded, structured unsaved outputs", () => {
  assert.deepEqual(coachMessageDraftSchema.parse(draft), draft);
  assert.ok(assistantCardSchema.safeParse({ kind: "adjust_wod", workoutId: athleteId }).success);
  assert.ok(assistantCardSchema.safeParse({ kind: "activity", draft: { activity_type: "walk", custom_label: null,
    duration_minutes: null, rpe: null, distance_m: null, performed_on: null } }).success);
  for (const input of [{ ...draft, body: "" }, { ...draft, body: "a".repeat(2001) }, { ...draft, athlete_id: athleteId },
    { ...draft, change: { type: "approved", note: "do it" } },
    { ...draft, change: { type: "scale_workout", note: "easier" } },
    { ...draft, change: { type: "write_workout", note: "new" } },
    { kind: "adjust_wod", workoutId: "not-uuid" }, { kind: "activity", draft: {} }]) {
    assert.equal(assistantCardSchema.safeParse(input).success, false);
  }
  assert.equal(assistantSettingsSchema.safeParse({ assistant_rules: null, assistant_training: true, assistant_nutrition: false,
    assistant_recovery: true, athlete_ai_daily_limit: 25 }).success, true);
  assert.equal(assistantSettingsSchema.safeParse({ athlete_ai_daily_limit: 201 }).success, false);
});

function fixture({ count = 0, reservedCount, settings = defaultAssistantSettings, historyError = false, reserveError = false,
  countError = false, notifyError = false, model = "test-model", schedule = [], sdk } = {}) {
  const events = [], inserted = [], assistantInserted = [], filters = [];
  let options, responseOptions, counts = 0;
  const supabase = {
    async rpc(name) { assert.equal(name, "athlete_assistant_settings"); return { data: settings ? [settings] : [], error: null }; },
    from(table) {
      const query = { mode: "", filters: [] };
      for (const name of ["eq", "gte", "lt", "order", "limit", "ilike", "in"]) query[name] = (...args) => {
        filters.push([table, name, ...args]); query.filters.push([name, ...args]); return query;
      };
      query.select = (_, opts) => { if (opts?.head) query.mode = "count"; else if (!query.mode) query.mode = "history"; return query; };
      query.insert = (row) => { query.mode = "insert"; query.row = row; return query; };
      query.single = () => run();
      query.then = (resolve, reject) => Promise.resolve(run()).then(resolve, reject);
      function run() {
        if (query.mode === "count") { events.push("count"); return { count: counts++ ? reservedCount ?? count + 1 : count, error: countError ? "offline" : null }; }
        if (query.mode === "insert") {
          events.push(query.row.role);
          if (reserveError && query.row.role === "user") return { error: "offline" };
          inserted.push(query.row);
          return { data: { id: messageId }, error: null };
        }
        if (table === "movements") return { data: [{ id: athleteId, name: "Squat", demo_video_url: null }], error: null };
        if (table === "movement_guides") return { data: [{ movement_id: athleteId, clip_path: "clip.mp4", cues: [] }], error: null };
        events.push("history");
        return { data: [{ role: "assistant", content: "Older answer" }], error: historyError ? "offline" : null };
      }
      return query;
    },
  };
  const assistantWriter = {
    from(table) {
      assert.equal(table, "athlete_ai_messages");
      return {
        insert(row) {
          assistantInserted.push(row);
          return Promise.resolve({ data: { id: messageId }, error: null });
        },
      };
    },
  };
  const fn = load("src/lib/ai/athlete-assistant.ts", {
    ai: { createUIMessageStream: require("ai").createUIMessageStream, createUIMessageStreamResponse: require("ai").createUIMessageStreamResponse,
      isStepCount: sdk?.isStepCount ?? ((n) => n), tool: (t) => t, streamText: (opts) => {
      events.push("model"); options = opts;
      if (sdk) return sdk.streamText(opts);
      return { toUIMessageStreamResponse: (opts) => { responseOptions = opts; return Response.json({ stream: true }); } };
    } },
    "./chat": { FRIENDLY_ERROR: "Friendly error", resolveModel: () => model },
    "./assistant-context": { getMyTraining: async (_, fixedViewer, today, driftDays) => {
      assert.deepEqual(fixedViewer, viewer); assert.equal(today, "2026-11-22");
      assert.equal(driftDays, settings.drift_days); return { own: true };
    } },
    "./activity-extraction": { extractActivityDraft: async () => ({ activity_type: "run", custom_label: null, duration_minutes: 30, rpe: 5, distance_m: null, performed_on: null }) },
    "./service-core": { aiLimitMessage: (n) => `Limit ${n}` },
    "@/lib/athlete-schedule": { loadAthleteSchedule: async (_, fixedId) => { assert.equal(fixedId, athleteId); return schedule; } },
    "@/lib/notifications": { notify: async (_, input) => { events.push("notify"); assert.equal(input.kind, "assistant_red_flag"); assert.equal(input.athleteId, athleteId); if (notifyError) throw Error("offline"); } },
  });
  return { events, inserted, assistantInserted, filters, get options() { return options; }, get responseOptions() { return responseOptions; },
    run: (message = "How should I train?") => fn.streamAthleteAssistant(
      supabase, viewer, message, "2026-11-22", "America/New_York", assistantWriter,
    ) };
}

test("stream engine reserves before generation, scopes counts/history, and persists text/cards", async () => {
  const f = fixture();
  assert.equal((await f.run()).status, 200);
  assert.deepEqual(f.events, ["count", "history", "user", "count", "model"]);
  assert.equal(f.inserted[0].athlete_id, athleteId);
  assert.equal(f.inserted[0].coach_id, coachId);
  assert.deepEqual(f.inserted.map((row) => row.role), ["user"]);
  assert.equal(f.options.messages.at(-1).role, "user");
  assert.equal(f.options.tools.get_my_training.inputSchema.safeParse({ athlete_id: "other" }).success, false);
  const card = await f.options.tools.draft_coach_message.execute({ body: draft.body, change: draft.change });
  assert.equal(card.kind, "coach_message");
  await f.options.onFinish({ steps: [{ text: "First part" }, { text: "Final answer" }] });
  assert.deepEqual(f.assistantInserted.map((row) => row.role), ["assistant"]);
  assert.equal(f.assistantInserted[0].athlete_id, athleteId);
  assert.equal(f.assistantInserted[0].coach_id, coachId);
  assert.equal(f.assistantInserted[0].content, "First part\n\nFinal answer");
  assert.deepEqual(f.assistantInserted[0].metadata.cards, [card]);
  assert.deepEqual(f.responseOptions.messageMetadata({ part: { type: "finish" } }), {
    cards: [card], assistantMessageId: f.assistantInserted[0].id,
  });
  assert.ok(f.filters.some((row) => row.join() === "athlete_ai_messages,eq,athlete_id," + athleteId));
  assert.ok(f.filters.some((row) => row.join() === "athlete_ai_messages,gte,created_at,2026-11-22T05:00:00.000Z"));
  assert.ok(f.filters.some((row) => row.join() === "athlete_ai_messages,lt,created_at,2026-11-23T05:00:00.000Z"));
});

test("limits, inactive profiles, missing model and database failures fail closed", async () => {
  for (const [opts, status] of [[{ count: 25 }, 429], [{ reservedCount: 26 }, 429], [{ settings: null }, 403],
    [{ model: null }, 503], [{ countError: true }, 503], [{ historyError: true }, 503], [{ reserveError: true }, 503]]) {
    const f = fixture(opts);
    assert.equal((await f.run()).status, status);
    assert.ok(!f.events.includes("model"));
  }
});

test("red flags over quota persist safety replies without a model, including quota races and notification failures", async () => {
  for (const opts of [{ count: 25, model: null }, { reservedCount: 26 }, { count: 25, notifyError: true }]) {
    for (const message of ["chest pain", "sharp knee pain"]) {
      const f = fixture(opts);
      const response = await f.run(message);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
      const { DefaultChatTransport, readUIMessageStream } = require("ai");
      const transport = new DefaultChatTransport({ fetch: async () => response });
      const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "safety", messageId: undefined, messages: [] });
      let last;
      for await (const reply of readUIMessageStream({ stream })) last = reply;
      const text = last.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
      assert.match(text, /Stop exercising/);
      assert.match(text, /coach/);
      assert.equal(text.includes("emergency services"), message === "chest pain");
      assert.ok(!f.events.includes("model"));
      assert.equal(f.events.filter((event) => event === "notify").length, 1);
      assert.equal(f.inserted.length, 1);
      assert.equal(f.assistantInserted.length, 1);
      assert.equal(f.inserted[0].role, "user");
      assert.equal(f.inserted[0].content, message);
      assert.equal(f.inserted[0].red_flag, true);
      assert.equal(f.assistantInserted[0].role, "assistant");
      assert.equal(f.assistantInserted[0].content, text);
      assert.equal(f.assistantInserted[0].metadata.source_message_id, messageId);
      assert.equal(f.assistantInserted[0].red_flag, true);
      assert.equal(last.metadata.assistantMessageId, f.assistantInserted[0].id);
    }
  }
  const failed = fixture({ count: 25, reserveError: true });
  assert.equal((await failed.run("chest pain")).status, 503);
  assert.ok(!failed.events.includes("model"));
});

test("notification failure never breaks an under-quota red-flag chat", async () => {
  const f = fixture({ notifyError: true });
  assert.equal((await f.run("chest pressure")).status, 200);
  assert.equal(f.inserted[0].red_flag, true);
  assert.match(f.options.system, /emergency services/);
  assert.ok("error" in await f.options.tools.adjust_todays_wod.execute({}));
  const card = await f.options.tools.draft_coach_message.execute({ body: "Help with chest pain", change: draft.change });
  assert.equal(card.change, undefined);
  await f.options.onError({ error: Error("provider") });
  await f.options.onFinish({ steps: [{ text: "Partial" }] });
  assert.equal(f.inserted.length, 1);
  assert.equal(f.assistantInserted.length, 1);
  assert.equal(f.assistantInserted[0].content, "Friendly error");
});

test("tools return only unsaved own-schedule handoffs and bounded activity/movement results", async () => {
  const empty = fixture();
  await empty.run();
  assert.ok("error" in await empty.options.tools.adjust_todays_wod.execute({}));
  const f = fixture({ schedule: [{ date: "2026-11-22", workout: { id: athleteId } }] });
  await f.run();
  assert.deepEqual(await f.options.tools.adjust_todays_wod.execute({}), { kind: "adjust_wod", workoutId: athleteId });
  assert.equal((await f.options.tools.draft_activity.execute({ description: "ran" })).kind, "activity");
  assert.deepEqual(await f.options.tools.find_movement.execute({ name: "squat" }), {
    movements: [{ name: "Squat", hasDemo: true, href: `/athlete/movements/${athleteId}` }],
  });
  assert.equal(f.inserted.length, 1);
  const off = fixture({ settings: { ...defaultAssistantSettings, assistant_training: false, assistant_nutrition: false } });
  await off.run();
  assert.ok("error" in await off.options.tools.adjust_todays_wod.execute({}));
  assert.ok("error" in await off.options.tools.draft_activity.execute({ description: "ran" }));
  assert.equal((await off.options.tools.draft_coach_message.execute({ body: draft.body, change: draft.change })).change, undefined);
});

test("athlete consistency override skips coach-only reads, while preserving compact context", async () => {
  const { computeConsistency } = load("src/lib/consistency.ts");
  const { consistencyContext } = load("src/lib/ai/athlete-context.ts", {
    "@/lib/consistency-data": { loadConsistency: async () => ({
      stats: computeConsistency({ today: "2026-11-22", scheduled: [], results: [], attendance: [] }), attendance: [],
    }) },
  });
  const client = { from(table) { assert.equal(table, "athletes"); return {
    select() { return this; }, eq() { return this; }, async single() { return { data: { coach_id: coachId }, error: null }; },
  }; } };
  const result = await consistencyContext(client, athleteId, "2026-11-22", 5);
  assert.equal(result.drift_days, 5);
  assert.equal(result.last_7_days.completion_rate_percent, null);
});

test("shared athlete context omits coach notes only for athlete callers", async () => {
  const client = { from(table) {
    const result = { data: table === "athletes" ? { id: athleteId, first_name: "Sam", last_name: "Test", notes: "private coach note" } : [], error: null };
    const q = { then: (resolve) => Promise.resolve(result).then(resolve), maybeSingle: async () => result };
    for (const name of ["select", "eq", "order", "limit", "gte", "lte"]) q[name] = () => q;
    return q;
  } };
  const { getAthleteContext } = load("src/lib/ai/athlete-chat-context.ts", {
    "@/lib/benchmarks": { loadAthleteBenchmarks: async () => [], loadLiftMaxes: async () => [] },
    "@/lib/check-in": { loadRecentCheckIns: async () => [] },
    "@/lib/athlete-schedule": { loadAthleteSchedule: async () => [] },
    "./athlete-context": { consistencyContext: async () => ({}), trainingLoadContext: async () => ({}) },
  });
  const athlete = await getAthleteContext(client, athleteId, "2026-11-22", "lb", { athleteFacing: true, driftDays: 5 });
  assert.ok(!("coach_notes" in athlete));
  assert.ok(!JSON.stringify(athlete).includes("private coach note"));
  const coach = await getAthleteContext(client, athleteId, "2026-11-22", "lb");
  assert.equal(coach.coach_notes, "private coach note");
});

test("athlete training context uses the configured inactivity threshold and defaults only when null", async () => {
  for (const driftDays of [12, null]) {
    const { getMyTraining } = load("src/lib/ai/assistant-context.ts", {
      "./athlete-chat-context": { getAthleteContext: async (_, id, today, units, options) => {
        assert.equal(id, athleteId); assert.equal(today, "2026-11-22"); assert.equal(units, "lb");
        assert.deepEqual(options, { athleteFacing: true, driftDays: driftDays ?? 5 });
        return { consistency: { drift_days: options.driftDays } };
      } },
      "@/lib/athlete-schedule": { loadAthleteSchedule: async () => [] },
    });
    const client = { from(table) {
      assert.ok(["athlete_workout_scalings", "nutrition_targets", "athlete_food_preferences", "athlete_intakes"].includes(table));
      const q = { select: () => q, eq: () => q, lte: () => q, or: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: null, error: null }), then: (resolve) => resolve({ data: [], error: null }) };
      return q;
    } };
    const context = await getMyTraining(client, viewer, "2026-11-22", driftDays);
    assert.equal(context.profile.consistency.drift_days, driftDays ?? 5);
    const f = fixture({ settings: { ...defaultAssistantSettings, drift_days: driftDays } });
    await f.run();
    await f.options.tools.get_my_training.execute({});
  }
});

test("athlete scaling requests include schema-valid null notes without leaking coach-private notes", async () => {
  const workoutContext = load("src/lib/ai/workout-context.ts");
  const { buildScaleRequest, scaleWorkoutInputSchema } = load("src/lib/ai/scale-workout.ts", {
    "./workout-context": { ...workoutContext, loadWorkoutContext: async () => ({ units: "lb", library: [] }) },
    "@/lib/time-zone": { getToday: async () => "2026-11-22" },
    "@/lib/check-in": { loadRecentCheckIns: async () => [] },
    "@/lib/benchmarks": { loadLiftMaxes: async () => [] },
    "./athlete-context": { trainingLoadContext: async () => ({}) },
  });
  let missing = false;
  const client = { from(table) {
    const data = table === "athletes" ? missing ? null : { id: athleteId, first_name: "Sam", experience_level: "beginner",
      injuries: null, notes: "Private coach assessment", sex: null, birth_date: null }
      : table === "workouts" ? { id: messageId, updated_at: "2026-11-22T00:00:00Z", title: "WOD",
        workout_type: "amrap", time_cap_seconds: null, rounds: null, description: null, notes: null, workout_movements: [] } : [];
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data, error: null }), then: (resolve) => resolve({ data, error: null }) };
    return q;
  } };
  for (const athleteFacing of [true, false]) {
    const request = await buildScaleRequest(client, { athleteId, workoutId: messageId,
      ...(athleteFacing ? { session: { units: "lb", athleteFacing: true } } : {}) });
    assert.equal(scaleWorkoutInputSchema.parse(request.input).athlete.notes, athleteFacing ? null : "Private coach assessment");
    assert.equal(request.prompt.includes("Private coach assessment"), !athleteFacing);
  }
  missing = true;
  await assert.rejects(buildScaleRequest(client, { athleteId, workoutId: messageId }), /Athlete not found/);
});

test("edited coach draft uses FIT-29 first, then registry/reservation with own identity and sent source", async () => {
  for (const mode of ["success", "coach", "invalid-link", "send-failed", "suggestion-failed", "already-sent", "missing-card", "fallback-drift"]) {
    const events = [];
    const supabase = { rpc: async () => ({ data: [{ ...defaultAssistantSettings, drift_days: mode === "fallback-drift" ? null : 12 }], error: null }),
      auth: { getClaims: async () => ({ data: { claims: { sub: "signed-in-athlete" } }, error: null }) } };
    const { sendAssistantCoachMessage } = load("src/app/athlete/assistant/actions.ts", {
      "next/cache": { revalidatePath: () => {} },
      "@/lib/viewer": { getViewer: async () => mode === "coach" ? { kind: "coach" } : viewer },
      "@/lib/supabase/server": { createClient: async () => supabase },
      "@/lib/activity-actions": { saveActivity: () => assert.fail("No activity save") },
      "@/lib/ai/assistant-card-actions": { loadAssistantCard: async (_, fixedViewer, identity) => {
        assert.equal(fixedViewer.athleteId, athleteId);
        assert.deepEqual(identity, { assistantMessageId: messageId, cardIndex: 0 });
        return mode === "missing-card" ? null : { kind: "coach_message", body: "Original", change: { type: "scale_workout", workoutId: athleteId, note: "Make it easier" } };
      } },
      "@/lib/messages": { validateMessageLink: async (_, id, link, isCoach) => { assert.equal(id, athleteId); assert.equal(isCoach, false); return mode !== "invalid-link"; } },
      "@/app/messages-actions": { sendMessage: async (id, _, form, identity) => { events.push("send"); assert.equal(id, athleteId); assert.equal(form.get("body"), "Edited request"); assert.equal(identity.cardIndex, 0); return mode === "send-failed" ? { error: "offline" } : { sentId: messageId, alreadyCompleted: mode === "already-sent" }; } },
      "@/lib/ai/suggestions": { SUGGESTION_REGISTRY: { scale_workout: { proposalSchema: "schema", buildRequest: async (_, params) => {
        events.push("build"); assert.equal(params.athleteId, athleteId); assert.equal(params.session.units, "lb"); assert.equal(params.session.driftDays, mode === "fallback-drift" ? 5 : 12);
        return { input: { workout_id: athleteId }, system: "system", prompt: "prompt" };
      } } } },
      "@/lib/ai/service-core": { runSuggestionWithClient: async (_, opts) => {
        events.push("reserve"); assert.equal(opts.coachId, coachId); assert.equal(opts.requestedBy, "signed-in-athlete");
        assert.equal(opts.input.source_message_id, messageId); assert.equal(opts.type, "scale_workout");
        return mode === "suggestion-failed" ? { error: "offline" } : { id: "suggestion" };
      } },
    });
    const result = await sendAssistantCoachMessage({ kind: "coach_message", body: "Edited request", change: {
      type: "scale_workout", workoutId: athleteId, note: "Make it easier",
    } }, { assistantMessageId: messageId, cardIndex: 0 });
    if (mode === "success" || mode === "fallback-drift") { assert.deepEqual(events, ["send", "build", "reserve"]); assert.equal(result.suggestionId, "suggestion"); }
    else if (mode === "suggestion-failed") { assert.equal(result.sentId, messageId); assert.match(result.warning, /Message sent/); }
    else if (mode === "already-sent") { assert.match(result.warning, /Already sent/); assert.deepEqual(events, ["send"]); }
    else { assert.ok(result.error); assert.ok(!events.includes("reserve")); }
  }
});

test("route rejects non-athletes and forged identities before streaming", async () => {
  let runs = 0;
  let adminClients = 0;
  let adminError = false;
  let currentViewer = null;
  let streamedArgs;
  const athleteClient = {};
  const assistantWriter = {};
  const { POST } = load("src/app/api/athlete-assistant/route.ts", {
    "@/lib/viewer": { getViewer: async () => currentViewer },
    "@/lib/supabase/server": { createClient: async () => athleteClient },
    "@/lib/supabase/admin": { createAdminClient: () => {
      adminClients++;
      if (adminError) throw new Error("missing service-role key");
      return assistantWriter;
    } },
    "@/lib/time-zone": { getToday: async () => "2026-11-22", getTimeZone: async () => "UTC" },
    "@/lib/ai/chat": { FRIENDLY_ERROR: "Friendly error" },
    "@/lib/ai/athlete-assistant": { streamAthleteAssistant: async (...args) => {
      runs++;
      streamedArgs = args;
      return new Response("stream");
    } },
  });
  const request = (body) => new Request("http://localhost/api/athlete-assistant", { method: "POST", body });
  assert.equal((await POST(request('{"message":"hi"}'))).status, 403);
  currentViewer = viewer;
  assert.equal((await POST(request("invalid"))).status, 400);
  assert.equal((await POST(request('{"message":""}'))).status, 400);
  assert.equal((await POST(request('{"message":"hi","athlete_id":"other"}'))).status, 400);
  assert.equal(runs, 0);
  assert.equal((await POST(request('{"message":"hi"}'))).status, 200);
  assert.equal(runs, 1);
  assert.equal(adminClients, 1);
  assert.equal(streamedArgs[0], athleteClient);
  assert.equal(streamedArgs[5], assistantWriter);
  adminError = true;
  assert.equal((await POST(request('{"message":"hi"}'))).status, 503);
  assert.equal(runs, 1);
});

test("installed AI SDK transports parse the real UI message SSE stream without React", async () => {
  const sdk = await import("ai");
  const { MockLanguageModelV4 } = await import("ai/test");
  assert.equal(typeof sdk.AbstractChat, "function");
  assert.equal(typeof sdk.DefaultChatTransport, "function");
  assert.equal(typeof sdk.readUIMessageStream, "function");
  const model = new MockLanguageModelV4({ doStream: async () => ({
    stream: new ReadableStream({ start(controller) {
      for (const chunk of [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: "Hello athlete" }, { type: "text-end", id: "text" },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" },
          usage: { inputTokens: { total: 5 }, outputTokens: { total: 3 } } },
      ]) controller.enqueue(chunk);
      controller.close();
    } }),
  }) });
  const f = fixture({ sdk, model });
  const transport = new sdk.DefaultChatTransport({
    api: "/api/athlete-assistant",
    prepareSendMessagesRequest: () => ({ body: { message: "How should I train?" } }),
    fetch: async (_, init) => {
      assert.deepEqual(JSON.parse(init.body), { message: "How should I train?" });
      const response = await f.run();
      assert.match(response.headers.get("content-type"), /text\/event-stream/);
      assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
      return response;
    },
  });
  const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "local", messages: [], abortSignal: undefined });
  let last;
  for await (const message of sdk.readUIMessageStream({ stream, terminateOnError: true })) last = message;
  assert.equal(last.parts.find((part) => part.type === "text").text, "Hello athlete");
  assert.deepEqual(last.metadata.cards, []);
  assert.equal(last.metadata.assistantMessageId, f.assistantInserted[0].id);
  assert.equal(f.assistantInserted[0].content, "Hello athlete");
});

test("coach transcript and settings actions guard roles, validate inputs and scope reads/writes", async () => {
  let currentViewer = viewer;
  const operations = [];
  const client = { from(table) {
    const q = { then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
      single: async () => ({ data: { id: coachId }, error: null }) };
    for (const name of ["select", "eq", "order", "range", "update"]) q[name] = (...args) => { operations.push([table, name, ...args]); return q; };
    return q;
  } };
  const actions = load("src/app/(app)/settings/assistant-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/viewer": { getViewer: async () => currentViewer },
    "@/lib/supabase/server": { createClient: async () => client },
  });
  const form = new FormData();
  form.set("assistant_rules", "No max attempts");
  form.set("assistant_training", "on");
  form.set("athlete_ai_daily_limit", "25");
  assert.match((await actions.loadAthleteAssistantTranscript(athleteId)).error, /signed in as an athlete/);
  assert.match((await actions.saveAssistantSettings({}, form)).error, /signed in as an athlete/);
  assert.match((await actions.saveAthleteAssistantRules(athleteId, {}, form)).error, /signed in as an athlete/);
  assert.deepEqual(operations, []);
  currentViewer = { kind: "coach", id: coachId, gymId: coachId, role: "owner" };
  assert.deepEqual(await actions.loadAthleteAssistantTranscript(athleteId), { messages: [] });
  assert.ok(operations.some((row) => row.join() === "athlete_ai_messages,eq,coach_id," + coachId));
  assert.ok(operations.some((row) => row.join() === "athlete_ai_messages,eq,athlete_id," + athleteId));
  assert.equal((await actions.saveAssistantSettings({}, form)).message, "Assistant settings saved.");
  assert.equal((await actions.saveAthleteAssistantRules(athleteId, {}, form)).message, "Athlete assistant rules saved.");
  assert.ok(operations.some((row) => row.join() === "athletes,eq,coach_id," + coachId));
  form.set("athlete_ai_daily_limit", "201");
  assert.ok((await actions.saveAssistantSettings({}, form)).error);
});

test("shared suggestion engine inserts the athlete reservation shape, then completes pending", async () => {
  const { z } = require("zod");
  const events = [];
  const client = { from(table) {
    const q = { mode: "", select(_, opts) { if (opts?.head) this.mode = "count"; return this; },
      eq() { return this; }, gte() { return this; },
      insert(row) { this.mode = "insert"; events.push(["insert", table, row]); return this; },
      update(row) { this.mode = "update"; events.push(["update", table, row]); return this; },
      async single() { return { data: { id: messageId }, error: null }; },
      then(resolve) { return Promise.resolve({ count: 0, error: null }).then(resolve); },
    };
    return q;
  } };
  const { runSuggestionWithClient } = load("src/lib/ai/service-core.ts", {
    ai: { Output: { object: (s) => s }, generateText: async () => ({ output: { text: "proposal" } }) },
  });
  const result = await runSuggestionWithClient(client, { type: "adjust_macros", athleteId, coachId, requestedBy: "signed-in-athlete",
    input: { source_message_id: messageId }, model: "test", schema: z.object({ text: z.string() }), system: "system", prompt: "prompt" });
  assert.equal(result.id, messageId);
  assert.equal(events[0][2].status, "failed");
  assert.equal(events[0][2].error, "in_progress");
  assert.equal(events[0][2].requested_by, "signed-in-athlete");
  assert.equal(events[0][2].coach_id, coachId);
  assert.equal(events[1][2].status, "pending");
});
