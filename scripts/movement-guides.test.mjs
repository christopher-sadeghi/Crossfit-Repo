import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import { loadDemoDataWithClipCleanup } from "../src/lib/reset-demo-data.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => id in mocks ? mocks[id] : id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { movementGuideSchema, movementGuideEntry, newMovementGuideSchema } = load("src/lib/ai/movement-guides.ts");
const { canSaveDemoCues, demoEmbedUrl, videoUrlSchema, hasGuideText, readGuideText, editedGuideSchema } = load("src/lib/movement-guides.ts");
const { HowTo } = load("src/components/movements/how-to.tsx");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
const blankGuide = { cues: [], common_mistakes: [], easier_versions: [], harder_versions: [] };
const blankDemo = { name: "Thruster", videoUrl: null, clipUrl: null, guide: blankGuide, easier: null, harder: null };
const valid = {
  cues: [" Stand tall. ", "Brace your trunk.", "Move with control."],
  common_mistakes: ["Rounding your back.", "Losing balance."],
  easier_versions: ["Reduce the load."], harder_versions: ["Add load gradually."],
};

test("AI schema accepts and trims plain instructions and rejects empty, excessive, and URL content", () => {
  assert.equal(movementGuideSchema.parse(valid).cues[0], "Stand tall.");
  assert.equal(movementGuideSchema.safeParse({}).success, false);
  for (const key of Object.keys(valid)) {
    assert.equal(movementGuideSchema.safeParse({ ...valid, [key]: [] }).success, false);
    assert.equal(movementGuideSchema.safeParse({ ...valid, [key]: Array(21).fill("Cue") }).success, false);
    for (const bad of ["", " ", "x".repeat(201), "See HTTPS://example.com", "www.example.com", "http", "ftp://demo.test", "example.xyz/demo"]) {
      const items = [...valid[key]];
      items[0] = bad;
      assert.equal(movementGuideSchema.safeParse({ ...valid, [key]: items }).success, false, `${key}: ${bad}`);
    }
  }
});

test("coach edits permit empty sections and form lines are normalized", () => {
  const empty = { cues: [], common_mistakes: [], easier_versions: [], harder_versions: [] };
  assert.equal(editedGuideSchema.safeParse(empty).success, true);
  assert.equal(hasGuideText(null), false);
  assert.equal(hasGuideText(empty), false);
  assert.equal(hasGuideText(valid), true);
  const form = new FormData();
  form.set("cues", " Brace.\r\n\n Stand. ");
  assert.deepEqual(readGuideText(form), { ...empty, cues: ["Brace.", "Stand."] });
});

test("demo reset collects only its coach's custom movement clips before deleting them", async () => {
  const calls = [];
  const clip = "coach/custom/clip.mp4";
  const query = {
    select: (columns) => { calls.push(["select", columns]); return query; },
    eq: (...args) => { calls.push(["eq", ...args]); return query; },
    not: () => query,
    order: () => query,
    range: async () => ({ data: [{ clip_path: clip }] }),
  };
  let rpcError = null;
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "coach" } } }) },
    from: () => query,
    rpc: async (_, params) => {
      calls.push(["rpc", params.reset]);
      return { data: { athletes: 12 }, error: rpcError };
    },
    storage: { from: (bucket) => ({ remove: async (paths) => {
      calls.push(["remove", bucket, ...paths]);
      return { error: null };
    } }) },
  };

  await loadDemoDataWithClipCleanup(client, false);
  assert.deepEqual(calls, [["rpc", false]]);
  const selection = [
    ["select", "clip_path, movement:movements!movement_guides_movement_id_fkey!inner(coach_id)"],
    ["eq", "coach_id", "coach"], ["eq", "movement.coach_id", "coach"],
  ];
  calls.length = 0;
  rpcError = { message: "Reset did not commit." };
  assert.equal((await loadDemoDataWithClipCleanup(client, true)).error, rpcError);
  assert.deepEqual(calls, [...selection, ["rpc", true]]);
  calls.length = 0;
  rpcError = null;
  assert.equal((await loadDemoDataWithClipCleanup(client, true)).clipError, null);
  assert.deepEqual(calls, [...selection, ["rpc", true], ["remove", "movement-demos", clip]]);
});

