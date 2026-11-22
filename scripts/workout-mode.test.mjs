import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(filename, overrides = {}) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  new Function("require", "module", "exports", js)((id) => overrides[id] ?? (id.startsWith(".") ? load(path.resolve(path.dirname(filename), `${id}.ts`), overrides) : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, overrides) : require(id)), loaded, loaded.exports);
  return loaded.exports;
}
const { timerView, crossedCues, elapsedTime, defaultTimer } = load("src/lib/workout-timer.ts");
const { platesPerSide, roundToLoadable } = load("src/lib/plates.ts");
const { parsePercentages, percentageLoad } = load("src/lib/percent-loads.ts");
const { workoutVersion } = load("src/lib/workout-version.ts");
const { workoutPrefill } = load("src/lib/workout-prefill.ts");

test("prefill validates numbers, strips control characters and limits notes", () => {
  assert.deepEqual(workoutPrefill({ time_seconds: "125", rounds: "3", load: "105.5", is_rx: "scaled", notes: "Hi\u0000" }), { minutes: "2", seconds: "5", rounds: "3", load: "105.5", is_rx: "scaled", notes: "Hi" });
  assert.deepEqual(workoutPrefill({}), {});
  assert.deepEqual(workoutPrefill({ reps: "-1", rounds: ["3"], time_seconds: "Infinity", load: "10001", is_rx: "true" }), {});
  assert.equal(workoutPrefill({ notes: "x".repeat(600) }).notes.length, 500);
});

test("timer countdown, count up, cap, AMRAP and rest boundaries", () => {
  assert.equal(timerView({ mode: "for_time" }, 7000).displaySeconds, 3);
  assert.deepEqual(timerView({ mode: "for_time" }, 15000), { phase: "work", displaySeconds: 5, index: 0, remaining: null });
  assert.equal(timerView({ mode: "for_time", capSeconds: 20 }, 30000).phase, "done");
  assert.equal(timerView({ mode: "amrap", durationSeconds: 60 }, 11001).displaySeconds, 59);
  assert.equal(timerView({ mode: "rest", seconds: 120 }, 10000).phase, "rest");
  assert.throws(() => timerView({ mode: "amrap", durationSeconds: 0 }, 0));
});
test("interval and tabata indexing at exact transitions", () => {
  const emom = { mode: "emom", intervalSeconds: 60, intervals: 3 };
  assert.equal(timerView(emom, 70000).index, 1);
  assert.equal(timerView(emom, 190000).phase, "done");
  const tabata = { mode: "tabata", work: 20, rest: 10, rounds: 8 };
  assert.equal(timerView(tabata, 30000).phase, "rest");
  assert.equal(timerView(tabata, 40000).index, 1);
  assert.equal(timerView(tabata, 250000).phase, "done");
});
test("cue crossing has no duplicates, handles delayed ticks and finish", () => {
  const config = { mode: "emom", intervalSeconds: 60, intervals: 2 };
  assert.deepEqual(crossedCues(config, 6000, 10000).map((c) => c.kind), ["beep", "beep", "beep", "start"]);
  assert.equal(crossedCues(config, 10000, 10000).length, 0);
  assert.equal(crossedCues(config, 10000, 130000).at(-1).kind, "finish");
  assert.equal(crossedCues({ mode: "for_time" }, 10000, 999999).length, 0);
});
test("timestamp clock survives long lock and pause", () => {
  assert.equal(elapsedTime({ startedAt: 1000, pausedAt: null, accumulated: 2000 }, 301000), 302000);
  assert.equal(elapsedTime({ startedAt: 1000, pausedAt: 5000, accumulated: 2000 }, 301000), 6000);
  assert.equal(elapsedTime({ startedAt: null, pausedAt: null, accumulated: 0 }, 100), 0);
});
test("defaults use caps, rounds, tabata detection and strength rest", () => {
  const w = { workout_type: "emom", rounds: null, time_cap_seconds: 900, title: "WOD" };
  assert.equal(defaultTimer(w).intervals, 15);
  assert.equal(defaultTimer({ ...w, workout_type: "other", title: "Tabata" }).rounds, 8);
  assert.equal(defaultTimer({ ...w, workout_type: "strength" }).seconds, 120);
});
test("plate calculator supports kg, lb, minimum bar and unloadable remainder", () => {
  assert.deepEqual(platesPerSide(102.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25]), { plates: [25, 15, 1.25], remainder: 0 });
  assert.deepEqual(platesPerSide(135, 45, [45, 35, 25, 10, 5, 2.5]), { plates: [45], remainder: 0 });
  assert.equal(platesPerSide(22, 20, [1.25]).remainder, 2);
  assert.equal(platesPerSide(15, 20, [1.25]).remainder, -5);
  assert.equal(roundToLoadable(101, 20, [25, 1.25]), 100);
  assert.equal(roundToLoadable(0, 20, [1.25]), 20);
  assert.throws(() => platesPerSide(100, 20, []));
  assert.throws(() => roundToLoadable(NaN, 20, [1.25]));
});
test("percentage prescriptions, ranges, progression and conversion", () => {
  assert.deepEqual(parsePercentages("5x3 @ 75%", 5), [75, 75, 75, 75, 75]);
  assert.deepEqual(parsePercentages("5x3 @ 75%"), [75, 75, 75, 75, 75]);
  assert.deepEqual(parsePercentages("65/70/75%", 3), [65, 70, 75]);
  assert.deepEqual(parsePercentages("65/70/75%"), [65, 70, 75]);
  assert.deepEqual(parsePercentages("70-75%", 3), [70, 72.5, 75]);
  assert.deepEqual(parsePercentages(null), []);
  assert.deepEqual(parsePercentages("@999%"), []);
  assert.equal(percentageLoad(100, 75, "kg", 20).weight, 75);
  assert.equal(percentageLoad(100, 75, "lb", 45).weight, 165);
  assert.throws(() => percentageLoad(0, 75, "kg", 20));
});
test("version resolves date-limited athlete adjustments and coach fallback", () => {
  const base = { movements: [], rounds: 5, time_cap_seconds: 600 };
  assert.equal(workoutVersion(base, null, "2026-01-01").isScaled, false);
  const details = { source: "ai", suggestion_id: "12345678-1234-4234-8234-123456789012", scheduled_on: "2026-01-01", movements: [{ original_movement_id: "a", movement_id: "b", movement_name: "Squat", sets: 3, reps: 5, load_kg: 50, distance_m: null, calories: null, duration_seconds: null, reason: "Scale" }], rounds: 3, time_cap_seconds: null };
  const scaling = { modifications: "Scaled", details, athlete_adjusted_at: "now", coach_modifications: null, coach_details: null };
  const resolved = workoutVersion(base, scaling, "2026-01-01");
  assert.equal(resolved.movements[0].movement_id, "b");
  assert.equal(resolved.rounds, 3);
  assert.equal(resolved.time_cap_seconds, null);
  assert.equal(workoutVersion(base, scaling, "2026-01-02").isScaled, false);
  assert.equal(workoutVersion(base, { ...scaling, coach_modifications: "Coach", coach_details: {} }, "2026-01-02").modifications, "Coach");
  assert.equal(workoutVersion(base, { ...scaling, details: {} }, "2026-01-01").rounds, 5);
});

