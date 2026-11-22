import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function loader(mocks = {}) {
  const cache = new Map();
  return function load(filename) {
    const full = path.resolve(root, filename);
    if (cache.has(full)) return cache.get(full).exports;
    const loaded = { exports: {} };
    cache.set(full, loaded);
    const js = ts.transpileModule(readFileSync(full, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
      fileName: full,
    }).outputText;
    const localRequire = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/") ? path.join(root, `src/${id.slice(2)}`) : path.resolve(path.dirname(full), id);
        return load(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
      }
      return require(id);
    };
    new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  };
}

const athleteId = "29000000-0000-4000-8000-000000000011";
const coachId = "29000000-0000-4000-8000-000000000001";
const userId = "29000000-0000-4000-8000-000000000003";
const itemId = "29000000-0000-4000-8000-000000000021";
const athlete = { id: athleteId, coach_id: coachId, user_id: userId, first_name: "Sam", last_name: "Athlete", status: "active" };
const coach = { kind: "coach", id: coachId };

function clientFixture(tables = {}, queryError = null) {
  const calls = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: userId } } }) },
    from(table) {
      let rows = tables[table] ?? [];
      const ordering = [];
      let limit = 1000, update;
      const result = () => {
        const count = rows.length;
        if (update && !queryError) rows.forEach((row) => Object.assign(row, update));
        const sorted = [...rows].sort((a, b) => {
          for (const [key, ascending] of ordering) {
            const compared = String(a[key]).localeCompare(String(b[key]));
            if (compared) return ascending ? compared : -compared;
          }
          return 0;
        });
        return { data: sorted.slice(0, limit), count, error: queryError };
      };
      const builder = {
        select: () => builder,
        order: (key, { ascending = true } = {}) => { ordering.push([key, ascending]); return builder; },
        limit: (value) => { limit = value; return builder; },
        eq: (key, value) => { rows = rows.filter((row) => row[key] === value); return builder; },
        neq: (key, value) => { rows = rows.filter((row) => row[key] !== value); return builder; },
        is: (key, value) => { rows = rows.filter((row) => row[key] === value); return builder; },
        in: (key, values) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
        insert: (value) => { calls.push({ insert: value, table }); rows = [{ ...value, id: itemId }]; return builder; },
        update: (value) => { update = value; calls.push({ update: value, table }); return builder; },
        maybeSingle: async () => { const value = result(); return { ...value, data: value.data[0] ?? null }; },
        single: async () => { const value = result(); return { ...value, data: value.data[0] ?? null }; },
        then: (resolve) => resolve(result()),
      };
      return builder;
    },
  };
  return { client, calls };
}

test("link parsing rejects malformed, unsupported and non-UUID links", () => {
  const { parseMessageLink } = loader()("src/lib/messages.ts");
  assert.deepEqual(parseMessageLink(`workout:${itemId}`), { type: "workout", id: itemId });
  for (const value of ["", "result:not-a-uuid", `workout:${itemId}:extra`, `url:${itemId}`]) assert.equal(parseMessageLink(value), null);
});

test("link validation enforces athlete ownership, assignment and coach-only suggestions", async () => {
  const { validateMessageLink, messageAthlete } = loader()("src/lib/messages.ts");
  const { client } = clientFixture({ athletes: [athlete], workouts: [{ id: itemId, athlete_id: athleteId }], workout_results: [{ id: itemId, athlete_id: "other" }], ai_suggestions: [{ id: itemId, athlete_id: athleteId }] });
  assert.equal((await messageAthlete(client, coach, athleteId)).id, athleteId);
  assert.equal(await messageAthlete(client, { kind: "coach", id: "stranger" }, athleteId), null);
  assert.equal(await messageAthlete(client, { kind: "athlete", athleteId: "other" }, athleteId), null);
  assert.equal(await validateMessageLink(client, athleteId, { type: "workout", id: itemId }, false), true);
  assert.equal(await validateMessageLink(client, athleteId, { type: "result", id: itemId }, true), false);
  assert.equal(await validateMessageLink(client, athleteId, { type: "suggestion", id: itemId }, false), false);
  assert.equal(await validateMessageLink(client, athleteId, { type: "suggestion", id: itemId }, true), true);
  for (const overridden of [false, true]) {
    const { client: groupClient } = clientFixture({ workouts: [{ id: itemId, athlete_id: null, program_id: "p" }], program_assignments: [{ id: "assignment", athlete_id: athleteId, program_id: "p" }], athlete_workout_overrides: overridden ? [{ id: "override", athlete_id: athleteId, workout_id: itemId }] : [] });
    assert.equal(await validateMessageLink(groupClient, athleteId, { type: "workout", id: itemId }, true), !overridden);
  }
});

