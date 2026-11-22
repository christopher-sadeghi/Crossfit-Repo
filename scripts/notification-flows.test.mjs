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
  return function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
    }).outputText;
    const localRequire = (id) => {
      if (id === "next/server") return { after: () => {} };
      if (id in mocks) return mocks[id];
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/") ? path.join(root, `src/${id.slice(2)}`) : path.resolve(path.dirname(filename), id);
        return load(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
      }
      return require(id);
    };
    new Function("require", "module", "exports", source)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  };
}

const userId = "29000000-0000-4000-8000-000000000001";
const athleteId = "29000000-0000-4000-8000-000000000011";
const itemId = "29000000-0000-4000-8000-000000000021";
const date = "2026-11-21";
const form = (values) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, String(value)); return data; };

function clientFixture(tables = {}, options = {}) {
  const events = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: options.anonymous ? null : userId } } }) },
    rpc: async (name, args) => { events.push(["rpc", name, args]); return { data: options.rpcData ?? itemId, error: options.writeError }; },
    from(table) {
      let operation = "select", values, limit = Infinity, ordering;
      const filters = [];
      const resolve = () => {
        if (options.thrown) throw new Error("offline");
        let rows = (tables[table] ?? []).filter((row) => filters.every(([key, value, not]) => not ? row[key] !== value : row[key] === value));
        const error = operation === "select" ? options.queryError : options.writeError;
        if (operation !== "select") {
          events.push([operation, table, values]);
          if (!error) {
            if (operation === "update") rows.forEach((row) => Object.assign(row, values));
            else rows = [{ id: itemId, ...values }];
          }
        }
        const count = rows.length;
        if (ordering) rows = [...rows].sort((a, b) => b[ordering].localeCompare(a[ordering]));
        return { data: rows.slice(0, limit), count, error };
      };
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push([key, value]); return query; },
        neq: (key, value) => { filters.push([key, value, true]); return query; },
        is: (key, value) => { filters.push([key, value]); return query; },
        order: (key) => { ordering = key; return query; }, limit: (value) => { limit = value; return query; },
        insert: (value) => { operation = "insert"; values = value; return query; },
        upsert: (value) => { operation = "upsert"; values = value; return query; },
        update: (value) => { operation = "update"; values = value; return query; },
        delete: () => { operation = "delete"; return query; },
        maybeSingle: async () => { const result = resolve(); return { ...result, data: result.data[0] ?? null }; },
        single: async () => { const result = resolve(); return { ...result, data: result.data[0] ?? null }; },
        then: (done, reject) => Promise.resolve().then(resolve).then(done, reject),
      };
      return query;
    },
  };
  return { client, events };
}

test("notification feed caps the ordered list at 20 but counts all own unread rows; receipts isolate other recipients", async () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: index === 0 ? itemId : `row-${index}`, recipient_id: userId, read_at: null, created_at: `2026-11-${String(index + 1).padStart(2, "0")}` }));
  const other = { id: athleteId, recipient_id: "other", read_at: null, created_at: "2026-11-30" };
  const { client } = clientFixture({ notifications: [...rows, other] });
  const actions = loader({ "@/lib/supabase/server": { createClient: async () => client } })("src/app/notification-actions.ts");
  const feed = await actions.getNotifications();
  assert.equal(feed.count, 25);
  assert.equal(feed.unreadMessages, 0);
  assert.equal(feed.items.length, 20);
  assert.equal(feed.items[0].created_at, "2026-11-25");
  assert.deepEqual(await actions.markNotificationRead(athleteId), {});
  assert.equal(other.read_at, null);
  assert.deepEqual(await actions.markNotificationRead(itemId), {});
  assert.ok(rows[0].read_at);
  const firstReceipt = rows[0].read_at;
  await actions.markNotificationRead(itemId);
  assert.equal(rows[0].read_at, firstReceipt);
  assert.deepEqual(await actions.markAllNotificationsRead(), {});
  assert.ok(rows.every((row) => row.read_at));
  assert.equal(other.read_at, null);
  assert.equal((await actions.getNotifications()).count, 0);
});