test("workout route gates by viewer, single-date schedule, and resolves scaling", async () => {
  const calls = [];
  let scheduled = true;
  let viewer = { kind: "athlete", athleteId: "a", units: "kg" };
  let failure = null;
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: failure }; } };
  const workout = { id: "w", title: "WOD", workout_type: "amrap", rounds: 5, time_cap_seconds: 600, workout_movements: [] };
  const { default: Page } = load("src/app/athlete/workout/[workoutId]/page.tsx", {
    "next/navigation": { notFound() { throw new Error("not found"); }, redirect(path) { throw new Error(`redirect ${path}`); } },
    "@/lib/viewer": { getViewer: async () => viewer },
    "@/lib/time-zone": { getToday: async () => "2026-01-01" },
    "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) },
    "@/lib/athlete-schedule": { loadAthleteSchedule: async (_client, id, range) => { calls.push({ id, range }); return scheduled ? [{ workout }] : []; } },
    "@/lib/benchmarks": { loadLiftMaxes: async () => [] },
    "./workout-mode": { WorkoutMode: "workout-mode" },
  });
  const render = (date) => Page({ params: Promise.resolve({ workoutId: "w" }), searchParams: Promise.resolve(date ? { date } : {}) });
  assert.equal((await render()).props.date, "2026-01-01");
  assert.deepEqual(calls[0], { id: "a", range: { from: "2026-01-01", to: "2026-01-01" } });
  assert.equal((await render("2025-12-31")).props.date, "2025-12-31");
  await assert.rejects(render("2026-02-31"), /not found/);
  scheduled = false;
  await assert.rejects(render(), /not found/);
  scheduled = true; failure = new Error("database unavailable");
  await assert.rejects(render(), /Couldn't load your workout version/);
  viewer = { kind: "coach" };
  await assert.rejects(render(), /redirect \//);
  viewer = null;
  await assert.rejects(render(), /redirect \/login/);
});

test("result form prefills new results but preserves edited results and validation errors", () => {
  let state = {};
  const { AthleteResultForm } = load("src/app/athlete/log/[workoutId]/result-form.tsx", {
    react: { ...require("react"), useActionState: () => [state, () => {}, false] },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "@/app/(app)/programs/workouts/log-result-form": { FIELDS: { other: ["time", "rounds", "reps", "load"] } },
    "../../actions": {},
  });
  const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
  const props = { workoutId: "w", workoutType: "other", today: "2026-01-01", minDate: "2025-12-18", defaultDate: "2026-01-01", units: "kg", existingResult: null, prefill: { minutes: "2", rounds: "3", load: "105", notes: "Sets", is_rx: "scaled" } };
  const values = (extra = {}) => Object.fromEntries(elements(AthleteResultForm({ ...props, ...extra })).filter((e) => e.type === "input" || e.type === "textarea").map((e) => [e.props.name === "is_rx" ? `is_rx_${e.props.value}` : e.props.name, e.props.name === "is_rx" ? e.props.defaultChecked : e.props.defaultValue]));
  assert.equal(values().minutes, "2");
  assert.equal(values().load, "105");
  assert.equal(values().is_rx_scaled, true);
  assert.equal(values({ existingResult: { id: "r", time_seconds: 300, load_kg: 90, is_rx: true, notes: "Original" } }).notes, "Original");
  assert.equal(values({ existingResult: { id: "r", time_seconds: 300, load_kg: 90, is_rx: true, notes: "Original" } }).minutes, "5");
  state = { error: "Invalid", values: { notes: "Retry", load: "80" } };
  assert.equal(values().notes, "Retry");
});
