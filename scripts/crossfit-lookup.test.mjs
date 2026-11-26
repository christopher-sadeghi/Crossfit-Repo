import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();

function load(relative, mocks = {}) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const js = ts.transpileModule(require("node:fs").readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id) => id in mocks ? mocks[id] : require(id);
  new Function("require", "module", "exports", js)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const { extractCrossfitVideoId, lookupCrossfitVideo, matchCrossfitSlug } = load("src/lib/crossfit-lookup.ts", {
  "server-only": {},
});

test("matchCrossfitSlug handles exact, plural, modifier, and unmatched names", () => {
  assert.equal(matchCrossfitSlug("Back Squat", ["back-squat", "the-back-squat"]), "the-back-squat");
  assert.equal(matchCrossfitSlug("Wall Balls", ["the-wall-ball"]), "the-wall-ball");
  assert.equal(matchCrossfitSlug("Pull-Up", ["the-strict-pull-up", "the-kipping-pull-up"]), "the-strict-pull-up");
  assert.equal(matchCrossfitSlug("Clean", ["the-dumbbell-clean", "the-power-clean"]), null);
  assert.equal(matchCrossfitSlug("Run", ["running-a-gym-in-2020", "running-fundamentals"]), null);
  assert.equal(matchCrossfitSlug("Sled Push", []), null);
  assert.equal(matchCrossfitSlug("Dumbbell Power Snatch", ["the-dumbbell-power-snatch"]), "the-dumbbell-power-snatch");
  assert.equal(matchCrossfitSlug("Clean & Jerks", ["the-clean-and-jerk"]), "the-clean-and-jerk");
});

test("extractCrossfitVideoId accepts YouTube and YouTube-nocookie embeds", () => {
  assert.equal(extractCrossfitVideoId('<iframe src="https://www.youtube.com/embed/QmZAiBqPvZw"></iframe>'), "QmZAiBqPvZw");
  assert.equal(extractCrossfitVideoId('<iframe src="https://www.youtube-nocookie.com/embed/AbCdEfGhIjK?rel=0"></iframe>'), "AbCdEfGhIjK");
  assert.equal(extractCrossfitVideoId("<p>No embedded video</p>"), null);
});

async function withMockFetch(mockFetch, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("lookupCrossfitVideo fetches only the matched CrossFit pages and returns the YouTube video", async () => {
  const calls = [];
  await withMockFetch(async (url, options) => {
    calls.push({ url: String(url), options });
    const body = calls.length === 1
      ? "<url><loc>https://www.crossfit.com/essentials/the-dumbbell-power-snatch</loc></url>"
      : '<iframe src="https://www.youtube-nocookie.com/embed/QmZAiBqPvZw"></iframe>';
    return new Response(body, { status: 200 });
  }, async () => {
    assert.deepEqual(await lookupCrossfitVideo("Dumbbell Power Snatch"), {
      crossfitUrl: "https://www.crossfit.com/essentials/the-dumbbell-power-snatch",
      videoUrl: "https://www.youtube.com/watch?v=QmZAiBqPvZw",
    });
  });

  assert.deepEqual(calls.map(({ url }) => new URL(url).host), ["www.crossfit.com", "www.crossfit.com"]);
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
    "/essentials-sitemap.xml",
    "/essentials/the-dumbbell-power-snatch",
  ]);
  for (const { options } of calls) {
    assert.equal(options.next.revalidate, 86400);
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal(options.redirect, "manual");
  }
});

test("lookupCrossfitVideo returns null when the sitemap fails", async () => {
  let calls = 0;
  await withMockFetch(async () => {
    calls += 1;
    return new Response("", { status: 503 });
  }, async () => {
    assert.equal(await lookupCrossfitVideo("Dumbbell Power Snatch"), null);
  });
  assert.equal(calls, 1);
});

test("lookupCrossfitVideo returns null when the matching page has no embedded video", async () => {
  let calls = 0;
  await withMockFetch(async () => {
    calls += 1;
    return new Response(calls === 1
      ? "<url><loc>https://www.crossfit.com/essentials/the-sandbag-clean</loc></url>"
      : '<a href="https://www.youtube.com/watch?v=QmZAiBqPvZw">watch</a>', { status: 200 });
  }, async () => {
    assert.equal(await lookupCrossfitVideo("Sandbag Clean"), null);
  });
  assert.equal(calls, 2);
});

const actionMovementId = "0ab2e57b-2cb5-43ad-9ec4-018239f53bb7";
const actionGymId = "3d47ae5f-16a1-4c05-ab44-9b5c8f296e21";
let actionState;