test("notification actions handle empty, malformed, unauthenticated and database error cases", async () => {
  for (const options of [{}, { anonymous: true }, { queryError: new Error("denied"), writeError: new Error("denied") }, { thrown: true }]) {
    const { client, events } = clientFixture({}, options);
    const actions = loader({ "@/lib/supabase/server": { createClient: async () => client } })("src/app/notification-actions.ts");
    const feed = await actions.getNotifications();
    assert.equal(feed.count, 0);
    assert.equal(feed.unreadMessages, 0);
    assert.equal(feed.items.length, 0);
    assert.equal(Boolean(feed.error), Object.keys(options).length > 0);
    assert.ok((await actions.markNotificationRead("bad-id")).error);
    assert.equal(events.length, 0);
    const result = await actions.markAllNotificationsRead();
    assert.equal(Boolean(result.error), Object.keys(options).length > 0);
  }
});

test("the shared bell feed counts all incoming unread messages for either viewer role", async () => {
  for (const sender of [athleteId, itemId]) {
    const messages = Array.from({ length: 1205 }, () => ({ sender_id: sender, read_at: null }));
    const { client } = clientFixture({ messages: [...messages, { sender_id: userId, read_at: null }, { sender_id: sender, read_at: "read" }] });
    const actions = loader({ "@/lib/supabase/server": { createClient: async () => client } })("src/app/notification-actions.ts");
    assert.equal((await actions.getNotifications()).unreadMessages, 1205);
  }
});

test("email preferences upsert only the signed-in user's row, including off and both frequencies", async () => {
  for (const [enabled, frequency] of [[false, "daily"], [true, "instant"], [true, "daily"]]) {
    const { client, events } = clientFixture();
    const paths = [];
    const { saveNotificationSettings } = loader({
      "@/lib/supabase/server": { createClient: async () => client },
      "next/cache": { revalidatePath: (path) => paths.push(path) },
    })("src/app/notification-actions.ts");
    const result = await saveNotificationSettings({}, form({ user_id: "forged", email_frequency: frequency, ...(enabled ? { email_enabled: "on" } : {}) }));
    assert.equal(result.message, "Notification preferences saved.");
    assert.deepEqual(events, [["upsert", "notification_settings", { user_id: userId, email_enabled: enabled, email_frequency: frequency }]]);
    assert.deepEqual(paths, ["/settings", "/athlete/messages"]);
  }
});

test("email preference saves reject empty, invalid, unauthenticated and failing writes", async () => {
  for (const [options, data] of [
    [{}, new FormData()], [{}, form({ email_frequency: "weekly" })], [{}, form({ email_enabled: "bad", email_frequency: "daily" })],
    [{ anonymous: true }, form({ email_frequency: "daily" })], [{ writeError: new Error("denied") }, form({ email_frequency: "daily" })], [{ thrown: true }, form({ email_frequency: "daily" })],
  ]) {
    const { client } = clientFixture({}, options);
    const { saveNotificationSettings } = loader({
      "@/lib/supabase/server": { createClient: async () => client },
      "next/cache": { revalidatePath: () => assert.fail("must not revalidate a failed save") },
    })("src/app/notification-actions.ts");
    assert.ok((await saveNotificationSettings({}, data)).error);
  }
});

