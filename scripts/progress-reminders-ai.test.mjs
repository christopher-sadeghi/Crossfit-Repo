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
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => overrides[id] ?? (id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, overrides)
    : id.startsWith(".") ? load(`${path.resolve(path.dirname(filename), id)}.ts`, overrides) : require(id));
  new Function("require", "module", "exports", source)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const today = "2026-11-22";
const timeZone = { getToday: async () => today, getTimeZone: async () => "UTC" };
const { checkProgressReminders } = load("src/lib/notifications.ts", {
  "@/lib/time-zone": timeZone, "@/lib/athlete-schedule": {}, "@/lib/consistency-data": {},
});
function reminderFixture(rows = [], error = null) {
  const queries = [], filters = [], calls = [];
  const client = {
    from(table) {
      queries.push(table);
      const q = { then: (resolve) => Promise.resolve({ data: rows, error }).then(resolve) };
      for (const method of ["select", "eq", "not", "lte", "order", "limit"]) q[method] = (...args) => { filters.push([method, ...args]); return q; };
      return q;
    },
    rpc: async (_, args) => { calls.push(args); return { error: null }; },
  };
  return { client, queries, filters, calls };
}
const reminder = (id, starts = "2026-11-07", cadence = 2, measured = [], photos = []) => ({
  athlete_id: id, starts_on: starts, cadence_weeks: cadence,
  athlete: { measurements: measured.map((measured_on) => ({ measured_on })), photos: photos.map((taken_on) => ({ taken_on })) },
});

test("reminders batch all athletes, use latest check-in/start, cadence and stable due-date dedupe", async () => {
  const f = reminderFixture([
    reminder("overdue"), reminder("due-today", "2026-11-08"), reminder("four-weeks", "2026-10-25", 4),
    reminder("not-due", "2026-11-09"), reminder("measurement", "2026-11-01", 2, [today]),
    reminder("photo", "2026-11-01", 2, [], ["2026-11-21"]),
    reminder("restarted", today, 2, ["2026-10-01"]),
  ]);
  await checkProgressReminders(f.client, { coachId: "coach" });
  assert.deepEqual(f.queries, ["progress_reminders"]);
  assert.deepEqual(f.calls.map((c) => c.p_dedupe_key), [
    "progress-check-in:overdue:2026-11-21", "progress-check-in:due-today:2026-11-22", "progress-check-in:four-weeks:2026-11-22",
  ]);
  for (const c of f.calls) { assert.equal(c.p_kind, "progress_check_in"); assert.equal(c.p_link, "/athlete/progress"); }
  assert.ok(f.filters.some((f) => f.join() === "eq,coach_id,coach"));
  assert.ok(f.filters.some((f) => f.join() === "eq,athlete.status,active"));
  assert.ok(f.filters.some((f) => f.join() === "not,athlete.user_id,is,"));
  for (const column of ["athlete.measurements.measured_on", "athlete.photos.taken_on"]) {
    assert.ok(f.filters.some((f) => f.join() === `lte,${column},${today}`));
  }
});

test("athlete reminder scope, empty settings and query failures are safe", async () => {
  const f = reminderFixture([reminder("self")]);
  await checkProgressReminders(f.client, { athleteId: "self" });
  assert.ok(f.filters.some((f) => f.join() === "eq,athlete_id,self"));
  assert.equal(f.calls.length, 1);
  const empty = reminderFixture();
  await checkProgressReminders(empty.client, { athleteId: "self" });
  assert.equal(empty.calls.length, 0);
  const failed = reminderFixture([reminder("self")], new Error("offline"));
  const original = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try { await checkProgressReminders(failed.client, { coachId: "coach" }); } finally { console.error = original; }
  assert.equal(failed.calls.length, 0);
  assert.equal(errors.length, 1);
});

