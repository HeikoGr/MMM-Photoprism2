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

test("a stale listing is refreshed in the background while the rotation goes on", async (t) => {
  let releaseSecond;
  const responses = [
    listing([{ UID: "p1", Files: [{ Hash: "h1" }] }]),
    new Promise((resolve) => {
      releaseSecond = () => resolve(listing([{ UID: "p2", Files: [{ Hash: "h2" }] }]));
    }),
  ];
  const fetchMock = t.mock.method(globalThis, "fetch", async () => responses.shift());
  const source = createImageSource();
  source.configure("i3", config);

  assert.equal((await source.next("i3")).fileHash, "h1");
  // Stale again (TTL 0), the server has not answered yet: the step does not wait for it.
  assert.equal((await source.next("i3")).fileHash, "h1");
  assert.equal((await source.next("i3")).fileHash, "h1");
  assert.equal(fetchMock.mock.callCount(), 2, "one background listing at a time");

  releaseSecond();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await source.next("i3")).fileHash, "h2");
});

test("after a failed background refresh the next try waits instead of listing on every step", async (t) => {
  const responses = [listing([{ UID: "p1", Files: [{ Hash: "h1" }] }])];
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    const next = responses.shift();
    if (!next) throw new Error("ECONNREFUSED");
    return next;
  });
  const source = createImageSource();
  source.configure("i4", config);

  await source.next("i4");
  await source.next("i4");
  await new Promise((resolve) => setImmediate(resolve));
  await source.next("i4");
  await source.next("i4");
  assert.equal(fetchMock.mock.callCount(), 2, "the failed refresh pauses further tries");
});

test("the listing keeps only the fields the module reads", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    listing([
      {
        UID: "p1",
        ID: "1",
        Title: "T",
        PlaceLabel: "P",
        TakenAt: "2024",
        Camera: "x",
        Details: { a: 1 },
        Files: [{ Hash: "h1", Name: "n" }, { Hash: "h2" }],
      },
    ]),
  );
  const { photos } = await fetchAlbumListing(config);
  assert.deepEqual(photos[0], {
    UID: "p1",
    ID: "1",
    FileUID: undefined,
    FileName: undefined,
    Title: "T",
    PlaceLabel: "P",
    TakenAt: "2024",
    Files: [{ Hash: "h1" }],
  });
});