test("shared email card defaults off/daily, loads own preferences, and exposes errors rather than overwriting", async () => {
  for (const mode of ["default", "existing", "error", "anonymous"]) {
    const { client } = clientFixture({ notification_settings: [{ user_id: userId, email_enabled: true, email_frequency: "instant" }] }, mode === "error" ? { queryError: new Error("denied") } : mode === "anonymous" ? { anonymous: true } : {});
    const empty = clientFixture().client;
    const { NotificationSettings } = loader({
      "@/lib/supabase/server": { createClient: async () => mode === "default" ? empty : client },
      "./email-settings-form": { EmailSettingsForm: "email-form" },
    })("src/components/notifications/email-settings.tsx");
    const result = await NotificationSettings();
    if (mode === "anonymous") { assert.equal(result, null); continue; }
    const formNode = nodes(result).find((node) => node.type === "email-form");
    if (mode === "error") { assert.equal(formNode, undefined); assert.ok(nodes(result).some((node) => node.props?.role === "alert")); }
    else { assert.equal(formNode.props.emailEnabled, mode === "existing"); assert.equal(formNode.props.frequency, mode === "existing" ? "instant" : "daily"); }
  }
});

test("email form has an off switch, daily default, both frequencies and the inactive-delivery note", () => {
  const { EmailSettingsForm } = loader({
    react: { useActionState: () => [{}, () => {}, false], useState: (initial) => [initial, () => {}] },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/label": { Label: "label" }, "@/app/notification-actions": { saveNotificationSettings: () => {} },
  })("src/components/notifications/email-settings-form.tsx");
  const tree = EmailSettingsForm({ emailEnabled: false, frequency: "daily" });
  assert.equal(nodes(tree).find((node) => node.props?.role === "switch").props.checked, false);
  assert.equal(nodes(tree).find((node) => node.type === "select").props.value, "daily");
  assert.deepEqual(nodes(tree).filter((node) => node.type === "option").map((node) => node.props.value), ["instant", "daily"]);
  assert.ok(nodes(tree).some((node) => node.props?.children === "Email delivery isn't switched on for this demo yet — your choice is saved for when it is."));
});

function actionHarness(tables = {}, options = {}, overrides = {}) {
  const { client, events } = clientFixture(tables, options);
  const notify = (name) => async (...args) => events.push(["notification", name, ...args.slice(1)]);
  const load = loader({
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (href) => { throw new Error(`redirect:${href}`); } },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/viewer": { getViewer: async () => options.viewer ?? { kind: "athlete", athleteId, coachId: userId, units: "kg" } },
    "@/lib/time-zone": { getToday: async () => date },
    "@/lib/notifications": Object.fromEntries(["notifyResultLogged", "notifyLowReadiness", "notifyWorkoutAdjusted", "notifyScheduleChanged", "notifySuggestionApproved"].map((name) => [name, notify(name)])),
    "@/lib/ai/service": {}, "@/lib/ai/suggestions": { SUGGESTION_REGISTRY: {} },
    "@/app/(app)/programs/actions": { placeWorkout: async () => { events.push(["place"]); return options.placementError ? { error: "Failed" } : {}; } },
    ...overrides,
  });
  return { load, events };
}

test("result inserts notify after success; edits and failed/invalid inserts do not notify", async () => {
  const tables = { workouts: [{ id: itemId, workout_type: "for_time" }], workout_results: [{ id: itemId, logged_by: userId, workout_id: itemId, athlete_id: athleteId }] };
  const values = { workout_id: itemId, performed_on: date, minutes: "5", is_rx: "rx", notes: "" };
  for (const edit of [false, true]) {
    const { load, events } = actionHarness(tables);
    const action = load("src/app/athlete/actions.ts").saveAthleteResult;
    await assert.rejects(action({}, form({ ...values, ...(edit ? { result_id: itemId } : {}) })), /redirect:/);
    const notifications = events.filter(([kind]) => kind === "notification");
    assert.equal(notifications.length, edit ? 0 : 1);
    if (!edit) { assert.equal(events[1][0], "insert"); assert.deepEqual(notifications[0], ["notification", "notifyResultLogged", athleteId, itemId]); }
  }
  for (const data of [form(values), new FormData()]) {
    const { load, events } = actionHarness(tables, { writeError: new Error("denied") });
    assert.ok((await load("src/app/athlete/actions.ts").saveAthleteResult({}, data)).error);
    assert.equal(events.filter(([kind]) => kind === "notification").length, 0);
  }
});