const { measurementTrends } = load("src/lib/measurements.ts");
const measurements = [
  { site: "waist", measured_on: "2026-10-25", value_cm: 86.4 },
  { site: "waist", measured_on: today, value_cm: 81.3 },
  { site: "waist", measured_on: "2026-11-08", value_cm: 83.8 },
  { site: "neck", measured_on: today, value_cm: 38.1 },
  { site: "waist", measured_on: "2026-12-01", value_cm: 77 },
];
test("numeric trends isolate sites and as-of dates, convert units, and distinguish missing baselines", () => {
  assert.deepEqual(measurementTrends([], "lb", today), []);
  const rows = measurementTrends(measurements, "lb", today);
  assert.deepEqual(rows[0], { site: "waist", unit: "in", latest: { value: 32, date: today },
    change_since_first: -2, first_date: "2026-10-25", change_since_four_weeks: -2, four_week_baseline_date: "2026-10-25" });
  assert.equal(rows[1].change_since_first, null);
  assert.equal(rows[1].change_since_four_weeks, null);
  assert.equal(measurementTrends(measurements, "kg", today)[0].change_since_first, -5.1);
  assert.equal(measurementTrends(measurements, "lb", "2026-11-01")[0].latest.value, 34);
  assert.equal(measurementTrends([{ site: "waist", measured_on: "2025-01-01", value_cm: 100 }, measurements[1]], "kg", today)[0].change_since_four_weeks, null);
  assert.equal(measurements[0].measured_on, "2026-10-25");
});

function aiFixture(rows = measurements, errorTable) {
  const queries = [], filters = [];
  const client = { from(table) {
    queries.push(table);
    const data = table === "coaches" ? { units: "lb" } : table === "athletes" ? { first_name: "Jamie", experience_level: "intermediate" }
      : table === "body_measurements" ? rows : [];
    const result = { data, error: table === errorTable ? new Error("denied") : null };
    const operations = [];
    const response = () => {
      if (table !== "body_measurements") return result;
      let selected = [...data];
      for (const [method, column, value] of operations) {
        if (method === "eq" && column === "site") selected = selected.filter((row) => row.site === value);
        if (method === "lte" && column === "measured_on") selected = selected.filter((row) => row.measured_on <= value);
        if (method === "order" && column === "measured_on") selected.sort((a, b) => a.measured_on.localeCompare(b.measured_on) * (value?.ascending === false ? -1 : 1));
        if (method === "limit") selected = selected.slice(0, column);
        if (method === "range") selected = selected.slice(column, value + 1);
      }
      return { ...result, data: selected.slice(0, 1000) };
    };
    const q = { then: (resolve) => Promise.resolve(response()).then(resolve),
      single: async () => result, maybeSingle: async () => ({ ...result, data: Array.isArray(data) ? null : data }) };
    for (const method of ["select", "eq", "or", "lte", "order", "limit", "gte", "range"]) q[method] = (...args) => { operations.push([method, ...args]); filters.push([table, method, ...args]); return q; };
    return q;
  } };
  const overrides = {
    "@/lib/time-zone": timeZone,
    "@/lib/benchmarks": { loadLiftMaxes: async () => [], loadAthleteBenchmarks: async () => [] },
    "@/lib/check-in": { CHECK_IN_LABELS: {}, loadRecentCheckIns: async () => [] },
    "@/lib/consistency-data": { loadConsistency: async () => ({ stats: { windows: { 7: {}, 30: {} }, prev30: {} }, attendance: [], schedule: [] }) },
    "./athlete-context": { consistencyContext: async () => ({}), trainingVolume: async () => ({}), weightTrend: () => null, foodAverages: () => ({}) },
  };
  return { client, overrides, queries, filters };
}

test("shared AI loader fetches numeric-only measurements and surfaces failures", async () => {
  const f = aiFixture();
  const { loadProgressData } = load("src/lib/ai/progress-data.ts", f.overrides);
  const data = await loadProgressData(f.client, "a", today);
  assert.deepEqual(data.measurementTrends, measurementTrends(measurements, "lb", today));
  assert.ok(f.filters.some((f) => f.join() === "body_measurements,select,site, measured_on, value_cm"));
  assert.ok(f.filters.some((f) => f.join() === `body_measurements,lte,measured_on,${today}`));
  assert.ok(!f.queries.includes("progress_photos"));
  const failed = aiFixture([], "body_measurements");
  await assert.rejects(load("src/lib/ai/progress-data.ts", failed.overrides).loadProgressData(failed.client, "a", today), /denied/);
});

