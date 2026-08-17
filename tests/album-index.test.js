const test = require("node:test");
const assert = require("node:assert/strict");

const { createAlbumIndex, buildImageUrl } = require("../lib/album-index");

function photo(uid, hash = `hash_${uid}`) {
  return {
    UID: uid,
    Title: `Photo ${uid}`,
    PlaceLabel: "Somewhere",
    Files: [{ Hash: hash, Name: `${uid}.jpg`, Type: "jpg" }],
  };
}

test("a fresh index is stale until it is filled", () => {
  const index = createAlbumIndex({ ttlMs: 1000, now: () => 0 });

  assert.equal(index.isStale(), true);
  index.setPhotos([photo("a")]);
  assert.equal(index.isStale(), false);
});

test("the index goes stale once the TTL elapsed", () => {
  let clock = 0;
  const index = createAlbumIndex({ ttlMs: 60 * 60 * 1000, now: () => clock });

  index.setPhotos([photo("a"), photo("b")]);
  clock = 59 * 60 * 1000;
  assert.equal(index.isStale(), false);

  clock = 60 * 60 * 1000;
  assert.equal(index.isStale(), true);
});

test("an empty listing counts as stale so it gets retried", () => {
  const index = createAlbumIndex({ ttlMs: 60 * 60 * 1000, now: () => 0 });

  index.setPhotos([]);
  assert.equal(index.isStale(), true);
  assert.equal(index.size(), 0);
  assert.equal(index.pick(), null);
});

test("pick avoids repeating the previous photo", () => {
  const values = [0, 0, 0.9];
  const index = createAlbumIndex({
    ttlMs: 1000,
    now: () => 0,
    random: () => values.shift() ?? 0,
  });

  index.setPhotos([photo("a"), photo("b")]);
  assert.equal(index.pick().UID, "a");
  assert.equal(index.pick().UID, "b", "the second draw must not repeat the first");
});

test("a single-photo album keeps returning that photo", () => {
  const index = createAlbumIndex({ ttlMs: 1000, now: () => 0, random: () => 0 });

  index.setPhotos([photo("only")]);
  assert.equal(index.pick().UID, "only");
  assert.equal(index.pick().UID, "only");
});

test("tokens travel with the listing", () => {
  const index = createAlbumIndex({ ttlMs: 1000, now: () => 0 });

  index.setPhotos([photo("a")], { download: "dl", preview: "pv" });
  assert.deepEqual(index.getTokens(), { download: "dl", preview: "pv" });
});

test("clear() drops the listing", () => {
  const index = createAlbumIndex({ ttlMs: 1000, now: () => 0 });

  index.setPhotos([photo("a")]);
  index.clear();
  assert.equal(index.isStale(), true);
  assert.equal(index.getAge(), null);
});

test("non-object entries are filtered out of the listing", () => {
  const index = createAlbumIndex({ ttlMs: 1000, now: () => 0 });

  assert.equal(index.setPhotos([photo("a"), null, "nope", undefined]), 1);
});

test("buildImageUrl produces a thumbnail URL with the preview token", () => {
  const info = buildImageUrl(
    photo("a", "abc"),
    { apiUrl: "https://pp.example", useThumbnails: true, thumbnailSize: "fit_1920" },
    { preview: "pv", download: "dl" },
  );

  assert.equal(info.url, "https://pp.example/api/v1/t/abc/pv/fit_1920");
  assert.equal(info.fileHash, "abc");
});

test("buildImageUrl falls back to the download URL and the public token", () => {
  const info = buildImageUrl(photo("a", "abc"), { apiUrl: "https://pp.example" }, {});

  assert.equal(info.url, "https://pp.example/api/v1/dl/abc?t=public");
});

test("buildImageUrl returns null when the photo has no file", () => {
  assert.equal(buildImageUrl({ UID: "a", Files: [] }, { apiUrl: "x" }, {}), null);
  assert.equal(buildImageUrl(null, { apiUrl: "x" }, {}), null);
});