test("check-in notifies only after successful low-readiness saves using the local day", async () => {
  const healthy = { sleep_hours: 8, sleep_quality: 5, soreness: 1, stress: 1, energy: 5, mood: 5 };
  const low = { sleep_hours: 0, sleep_quality: 1, soreness: 5, stress: 5, energy: 1, mood: 1 };
  for (const [ratings, options, expected] of [[low, {}, 1], [healthy, {}, 0], [low, { writeError: new Error("denied") }, 0], [{}, {}, 0]]) {
    const { load, events } = actionHarness({}, options);
    await load("src/app/athlete/check-in/actions.ts").saveCheckIn({}, form({ ...ratings, notes: "", expected_date: date }));
    const notifications = events.filter(([kind]) => kind === "notification");
    assert.equal(notifications.length, expected);
    if (expected) { assert.equal(events[0][0], "upsert"); assert.deepEqual(notifications[0], ["notification", "notifyLowReadiness", athleteId, date]); }
  }
});

test("AI adjustment notifies for applied and persisted pain paths, not unpersisted/ordinary failures", async () => {
  for (const result of [
    { ok: true, suggestionId: itemId, checkWithCoach: false },
    { ok: true, suggestionId: itemId, checkWithCoach: true },
    { ok: false, suggestionId: itemId, checkWithCoach: true, error: "unsafe" },
    { ok: false, suggestionId: itemId, checkWithCoach: false, error: "offline" },
    { ok: false, checkWithCoach: true, error: "No suggestion stored" },
  ]) {
    const { load, events } = actionHarness({}, {}, {
      "@/lib/athlete-schedule": { loadAthleteSchedule: async () => [{ date, workout: { id: itemId } }] },
      "@/lib/ai/athlete-adjust": { athleteAdjustFeelingSchema: require("zod").z.string().min(3), buildAthleteAdjustRequest: async () => ({}), runAthleteAdjustment: async () => { events.push(["adjustment"]); return result; } },
    });
    await load("src/app/athlete/adjust-actions.ts").adjustTodaysWorkout({}, form({ workout_id: itemId, feeling: "Feeling tired" }));
    const notifications = events.filter(([kind]) => kind === "notification");
    assert.equal(notifications.length, result.suggestionId && (result.ok || result.checkWithCoach) ? 1 : 0);
    if (notifications.length) { assert.equal(events[0][0], "adjustment"); assert.equal(notifications[0][2], athleteId); assert.equal(notifications[0][3], itemId); assert.deepEqual(notifications[0][4], { applied: result.ok, checkWithCoach: result.checkWithCoach }); }
  }
});

test("calendar mutations notify after writes except opening the editor; group additions skip", async () => {
  for (const name of ["editWorkoutForAthlete", "removeWorkoutForAthlete", "restoreWorkoutForAthlete", "moveAthleteWorkout", "deleteAthleteWorkout"]) {
    for (const failed of [false, true]) {
      const { load, events } = actionHarness({ workouts: [{ id: itemId, athlete_id: athleteId, program_id: null }] }, failed ? { writeError: new Error("denied") } : {});
      const action = load("src/app/(app)/athletes/[id]/calendar-actions.ts")[name];
      if (name === "editWorkoutForAthlete" && !failed) await assert.rejects(action(athleteId, itemId, date), /redirect:/);
      else await action(athleteId, itemId, date);
      const notifications = events.filter(([kind]) => kind === "notification");
      assert.equal(notifications.length, failed || name === "editWorkoutForAthlete" ? 0 : 1, name);
      if (notifications.length) { assert.notEqual(events[0][0], "notification"); if (name === "moveAthleteWorkout") assert.equal(notifications[0][3].date, date); }
    }
  }
  for (const options of [{}, { writeError: new Error("denied") }]) {
    const { load, events } = actionHarness({}, options);
    await load("src/app/(app)/athletes/[id]/calendar-actions.ts").addExistingWorkoutForAthlete({}, form({ athlete_id: athleteId, workout_id: itemId, date, destination: "athlete" }));
    assert.equal(events.filter(([kind]) => kind === "notification").length, options.writeError ? 0 : 1);
  }
  for (const personal of [false, true]) {
    const { load, events } = actionHarness({ program_assignments: [{ athlete_id: athleteId, program_id: itemId, start_date: date, programs: { athlete_id: personal ? athleteId : null, weeks: 1 } }] });
    await load("src/app/(app)/athletes/[id]/calendar-actions.ts").addExistingWorkoutForAthlete({}, form({ athlete_id: athleteId, workout_id: itemId, date, destination: itemId }));
    assert.equal(events.filter(([kind]) => kind === "notification").length, personal ? 1 : 0);
  }
});