test("render-time resolution only returns visible rows and never exposes athlete suggestion links", async () => {
  const { resolveMessageLinks } = loader()("src/lib/messages.ts");
  const { client } = clientFixture({ workouts: [{ id: itemId, title: "Renamed Fran" }], ai_suggestions: [{ id: itemId, athlete_id: athleteId, suggestion_type: "scale_workout" }] });
  const links = [{ type: "workout", id: itemId }, { type: "suggestion", id: itemId }, { type: "result", id: itemId }];
  const athleteLinks = await resolveMessageLinks(client, athleteId, links, false);
  assert.equal(athleteLinks.size, 1);
  assert.equal(athleteLinks.get(`workout:${itemId}`).label, "Renamed Fran");
  assert.equal(athleteLinks.get(`workout:${itemId}`).href, `/athlete/log/${itemId}`);
  assert.equal((await resolveMessageLinks(client, athleteId, [], true)).size, 0);
  const { client: errorClient } = clientFixture({}, { message: "offline" });
  assert.equal((await resolveMessageLinks(errorClient, athleteId, links, true)).size, 0);
});

function actionsFixture({ viewer = coach, error = null, tables = {} } = {}) {
  const { client, calls } = clientFixture({ athletes: [athlete], ...tables }, error);
  const notifications = [];
  const actions = loader({
    "next/cache": { revalidatePath() {} },
    "@/lib/viewer": { getViewer: async () => viewer },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/notifications": { notifyMessage: async (...args) => notifications.push(args) },
  })("src/app/messages-actions.ts");
  return { actions, calls, notifications };
}

function form(body = "Hello Sam", link = "") {
  const data = new FormData();
  data.set("body", body); data.set("link", link);
  return data;
}

test("send action inserts with current client and notifies once, and read action updates receipts", async () => {
  const { actions, calls, notifications } = actionsFixture();
  const state = await actions.sendMessage(athleteId, {}, form());
  assert.equal(state.sentId, itemId);
  assert.equal(calls[0].insert.athlete_id, athleteId);
  assert.equal(calls[0].insert.coach_id, coachId);
  assert.equal(calls[0].insert.body, "Hello Sam");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][3], "coach");
  assert.deepEqual(await actions.markThreadRead(athleteId), {});
  assert.ok(calls[1].update.read_at);
});

test("send rejects empty, oversized, forged links, strangers and database failures without notifying", async () => {
  for (const [options, data] of [
    [{}, form("   ")], [{}, form("x".repeat(2001))], [{}, form("Hello", "bad")],
    [{}, form("Hello", `result:${itemId}`)], [{ viewer: null }, form()],
    [{ viewer: { kind: "coach", id: "stranger" } }, form()], [{ error: { message: "offline" } }, form()],
  ]) {
    const { actions, notifications } = actionsFixture(options);
    assert.ok((await actions.sendMessage(athleteId, {}, data)).error);
    assert.equal(notifications.length, 0);
  }
});

function treeNodes(node) {
  if (Array.isArray(node)) return node.flatMap(treeNodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat().flatMap(treeNodes)];
}

