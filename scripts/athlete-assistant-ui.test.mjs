import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative, mocks = {}, fetcher = globalThis.fetch) {
  const filename = path.resolve(root, relative);
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const resolve = (id) => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith("@/") && !id.startsWith(".")) return require(id);
    const base = id.startsWith("@/") ? path.resolve(root, "src/" + id.slice(2)) : path.resolve(path.dirname(filename), id);
    return load(path.relative(root, base + (existsSync(base + ".ts") ? ".ts" : ".tsx")), mocks);
  };
  new Function("require", "module", "exports", "fetch", code)(resolve, loaded, loaded.exports, fetcher);
  return loaded.exports;
}
const { assistantCards, assistantCardEntries, assistantMessageId, safeAssistantHref, assistantTextParts } = load("src/lib/ai/assistant-ui.ts");

test("transcript metadata keeps valid unsaved cards, ignores malformed/legacy data and caps count", () => {
  for (const input of [null, {}, [], { cards: "bad" }, { cards: [null, { kind: "unknown" }] }]) assert.deepEqual(assistantCards(input), []);
  const card = { kind: "coach_message", body: "Could we talk?" };
  assert.deepEqual(assistantCards({ cards: [card, { kind: "activity", draft: {} }] }), [card]);
  assert.equal(assistantCards({ cards: Array(10).fill(card) }).length, 6);
  assert.deepEqual(assistantCardEntries({ cards: [null, card] }), [{ index: 1, card }]);
  assert.equal(assistantMessageId({ assistantMessageId: "persisted-id" }, "local-id"), "persisted-id");
  assert.equal(assistantMessageId(null, "local-id"), "local-id");
});

test("safe markdown supports only internal links and leaves unsafe markup inert as text", () => {
  for (const href of ["javascript:alert(1)", "https://example.com", "//evil.test", "/\\evil.test", "/%2fevil.test", "/%5cevil.test", "/foo%0abar", "/bad%xx"]) {
    assert.equal(safeAssistantHref(href), null, href);
  }
  assert.equal(safeAssistantHref("/athlete/movements/id?tab=demo#clip"), "/athlete/movements/id?tab=demo#clip");
  assert.deepEqual(assistantTextParts(""), []);
  assert.deepEqual(assistantTextParts('<img src=x onerror="alert(1)">'), [{ text: '<img src=x onerror="alert(1)">' }]);
  assert.deepEqual(assistantTextParts("Try [Squat](/athlete/movements/id) today."), [
    { text: "Try " }, { text: "Squat", href: "/athlete/movements/id" }, { text: " today." },
  ]);
  assert.deepEqual(assistantTextParts("[Bad](javascript:evil)"), [{ text: "[Bad](javascript:evil)" }]);
});

function hookFixture({ status = 200, errorBody = { error: "Please try again later." }, streamError = false } = {}) {
  const states = [], updates = [], refs = [];
  let options, request;
  const ai = {
    DefaultChatTransport: class {
      constructor(input) { options = input; }
      async sendMessages(input) {
        request = input;
        assert.deepEqual(options.prepareSendMessagesRequest().body, { message: "My question" });
        await options.fetch(options.api, {});
        return {};
      }
    },
    async *readUIMessageStream({ terminateOnError }) {
      assert.equal(terminateOnError, true);
      yield { parts: [{ type: "text", text: "First" }] };
      if (streamError) throw Error("Friendly stream failure");
      yield { parts: [{ type: "text", text: "First answer" }], metadata: { cards: [{ kind: "coach_message", body: "Help?" }] } };
    },
  };
  const react = {
    useState(initial) {
      const index = states.length;
      states.push(initial);
      return [initial, (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; updates.push(structuredClone(states)); }];
    },
    useRef(initial) { const ref = { current: initial }; refs.push(ref); return ref; },
    useEffect() {},
  };
  const { useAssistant: createAssistant } = load("src/app/athlete/assistant/use-assistant.ts", { ai, react },
    async () => ({ ok: status === 200, json: async () => errorBody }));
  const hook = createAssistant([]);
  return { hook, states, updates, refs, get request() { return request; } };
}

test("stream hook sends only message, progressively updates one reply and retains finish cards", async () => {
  const f = hookFixture();
  await f.hook.send("My question");
  assert.equal(f.request.trigger, "submit-message");
  assert.equal(f.request.messages.length, 0);
  assert.equal(f.states[0].length, 2);
  assert.equal(f.states[0][0].content, "My question");
  assert.equal(f.states[0][1].content, "First answer");
  assert.equal(f.states[0][1].metadata.cards[0].kind, "coach_message");
  assert.ok(f.updates.some((state) => state[0][1]?.content === "First"));
  assert.equal(f.states[1], false);
  assert.equal(f.states[2], "");
  assert.equal(f.refs[0].current, null);
});

