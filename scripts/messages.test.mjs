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
const staffCoachId = "29000000-0000-4000-8000-000000000002";
const userId = "29000000-0000-4000-8000-000000000003";
const itemId = "29000000-0000-4000-8000-000000000021";
const athlete = { id: athleteId, coach_id: coachId, user_id: userId, first_name: "Sam", last_name: "Athlete", status: "active" };
const coach = { kind: "coach", id: coachId, gymId: coachId, role: "owner" };

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
        or: (predicate) => {
          assert.equal(predicate, "suggestion_type.eq.athlete_adjust_workout,input->>source_message_id.not.is.null");
          rows = rows.filter((row) => row.suggestion_type === "athlete_adjust_workout" || row.input?.source_message_id);
          return builder;
        },
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
  assert.equal(await messageAthlete(client, { kind: "coach", id: "stranger", gymId: "stranger", role: "coach" }, athleteId), null);
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
  const messages = [
    { athlete_id: athleteId, sender_id: userId, read_at: null },
    { athlete_id: athleteId, sender_id: coachId, read_at: null },
    { athlete_id: athleteId, sender_id: "staff-coach", read_at: null },
  ];
  const { actions, calls, notifications } = actionsFixture({ tables: { messages } });
  const state = await actions.sendMessage(athleteId, {}, form());
  assert.equal(state.sentId, itemId);
  assert.equal(calls[0].insert.athlete_id, athleteId);
  assert.equal(calls[0].insert.coach_id, coachId);
  assert.equal(calls[0].insert.body, "Hello Sam");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][3], "coach");
  assert.deepEqual(await actions.markThreadRead(athleteId), {});
  assert.ok(calls[1].update.read_at);
  assert.ok(messages[0].read_at);
  assert.equal(messages[1].read_at, null);
  assert.equal(messages[2].read_at, null);
});

test("coach does not mark messages read before an athlete has an account", async () => {
  const messages = [{ athlete_id: athleteId, sender_id: coachId, read_at: null }];
  const { actions, calls } = actionsFixture({
    tables: { athletes: [{ ...athlete, user_id: null }], messages },
  });
  assert.deepEqual(await actions.markThreadRead(athleteId), {});
  assert.ok(!calls.some((call) => call.table === "messages" && call.update));
  assert.equal(messages[0].read_at, null);
});

test("athlete read marking still selects coach messages", async () => {
  const messages = [
    { athlete_id: athleteId, sender_id: userId, read_at: null },
    { athlete_id: athleteId, sender_id: coachId, read_at: null },
  ];
  const { actions } = actionsFixture({
    viewer: { kind: "athlete", athleteId },
    tables: { messages },
  });
  assert.deepEqual(await actions.markThreadRead(athleteId), {});
  assert.equal(messages[0].read_at, null);
  assert.ok(messages[1].read_at);
});

test("coach unread badge counts only athlete senders while athlete behavior stays unchanged", async () => {
  const coachMessages = [
    { sender_id: userId, read_at: null },
    { sender_id: "another-athlete", read_at: null },
    { sender_id: coachId, read_at: null },
    { sender_id: userId, read_at: "2026-11-21T10:00:00Z" },
  ];
  const { client: coachClient } = clientFixture({
    athletes: [
      { coach_id: coachId, user_id: userId },
      { coach_id: coachId, user_id: "another-athlete" },
      { coach_id: coachId, user_id: null },
    ],
    messages: coachMessages,
  });
  const loadCoachActions = loader({
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase/server": { createClient: async () => coachClient },
    "@/lib/viewer": { getViewer: async () => coach },
  });
  const coachFeed = await loadCoachActions("src/app/notification-actions.ts").getNotifications();
  assert.equal(coachFeed.unreadMessages, 2);

  const { client: athleteClient } = clientFixture({
    messages: [
      { sender_id: userId, read_at: null },
      { sender_id: coachId, read_at: null },
    ],
  });
  const loadAthleteActions = loader({
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase/server": { createClient: async () => athleteClient },
    "@/lib/viewer": { getViewer: async () => ({ kind: "athlete", athleteId }) },
  });
  const athleteFeed = await loadAthleteActions("src/app/notification-actions.ts").getNotifications();
  assert.equal(athleteFeed.unreadMessages, 1);
});

