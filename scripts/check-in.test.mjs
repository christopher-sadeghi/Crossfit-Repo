import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  const localRequire = (id) => overrides[id] ?? (id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, overrides) : require(id));
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { readinessScore, readinessLabel, checkInAttention, loadRecentCheckIns, loadCheckInAttention } = load("src/lib/check-in.ts");
const sample = { sleep_hours: 7.5, sleep_quality: 4, soreness: 2, stress: 2, energy: 4, mood: 4 };
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
  assert.equal(attention([]).flagged, false);
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
});
function client(data, error = null) {
  const calls = [];
  const query = { then(resolve) { return Promise.resolve({ data, error }).then(resolve); } };
  for (const method of ["select", "eq", "gte", "lte", "order", "in"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  return { calls, from(table) { calls.push(["from", table]); return query; } };
}
test("recent check-ins are compact, trim notes, constrain dates and propagate errors", async () => {
  const db = client([{ athlete_id: "a", entry_on: "2026-03-01", notes: "  " + "n".repeat(400) + " ", ...sample, soreness_areas: ["quads"], readiness: 78 }]);
  const rows = await loadRecentCheckIns(db, "a", "2026-03-01", 7);
  assert.equal(rows[0].date, "2026-03-01");
  assert.equal(rows[0].note.length, 300);
  assert.equal("athlete_id" in rows[0], false);
  assert.ok(db.calls.some((c) => c[0] === "gte" && c[2] === "2026-02-23"));
  assert.deepEqual(await loadRecentCheckIns(client([]), "a", "2026-03-01", 7), []);
  assert.deepEqual(await loadRecentCheckIns(client([]), "a", "2026-03-01", 0), []);
  await assert.rejects(loadRecentCheckIns(client(null, new Error("db error")), "a", "2026-03-01", 7), /db error/);
});
test("attention loader uses one query, supports requested empty athletes and errors", async () => {
  const db = client([{ athlete_id: "a", ...row("2026-03-01", 30) }]);
  const map = await loadCheckInAttention(db, "2026-03-01", ["a", "b"]);
  assert.equal(map.get("a").flagged, true);
  assert.equal(map.get("b").flagged, false);
  assert.equal(db.calls.filter((c) => c[0] === "from").length, 1);
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
  assert.deepEqual(writes[0].payload.soreness_areas, ["quads", "hips"]);
  assert.equal(writes[0].options.onConflict, "athlete_id,entry_on");
  assert.deepEqual(paths, ["/athlete", "/athlete/journal", "/athletes/athlete"]);
  for (const key of Object.keys(sample)) {
    const data = form();
    data.delete(key);
    assert.ok((await saveCheckIn({}, data)).error, key);
  }
  const empty = new FormData();
  assert.ok((await saveCheckIn({}, empty)).error);
  for (const [key, value] of [["sleep_hours", "25"], ["soreness", "6"], ["stress", "2.5"], ["notes", "n".repeat(501)], ["soreness_areas", "unknown"]]) {
    const data = form();
    data.set(key, value);
    assert.ok((await saveCheckIn({}, data)).error, key);
  }
  assert.equal(writes.length, 1);
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
