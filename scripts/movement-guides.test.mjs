import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const js = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { movementGuideSchema, movementGuideEntry } = load("src/lib/ai/movement-guides.ts");
const { demoEmbedUrl, videoUrlSchema, hasGuideText, readGuideText, editedGuideSchema } = load("src/lib/movement-guides.ts");
const { HowTo } = load("src/components/movements/how-to.tsx");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");
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
  const render = (videoUrl, guide = null) => renderToStaticMarkup(createElement(HowTo, { name: "Thruster", videoUrl, guide }));
  const empty = render(null);
  assert.match(empty, /No demo video yet/);
  assert.equal((empty.match(/hasn&#x27;t added this yet/g) ?? []).length, 4);
  const coachEmpty = renderToStaticMarkup(createElement(HowTo, {
    name: "Thruster", videoUrl: null, guide: null, emptyMessage: "Not written yet. Ask AI or add it below.",
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

test("buildRequest uses the exact movement and propagates a missing movement", async () => {
  const movement = { id: "movement", name: "Hang Power Clean", category: "weightlifting", measure: "load" };
  const mock = (result) => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => result }) }) }) });
  const request = await movementGuideEntry.buildRequest(mock({ data: movement }), "movement");
  assert.equal(request.input.movement_id, movement.id);
  assert.match(request.prompt, /Hang Power Clean/);
  assert.match(request.system, /Never include links/);
  await assert.rejects(() => movementGuideEntry.buildRequest(mock({ data: null, error: new Error() }), "missing"), /Movement not found/);
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
