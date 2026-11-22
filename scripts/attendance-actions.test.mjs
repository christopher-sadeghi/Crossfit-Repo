import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const athleteId = "33000000-0000-4000-8000-000000000011";
const coachId = "33000000-0000-4000-8000-000000000001";
function fixture({ kind = "coach", ownsAthlete = true, dbError = null } = {}) {
  const writes = [];
  const filters = [];
  const invalidations = [];
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: coachId } } }) },
    from(table) {
      const response = () => ({ data: ownsAthlete ? { id: athleteId } : null, error: table === "athletes" ? null : dbError });
      const query = {
        select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
        insert(row) { writes.push(["insert", row]); return this; },
        update(row) { writes.push(["update", row]); return this; },
        delete() { writes.push(["delete"]); return this; },
        maybeSingle: async () => response(),
        then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); },
      };
      return query;
    },
  };
  const overrides = {
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
    "@/lib/viewer": { getViewer: async () => kind ? { kind, id: coachId } : null },
    "@/lib/time-zone": { getToday: async () => "2026-11-22" },
    "@/lib/supabase/server": { createClient: async () => client },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    const loaded = { exports: {} };
    const js = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = (id) => overrides[id] ?? (id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : require(id));
    new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return { actions: load("src/app/(app)/athletes/[id]/attendance-actions.ts"), settings: load("src/app/(app)/settings/actions.ts"), writes, filters, invalidations };
}
function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ athlete_id: athleteId, attended_on: "2026-11-22", kind: "class", ...extra })) data.set(key, value);
  return data;
}
test("coach marks attendance with database-default ownership and revalidates both viewers", async () => {
  const f = fixture();
  assert.equal((await f.actions.markAttendance({}, form({ note: "  Nice work  " }))).message, "Attendance marked.");
  assert.deepEqual(f.writes, [["insert", { athlete_id: athleteId, attended_on: "2026-11-22", kind: "class", note: "Nice work" }]]);
  assert.ok(f.filters.some(([key, value]) => key === "coach_id" && value === coachId));
  for (const route of ["/attendance", `/athletes/${athleteId}`, "/athlete", "/athlete/history"]) assert.ok(f.invalidations.some(([path]) => path === route));
});
test("optional notes are stored as null and duplicate attendance is friendly", async () => {
  const f = fixture();
  assert.ok((await f.actions.markAttendance({}, form({ kind: "open_gym" }))).message);
  assert.equal(f.writes[0][1].note, null);
  const duplicate = fixture({ dbError: { code: "23505" } });
  assert.match((await duplicate.actions.markAttendance({}, form())).error, /already marked/);
});
test("empty, invalid, future, overlong, unauthorized and unowned requests cannot write", async () => {
  for (const name of ["markAttendance", "removeAttendance"]) {
    for (const extra of [{ attended_on: "" }, { attended_on: "2026-02-30" }, { attended_on: "2026-11-23" }, { kind: "other" }, { athlete_id: "bad" }, { note: "x".repeat(501) }]) {
      const f = fixture();
      assert.ok((await f.actions[name]({}, form(extra))).error);
      assert.equal(f.writes.length, 0);
    }
    for (const options of [{ kind: "athlete" }, { kind: null }, { ownsAthlete: false }]) {
      const f = fixture(options);
      assert.ok((await f.actions[name]({}, form())).error);
      assert.equal(f.writes.length, 0);
    }
    assert.ok((await fixture().actions[name]({}, new FormData())).error);
  }
});
test("removal scopes to athlete, day and session type and database errors are surfaced", async () => {
  const f = fixture();
  assert.equal((await f.actions.removeAttendance({}, form())).message, "Attendance removed.");
  for (const filter of [["athlete_id", athleteId], ["attended_on", "2026-11-22"], ["kind", "class"]]) assert.ok(f.filters.some((entry) => JSON.stringify(entry) === JSON.stringify(filter)));
  for (const name of ["markAttendance", "removeAttendance"]) {
    const failure = fixture({ dbError: { code: "unavailable" } });
    assert.match((await failure.actions[name]({}, form())).error, /Couldn't/);
  }
});
test("settings accept 1–60 whole drift days and reject missing/out-of-range values", async () => {
  for (const days of ["1", "5", "60"]) {
    const f = fixture();
    const data = new FormData();
    for (const [key, value] of Object.entries({ full_name: "Coach", gym_name: "", units: "lb", drift_days: days })) data.set(key, value);
    assert.equal((await f.settings.updateProfile({}, data)).message, "Settings saved.");
    assert.equal(f.writes[0][1].drift_days, Number(days));
  }
  for (const days of ["", "0", "61", "1.5", "abc"]) {
    const f = fixture();
    const data = new FormData();
    for (const [key, value] of Object.entries({ full_name: "Coach", gym_name: "", units: "lb", drift_days: days })) data.set(key, value);
    assert.ok((await f.settings.updateProfile({}, data)).error);
    assert.equal(f.writes.length, 0);
  }
});