test("saving athlete-specific WODs notifies only after workout and movements succeed; group and missing workouts skip", async () => {
  for (const mode of ["edit", "create", "group", "missing", "failed"]) {
    const { load, events } = actionHarness({ workouts: mode === "missing" ? [] : [{ id: itemId, athlete_id: mode === "group" ? null : athleteId }], athletes: [{ id: athleteId }] }, mode === "failed" ? { writeError: new Error("denied") } : {});
    const data = form({
      title: "Fran", workout_type: "for_time", description: "", notes: "", scheduled_on: date,
      ...(mode === "create" ? { athlete_id: athleteId } : { id: itemId }),
      movements: JSON.stringify([{ movement_id: itemId, sets: null, reps: 21, load_kg: null, distance_m: null, calories: null, duration_seconds: null, notes: null }]),
    });
    const save = load("src/app/(app)/programs/workouts/actions.ts").saveWorkout({}, data);
    if (["edit", "create", "group"].includes(mode)) await assert.rejects(save, /redirect:/);
    else assert.ok((await save).error);
    const notifications = events.filter(([kind]) => kind === "notification");
    assert.equal(notifications.length, ["edit", "create"].includes(mode) ? 1 : 0, mode);
    if (notifications.length) {
      assert.deepEqual(notifications[0], ["notification", "notifyScheduleChanged", athleteId, { action: mode === "edit" ? "updated" : "added", date }]);
      assert.ok(events.findIndex(([kind, table]) => kind === "insert" && table === "workout_movements") < events.indexOf(notifications[0]));
    }
  }
});

test("adjustment service returns the persisted suggestion ID on success and failures, but not a refused start", async () => {
  for (const mode of ["success", "generation-error", "apply-error", "start-error"]) {
    const calls = [];
    const { runAthleteAdjustment } = loader({
      ai: { generateText: async () => { if (mode === "generation-error") throw new Error("offline"); return { output: {} }; }, Output: { object: () => ({}) } },
      "@ai-sdk/openai": {}, "./service-core": { friendlySuggestionError: () => "Try again" },
      "./scale-workout": {}, "./athlete-adjust-schema": { normalizeAthleteAdjustment: () => ({ summary: "Easier WOD", rounds: null, time_cap_minutes: null, changes: [] }) },
    })("src/lib/ai/athlete-adjust.ts");
    const client = { rpc: async (name) => {
      calls.push(name);
      if (name === "start_athlete_workout_adjustment") return { data: mode === "start-error" ? null : itemId, error: null };
      return { error: name === "apply_athlete_workout_adjustment" && mode === "apply-error" ? { message: "workout_changed" } : null };
    } };
    const result = await runAthleteAdjustment(client, { input: { mentions_pain: true, units: "kg", library: [] } }, { modelId: "local-mock" });
    assert.equal(result.ok, mode === "success");
    assert.equal(result.checkWithCoach, true);
    assert.equal(result.suggestionId, mode === "start-error" ? undefined : itemId);
    if (mode.includes("error") && mode !== "start-error") assert.equal(calls.at(-1), "fail_athlete_workout_adjustment");
  }
});