function createSupabaseMock() {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const builder = {
        update(values) {
          call.method = "update";
          call.values = values;
          return builder;
        },
        upsert(values, options) {
          call.method = "upsert";
          call.values = values;
          call.options = options;
          return builder;
        },
        eq(column, value) {
          call.filters.push([column, value]);
          return builder;
        },
        select(columns) {
          call.returning = columns;
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: { id: actionMovementId }, error: call.error ?? null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: call.error ?? null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const actionMocks = {
  "next/cache": { revalidatePath: (path) => actionState.revalidated.push(path) },
  "@/lib/ai/decisions": { approveSuggestionWithClient: async () => ({}), rejectSuggestionWithClient: async () => ({}) },
  "@/lib/ai/movement-guides": { movementGuideEntry: {}, movementGuideSchema: {}, newMovementGuideSchema: {} },
  "@/lib/ai/service": { runSuggestion: async () => ({}) },
  "@/lib/auth/form-state": { failure: (_form, error) => ({ error }) },
  "@/lib/crossfit-lookup": {
    lookupCrossfitVideo: async (name) => {
      actionState.lookupNames.push(name);
      return actionState.lookupResult;
    },
  },
  "@/lib/movement-demos": {
    loadMovementDemoSource: async (_client, id, coachId) => {
      actionState.loadCalls.push({ id, coachId });
      return actionState.source;
    },
  },
  "@/lib/movement-guides": {
    canSaveDemoCues: () => true,
    demoEmbedUrl: () => null,
    editedGuideSchema: {},
    hasGuideText: () => false,
    MOVEMENT_DEMO_BUCKET: "movement-demos",
    readGuideText: () => ({}),
  },
  "@/lib/supabase/server": { createClient: async () => actionState.client },
  "@/lib/viewer": { getViewer: async () => actionState.viewer },
};

const movementActions = load("src/app/(app)/programs/movements/[id]/actions.ts", actionMocks);

function prepareAction({ coachId = actionGymId, role = "owner", guide = null, lookupResult = null } = {}) {
  const client = createSupabaseMock();
  actionState = {
    client,
    lookupResult,
    lookupNames: [],
    loadCalls: [],
    revalidated: [],
    source: {
      movement: {
        id: actionMovementId,
        name: "Dumbbell Power Snatch",
        coach_id: coachId,
        demo_video_url: null,
      },
      guide,
    },
    viewer: { kind: "coach", id: actionGymId, gymId: actionGymId, role },
  };
  return actionState;
}

test("applyCrossfitVideo updates only the coach's own movement", async () => {
  const suggestion = {
    crossfitUrl: "https://www.crossfit.com/essentials/the-dumbbell-power-snatch",
    videoUrl: "https://www.youtube.com/watch?v=QmZAiBqPvZw",
  };
  const state = prepareAction({ lookupResult: suggestion });

  assert.deepEqual(await movementActions.applyCrossfitVideo(actionMovementId), {});
  assert.deepEqual(state.lookupNames, ["Dumbbell Power Snatch"]);
  assert.deepEqual(state.loadCalls, [{ id: actionMovementId, coachId: actionGymId }]);
  assert.deepEqual(state.client.calls, [{
    table: "movements",
    filters: [["id", actionMovementId], ["coach_id", actionGymId]],
    method: "update",
    values: { demo_video_url: suggestion.videoUrl, crossfit_url: suggestion.crossfitUrl },
    returning: "id",
  }]);
  assert.ok(state.revalidated.includes(`/programs/movements/${actionMovementId}`));
});

test("applyCrossfitVideo adds only the video override for a library movement using the gym id", async () => {
  const suggestion = {
    crossfitUrl: "https://www.crossfit.com/essentials/the-dumbbell-power-snatch",
    videoUrl: "https://www.youtube.com/watch?v=QmZAiBqPvZw",
  };
  const state = prepareAction({ coachId: null, role: "coach", guide: { video_url: null, clip_path: null }, lookupResult: suggestion });

  assert.deepEqual(await movementActions.applyCrossfitVideo(actionMovementId), {});
  assert.deepEqual(state.client.calls, [{
    table: "movement_guides",
    filters: [],
    method: "upsert",
    values: { coach_id: actionGymId, movement_id: actionMovementId, video_url: suggestion.videoUrl },
    options: { onConflict: "coach_id,movement_id" },
  }]);
});

test("applyCrossfitVideo returns an error without writes when lookup finds no video", async () => {
  const state = prepareAction({ lookupResult: null });

  assert.deepEqual(await movementActions.applyCrossfitVideo(actionMovementId), { error: "No CrossFit video found." });
  assert.deepEqual(state.client.calls, []);
});

test("suggestCrossfitVideo skips lookup when the movement already has a video or clip", async () => {
  const state = prepareAction({
    guide: { video_url: "https://youtu.be/QmZAiBqPvZw", clip_path: null },
  });

  assert.deepEqual(await movementActions.suggestCrossfitVideo(actionMovementId), { suggestion: null });
  assert.deepEqual(state.lookupNames, []);
});