test("stream hook displays JSON 429/403/503 and stream failures without leaving pending state", async () => {
  for (const status of [429, 403, 503]) {
    const f = hookFixture({ status });
    await f.hook.send("My question");
    assert.equal(f.states[2], "Please try again later.");
    assert.equal(f.states[1], false);
    assert.equal(f.states[0].length, 1);
  }
  const failed = hookFixture({ streamError: true });
  await failed.hook.send("My question");
  assert.equal(failed.states[2], "Friendly stream failure");
  assert.equal(failed.states[0][1].content, "First");
  const empty = hookFixture();
  await empty.hook.send("  ");
  assert.deepEqual(empty.states[0], []);
});

test("entry points and coach tab preserve scoped thread cards without expanding athlete navigation", () => {
  const today = readFileSync(path.join(root, "src/app/athlete/page.tsx"), "utf8");
  const athlete = readFileSync(path.join(root, "src/app/(app)/athletes/[id]/page.tsx"), "utf8");
  const thread = readFileSync(path.join(root, "src/components/messages/thread.tsx"), "utf8");
  assert.match(today, /href="\/athlete\/assistant"/);
  assert.match(today, /id={`adjust-\$\{workout.id\}`}/);
  assert.match(athlete, /TabsTrigger value="assistant"/);
  assert.match(athlete, /TabsContent value="assistant"/);
  assert.match(thread, /input->>source_message_id.not.is.null/);
  assert.match(thread, /cardsByMessage.get\(row.id\)/);
  assert.ok(!thread.includes("requested_by"));
});

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const uiMocks = {
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/input": { Input: "input" },
  "@/components/ui/label": { Label: "label" },
  "@/components/ui/textarea": { Textarea: "textarea" },
};

test("activity cards reuse editable fields, submit source ai, retain failures and show saved state", async () => {
  for (const complete of [true, false]) {
    let cursor = 0, state = {}, action;
    const slots = [], calls = [];
    const react = {
      useId: () => "activity-test",
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
      },
      useTransition: () => [false, () => assert.fail("Must not extract another AI draft")],
      useActionState(fn) { action = async (data) => { state = await fn(state, data); }; return [state, action, false]; },
    };
    const mocksSave = async (id, activityId, _, data) => {
        calls.push(Object.fromEntries(data)); assert.equal(id, "own-athlete"); assert.equal(activityId, null);
        return complete ? { message: "Activity saved." } : { error: "Couldn't save the activity. Please try again." };
    };
    const { ActivityForm } = load("src/components/activity-form.tsx", {
      ...uiMocks, react,
      "@/lib/activity-actions": { saveActivity: () => assert.fail("Card must use the assistant wrapper") },
      "@/lib/ai/activity-draft": { draftActivity: () => assert.fail("Must not reserve another AI request") },
      "@/app/athlete/assistant/actions": { saveAssistantActivity: async (identity, previous, data) => {
        assert.deepEqual(identity, { assistantMessageId: "assistant-row", cardIndex: 1 });
        const result = await mocksSave("own-athlete", null, previous, data);
        return result;
      } },
    });
    const props = { athleteId: "own-athlete", today: "2026-11-22", units: "kg",
      assistantCard: { assistantMessageId: "assistant-row", cardIndex: 1 },
      initialDraft: { activity_type: "run", custom_label: "Easy run", performed_on: null,
        duration_minutes: complete ? 30 : null, rpe: complete ? 5 : null, distance_m: complete ? 2000 : null } };
    const render = () => { cursor = 0; return ActivityForm(props); };
    let tree = render();
    const field = (name) => nodes(tree).find((node) => node.props?.name === name);
    assert.equal(field("source").props.value, "ai");
    assert.equal(field("performed_on").props.value, props.today);
    assert.equal(field("distance").props.value, complete ? "2" : "");
    assert.equal(field("duration_minutes").props.value, complete ? "30" : "");
    field("duration_minutes").props.onChange({ target: { value: "45" } });
    tree = render();
    const data = new FormData();
    for (const node of nodes(tree)) if (node.props?.name) data.set(node.props.name, node.props.value);
    await nodes(tree).find((node) => node.type === "form").props.action(data);
    tree = render();
    assert.equal(calls[0].duration_minutes, "45");
    assert.equal(calls[0].source, "ai");
    if (complete) {
      assert.equal(tree.props.role, "status");
      assert.equal(tree.props.children, "Activity saved.");
    } else {
      assert.ok(nodes(tree).some((node) => node.props?.role === "alert"));
      assert.equal(field("duration_minutes").props.value, "45");
    }
  }
});