test("new demos have 3–5 cues and coaches can save non-cue edits to older AI guides", () => {
  const cues = ["Stand tall.", "Brace.", "Move with control.", "Relax.", "Breathe.", "Reset."];
  assert.equal(newMovementGuideSchema.safeParse({ ...valid, cues: cues.slice(0, 5) }).success, true);
  assert.equal(newMovementGuideSchema.safeParse({ ...valid, cues }).success, false);
  assert.equal(movementGuideSchema.safeParse({ ...valid, cues }).success, true);
  assert.equal(canSaveDemoCues(cues.slice(0, 3)), true);
  assert.equal(canSaveDemoCues(cues), false);
  assert.equal(canSaveDemoCues(cues, cues), true);
  assert.equal(canSaveDemoCues(["Changed.", ...cues.slice(1)], cues), false);
});

test("deleting a custom movement removes its clip only after the movement was deleted", async () => {
  const calls = [];
  const id = "00000000-0000-4000-8000-000000000001";
  const clip = `coach/${id}/clip.mp4`;
  let deleteError = null;
  const { deleteMovement } = load("src/app/(app)/programs/movements/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/viewer": { getViewer: async () => ({ kind: "coach", id: "coach" }) },
    "../options": { CATEGORIES: ["other"], MEASURES: ["reps"] },
    "@/lib/supabase/server": { createClient: async () => ({
      from: (table) => table === "movement_guides" ? {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => {
          calls.push("read clip");
          return { data: { clip_path: clip } };
        } }) }) }),
      } : {
        delete: () => ({ eq: () => ({ eq: async () => {
          calls.push("delete movement");
          return { count: deleteError ? 0 : 1, error: deleteError };
        } }) }),
      },
      storage: { from: (bucket) => ({ remove: async (paths) => {
        calls.push([bucket, ...paths]);
        return { error: null };
      } }) },
    }) },
  });
  deleteError = { code: "23503" };
  assert.match((await deleteMovement(id)).error, /used in a WOD/);
  assert.deepEqual(calls, ["read clip", "delete movement"]);
  calls.length = 0;
  deleteError = null;
  assert.deepEqual(await deleteMovement(id), {});
  assert.deepEqual(calls, ["read clip", "delete movement", ["movement-demos", clip]]);
});

test("YouTube and Vimeo URLs embed safely; unrelated and unsafe URLs do not", () => {
  const id = "L219ltL15zk";
  for (const url of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://youtube.com/shorts/${id}`, `https://youtube.com/embed/${id}`]) {
    assert.equal(demoEmbedUrl(url), `https://www.youtube-nocookie.com/embed/${id}`);
  }
  assert.equal(demoEmbedUrl("https://vimeo.com/123456"), "https://player.vimeo.com/video/123456");
  assert.equal(demoEmbedUrl("https://vimeo.com/123456/abc123"), "https://player.vimeo.com/video/123456?h=abc123");
  assert.equal(demoEmbedUrl("https://player.vimeo.com/video/123456?h=abc123"), "https://player.vimeo.com/video/123456?h=abc123");
  for (const url of ["", "javascript:alert(1)", "http://youtube.com/watch?v=" + id, "https://youtube.com.evil.test/watch?v=" + id, "https://example.com/demo", "https://youtube.com/watch?v=invalid"]) assert.equal(demoEmbedUrl(url), null);
  assert.equal(videoUrlSchema.safeParse("https://example.com/unlisted").success, true);
  assert.equal(videoUrlSchema.safeParse("http://example.com/demo").success, false);
});