test("send rejects empty, oversized, forged links, strangers and database failures without notifying", async () => {
  for (const [options, data] of [
    [{}, form("   ")], [{}, form("x".repeat(2001))], [{}, form("Hello", "bad")],
    [{}, form("Hello", `result:${itemId}`)], [{ viewer: null }, form()],
    [{ viewer: { kind: "coach", id: "stranger", gymId: "stranger", role: "coach" } }, form()], [{ error: { message: "offline" } }, form()],
  ]) {
    const { actions, notifications } = actionsFixture(options);
    assert.ok((await actions.sendMessage(athleteId, {}, data)).error);
    assert.equal(notifications.length, 0);
  }
});

const threadCardMocks = {
  "@/components/messages/ask-ai": { AskAI: "ask-ai" },
  "@/components/suggestions/inline-suggestion-card": { InlineSuggestionCard: "approval-card" },
  "@/components/suggestions/athlete-adjustment-card": { AthleteAdjustmentCard: "adjustment-card" },
  "@/lib/ai/inline-suggestion": { inlineSuggestion: (row) => ({ id: row.id }) },
};

test("Ask AI reply preserves coach edits after a failed send", () => {
  let body, failed = false, isDraft = false;
  const { AskAI } = loader({
    react: {
      useActionState: () => [isDraft ? (failed ? { error: "Offline" } : {}) : { draft: "AI text" }, () => {}, false],
      useState: (initial) => [body ?? initial, (next) => { body = next; }],
    },
    "@/app/(app)/messages/[athleteId]/ask-ai-action": { askAthleteMessageAI() {}, sendAthleteAIDraft() {} },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/textarea": { Textarea: "textarea" },
  })("src/components/messages/ask-ai.tsx");
  const draft = treeNodes(AskAI({ athleteId, messageId: itemId, pendingSuggestionIds: [] })).find((node) => node.type.name === "ReplyDraft");
  isDraft = true;
  treeNodes(draft.type(draft.props)).find((node) => node.type === "textarea").props.onChange({ target: { value: "Coach's edit" } });
  failed = true;
  const nodes = treeNodes(draft.type(draft.props));
  assert.equal(nodes.find((node) => node.type === "textarea").props.value, "Coach's edit");
  assert.equal(nodes.find((node) => node.props.role === "alert").props.children, "Offline");
});