test("approval actions notify only on successful athlete-specific approvals, including report and scaling", async () => {
  const z = require("zod").z;
  for (const type of ["adjust_macros", "write_workout", "progress_summary", "scale_workout"]) {
    for (const mode of ["success", "failure", "no-athlete", "absent"]) {
      const suggestion = { id: itemId, athlete_id: mode === "no-athlete" ? null : athleteId, suggestion_type: type, status: "pending", proposal: { summary: "Report", goals: [] }, input: { mode: "write", workout_id: itemId } };
      const { load, events } = actionHarness({ ai_suggestions: mode === "absent" ? [] : [suggestion] }, {}, {
        "@/lib/ai/suggestions": { SUGGESTION_REGISTRY: { [type]: { apply: true, proposalSchema: z.any() } } },
        "@/lib/ai/decisions": { approveSuggestionWithClient: async () => { events.push(["approve"]); return mode === "failure" ? { error: "Failed" } : { status: "approved" }; } },
        "@/lib/ai/scale-workout": { scaleWorkoutSchema: z.any(), scaleWorkoutInputSchema: z.any(), applyScaleWorkoutLoadEdits: () => ({ data: {} }) },
      });
      const actions = load(`src/app/(app)/suggestions/${type === "scale_workout" ? "scale-actions" : "actions"}.ts`);
      await actions[type === "scale_workout" ? "approveScaleSuggestion" : "approveSuggestion"]({}, form({ id: itemId, summary: "Report" }));
      const notifications = events.filter(([kind]) => kind === "notification");
      assert.equal(notifications.length, mode === "success" ? 1 : 0, `${type}:${mode}`);
      if (notifications.length) { assert.equal(events[0][0], "approve"); assert.deepEqual(notifications[0], ["notification", "notifySuggestionApproved", athleteId, itemId]); }
    }
  }
});

