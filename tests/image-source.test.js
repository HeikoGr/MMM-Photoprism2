const test = require("node:test");
const assert = require("node:assert/strict");
const { createImageSource } = require("../lib/image-source");
const { fetchAlbumListing } = require("../lib/photoprism-api");

const config = { apiUrl: "http://photoprism.test", apiKey: "k", albumId: "a", albumIndexTtl: 0, useThumbnails: true };

function listing(photos) {
  return {
    ok: true,
    status: 200,
    headers: new Map([["x-preview-token", "pt"]]),
    json: async () => photos,
  };
}

test("a failed listing refresh keeps rotating through the previous images", async (t) => {
  const responses = [listing([{ UID: "p1", Files: [{ Hash: "h1" }] }])];
  t.mock.method(globalThis, "fetch", async () => {
    const next = responses.shift();
    if (!next) throw new Error("ECONNREFUSED");
    return next;
  });
  const source = createImageSource();
  source.configure("i1", config);

  assert.equal((await source.next("i1")).fileHash, "h1");
  // albumIndexTtl 0: the listing is stale again, and the server is gone now.
  assert.equal((await source.next("i1")).fileHash, "h1");
});

test("without any previous listing the failure still reaches the hub", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("ECONNREFUSED");
  });
  const source = createImageSource();
  source.configure("i2", config);

  await assert.rejects(source.next("i2"), { code: "FETCH_FAILED" });
});

test("an error status releases the response body", async (t) => {
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 502,
    body: { cancel: async () => (cancelled = true) },
  }));

  await assert.rejects(fetchAlbumListing(config), { code: "INVALID_RESPONSE" });
  assert.ok(cancelled, "an unread error body keeps the connection busy");
});