test("Ask AI reports a ready suggestion only while one of its cards is pending", () => {
  const { AskAI } = loader({
    react: { useActionState: () => [{ suggestionIds: [itemId] }, () => {}, false] },
    "@/app/(app)/messages/[athleteId]/ask-ai-action": { askAthleteMessageAI() {}, sendAthleteAIDraft() {} },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/textarea": { Textarea: "textarea" },
  })("src/components/messages/ask-ai.tsx");
  const statuses = (pendingSuggestionIds) => treeNodes(AskAI({ athleteId, messageId: userId, pendingSuggestionIds })).filter((node) => node.props.role === "status").map((node) => node.props.children);
  assert.deepEqual(statuses([itemId]), ["Suggestion ready to review."]);
  assert.deepEqual(statuses(["another-pending-card"]), []);
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
    ...threadCardMocks,
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

test("coach conversation activity includes applied athlete adjustments and flags only those needing review", async () => {
  const adjustment = { coach_id: coachId, suggestion_type: "athlete_adjust_workout", status: "approved", created_at: "2026-11-19T00:00:00Z" };
  const { client } = clientFixture({
    athletes: [athlete, { ...athlete, id: "second", first_name: "Ari" }, { ...athlete, id: "third", first_name: "Ben" }],
    messages: [{ athlete_id: athleteId, sender_id: userId, body: "Checking in", created_at: "2026-11-21T00:00:00Z", read_at: null }],
    ai_suggestions: [
      { ...adjustment, athlete_id: "second", decided_at: "2026-11-23T00:00:00Z", coach_reviewed_at: null },
      { ...adjustment, athlete_id: "third", decided_at: "2026-11-22T00:00:00Z", coach_reviewed_at: "2026-11-22T01:00:00Z" },
      { ...adjustment, athlete_id: athleteId, decided_at: "2026-11-24T00:00:00Z", coach_reviewed_at: null, status: "pending" },
      { ...adjustment, athlete_id: athleteId, decided_at: "2026-11-24T00:00:00Z", coach_reviewed_at: null, coach_id: "another-coach" },
    ],
  });
  const { default: MessagesPage } = loader({
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/viewer": { getViewer: async () => coach },
    "@/lib/time-zone": { getTimeZone: async () => "UTC" },
    "@/components/messages/thread-live": { ThreadLive: "thread-live" },
  })("src/app/(app)/messages/page.tsx");
  const rows = treeNodes(await MessagesPage()).filter((node) => node.type === "li").map(treeNodes);
  assert.deepEqual(rows.map((row) => row.find((node) => node.props.href).props.href), ["/messages/second", "/messages/third", `/messages/${athleteId}`]);
  assert.deepEqual(rows.map((row) => row.some((node) => node.props.children === "Adjustment to review")), [true, false, false]);
  assert.ok(rows[0].some((node) => node.props.children === "Athlete adjusted a workout"));
  assert.ok(rows[2].some((node) => node.props["aria-label"] === "1 unread messages"));
});

test("message labels identify gym coaches for coaches and fall back for hidden staff rows", async () => {
  const coaches = [
    { id: coachId, gym_id: coachId, full_name: "Owner Coach" },
    { id: staffCoachId, gym_id: coachId, full_name: "Staff Coach" },
  ];
  const messages = [
    { id: "athlete", athlete_id: athleteId, sender_id: userId, body: "Athlete", created_at: "2026-11-21T10:00:00Z" },
    { id: "owner", athlete_id: athleteId, sender_id: coachId, body: "Owner", created_at: "2026-11-21T10:01:00Z" },
    { id: "staff", athlete_id: athleteId, sender_id: staffCoachId, body: "Staff", created_at: "2026-11-21T10:02:00Z" },
    { id: "unknown", athlete_id: athleteId, sender_id: "unknown-coach", body: "Unknown", created_at: "2026-11-21T10:03:00Z" },
  ];

  for (const { viewer, user, expected } of [
    { viewer: { kind: "coach", id: staffCoachId, gymId: coachId, role: "coach" }, user: staffCoachId, expected: ["Sam Athlete", "Owner Coach", "You", "Coach"] },
    { viewer: { kind: "athlete", athleteId }, user: userId, expected: ["Sam Athlete", "Owner Coach", "Coach", "Coach"] },
  ]) {
    const { client } = clientFixture({ athletes: [athlete], coaches, messages });
    client.auth.getClaims = async () => ({ data: { claims: { sub: user } } });
    const { MessageThread } = loader({
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/viewer": { getViewer: async () => viewer },
      "@/lib/time-zone": { getToday: async () => "2026-11-21", getTimeZone: async () => "UTC" },
      "@/lib/messages": { messageAthlete: async () => athlete, resolveMessageLinks: async () => new Map(), messageLinkOptions: async () => [] },
      "@/components/messages/composer": { MessageComposer: "composer" },
      "@/components/messages/thread-live": { ThreadLive: "thread-live" },
      ...threadCardMocks,
    })("src/components/messages/thread.tsx");
    const nodes = treeNodes(await MessageThread(viewer.kind === "coach" ? { athleteId } : {}));
    assert.deepEqual(nodes.filter((node) => node.type === "p" && node.props.className === "mb-1 text-xs opacity-75").map((node) => node.props.children), expected);
  }
});

test("athlete suggestion attachments are neutral unlinked text; coach picker warns suggestions are private", async () => {
  const { client } = clientFixture({
    messages: [{ id: itemId, athlete_id: athleteId, sender_id: coachId, body: "Discuss this", read_at: null, created_at: "2026-11-21T10:00:00Z", link_type: "suggestion", link_id: itemId }],
    ai_suggestions: [{ id: itemId, athlete_id: athleteId, suggestion_type: "scale_workout" }],
  });
  const messageHelpers = loader({ "@/lib/athlete-schedule": { loadAthleteSchedule: async () => [] } })("src/lib/messages.ts");
  const options = await messageHelpers.messageLinkOptions(client, athleteId, "2026-11-21", true);
  assert.equal(options[0].label, "scale workout (only you can open this)");
  assert.deepEqual(await messageHelpers.messageLinkOptions(client, athleteId, "2026-11-21", false), []);
  const { MessageThread } = loader({
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/viewer": { getViewer: async () => ({ kind: "athlete", athleteId }) },
    "@/lib/time-zone": { getToday: async () => "2026-11-21", getTimeZone: async () => "UTC" },
    "@/lib/messages": { ...messageHelpers, messageAthlete: async () => athlete },
    "@/components/messages/composer": { MessageComposer: "composer" },
    "@/components/messages/thread-live": { ThreadLive: "thread-live" },
    ...threadCardMocks,
  })("src/components/messages/thread.tsx");
  const nodes = treeNodes(await MessageThread({}));
  assert.ok(nodes.some((node) => node.props?.children === "AI suggestion (your coach is reviewing it)"));
  assert.ok(!nodes.some((node) => node.props?.href === `/suggestions/${itemId}`));
  assert.ok(!nodes.some((node) => node.props?.children === "Linked item unavailable"));
});
test("only the coach thread gets AI controls and suggestions linked to an athlete message", async () => {
  const sourceId = "athlete-message";
  const { client } = clientFixture({
    messages: [{ id: sourceId, athlete_id: athleteId, coach_id: coachId, sender_id: userId, body: "Can I get a different WOD?", created_at: "2026-11-21T10:00:00Z" }],
    ai_suggestions: [
      { id: "proposal", athlete_id: athleteId, coach_id: coachId, suggestion_type: "write_workout", status: "pending", input: { source_message_id: sourceId } },
      { id: "adjustment", athlete_id: athleteId, coach_id: coachId, suggestion_type: "athlete_adjust_workout" },
      { id: "unrelated", athlete_id: athleteId, coach_id: coachId, suggestion_type: "adjust_macros" },
      { id: "other-athlete", athlete_id: "other", coach_id: coachId, suggestion_type: "athlete_adjust_workout" },
    ],
  });
  const originalFrom = client.from.bind(client);
  for (const isCoach of [true, false]) {
    client.auth.getClaims = async () => ({ data: { claims: { sub: isCoach ? coachId : userId } } });
    client.from = (table) => {
      if (!isCoach) assert.notEqual(table, "ai_suggestions");
      return originalFrom(table);
    };
    const { MessageThread } = loader({
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/viewer": { getViewer: async () => isCoach ? coach : { kind: "athlete", athleteId } },
      "@/lib/time-zone": { getToday: async () => "2026-11-21", getTimeZone: async () => "UTC" },
      "@/lib/messages": { messageAthlete: async () => athlete, resolveMessageLinks: async () => new Map(), messageLinkOptions: async () => [] },
      "@/components/messages/composer": { MessageComposer: "composer" },
      "@/components/messages/thread-live": { ThreadLive: "thread-live" },
      ...threadCardMocks,
    })("src/components/messages/thread.tsx");
    const nodes = treeNodes(await MessageThread(isCoach ? { athleteId } : {}));
    assert.deepEqual(nodes.filter((node) => node.type === "ask-ai").map((node) => node.props.messageId), isCoach ? [sourceId] : []);
    assert.deepEqual(nodes.filter((node) => node.type === "ask-ai").map((node) => node.props.pendingSuggestionIds), isCoach ? [["proposal"]] : []);
    assert.deepEqual(nodes.filter((node) => node.type === "approval-card").map((node) => node.props.id), isCoach ? ["proposal"] : []);
    assert.deepEqual(nodes.filter((node) => node.type === "adjustment-card").map((node) => node.props.suggestion.id), isCoach ? ["adjustment"] : []);
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