test("long threads show the latest 100 chronologically, count all unread and mark even hidden messages read", async () => {
  const messages = Array.from({ length: 1205 }, (_, index) => ({
    id: String(index).padStart(5, "0"), athlete_id: athleteId, coach_id: coachId,
    sender_id: index < 1105 ? userId : coachId, read_at: null, body: `message-${index}`,
    created_at: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
  }));
  for (const mode of ["long", "empty", "error"]) {
    const { client } = clientFixture({ athletes: [athlete], messages: mode === "empty" ? [] : messages }, mode === "error" ? { message: "offline" } : null);
    client.auth.getClaims = async () => ({ data: { claims: { sub: coachId } } });
    const load = loader({
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/viewer": { getViewer: async () => coach },
      "@/lib/time-zone": { getToday: async () => "2026-11-01", getTimeZone: async () => "UTC" },
      "@/lib/messages": { messageAthlete: async () => athlete, resolveMessageLinks: async () => new Map(), messageLinkOptions: async () => [] },
      "@/components/messages/composer": { MessageComposer: "composer" },
      "@/components/messages/thread-live": { ThreadLive: "thread-live" },
      "next/cache": { revalidatePath() {} },
    });
    const { MessageThread } = load("src/components/messages/thread.tsx");
    const { default: MessagesPage } = load("src/app/(app)/messages/page.tsx");
    if (mode === "error") {
      await assert.rejects(MessageThread({ athleteId }), /Couldn't load your messages/);
      await assert.rejects(MessagesPage(), /Couldn't load conversations/);
      continue;
    }
    const nodes = treeNodes(await MessageThread({ athleteId }));
    const bodies = nodes.filter((node) => node.type === "p" && /^message-/.test(node.props.children)).map((node) => node.props.children);
    assert.deepEqual(bodies, mode === "empty" ? [] : messages.slice(-100).map((row) => row.body));
    assert.equal(nodes.find((node) => node.type === "thread-live").props.unreadKey, mode === "empty" ? "" : "1105");
    const list = treeNodes(await MessagesPage());
    if (mode === "long") {
      assert.ok(list.some((node) => node.props?.["aria-label"] === "1105 unread messages"));
      assert.ok(list.some((node) => node.props?.children === "message-1204"));
      await load("src/app/messages-actions.ts").markThreadRead(athleteId);
      assert.ok(messages.slice(0, 1105).every((row) => row.read_at));
      assert.ok(messages.slice(1105).every((row) => row.read_at === null));
    } else assert.ok(list.some((node) => node.props?.children === "No messages yet · Start a conversation"));
  }
});

test("thread polls every 10s only while visible, marks incoming messages read and cleans up", async () => {
  const effects = [];
  const listeners = new Set();
  let interval, delay, reads = 0, refreshes = 0, cleared = false;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = { setInterval: (callback, ms) => { interval = callback; delay = ms; return 1; }, clearInterval: () => { cleared = true; } };
  globalThis.document = { visibilityState: "visible", addEventListener: (_, callback) => listeners.add(callback), removeEventListener: (_, callback) => listeners.delete(callback) };
  try {
    const { ThreadLive } = loader({
      react: { useEffect: (callback) => effects.push(callback), useState: () => ["", () => {}] },
      "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
      "@/app/messages-actions": { markThreadRead: async () => { reads++; return {}; } },
    })("src/components/messages/thread-live.tsx");
    assert.equal(ThreadLive({ athleteId, unreadKey: "incoming" }), null);
    const cleanups = effects.map((effect) => effect());
    await Promise.resolve();
    assert.equal(reads, 1);
    assert.equal(delay, 10000);
    const baseline = refreshes;
    globalThis.document.visibilityState = "hidden";
    interval();
    assert.equal(refreshes, baseline);
    globalThis.document.visibilityState = "visible";
    interval();
    assert.equal(refreshes, baseline + 1);
    await Promise.all([...listeners].map((callback) => callback()));
    assert.equal(reads, 2);
    cleanups.forEach((cleanup) => cleanup?.());
    assert.equal(cleared, true);
    assert.equal(listeners.size, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});