test("AI and page trends remain current beyond the row cap, including a sparse site's first entry", async () => {
  const { addDays } = load("src/lib/nutrition.ts");
  const history = Array.from({ length: 1500 }, (_, index) => ({
    site: "waist", measured_on: addDays(today, index - 1499), value_cm: Math.round((100 + index / 10) * 10) / 10,
  }));
  history.push({ site: "hips", measured_on: "2020-01-01", value_cm: 99 });
  const f = aiFixture(history);
  const { loadMeasurementTrendRows, measurementTrend } = load("src/lib/measurements.ts");
  const rows = await loadMeasurementTrendRows(f.client, "a", today);
  assert.equal(rows.length, 38);
  const trends = measurementTrends(rows, "kg", today);
  assert.equal(trends[0].latest.value, 249.9);
  assert.equal(trends[0].latest.date, today);
  assert.equal(trends[0].change_since_four_weeks, 2.8);
  assert.equal(trends[0].change_since_first, 149.9);
  assert.equal(trends[0].first_date, history[0].measured_on);
  assert.equal(trends[1].latest.value, 99);
  assert.equal(trends[1].first_date, "2020-01-01");
  assert.deepEqual(measurementTrend(rows, "waist", "kg"), { latest: 249.9, date: today, sinceFirst: 149.9, sincePrevious: 0.1 });
  const ai = await load("src/lib/ai/progress-data.ts", f.overrides).loadProgressData(f.client, "a", today);
  assert.deepEqual(ai.measurementTrends, measurementTrends(rows, "lb", today));
  const pageFixture = aiFixture(history);
  const page = await load("src/lib/measurements.ts").loadProgressCheckIns(pageFixture.client, "a", today);
  assert.deepEqual(page.measurementTrendRows, rows);
  assert.equal(page.measurements.length, 1501);
  assert.equal(page.measurements.at(-1).measured_on, today);
  assert.ok(f.filters.some((f) => f[0] === "body_measurements" && f[1] === "order" && f[3]?.ascending === false));
  assert.ok(f.filters.some((f) => f.join() === "body_measurements,limit,36"));
  assert.ok(f.filters.some((f) => f.join() === "body_measurements,limit,1"));
});

test("both actual AI requests include trends only when present, never photos, and keep schemas valid", async () => {
  for (const rows of [measurements, []]) for (const kind of ["weekly-report", "progress-summary"]) {
    const f = aiFixture(rows);
    const loaded = load(`src/lib/ai/${kind}.ts`, f.overrides);
    const entry = kind === "weekly-report" ? loaded.weeklyReportEntry : loaded.progressSummaryEntry;
    const request = await entry.buildRequest(f.client, { athleteId: "a" });
    assert.equal(request.prompt.includes('"measurement_trends"'), rows.length > 0);
    assert.doesNotMatch(request.prompt, /storage_path|signedUrl|progress_photos|https?:/);
    assert.ok(!f.queries.includes("progress_photos"));
    if (rows.length) assert.match(request.prompt, /"unit":\s*"in"/);
    if (kind === "weekly-report") {
      const schema = load("src/lib/weekly-report.ts").weeklyReportInputSchema;
      assert.equal(schema.safeParse(request.input).success, true);
      entry.validate({ summary: "Steady progress.", focus: ["Keep moving.", "Stay consistent."] });
      assert.throws(() => entry.validate({ summary: "Lost 2 inches.", focus: ["Keep moving.", "Stay consistent."] }));
    } else {
      assert.equal(loaded.progressSummaryInputSchema.safeParse(request.input).success, true);
      assert.equal(loaded.progressSummarySchema.safeParse({ summary: "Steady progress.", goals: [] }).success, true);
    }
  }
});
