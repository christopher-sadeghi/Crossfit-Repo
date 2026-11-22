import assert from "node:assert/strict";
import test from "node:test";

import { loadDemoDataWithClipCleanup, removeProgressPhotos } from "../src/lib/reset-demo-data.mjs";

const photoRows = { from: (table) => {
  assert.equal(table, "progress_photos");
  return { delete: () => ({ eq: async (column, value) => {
    assert.equal(column, "coach_id");
    assert.equal(value, "coach");
    return { error: null };
  } }) };
} };

test("photo cleanup drains paged files and collects all folders before removing any", async () => {
  const folders = Array.from({ length: 101 }, (_, n) => ({ name: String(n) }));
  const files = new Map(folders.map(({ name }) => [`coach/${name}`, Array.from({ length: 101 }, (_, n) => ({ name: `${n}.jpg` }))]));
  let lists = 0;
  let removals = 0;
  const client = { ...photoRows, storage: { from: (bucket) => {
    assert.equal(bucket, "progress-photos");
    return {
      list: async (prefix, options) => {
        if (prefix === "coach") {
          lists++;
          assert.equal(removals, 0);
          return { data: folders.slice(options.offset, options.offset + options.limit), error: null };
        }
        return { data: files.get(prefix).slice(0, options.limit), error: null };
      },
      remove: async (paths) => {
        removals++;
        for (const path of paths) {
          const prefix = path.slice(0, path.lastIndexOf("/"));
          files.set(prefix, files.get(prefix).filter(({ name }) => `${prefix}/${name}` !== path));
        }
        return { error: null };
      },
    };
  } } };
  assert.equal(await removeProgressPhotos(client, "coach"), null);
  assert.equal(lists, 2);
  assert.equal(removals, 202);
  assert.equal([...files.values()].flat().length, 0);
});

test("empty photo bucket is a no-op", async () => {
  const client = { ...photoRows, storage: { from: () => ({
    list: async () => ({ data: [], error: null }),
    remove: () => assert.fail("empty cleanup must not remove"),
  }) } };
  assert.equal(await removeProgressPhotos(client, "coach"), null);
});

for (const stage of ["folders", "files", "remove"]) {
  test(`photo cleanup ${stage} failure prevents demo reset RPC`, async () => {
    const error = { message: `${stage} failed` };
    const client = {
      ...photoRows,
      auth: { getClaims: async () => ({ data: { claims: { sub: "coach" } } }) },
      rpc: () => assert.fail("failed cleanup must not delete athletes"),
      storage: { from: () => ({
        list: async (prefix) => prefix === "coach"
          ? stage === "folders" ? { data: null, error } : { data: [{ name: "athlete" }], error: null }
          : stage === "files" ? { data: null, error } : { data: [{ name: "photo.jpg" }], error: null },
        remove: async () => ({ error }),
      }) },
    };
    assert.equal((await loadDemoDataWithClipCleanup(client, true)).error, error);
  });
}

test("failed reset RPC never leaves photo rows pointing at removed files", async () => {
  const events = [];
  let rows = ["coach/athlete/photo.jpg"];
  let files = [...rows];
  const rpcError = { message: "reset failed" };
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "coach" } } }) },
    from: (table) => table === "progress_photos" ? { delete: () => ({ eq: async () => {
      events.push("rows"); rows = []; return { error: null };
    } }) } : { select() { return this; }, eq() { return this; }, not() { return this; }, order() { return this; }, range: async () => ({ data: [], error: null }) },
    storage: { from: () => ({
      list: async (prefix) => ({ data: prefix === "coach" ? [{ name: "athlete" }] : files.map(() => ({ name: "photo.jpg" })), error: null }),
      remove: async () => { assert.deepEqual(rows, []); events.push("files"); files = []; return { error: null }; },
    }) },
    rpc: async () => { events.push("rpc"); return { data: null, error: rpcError }; },
  };
  assert.equal((await loadDemoDataWithClipCleanup(client, true)).error, rpcError);
  assert.deepEqual(events, ["rows", "files", "rpc"]);
  assert.deepEqual(rows, []);
  assert.deepEqual(files, []);
});

test("row deletion failure leaves files untouched and prevents reset", async () => {
  const error = { message: "row delete failed" };
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "coach" } } }) },
    from: () => ({ delete: () => ({ eq: async () => ({ error }) }) }),
    storage: { from: () => assert.fail("files must remain intact") },
    rpc: () => assert.fail("reset must not run"),
  };
  assert.equal((await loadDemoDataWithClipCleanup(client, true)).error, error);
});