test("coach draft sends edited text and preserves warnings, errors and sent state", async () => {
  for (const success of [true, false]) {
    let cursor = 0;
    const slots = [], pending = [], calls = [];
    const react = {
      useId: () => "coach-draft",
      useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value) => { slots[index] = value; }]; },
      useTransition: () => [false, (fn) => pending.push(fn())],
    };
    const { DraftCard } = load("src/app/athlete/assistant/draft-card.tsx", {
      ...uiMocks, react, "next/link": "a", "@/components/activity-form": { ActivityForm: "activity-form" },
      "./actions": { sendAssistantCoachMessage: async (input, identity) => {
        assert.deepEqual(identity, { assistantMessageId: "assistant-row", cardIndex: 0 });
        calls.push(input); return success ? { sentId: "message", warning: "Message sent, but the change card couldn't be created." } : { error: "Please try again." };
      } },
    });
    const card = { kind: "coach_message", body: "Original draft", change: { type: "adjust_macros", note: "More carbs" } };
    const child = DraftCard({ card, athleteId: "own-athlete", today: "2026-11-22", units: "kg", disabled: false,
      identity: { assistantMessageId: "assistant-row", cardIndex: 0 } }).props.children;
    const render = () => { cursor = 0; return child.type(child.props); };
    let tree = render();
    nodes(tree).find((node) => node.type === "textarea").props.onChange({ target: { value: "Edited request" } });
    tree = render();
    tree.props.onSubmit({ preventDefault() {} });
    await Promise.all(pending);
    tree = render();
    assert.equal(calls[0].body, "Edited request");
    assert.deepEqual(calls[0].change, card.change);
    if (success) {
      assert.ok(nodes(tree).some((node) => node.props?.href === "/athlete/messages"));
      assert.ok(nodes(tree).some((node) => typeof node.props?.children === "string" && node.props.children.includes("change card couldn't")));
    } else assert.ok(nodes(tree).some((node) => node.props?.role === "alert"));
  }
});

test("replayed completed cards expose only durable status links, never send/save controls", () => {
  const { DraftCard } = load("src/app/athlete/assistant/draft-card.tsx", {
    ...uiMocks, "next/link": "a", "@/components/activity-form": { ActivityForm: "activity-form" },
    "./actions": { sendAssistantCoachMessage: () => assert.fail("Completed cards cannot send") },
  });
  for (const action of ["sent", "saved"]) {
    const tree = DraftCard({ card: { kind: action === "sent" ? "coach_message" : "activity" }, completed: { action } });
    const all = nodes(tree);
    assert.equal(tree.props.role, "status");
    assert.ok(all.some((node) => node.props?.href === (action === "sent" ? "/athlete/messages" : "/athlete/history")));
    assert.ok(!all.some((node) => ["button", "form", "activity-form"].includes(node.type)));
  }
});

test("card identity validation and metadata lookup bind server actions to own assistant row and exact index", async () => {
  const { assistantCardIdentitySchema, loadAssistantCard } = load("src/lib/ai/assistant-card-actions.ts");
  const identity = { assistantMessageId: "47000000-0000-4000-8000-000000000021", cardIndex: 1 };
  assert.equal(assistantCardIdentitySchema.safeParse(identity).success, true);
  for (const bad of [{}, { ...identity, cardIndex: -1 }, { ...identity, cardIndex: 6 }, { ...identity, assistantMessageId: "bad" }]) {
    assert.equal(assistantCardIdentitySchema.safeParse(bad).success, false);
  }
  const filters = [];
  let response = { data: { metadata: { cards: [null, { kind: "coach_message", body: "Original" }] } }, error: null };
  const client = { from: (table) => {
    assert.equal(table, "athlete_ai_messages");
    const q = { select: () => q, eq: (...args) => { filters.push(args); return q; }, maybeSingle: async () => response };
    return q;
  } };
  const viewer = { athleteId: "own-athlete", coachId: "own-coach" };
  assert.equal((await loadAssistantCard(client, viewer, identity)).body, "Original");
  assert.ok(filters.some(([key, value]) => key === "athlete_id" && value === viewer.athleteId));
  assert.ok(filters.some(([key, value]) => key === "coach_id" && value === viewer.coachId));
  assert.ok(filters.some(([key, value]) => key === "role" && value === "assistant"));
  assert.equal(await loadAssistantCard(client, viewer, { ...identity, cardIndex: 0 }), null);
  response = { data: null, error: null };
  assert.equal(await loadAssistantCard(client, viewer, identity), null);
  response = { data: null, error: Error("DB unavailable") };
  await assert.rejects(loadAssistantCard(client, viewer, identity), /DB unavailable/);
});
