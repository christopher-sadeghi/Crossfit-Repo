import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("../src/lib/training-load.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { gymSessionLoad, sessionLoad, shouldWarnAboutLoad, summarizeLoad } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("session load multiplies duration by RPE", () => {
  assert.equal(sessionLoad(90, 8), 720);
});

test("gym scores, fixed AMRAP duration, and estimates contribute", () => {
  assert.deepEqual(gymSessionLoad({ time_seconds: 750, rpe: 9 }, { workout_type: "for_time", time_cap_seconds: 900 }), { load: 112.5, estimated: false });
  assert.deepEqual(gymSessionLoad({ time_seconds: null, rpe: 8 }, { workout_type: "amrap", time_cap_seconds: 1200 }), { load: 160, estimated: false });
  assert.deepEqual(gymSessionLoad({ time_seconds: null, rpe: 8 }, { workout_type: "for_time", time_cap_seconds: 900 }), { load: 120, estimated: true });
  assert.deepEqual(gymSessionLoad({ time_seconds: null, rpe: null }, { workout_type: "strength", time_cap_seconds: null }), { load: 270, estimated: true });
  assert.deepEqual(gymSessionLoad({ time_seconds: 600, rpe: null }, null), { load: 60, estimated: true });
});

test("load windows are inclusive and do not count future sessions", () => {
  const load = summarizeLoad([
    { date: "2026-11-21", kind: "outside", load: 900 },
    { date: "2026-11-15", kind: "gym", load: 300, estimated: true },
    { date: "2026-11-14", kind: "outside", load: 400 },
    { date: "2026-10-25", kind: "gym", load: 400 },
    { date: "2026-10-24", kind: "gym", load: 700 },
    { date: "2026-11-22", kind: "gym", load: 500 },
  ], "2026-11-21");
  assert.equal(load.acute, 1200);
  assert.equal(load.chronic, 500);
  assert.equal(load.ratio, 2.4);
  assert.equal(load.estimatedGymSessions28, 1);
  assert.equal(load.weekly.length, 8);
  assert.deepEqual(load.weekly.at(-1), { from: "2026-11-15", to: "2026-11-21", outside: 900, gym: 300, estimatedGymSessions: 1 });
  assert.equal(summarizeLoad([], "2026-11-21").ratio, null);
});

test("warnings require meaningful acute load and a strictly higher ratio", () => {
  assert.equal(shouldWarnAboutLoad(999, 4), false);
  assert.equal(shouldWarnAboutLoad(1000, 1.5), false);
  assert.equal(shouldWarnAboutLoad(1000, 1.51), true);
  assert.equal(shouldWarnAboutLoad(2000, 2, 2.1), false);
  assert.equal(shouldWarnAboutLoad(0, null), false);
});
