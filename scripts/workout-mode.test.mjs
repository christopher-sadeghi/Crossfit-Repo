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
const { timerView, crossedCues, elapsedTime, defaultTimer, timerForSection } = load("src/lib/workout-timer.ts");
const { platesPerSide, roundToLoadable } = load("src/lib/plates.ts");
const { parsePercentages, percentageLoad } = load("src/lib/percent-loads.ts");
const { workoutVersion } = load("src/lib/workout-version.ts");
const { workoutPrefill } = load("src/lib/workout-prefill.ts");

const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
function workoutHarness(extra = {}) {
  const states = [], refs = [];
  let stateIndex, refIndex, effects;
  const navigations = [];
  const props = { athleteId: "a", date: "2026-01-01", units: "kg", maxes: [], workout: { id: "w", title: "WOD", workout_type: "for_time", time_cap_seconds: 600, rounds: 5, movements: [], isScaled: false }, ...extra };
  const { WorkoutMode } = load("src/app/athlete/workout/[workoutId]/workout-mode.tsx", {
    react: {
      useEffect: (effect) => { effects.push(effect); },
      useRef: (value) => refs[refIndex++] ??= { current: value },
      useState(value) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof value === "function" ? value() : value;
        return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
      },
    },
    "next/link": { default: "a" },
    "next/navigation": { useRouter: () => ({ push: (url) => navigations.push(url) }) },
    "@/components/movements/movement-demo-sheet": { MovementDemoSheet: "movement-demo" },
  });
  const render = () => { stateIndex = 0; refIndex = 0; effects = []; return WorkoutMode(props); };
  render();
  return { states, navigations, render, effects: () => effects, props };
}

