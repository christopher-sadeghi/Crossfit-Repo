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
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => overrides[id] ?? (id === "recharts"
    ? Object.fromEntries(["CartesianGrid", "Line", "LineChart", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map((name) => [name, name]))
    : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, overrides) : require(id));
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { BenchmarkTrend } = load("src/app/(app)/athletes/[id]/benchmark-trend.tsx");
const point = (extra = {}) => ({ date: "2026-01-01", time_seconds: null, load_kg: null, rounds: null, reps: null, estimatedOneRmKg: null, is_rx: true, ...extra });
function elements(node, type) {
  if (!node || typeof node !== "object") return [];
  return [...(node.type === type ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap((child) => elements(child, type))];
}
function trend(points, extra = {}) {
  const tree = BenchmarkTrend({ points, lift: false, workoutType: "other", units: "kg", ...extra });
  return { rows: elements(tree, "LineChart")[0].props.data, axis: elements(tree, "YAxis")[0].props, lines: elements(tree, "Line"), label: tree.props["aria-label"] };
}
test("strength trends use populated loads, converting units and leaving missing scores as gaps", () => {
  const chart = trend([point({ load_kg: 100 }), point()], { workoutType: "strength", units: "lb" });
  assert.deepEqual(chart.rows.map((p) => p.value), [220.5, null]);
  assert.match(chart.label, /Load \(lb\)/);
  assert.equal(chart.axis.reversed, false);
});
test("other trends select time, load, rounds or reps from actual scores", () => {
  for (const [metric, value] of [["time_seconds", 300], ["load_kg", 100], ["rounds", 0], ["reps", 25]]) {
    const chart = trend([point({ [metric]: value }), point()]);
    assert.deepEqual(chart.rows.map((p) => p.value), [value, null]);
    assert.equal(chart.axis.reversed, metric === "time_seconds");
  }
});
test("time and rounds trends retain their labels, direction and additional reps", () => {
  const timed = trend([point({ time_seconds: 300 })], { workoutType: "for_time" });
  assert.match(timed.label, /lower is better/);
  assert.equal(timed.axis.reversed, true);
  for (const workoutType of ["amrap", "emom"]) {
    const rounds = trend([point({ rounds: 5, reps: 12 }), point({ reps: 10 })], { workoutType });
    assert.deepEqual(rounds.rows.map((p) => p.value), [5, null]);
    assert.equal(rounds.lines[1].props.dataKey, "reps");
  }
});
test("lift and empty trends never fabricate zeroes for absent estimates or scores", () => {
  const chart = trend([point({ estimatedOneRmKg: 110 }), point({ load_kg: 100 })], { lift: true, workoutType: "strength" });
  assert.deepEqual(chart.rows.map((p) => p.value), [110, null]);
  assert.deepEqual(trend([]).rows, []);
  assert.deepEqual(trend([point()]).rows.map((p) => p.value), [null]);
  assert.match(trend([point()]).label, /No plottable scores/);
});

function forms(state = {}) {
  const overrides = {
    react: { ...require("react"), useState: (initial) => [initial, () => {}], useId: () => "test", useActionState: () => [state, () => {}, false] },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "./benchmark-actions": {},
  };
  return load("src/app/(app)/athletes/[id]/benchmark-forms.tsx", overrides);
}
test("result and shared custom/retest forms cancel native resets synchronously, including success and error states", () => {
  for (const state of [{}, { message: "Result saved." }, { error: "Invalid score" }]) {
    const { BenchmarkResultForm, BenchmarkActionForm } = forms(state);
    const result = BenchmarkResultForm({ benchmarks: [{ id: "lift", name: "Squat", kind: "lift", workout_type: "strength" }], athleteId: "a", today: "2026-01-01", units: "kg" });
    const shared = BenchmarkActionForm({ action: () => {}, label: "Save interval", children: null });
    for (const tree of [result, shared]) {
      const target = new EventTarget();
      const cleanup = tree.props.ref(target);
      assert.equal(target.dispatchEvent(new Event("reset", { cancelable: true })), false);
      cleanup();
      assert.equal(target.dispatchEvent(new Event("reset", { cancelable: true })), true);
    }
    const selects = elements(result, "select");
    assert.equal(selects[0].props.value, "lift");
    assert.equal(selects[1].props.value, "1");
  }
  const empty = forms().BenchmarkResultForm({ benchmarks: [], athleteId: "a", today: "2026-01-01", units: "kg" });
  assert.equal(elements(empty, "form").length, 0);
});