test("coach edits, undoes and removes scaling notify only after an active athlete plan was changed", async () => {
  const z = require("zod").z;
  const suggestion = { id: itemId, suggestion_type: "athlete_adjust_workout", input: { scheduled_on: date, units: "kg" }, final: { changes: [] } };
  for (const name of ["editAthleteAdjustment", "undoAthleteAdjustment"]) {
    for (const mode of ["success", "absent", "failure"]) {
      const { load, events } = actionHarness({
        ai_suggestions: [suggestion],
        athlete_workout_scalings: mode === "absent" ? [] : [{ id: itemId, athlete_suggestion_id: itemId, athlete_id: athleteId, workout_id: itemId, coach_modifications: "Original scaling", details: { movements: [] } }],
      }, mode === "failure" ? { writeError: new Error("denied") } : {}, {
        "@/lib/ai/athlete-adjust-schema": { athleteAdjustInputSchema: z.any(), athleteAdjustSchema: z.any() },
        "@/lib/ai/scale-workout": { scaleWorkoutDetailsSchema: z.any() },
      });
      await load("src/app/(app)/suggestions/athlete-adjust-actions.ts")[name]({}, form({ id: itemId, summary: "Coach-edited scaling" }));
      const notifications = events.filter(([kind]) => kind === "notification");
      assert.equal(notifications.length, mode === "success" ? 1 : 0);
      if (notifications.length) { assert.equal(notifications[0][2], athleteId); assert.equal(events[0][0], "update"); }
    }
  }
  for (const mode of ["success", "absent", "failure"]) {
    const { load, events } = actionHarness({}, {}, {
      "@/lib/ai/scale-workout": { deleteWorkoutScalingWithClient: async () => {
        if (mode === "failure") throw new Error("denied");
        events.push(["delete"]);
        return mode === "absent" ? null : { athlete_id: athleteId, workout_id: itemId };
      } },
    });
    await load("src/app/(app)/suggestions/scale-actions.ts").removeWorkoutScaling({}, form({ id: itemId }));
    assert.equal(events.filter(([kind]) => kind === "notification").length, mode === "success" ? 1 : 0);
  }
});

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test("bell polls visible tabs every 18s, displays local times, marks/navigates and handles empty/error/cleanup", async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  let interval, cleared = false, reads = 0, polls = 0, failRead = false, messageCount = 0, refreshes = 0, failPoll = false;
  const listeners = new Set(), effects = [], tasks = [], states = [], refs = [], pushed = [];
  let cursor = 0, refCursor = 0, mounted = false;
  const item = { id: itemId, title: "New result", body: "Sam logged Fran", created_at: "2026-11-21T12:00:00Z", read_at: null, link: "/athlete" };
  globalThis.window = { setInterval: (callback, delay) => { interval = callback; assert.equal(delay, 18000); return 1; }, clearInterval: () => { cleared = true; } };
  globalThis.document = { visibilityState: "visible", addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  try {
    const { NotificationBell } = loader({
      react: {
        useState: (initial) => { const index = cursor++; if (!mounted) states[index] = initial; return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
        useRef: (initial) => { const index = refCursor++; if (!mounted) refs[index] = { current: initial }; return refs[index]; },
        useEffect: (fn) => { if (!mounted) effects.push(fn); }, useTransition: () => [false, (fn) => tasks.push(fn())],
      },
      "next/navigation": { useRouter: () => ({ push: (href) => pushed.push(href), refresh: () => refreshes++ }) },
      "next/link": "a", "lucide-react": { Bell: "svg" }, "@/components/ui/button": { Button: "button" },
      "@/app/notification-actions": {
        getNotifications: async () => { polls++; return { items: [], count: 0, unreadMessages: messageCount, ...(failPoll ? { error: "offline" } : {}) }; },
        markNotificationRead: async (id) => { reads++; assert.equal(id, itemId); return failRead ? { error: "Failed receipt" } : {}; },
        markAllNotificationsRead: async () => ({}),
      },
    })("src/components/notifications/bell.tsx");
    const render = () => { cursor = 0; refCursor = 0; const result = NotificationBell({ initial: { items: [item], count: 1, unreadMessages: 0 }, timeZone: "America/Los_Angeles" }); mounted = true; return result; };
    let tree = render();
    const cleanup = effects[0]();
    assert.equal(nodes(tree).find((node) => node.type === "summary").props["aria-label"], "Notifications, 1 unread");
    assert.match(nodes(tree).find((node) => node.type === "time").props.children, /4:00/);
    failRead = true;
    nodes(tree).find((node) => node.type === "a").props.onClick({ preventDefault() {} });
    await Promise.all(tasks.splice(0));
    assert.equal(pushed.length, 0);
    assert.equal(states[0].count, 1);
    assert.equal(states[1], "Failed receipt");
    failRead = false;
    nodes(tree).find((node) => node.type === "a").props.onClick({ preventDefault() {} });
    await Promise.all(tasks.splice(0));
    assert.deepEqual(pushed, ["/athlete"]);
    assert.equal(states[0].count, 0);
    assert.ok(states[0].items[0].read_at);
    assert.equal(reads, 2);
    states[0] = { items: [item], count: 7 };
    tree = render();
    nodes(tree).find((node) => node.type === "button" && node.props.children === "Mark all read").props.onClick();
    await Promise.all(tasks.splice(0));
    assert.equal(states[0].count, 0);
    globalThis.document.visibilityState = "hidden";
    await interval(); assert.equal(polls, 0);
    globalThis.document.visibilityState = "visible";
    await interval(); assert.equal(polls, 1);
    assert.ok(nodes(render()).some((node) => node.props?.children === "No notifications yet."));
    await Promise.all([...listeners].map((fn) => fn())); assert.equal(polls, 2);
    assert.equal(refreshes, 0);
    messageCount = 4;
    await interval(); assert.equal(refreshes, 1);
    await interval(); assert.equal(refreshes, 1);
    messageCount = 0; failPoll = true;
    await interval(); assert.equal(refreshes, 1);
    failPoll = false;
    await interval(); assert.equal(refreshes, 2);
    cleanup(); assert.equal(cleared, true); assert.equal(listeners.size, 0);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
