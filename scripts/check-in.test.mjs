import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative, overrides = {}) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => {
    if (overrides[id]) return overrides[id];
    if (!id.startsWith("@/")) return require(id);
    const filename = `src/${id.slice(2)}`;
    return load(existsSync(path.resolve(root, filename + ".ts")) ? filename + ".ts" : filename + ".tsx", overrides);
  };
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { readinessScore, readinessLabel, checkInAttention, isCheckIn, CHECK_IN_FILTER, loadRecentCheckIns, loadCheckInAttention } = load("src/lib/check-in.ts");
const sample = { sleep_hours: 7.5, sleep_quality: 4, soreness: 2, stress: 2, energy: 4, mood: 4 };
const habitsOnly = { sleep_hours: null, sleep_quality: null, soreness: null, stress: null, energy: null, mood: null, readiness: null, notes: null, soreness_areas: [] };
test("check-ins require a recovery measurement or non-empty note, including zero hours", () => {
  assert.equal(isCheckIn(habitsOnly), false);
  assert.equal(isCheckIn({ ...habitsOnly, soreness_areas: ["quads"] }), true);
  assert.equal(isCheckIn({ ...habitsOnly, notes: "A note" }), true);
  assert.equal(isCheckIn({ ...habitsOnly, notes: "" }), false);
  assert.equal(isCheckIn({ ...habitsOnly, notes: "  \n " }), false);
  assert.ok(CHECK_IN_FILTER.includes("notes.neq."));
  assert.ok(CHECK_IN_FILTER.includes("soreness_areas.neq.{}"));
  for (const field of Object.keys(sample)) {
    assert.equal(isCheckIn({ ...habitsOnly, [field]: field === "sleep_hours" ? 0 : 1 }), true);
    assert.ok(CHECK_IN_FILTER.includes(`${field}.not.is.null`));
  }
});
test("coach check-in sections render empty states, readable dates and directional recovery trends", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { CheckInsTab } = load("src/app/(app)/athletes/[id]/check-ins-tab.tsx");
  const empty = renderToStaticMarkup(createElement(CheckInsTab, { entries: [], today: "2026-03-01" }));
  assert.match(empty, /No complete check-in yet/);
  assert.match(empty, /No check-ins yet/);
  assert.match(empty, /No comparison/);
  const entry = (entry_on, values) => ({
    athlete_id: "a", entry_on, ...sample, soreness_areas: ["quads"], readiness: 78, notes: null, ...values,
  });
  const html = renderToStaticMarkup(createElement(CheckInsTab, {
    today: "2026-03-01",
    entries: [
      entry("2026-03-01", { soreness: 2, stress: 4, readiness: 30 }),
      entry("2026-02-20", { soreness: 4, stress: 2, readiness: 70 }),
    ],
  }));
  assert.match(html, /↓ Better vs 4/);
  assert.match(html, /↑ Worse vs 2/);
  assert.match(html, /↓ Worse vs 70/);
  assert.match(html, /Needs attention/);
  assert.match(html, /Sleep \(h\)/);
  assert.match(html, /Sleep quality/);
  const { formatDate } = load("src/lib/units.ts");
  assert.ok(html.includes(formatDate("2026-03-01")));
  const yesterday = renderToStaticMarkup(createElement(CheckInsTab, {
    today: "2026-03-01",
    entries: [entry("2026-02-28", { readiness: 30 })],
  }));
  assert.ok(yesterday.includes(`${formatDate("2026-02-28")}</span>: Low readiness`));
  const habits = renderToStaticMarkup(createElement(CheckInsTab, {
    today: "2026-03-01", entries: [entry("2026-03-01", habitsOnly)],
  }));
  assert.match(habits, /No check-ins yet/);
  const areasOnly = renderToStaticMarkup(createElement(CheckInsTab, {
    today: "2026-03-01", entries: [entry("2026-03-01", { ...habitsOnly, soreness_areas: ["quads"] })],
  }));
  assert.match(areasOnly, /No complete check-in yet/);
  assert.match(areasOnly, /quads \(1\)/);
  assert.doesNotMatch(areasOnly, /null\/5/);
  const { addDays } = load("src/lib/nutrition.ts");
  const entries = Array.from({ length: 31 }, (_, i) => entry(addDays("2025-06-01", -i), { notes: `history-${i}-end` }));
  const history = renderToStaticMarkup(createElement(CheckInsTab, { today: "2026-03-01", entries }));
  assert.match(history, /78\/100/);
  assert.ok(history.includes(formatDate("2025-06-01")));
  assert.match(history, /history-29-end/);
  assert.doesNotMatch(history, /history-30-end/);
  assert.match(history, /\?tab=check-ins&amp;checkins=all/);
  const all = renderToStaticMarkup(createElement(CheckInsTab, { today: "2026-03-01", entries, showAll: true }));
  assert.match(all, /history-30-end/);
  assert.doesNotMatch(all, /Show all/);
});
test("readiness matches SQL sample, bounds, labels and incomplete cases", () => {
  assert.equal(readinessScore(sample), 78);
  for (const key of Object.keys(sample)) assert.equal(readinessScore({ ...sample, [key]: null }), null);
  assert.equal(readinessScore({ sleep_hours: 24, sleep_quality: 5, soreness: 1, stress: 1, energy: 5, mood: 5 }), 100);
  assert.equal(readinessScore({ sleep_hours: 0, sleep_quality: 1, soreness: 5, stress: 5, energy: 1, mood: 1 }), 1);
  assert.deepEqual([null, 39, 40, 69, 70].map(readinessLabel), ["Incomplete", "Low", "Moderate", "Moderate", "Good"]);
  console.log("readinessScore(sample) = " + readinessScore(sample));
});
const row = (entry_on, readiness = 70, soreness = 1) => ({ entry_on, readiness, soreness });
test("attention handles empty, stale, future, thresholds and consecutive local calendar dates", () => {
  const attention = (rows) => checkInAttention(rows, "2026-03-01");
  assert.deepEqual(attention([]), { flagged: false, reasons: [] });
  assert.deepEqual(attention([{ entry_on: "2026-03-01", ...habitsOnly }]), { flagged: false, reasons: [] });
  assert.equal(attention([{ entry_on: "2026-03-01", ...habitsOnly }, row("2026-02-28", 39)]).flagged, true);
  assert.equal(attention([{ entry_on: "2026-03-01", ...habitsOnly, sleep_hours: 0 }, row("2026-02-28", 39)]).flagged, true);
  assert.deepEqual(attention([{ entry_on: "2026-03-01", ...habitsOnly, notes: "Legacy note" }]), { flagged: false, reasons: [] });
  assert.deepEqual(attention([
    { entry_on: "2026-03-01", ...habitsOnly, notes: "Legacy note" }, row("2026-02-28", 39),
  ]).reasons, [{ date: "2026-02-28", text: "Low readiness on the latest check-in" }]);
  assert.equal(attention([row("2026-02-27", 1)]).flagged, false);
  assert.equal(attention([row("2026-03-02", 1)]).flagged, false);
  assert.equal(attention([row("2026-02-28", 39)]).flagged, true);
  assert.equal(attention([row("2026-03-01", null, null), row("2026-02-28", 39)]).flagged, true);
  assert.equal(attention([row("2026-03-01", 40)]).flagged, false);
  assert.equal(attention([row("2026-02-28", 10), row("2026-03-01", 70)]).flagged, false);
  assert.equal(attention([row("2026-03-01", 70, 4), row("2026-02-28", 70, 4)]).flagged, true);
  assert.equal(attention([row("2026-03-01"), row("2026-02-28", 70, 4), row("2026-02-27", 70, 5)]).flagged, true);
  assert.equal(attention([row("2026-03-01", 70, 4), row("2026-02-27", 70, 4)]).flagged, false);
  assert.equal(attention([row("2026-03-01", 39, 5), row("2026-02-28", 70, 4)]).reasons.length, 2);
  assert.deepEqual(attention([row("2026-02-28", 39, 5), row("2026-02-27", 70, 4)]), {
    flagged: true,
    reasons: [
      { date: "2026-02-28", text: "Low readiness on the latest check-in" },
      { date: "2026-02-28", text: "High soreness (5/5) two days in a row" },
    ],
  });
  assert.deepEqual(attention([
    row("2026-02-27", 70, 4), row("2026-03-01", 70, 4), row("2026-02-28", 70, 5),
  ]).reasons, [{ date: "2026-03-01", text: "High soreness (4/5) two days in a row" }]);
  assert.deepEqual(attention([
    row("2026-03-01"), row("2026-02-28", 70, 4), row("2026-02-27", 70, 5),
  ]).reasons, [{ date: "2026-02-28", text: "High soreness (4/5) two days in a row" }]);
});
function client(data, error = null) {
  const calls = [];
  const query = { then(resolve) { return Promise.resolve({ data, error }).then(resolve); } };
  for (const method of ["select", "eq", "gte", "lte", "order", "in", "or"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  return { calls, from(table) { calls.push(["from", table]); return query; } };
}
test("recent check-ins are compact, trim notes, constrain dates and propagate errors", async () => {
  const db = client([{ athlete_id: "a", entry_on: "2026-03-01", notes: "  " + "n".repeat(400) + " ", ...sample, soreness_areas: ["quads"], readiness: 78 }]);
  const rows = await loadRecentCheckIns(db, "a", "2026-03-01", 7);
  assert.equal(rows[0].date, "2026-03-01");
  assert.equal(rows[0].note.length, 300);
  assert.equal("athlete_id" in rows[0], false);
  assert.ok(db.calls.some((c) => c[0] === "gte" && c[2] === "2026-02-23"));
  assert.ok(db.calls.some((c) => c[0] === "or" && c[1] === CHECK_IN_FILTER));
  assert.deepEqual(await loadRecentCheckIns(client([{ entry_on: "2026-03-01", ...habitsOnly }]), "a", "2026-03-01", 7), []);
  assert.deepEqual(await loadRecentCheckIns(client([
    { athlete_id: "a", entry_on: "2026-03-01", ...habitsOnly, soreness_areas: ["quads"] },
  ]), "a", "2026-03-01", 7), [{
    date: "2026-03-01",
    sleep_hours: null,
    sleep_quality: null,
    soreness: null,
    soreness_areas: ["quads"],
    stress: null,
    energy: null,
    mood: null,
    readiness: null,
    note: null,
  }]);
  const notesOnly = await loadRecentCheckIns(client([
    { entry_on: "2026-03-01", ...habitsOnly, notes: "  Legacy recovery note  " },
    { entry_on: "2026-02-28", ...habitsOnly, notes: "  " },
  ]), "a", "2026-03-01", 7);
  assert.equal(notesOnly.length, 1);
  assert.equal(notesOnly[0].note, "Legacy recovery note");
  const unicode = await loadRecentCheckIns(client([{ ...sample, entry_on: "2026-03-01", notes: "n".repeat(299) + "😀extra" }]), "a", "2026-03-01", 7);
  assert.equal(unicode[0].note, "n".repeat(299) + "😀");
  assert.equal(Array.from(unicode[0].note).length, 300);
  assert.equal(JSON.parse(JSON.stringify(unicode))[0].note, unicode[0].note);
  assert.deepEqual(await loadRecentCheckIns(client([]), "a", "2026-03-01", 7), []);
  assert.deepEqual(await loadRecentCheckIns(client([]), "a", "2026-03-01", 0), []);
  await assert.rejects(loadRecentCheckIns(client(null, new Error("db error")), "a", "2026-03-01", 7), /db error/);
});
test("attention loader uses one query, supports requested empty athletes and errors", async () => {
  const db = client([{ athlete_id: "a", ...row("2026-03-01", 30) }]);
  const map = await loadCheckInAttention(db, "2026-03-01", ["a", "b"]);
  assert.equal(map.get("a").flagged, true);
  assert.deepEqual(map.get("a").reasons, [{ date: "2026-03-01", text: "Low readiness on the latest check-in" }]);
  assert.equal(map.get("b").flagged, false);
  assert.equal(db.calls.filter((c) => c[0] === "from").length, 1);
  assert.ok(db.calls.some((c) => c[0] === "or" && c[1] === CHECK_IN_FILTER));
  const empty = client([]);
  assert.equal((await loadCheckInAttention(empty, "2026-03-01", [])).size, 0);
  assert.equal(empty.calls.length, 0);
  await assert.rejects(loadCheckInAttention(client(null, new Error("db error")), "2026-03-01"), /db error/);
});

test("check-in and habit actions validate, isolate their payloads, use viewer-local today and report save errors", async () => {
  let viewer = { kind: "athlete", athleteId: "athlete", coachId: "coach" };
  let dbError = null;
  const writes = [], paths = [];
  const overrides = {
    "@/lib/activity-training-warning": { checkTrainingLoad: async () => {} },
    "@/lib/notifications": { notifyLowReadiness: async () => {} },
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/viewer": { getViewer: async () => viewer },
    "@/lib/time-zone": { getToday: async () => "2026-03-01" },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ upsert: async (payload, options) => { writes.push({ payload, options }); return { error: dbError }; } }) }) },
  };
  const { saveCheckIn } = load("src/app/athlete/check-in/actions.ts", overrides);
  const form = () => {
    const data = new FormData();
    for (const [key, value] of Object.entries(sample)) data.set(key, String(value));
    data.set("notes", " Feeling good ");
    data.set("entry_on", "1999-01-01");
    data.set("expected_date", "2026-03-01");
    data.set("alcohol", "on");
    data.append("soreness_areas", "quads");
    data.append("soreness_areas", "hips");
    return data;
  };
  assert.equal((await saveCheckIn({}, form())).message, "Check-in saved.");
  assert.equal(writes[0].payload.entry_on, "2026-03-01");
  assert.equal(writes[0].payload.notes, "Feeling good");
  assert.equal("alcohol" in writes[0].payload, false);
  assert.equal("readiness" in writes[0].payload, false);
  assert.equal("expected_date" in writes[0].payload, false);
  assert.deepEqual(writes[0].payload.soreness_areas, ["quads", "hips"]);
  assert.equal(writes[0].options.onConflict, "athlete_id,entry_on");
  assert.deepEqual(paths, ["/athlete", "/athlete/journal", "/athletes/athlete"]);
  const partial = new FormData();
  partial.set("sleep_hours", "6.25");
  partial.set("notes", "");
  partial.set("expected_date", "2026-03-01");
  assert.equal((await saveCheckIn({}, partial)).message, "Check-in saved.");
  assert.deepEqual(
    Object.fromEntries(Object.entries(writes.at(-1).payload).filter(([key]) =>
      !["athlete_id", "coach_id", "entry_on", "soreness_areas"].includes(key))),
    { sleep_hours: 6.3, sleep_quality: null, soreness: null, stress: null, energy: null, mood: null, notes: null },
  );
  assert.equal(readinessScore(writes.at(-1).payload), null);
  const areasOnly = new FormData();
  areasOnly.set("expected_date", "2026-03-01");
  areasOnly.append("soreness_areas", "quads");
  assert.equal((await saveCheckIn({}, areasOnly)).message, "Check-in saved.");
  assert.deepEqual(writes.at(-1).payload.soreness_areas, ["quads"]);
  assert.equal(readinessScore(writes.at(-1).payload), null);
  const empty = new FormData();
  empty.set("expected_date", "2026-03-01");
  assert.equal((await saveCheckIn({}, empty)).error, "Fill in at least one answer, or tap Skip today.");
  for (const [key, value] of [["sleep_hours", "25"], ["soreness", "6"], ["stress", "2.5"], ["notes", "n".repeat(501)], ["soreness_areas", "unknown"]]) {
    const data = form();
    data.set(key, value);
    assert.ok((await saveCheckIn({}, data)).error, key);
  }
  assert.equal(writes.length, 3);
  for (const expectedDate of ["2026-02-28", "2026-03-02", null]) {
    const stale = form();
    if (expectedDate == null) stale.delete("expected_date");
    else stale.set("expected_date", expectedDate);
    assert.equal((await saveCheckIn({}, stale)).error, "A new day has started — reload to do today's check-in.");
  }
  assert.equal(writes.length, 3);
  for (const [value, expected] of [["7.56", 7.6], [String(0.1 + 0.2), 0.3], ["0", 0]]) {
    const data = form();
    data.set("sleep_hours", value);
    assert.equal((await saveCheckIn({}, data)).message, "Check-in saved.");
    assert.equal(writes.at(-1).payload.sleep_hours, expected);
  }
  dbError = { message: "database unavailable" };
  assert.match((await saveCheckIn({}, form())).error, /Couldn't save/);
  viewer = { kind: "coach" };
  assert.match((await saveCheckIn({}, form())).error, /Only athletes/);
  viewer = { kind: "athlete", athleteId: "athlete", coachId: "coach" };
  dbError = null;
  const { saveJournalEntry } = load("src/app/athlete/journal/actions.ts", overrides);
  const habits = form();
  habits.set("entry_on", "2026-02-28");
  assert.equal((await saveJournalEntry({}, habits)).message, "Journal saved.");
  const payload = writes.at(-1).payload;
  for (const key of [...Object.keys(sample), "notes", "soreness_areas", "readiness"]) assert.equal(key in payload, false, key);
  assert.equal(payload.alcohol, true);
  assert.equal(payload.entry_on, "2026-02-28");
  habits.set("entry_on", "2026-03-02");
  assert.ok((await saveJournalEntry({}, habits)).error);
});