function withWorkoutStorage(run) {
  const previous = globalThis.localStorage;
  const previousSession = globalThis.sessionStorage;
  const records = new Map();
  const sessionRecords = new Map();
  globalThis.localStorage = { getItem: (key) => records.get(key) ?? null, setItem: (key, value) => records.set(key, value), removeItem: (key) => records.delete(key) };
  globalThis.sessionStorage = { getItem: (key) => sessionRecords.get(key) ?? null, setItem: (key, value) => sessionRecords.set(key, value), removeItem: (key) => sessionRecords.delete(key) };
  try { run(records, sessionRecords); } finally {
    if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous;
    if (previousSession === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previousSession;
  }
}

test("finish retains paused progress until a result newer than the session is saved", () => withWorkoutStorage((records) => {
  const h = workoutHarness();
  h.states[0] = { ...h.states[0], reps: 42, clock: { startedAt: Date.now() - 30000, pausedAt: null, accumulated: 0 } };
  h.states[1] = true;
  elements(h.render()).find((node) => node.type === "button" && node.props.children === "Finish & review result").props.onClick();
  const [key, raw] = [...records][0];
  const saved = JSON.parse(raw);
  assert.equal(saved.reps, 42);
  assert.ok(saved.clock.pausedAt);
  const restored = workoutHarness({ latestResultCreatedAt: null });
  restored.effects()[0]();
  assert.equal(restored.states[0].reps, 42);
  const olderResult = workoutHarness({ latestResultCreatedAt: new Date(saved.createdAt - 1000).toISOString() });
  olderResult.effects()[0]();
  assert.equal(olderResult.states[0].reps, 42);
  const logged = workoutHarness({ latestResultCreatedAt: new Date(saved.createdAt + 1000).toISOString() });
  logged.effects()[0]();
  assert.equal(logged.states[0].reps, 0);
  assert.equal(records.has(key), false);
}));

test("capped For Time handoff includes cap time plus reps accepted by buildScore", () => {
  const h = workoutHarness();
  h.states[0] = { ...h.states[0], reps: 42, clock: { startedAt: Date.now() - 611000, pausedAt: null, accumulated: 0 } };
  h.states[1] = true;
  const finish = elements(h.render()).find((node) => node.type === "button" && node.props.children === "Finish & review result");
  finish.props.onClick();
  const query = Object.fromEntries(new URL(h.navigations[0], "https://example.test").searchParams);
  assert.equal(query.time_seconds, "600");
  assert.equal(query.reps, "42");
  const { buildScore, scoreSchema } = load("src/lib/result-score.ts");
  assert.deepEqual(buildScore(scoreSchema.parse(workoutPrefill(query)), "for_time", "kg"), { score: { time_seconds: 600, reps: 42, rounds: null, load_kg: null } });
});

test("section timers use section caps and reset only the clock", () => {
  assert.deepEqual(
    timerForSection({ format: "amrap", time_cap_seconds: 1200 }),
    { mode: "amrap", durationSeconds: 1200 },
  );
  assert.deepEqual(
    timerForSection({ format: "for_time", time_cap_seconds: 900 }),
    { mode: "for_time", capSeconds: 900 },
  );
  assert.deepEqual(
    timerForSection({ format: "emom", time_cap_seconds: 720 }),
    { mode: "emom", intervalSeconds: 60, intervals: 12 },
  );
  assert.equal(timerForSection({ format: "emom", time_cap_seconds: null }), null);
  assert.equal(timerForSection({ format: "other", time_cap_seconds: 600 }), null);

  const section = { title: "C. AMRAP", format: "amrap", time_cap_seconds: 1200, rounds: null };
  const h = workoutHarness({
    workout: {
      id: "w",
      title: "WOD",
      workout_type: "other",
      time_cap_seconds: null,
      rounds: null,
      sections: [section],
      movements: [
        {
          movement_id: "10000000-0000-4000-8000-000000000001",
          name: "Row",
          sets: 3,
          reps: 10,
          load_kg: null,
          section: 0,
        },
      ],
      isScaled: false,
    },
  });
  h.states[0] = {
    ...h.states[0],
    clock: { startedAt: Date.now() - 5000, pausedAt: null, accumulated: 0 },
    done: ["0-0"],
    weights: { "0-0": 43 },
  };
  h.states[1] = true;
  elements(h.render())
    .find((node) => node.type === "button" && node.props.children === "Time this section")
    .props.onClick();
  assert.deepEqual(h.states[0].config, { mode: "amrap", durationSeconds: 1200 });
  assert.deepEqual(h.states[0].clock, { startedAt: null, pausedAt: null, accumulated: 0 });
  assert.deepEqual(h.states[0].done, ["0-0"]);
  assert.deepEqual(h.states[0].weights, { "0-0": 43 });

  h.states[0] = {
    ...h.states[0],
    clock: { startedAt: Date.now() - 5000, pausedAt: null, accumulated: 0 },
  };
  elements(h.render())
    .find((node) => node.type === "button" && node.props.children === "Reset timer")
    .props.onClick();
  assert.deepEqual(h.states[0].config, { mode: "amrap", durationSeconds: 1200 });
  assert.deepEqual(h.states[0].clock, { startedAt: null, pausedAt: null, accumulated: 0 });
  assert.deepEqual(h.states[0].done, ["0-0"]);
  assert.deepEqual(h.states[0].weights, { "0-0": 43 });
});

test("finish hands off completed part sets through session storage", () => withWorkoutStorage((_records, sessionRecords) => {
  const movementId = "10000000-0000-4000-8000-000000000001";
  const h = workoutHarness({
    workout: {
      id: "w",
      title: "WOD",
      workout_type: "strength",
      time_cap_seconds: null,
      rounds: null,
      movements: [{ movement_id: movementId, name: "Back Squat", sets: 3, reps: 5, load_kg: 100 }],
      isScaled: false,
    },
  });
  h.states[0] = { ...h.states[0], weights: { "0-0": 100, "0-1": 105, "0-2": 110 }, done: ["0-0", "0-2"] };
  h.states[1] = true;
  elements(h.render()).find((node) => node.type === "button" && node.props.children === "Finish & review result").props.onClick();
  const query = new URL(h.navigations[0], "https://example.test").searchParams;
  const token = query.get("parts_handoff");
  assert.ok(token);
  assert.equal(query.has("load"), false);
  assert.equal(query.has("summary"), false);
  assert.deepEqual(
    JSON.parse(sessionRecords.get(`workout-result-parts:${token}`))[0].sets,
    [
      { reps: 5, load_kg: 100, done: true },
      { reps: 5, load_kg: 105, done: false },
      { reps: 5, load_kg: 110, done: true },
    ],
  );
}));

test("non-strength handoff keeps default completion and only uses the first entered load", () => withWorkoutStorage((_records, sessionRecords) => {
  const movementId = "10000000-0000-4000-8000-000000000001";
  const h = workoutHarness({
    workout: {
      id: "w",
      title: "WOD",
      workout_type: "for_time",
      time_cap_seconds: 600,
      rounds: null,
      movements: [{ movement_id: movementId, name: "Row", sets: 3, reps: 5, load_kg: 100 }],
      isScaled: false,
    },
  });
  h.states[0] = {
    ...h.states[0],
    weights: { "0-0": 110, "0-1": 120 },
    done: [],
  };
  h.states[1] = true;
  elements(h.render()).find((node) => node.type === "button" && node.props.children === "Finish & review result").props.onClick();
  const query = new URL(h.navigations[0], "https://example.test").searchParams;
  const token = query.get("parts_handoff");
  assert.ok(token);
  assert.deepEqual(
    JSON.parse(sessionRecords.get(`workout-result-parts:${token}`))[0].sets,
    [
      { reps: 5, load_kg: 110, done: true },
      { reps: 5, load_kg: 100, done: true },
      { reps: 5, load_kg: 100, done: true },
    ],
  );
}));

test("non-strength lb handoff converts planned loads to pounds", () => withWorkoutStorage((_records, sessionRecords) => {
  const movementId = "10000000-0000-4000-8000-000000000001";
  const h = workoutHarness({
    units: "lb",
    workout: {
      id: "w",
      title: "WOD",
      workout_type: "for_time",
      time_cap_seconds: 600,
      rounds: null,
      movements: [{ movement_id: movementId, name: "Row", sets: 2, reps: 8, load_kg: 50 }],
      isScaled: false,
    },
  });
  h.states[1] = true;
  elements(h.render()).find((node) => node.type === "button" && node.props.children === "Finish & review result").props.onClick();
  const query = new URL(h.navigations[0], "https://example.test").searchParams;
  const token = query.get("parts_handoff");
  assert.ok(token);
  assert.deepEqual(
    JSON.parse(sessionRecords.get(`workout-result-parts:${token}`))[0].sets,
    [
      { reps: 8, load_kg: 110.2, done: true },
      { reps: 8, load_kg: 110.2, done: true },
    ],
  );
}));

test("saved display-unit weights are isolated by units", () => withWorkoutStorage((records) => {
  const kg = workoutHarness({ units: "kg" });
  kg.states[0] = { ...kg.states[0], weights: { "0-0": 100 }, reps: 10 };
  kg.states[1] = true;
  kg.render(); kg.effects()[1]();
  assert.ok([...records.keys()][0].endsWith(":kg"));
  const lb = workoutHarness({ units: "lb" });
  lb.effects()[0]();
  assert.deepEqual(lb.states[0].weights, {});
  const restored = workoutHarness({ units: "kg" });
  restored.effects()[0]();
  assert.deepEqual(restored.states[0].weights, { "0-0": 100 });
}));

test("changed movement ordering or scaling invalidates saved progress and Rx", () => withWorkoutStorage((records) => {
  const movements = [{ movement_id: "a", sets: 3, reps: 5, load_kg: null, notes: "@75%" }, { movement_id: "b", sets: 2, reps: 10, load_kg: null, notes: null }];
  const original = workoutHarness();
  original.props.workout = { ...original.props.workout, movements };
  original.render();
  original.effects()[0]();
  original.render();
  original.states[0] = { ...original.states[0], reps: 42, weights: { "0-0": 100 }, done: ["0-0"] };
  original.render(); original.effects()[1]();
  const [key, saved] = [...records][0];
  for (const workout of [{ ...original.props.workout, movements: [...movements].reverse() }, { ...original.props.workout, isScaled: true }, { ...original.props.workout, movements: [{ ...movements[0], sets: 5 }, movements[1]] }]) {
    records.set(key, saved);
    const changed = workoutHarness({ workout });
    changed.effects()[0]();
    assert.equal(changed.states[0].reps, 0);
    assert.deepEqual(changed.states[0].weights, {});
    assert.deepEqual(changed.states[0].done, []);
    assert.equal(changed.states[0].rx, !workout.isScaled);
    assert.match(changed.states[2], /version changed/);
  }
}));

test("workout mode shows instructions, coach notes and the prescribed rounds target", () => {
  const h = workoutHarness();
  h.props.workout = { ...h.props.workout, description: "Complete in order\nStay smooth", notes: "Coach: full depth", rounds: 5 };
  h.states[0] = { ...h.states[0], rounds: 3 };
  h.states[1] = true;
  const nodes = elements(h.render());
  assert.ok(nodes.some((node) => node.props.children === h.props.workout.description));
  assert.ok(nodes.some((node) => node.props.children === h.props.workout.notes));
  assert.ok(nodes.some((node) => JSON.stringify(node.props.children) === JSON.stringify([3, " / 5", " rounds"])));
  h.props.workout = { ...h.props.workout, description: null, notes: null, rounds: null };
  assert.equal(elements(h.render()).some((node) => node.props["aria-label"] === "Workout instructions"), false);
});

test("strength plates are shown for each set's edited weight, not just set one", () => {
  const h = workoutHarness();
  h.props.workout = { ...h.props.workout, workout_type: "strength", movements: [{ movement_id: "a", name: "Squat", sets: 3, reps: 3, load_kg: null, notes: null }] };
  h.states[0] = { ...h.states[0], weights: { "0-0": 100, "0-1": 105, "0-2": 110 } };
  h.states[1] = true;
  const plates = elements(h.render()).filter((node) => node.type.name === "PlateDisplay");
  assert.deepEqual(plates.map((node) => node.props.weight), [100, 105, 110]);
  for (const plate of plates) assert.equal(plate.type(plate.props).type, "p");
  h.states[0] = { ...h.states[0], weights: {} };
  assert.equal(elements(h.render()).filter((node) => node.type.name === "PlateDisplay").length, 0);
});

test("AI-adjusted EMOM retains reason guidance and prefers an explicit scaled load over percentages", () => {
  const { fromKgPrecise } = load("src/lib/units.ts");
  const base = { id: "w", title: "EMOM", workout_type: "emom", time_cap_seconds: 600, rounds: 10, description: "@90%", movements: [{ movement_id: "squat", name: "Back Squat", sets: 1, reps: 5, load_kg: 100, notes: "@75%" }] };
  const reason = "Use about 130 lb today to keep the squats comfortable.";
  const movement = { original_movement_id: "squat", movement_id: "squat", movement_name: "Back Squat", sets: 1, reps: 3, distance_m: null, calories: null, duration_seconds: null, reason };
  const scaling = { modifications: "Easier today", athlete_adjusted_at: "2026-01-01T10:00:00Z", coach_modifications: null, coach_details: null, details: { source: "ai", suggestion_id: "12345678-1234-4234-8234-123456789012", scheduled_on: "2026-01-01", movements: [] } };
  for (const load_kg of [null, 58.97]) {
    const workout = workoutVersion(base, { ...scaling, details: { ...scaling.details, movements: [{ ...movement, load_kg }] } }, "2026-01-01");
    assert.equal(workout.movements[0].reason, reason);
    assert.equal(workout.movements[0].load_kg, load_kg);
    const h = workoutHarness({ workout, units: "lb", maxes: load_kg == null ? [] : [{ movement_id: "squat", oneRmKg: 200 }] });
    h.states[1] = true;
    const nodes = elements(h.render());
    assert.ok(nodes.some((node) => node.type === "p" && node.props.children === reason));
    const input = nodes.find((node) => node.type === "input" && node.props["aria-label"] === "Back Squat working weight (lb)");
    assert.equal(input.props.value, load_kg == null ? "" : fromKgPrecise(load_kg, "lb"));
    if (load_kg != null) assert.ok(nodes.some((node) => node.type.name === "PlateDisplay" && node.props.weight === 130));
  }
  const unscaled = workoutHarness({ workout: { ...base, isScaled: false } });
  unscaled.states[1] = true;
  assert.equal(elements(unscaled.render()).some((node) => node.type === "p" && node.props.children === reason), false);
});

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

test("scaled movements retain original prescription notes without falling back for sets or reps", () => {
  const original = { movement_id: "a", name: "Squat", notes: "5x3 @75%", sets: 5, reps: 3, load_kg: null };
  const base = { movements: [{ ...original, movement_id: "unrelated", notes: "@50%" }, original], rounds: null, time_cap_seconds: null };
  const scaledMovement = { original_movement_id: "a", movement_id: "b", movement_name: "Front squat", sets: null, reps: null, load_kg: null, distance_m: null, calories: null, duration_seconds: null, reason: "Scale" };
  const scaling = { modifications: "Scaled", athlete_adjusted_at: null, coach_modifications: null, coach_details: null, details: { source: "ai", suggestion_id: "12345678-1234-4234-8234-123456789012", movements: [scaledMovement, { ...scaledMovement, original_movement_id: "missing" }] } };
  const version = workoutVersion(base, scaling, "2026-01-01");
  assert.equal(version.movements[0].notes, "5x3 @75%");
  assert.equal(version.movements[0].sets, null);
  assert.equal(version.movements[0].reps, null);
  assert.equal(version.movements[1].notes, null);
  assert.equal(workoutVersion({ ...base, movements: [] }, scaling, "2026-01-01").movements[0].notes, null);
});

test("timer settings display minutes and store seconds for caps and strength rest", () => {
  const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
  for (const [workoutType, key, initial, minutes] of [["for_time", "capSeconds", 10, "12.5"], ["strength", "seconds", 2, "1.5"]]) {
    let stateIndex = 0;
    const { WorkoutMode } = load("src/app/athlete/workout/[workoutId]/workout-mode.tsx", {
      react: { useEffect() {}, useRef: (value) => ({ current: value }), useState: (value) => [stateIndex++ === 1 ? true : typeof value === "function" ? value() : value, () => {}] },
      "next/link": { default: "a" },
      "next/navigation": { useRouter: () => ({}) },
      "@/components/movements/movement-demo-sheet": { MovementDemoSheet: "movement-demo" },
    });
    const tree = WorkoutMode({ athleteId: "a", date: "2026-01-01", units: "kg", maxes: [], workout: { id: "w", title: "WOD", workout_type: workoutType, time_cap_seconds: 600, rounds: null, movements: [], isScaled: false } });
    const settings = elements(tree).find((node) => node.type.name === "TimerSettings");
    const config = settings.props.config;
    let changed;
    const labels = settings.type({ config, onChange: (value) => { changed = value; } });
    const label = labels.find((node) => node.key === key);
    assert.match(label.props.children[0], /minutes/);
    const input = elements(label).find((node) => node.type === "input");
    assert.equal(input.props.value, initial);
    input.props.onChange({ target: { value: minutes } });
    assert.equal(changed[key], Number(minutes) * 60);
    if (key === "capSeconds") {
      input.props.onChange({ target: { value: "" } });
      assert.equal(changed.capSeconds, undefined);
    }
    changed = undefined;
    input.props.onChange({ target: { value: "-1" } });
    assert.equal(changed, undefined);
  }
});

test("workout route gates by viewer, single-date schedule, and resolves scaling", async () => {
  const calls = [];
  let scheduled = true;
  let viewer = { kind: "athlete", athleteId: "a", units: "kg" };
  let failure = null;
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: null, error: failure }; } };
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
    react: {
      ...require("react"),
      useActionState: () => [state, () => {}, false],
      useState: (value) => [typeof value === "function" ? value() : value, () => {}],
      useEffect: () => {},
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "@/components/result-parts-editor": { ResultPartsEditor: "result-parts-editor" },
    "@/components/workout-result-parts-display": { WorkoutResultPartsDisplay: "parts-display" },
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
