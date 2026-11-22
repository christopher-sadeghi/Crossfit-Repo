import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative);
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`, mocks) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { toCm, fromCm, lengthUnit } = load("src/lib/units.ts");
const { measurementTrend, checkInDates, progressDateSchema, loadProgressCheckIns } = load("src/lib/measurements.ts");
const athleteId = "41000000-0000-4000-8000-000000000011";
const coachId = "41000000-0000-4000-8000-000000000001";
const photoId = "41000000-0000-4000-8000-000000000020";
const photoPath = `${coachId}/${athleteId}/${photoId}.jpg`;

test("length helpers preserve 0.1-inch editing round trips and centimeter values", () => {
  assert.equal(toCm(32, "lb"), 81.3);
  assert.equal(fromCm(81.3, "lb"), 32);
  for (let n = 1; n < 1500; n++) assert.equal(fromCm(toCm(n / 10, "lb"), "lb"), n / 10);
  assert.equal(toCm(81.3, "kg"), 81.3);
  assert.equal(fromCm(81.3, "kg"), 81.3);
  assert.equal(lengthUnit("lb"), "in");
  assert.equal(lengthUnit("kg"), "cm");
});

test("trends handle empty, single, unsorted and multiple sites without mutating input", () => {
  assert.equal(measurementTrend([], "waist", "lb"), null);
  const rows = [
    { site: "waist", measured_on: "2026-11-20", value_cm: 81.3 },
    { site: "neck", measured_on: "2026-10-01", value_cm: 38.1 },
    { site: "waist", measured_on: "2026-10-20", value_cm: 86.4 },
    { site: "waist", measured_on: "2026-11-01", value_cm: 83.8 },
  ];
  assert.deepEqual(measurementTrend(rows, "waist", "lb"), { latest: 32, date: "2026-11-20", sinceFirst: -2, sincePrevious: -1 });
  assert.equal(measurementTrend(rows, "neck", "kg").sincePrevious, null);
  assert.equal(rows[0].value_cm, 81.3);
  assert.deepEqual(checkInDates(rows, [{ taken_on: "2026-11-20" }, { taken_on: "2026-10-01" }]), ["2026-10-01", "2026-10-20", "2026-11-01", "2026-11-20"]);
});

test("dates reject invalid and future days", () => {
  const schema = progressDateSchema("2026-11-20");
  for (const date of ["", "2026-02-30", "2026-11-21", "invalid"]) assert.equal(schema.safeParse(date).success, false);
  assert.equal(schema.safeParse("2026-11-20").success, true);
  assert.equal(schema.safeParse("2026-01-01").success, true);
});

test("loader supports empty data, missing signed files and database errors", async () => {
  let rows = [];
  let error = null;
  const client = {
    from: (table) => {
      const query = { select: () => query, eq: () => query, lte: () => query, order: () => query,
        limit: async () => ({ data: [], error }), range: async () => ({ data: table === "progress_photos" ? rows : [], error }) };
      return query;
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [{ path: photoPath, error: "not found" }] }) }) },
  };
  assert.deepEqual(await loadProgressCheckIns(client, athleteId, "2026-11-20"), { photos: [], measurements: [], measurementTrendRows: [] });
  rows = [{ storage_path: photoPath }];
  assert.equal((await loadProgressCheckIns(client, athleteId, "2026-11-20")).photos[0].url, null);
  error = new Error("offline");
  await assert.rejects(() => loadProgressCheckIns(client, athleteId, "2026-11-20"));
});

function actions({ kind = "coach", accessError = false, removeError = false, writeError = false, old = null } = {}) {
  const calls = [];
  const query = (table) => {
    let operation = "read";
    const q = {
      select: () => q,
      eq: () => q,
      insert: (row) => { calls.push(["insert", table, row]); operation = "write"; return q; },
      update: (row) => { calls.push(["update", table, row]); operation = "write"; return q; },
      upsert: (row) => { calls.push(["upsert", table, row]); operation = "write"; return q; },
      delete: () => { calls.push(["delete", table]); operation = "write"; return q; },
      maybeSingle: async () => ({ data: old, error: null }),
      single: async () => ({ data: operation === "read" ? { storage_path: photoPath } : { id: photoId }, error: writeError ? new Error("offline") : null }),
      then: (resolve) => Promise.resolve({ error: writeError ? new Error("offline") : null }).then(resolve),
    };
    return q;
  };
  const supabase = {
    from: query,
    storage: { from: () => ({
      info: async () => ({ data: { contentType: "image/jpeg" }, error: null }),
      remove: async (paths) => { calls.push(["remove", paths]); return { error: removeError ? new Error("offline") : null }; },
    }) },
  };
  const api = load("src/app/progress-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/time-zone": { getToday: async () => "2026-11-20" },
    "@/lib/progress-access": { progressAccess: async () => {
      if (accessError) throw new Error("You can't access this athlete.");
      return { supabase, athlete: { coach_id: coachId }, viewer: { kind, units: "lb" } };
    } },
  });
  return { api, calls };
}

test("measurement actions validate empty/future/site/range and save converted cm", async () => {
  const { api, calls } = actions();
  assert.match((await api.saveMeasurements(athleteId, "2026-11-20", {})).error, /at least one/);
  for (const [date, values] of [
    ["2026-11-21", { waist: "32" }], ["2026-11-20", { weight: "32" }],
    ["2026-11-20", { waist: "0" }], ["2026-11-20", { waist: "Infinity" }], ["2026-11-20", { waist: "200" }],
  ]) assert.ok((await api.saveMeasurements(athleteId, date, values)).error);
  assert.equal(calls.length, 0);
  assert.ok((await api.saveMeasurements(athleteId, "2026-11-20", { waist: "32", neck: "" })).message);
  assert.equal(calls[0][2][0].value_cm, 81.3);
  assert.ok((await actions({ accessError: true }).api.saveMeasurements(athleteId, "2026-11-20", { waist: "32" })).error);
  assert.ok((await actions({ writeError: true }).api.saveMeasurements(athleteId, "2026-11-20", { waist: "32" })).error);
});

test("photo actions validate paths and replace old file after row save", async () => {
  const { api, calls } = actions({ old: { id: photoId, storage_path: "old.jpg" } });
  for (const [date, pose, path] of [["2026-11-21", "front", photoPath], ["2026-11-20", "other", photoPath], ["2026-11-20", "front", "other/file.jpg"]]) {
    assert.ok((await api.saveProgressPhoto(athleteId, date, pose, path)).error);
  }
  assert.equal(calls.length, 0);
  assert.equal((await api.saveProgressPhoto(athleteId, "2026-11-20", "front", photoPath)).saved, true);
  assert.equal(calls[0][0], "update");
  assert.deepEqual(calls[1], ["remove", ["old.jpg"]]);
  const failed = actions({ old: { id: photoId, storage_path: "old.jpg" }, removeError: true });
  const result = await failed.api.saveProgressPhoto(athleteId, "2026-11-20", "front", photoPath);
  assert.equal(result.saved, true);
  assert.match(result.error, /previous file/);
});

test("photo delete removes file first and keeps row on Storage failure", async () => {
  const success = actions();
  assert.ok((await success.api.deleteProgressPhoto(athleteId, photoId)).message);
  assert.deepEqual(success.calls.map((call) => call[0]), ["remove", "delete"]);
  const failure = actions({ removeError: true });
  assert.ok((await failure.api.deleteProgressPhoto(athleteId, photoId)).error);
  assert.deepEqual(failure.calls.map((call) => call[0]), ["remove"]);
});

test("reminder actions enforce coach-only, valid cadence, off and starts_on", async () => {
  assert.ok((await actions({ kind: "athlete" }).api.saveProgressReminder(athleteId, "2")).error);
  const { api, calls } = actions();
  assert.ok((await api.saveProgressReminder(athleteId, "3")).error);
  assert.equal(calls.length, 0);
  assert.ok((await api.saveProgressReminder(athleteId, "2")).message);
  assert.equal(calls[0][2].starts_on, "2026-11-20");
  assert.ok((await api.saveProgressReminder(athleteId, "off")).message);
  assert.equal(calls[1][0], "delete");
  const unchanged = actions({ old: { cadence_weeks: 2 } });
  assert.ok((await unchanged.api.saveProgressReminder(athleteId, "2")).message);
  assert.equal(unchanged.calls.length, 0, "saving an unchanged cadence preserves starts_on");
});

test("progress access enforces ownership and active athlete status before writes", async () => {
  async function access(viewer, row) {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error: null }) };
    const { progressAccess } = load("src/lib/progress-access.ts", {
      "@/lib/viewer": { getViewer: async () => viewer },
      "@/lib/supabase/server": { createClient: async () => ({ from: () => q }) },
    });
    return progressAccess(athleteId);
  }
  const row = { id: athleteId, coach_id: coachId, status: "active" };
  assert.equal((await access({ kind: "coach", id: coachId, gymId: coachId, role: "owner" }, row)).athlete.id, athleteId);
  assert.equal((await access({ kind: "athlete", athleteId, coachId }, row)).athlete.id, athleteId);
  for (const [viewer, athlete] of [
    [null, row], [{ kind: "none" }, row], [{ kind: "coach", id: photoId, gymId: photoId, role: "owner" }, row],
    [{ kind: "athlete", athleteId: photoId, coachId }, row],
    [{ kind: "athlete", athleteId, coachId }, { ...row, status: "archived" }],
    [{ kind: "coach", id: coachId, gymId: coachId, role: "owner" }, null],
  ]) await assert.rejects(() => access(viewer, athlete), /access|log in/);
});