test("partial saved check-ins render only answered fields and offer an edit action", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const tag = (name) => {
    const Tag = (props) => React.createElement(name, props, props.children);
    Tag.displayName = name;
    return Tag;
  };
  const { CheckInForm } = load("src/app/athlete/check-in/check-in-form.tsx", {
    "next/link": "a",
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/button": { Button: tag("button") },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h2" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "./actions": { saveCheckIn: async () => ({ message: "Check-in saved." }) },
  });
  const entry = { ...habitsOnly, sleep_hours: 6.5 };
  const html = renderToStaticMarkup(React.createElement(CheckInForm, { entry, today: "2026-03-01", athleteId: "athlete" }));
  assert.match(html, /Daily check-in \(optional\)/);
  assert.match(html, /Readiness: answer all six to get a score/);
  assert.match(html, /Sleep 6\.5h/);
  assert.match(html, /Edit today&#x27;s check-in/);
  assert.doesNotMatch(html, /Sleep quality|Soreness|Stress|Energy|Mood|null\/5|Save check-in/);
  const areasOnly = { ...habitsOnly, soreness_areas: ["quads"] };
  const areasOnlyHtml = renderToStaticMarkup(React.createElement(CheckInForm, {
    entry: areasOnly,
    today: "2026-03-01",
    athleteId: "athlete",
  }));
  assert.match(areasOnlyHtml, /Readiness: answer all six to get a score/);
  assert.match(areasOnlyHtml, /quads/);
  assert.match(areasOnlyHtml, /Edit today&#x27;s check-in/);
  assert.doesNotMatch(areasOnlyHtml, /null\/5|Save check-in/);
  const compact = renderToStaticMarkup(React.createElement(CheckInForm, {
    entry: null,
    today: "2026-03-01",
    athleteId: "athlete",
  }));
  assert.match(compact, /Daily check-in \(optional\)/);
  assert.match(compact, /How are you feeling today\? Takes about 30 seconds\./);
  assert.match(compact, /Fill it in/);
  assert.match(compact, /Skip today/);
  assert.doesNotMatch(compact, /Save check-in/);
});
