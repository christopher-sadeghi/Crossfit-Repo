import assert from "node:assert/strict";
import test from "node:test";

import { loadDemoDataWithClipCleanup, removeProgressPhotos } from "../src/lib/reset-demo-data.mjs";

test("photo cleanup drains paged files and collects all folders before removing any", async () => {
  const folders = Array.from({ length: 101 }, (_, n) => ({ name: String(n) }));
  const files = new Map(folders.map(({ name }) => [`coach/${name}`, Array.from({ length: 101 }, (_, n) => ({ name: `${n}.jpg` }))]));
  let lists = 0;
  let removals = 0;
  const client = { storage: { from: (bucket) => {
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
  const client = { storage: { from: () => ({
    list: async () => ({ data: [], error: null }),
    remove: () => assert.fail("empty cleanup must not remove"),
  }) } };
  assert.equal(await removeProgressPhotos(client, "coach"), null);
});

for (const stage of ["folders", "files", "remove"]) {
  test(`photo cleanup ${stage} failure prevents demo reset RPC`, async () => {
    const error = { message: `${stage} failed` };
    const client = {
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