test("HowTo renders embeds, external links, empty placeholders and escaped cues", () => {
  const render = (videoUrl, guide = blankGuide) => renderToStaticMarkup(createElement(HowTo, { demo: { ...blankDemo, videoUrl, guide } }));
  const empty = render(null);
  assert.match(empty, /No demo video yet/);
  assert.equal((empty.match(/hasn&#x27;t added this yet/g) ?? []).length, 4);
  const coachEmpty = renderToStaticMarkup(createElement(HowTo, {
    demo: blankDemo, emptyMessage: "Not written yet. Ask AI or add it below.",
  }));
  assert.equal((coachEmpty.match(/Not written yet\. Ask AI or add it below\./g) ?? []).length, 4);
  assert.doesNotMatch(coachEmpty, /Your coach/);
  const embedded = render("https://youtu.be/L219ltL15zk", { ...valid, cues: ["<script>bad</script>"] });
  assert.match(embedded, /youtube-nocookie.com\/embed\/L219ltL15zk/);
  assert.match(embedded, /title="Thruster demo video"/);
  assert.match(embedded, /&lt;script&gt;/);
  assert.match(render("https://example.com/demo"), /rel="noopener noreferrer"/);
  assert.doesNotMatch(render("javascript:alert(1)"), /href=|iframe/);
});

test("HowTo renders uploaded video controls and links to variation demos", () => {
  const demo = { ...blankDemo, clipUrl: "https://storage.example/demo.mp4?token=signed",
    easier: { id: "press", name: "Push Press" }, harder: { id: "jerk", name: "Push Jerk" } };
  const text = renderToStaticMarkup(createElement(HowTo, { demo,
    renderVariation: ({ id, name }) => createElement("a", { href: `/athlete/movements/${id}` }, name) }));
  assert.match(text, /<video[^>]*controls/);
  assert.match(text, /demo\.mp4\?token=signed/);
  assert.match(text, /href="\/athlete\/movements\/press">Push Press/);
  assert.match(text, /href="\/athlete\/movements\/jerk">Push Jerk/);
});

test("workout context prefers visible gym variations and filters IDs outside the library", async () => {
  const { loadWorkoutMovementLibrary } = load("src/lib/ai/workout-context.ts");
  const ids = ["original", "easier", "harder", "custom"];
  const mock = {
    from: (table) => ({ select: () => table === "movements" ? {
      order: async () => ({ data: ids.map((id) => ({
        id, easier_movement_id: id === "original" ? "easier" : null, harder_movement_id: id === "original" ? "harder" : null,
      })) }),
    } : {
      or: async () => ({ data: [{ movement_id: "original", easier_movement_id: "custom", harder_movement_id: null },
        { movement_id: "custom", easier_movement_id: "unavailable", harder_movement_id: null }] }),
    } }),
  };
  const library = await loadWorkoutMovementLibrary(mock);
  assert.deepEqual(library[0], { id: "original", easier_movement_id: "custom", harder_movement_id: "harder" });
  assert.equal(library[3].easier_movement_id, null);
});

test("buildRequest uses the exact movement and propagates a missing movement", async () => {
  const movement = { id: "movement", name: "Hang Power Clean", category: "weightlifting", measure: "load" };
  const mock = (result) => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => result }) }) }) });
  const request = await movementGuideEntry.buildRequest(mock({ data: movement }), { athleteId: null, movementId: "movement" });
  assert.equal(request.input.movement_id, movement.id);
  assert.match(request.prompt, /Hang Power Clean/);
  assert.match(request.system, /Never include links/);
  await assert.rejects(() => movementGuideEntry.buildRequest(mock({ data: null, error: new Error() }), { athleteId: null, movementId: "missing" }), /Movement not found/);
  await assert.rejects(() => movementGuideEntry.buildRequest(mock({ data: movement }), { athleteId: null }), /Movement not found/);
});

test("apply publishes only approved arrays and AI reference, without updating the video override", async () => {
  let payload;
  const suggestion = { id: "suggestion", coach_id: "coach", input: { movement_id: "00000000-0000-4000-8000-000000000001" } };
  const mock = (error) => ({ from: (table) => {
    assert.equal(table, "movement_guides");
    return { upsert: (row, options) => {
      payload = row;
      assert.equal(options.onConflict, "coach_id,movement_id");
      return { select: () => ({ single: async () => ({ data: { id: "guide" }, error }) }) };
    } };
  } });
  assert.deepEqual(await movementGuideEntry.apply(mock(), suggestion, valid), { target_table: "movement_guides", target_id: "guide" });
  assert.equal(payload.coach_id, "coach");
  assert.equal(payload.ai_suggestion_id, "suggestion");
  assert.equal("video_url" in payload, false);
  await assert.rejects(() => movementGuideEntry.apply(mock(new Error("db failed")), suggestion, valid), /db failed/);
  await assert.rejects(() => movementGuideEntry.apply(mock(), { ...suggestion, input: {} }, valid));
});
