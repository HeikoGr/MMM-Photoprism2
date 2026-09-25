const test = require("node:test");
const assert = require("node:assert/strict");

const { imageUrlFor, resolveThumbnailSize } = require("../lib/thumbnail-size");

test("auto picks the smallest fit_ size that covers the screen in device pixels", () => {
  const config = { useThumbnails: true, thumbnailSize: "auto" };
  assert.equal(resolveThumbnailSize(config, { width: 1920, height: 1080, devicePixelRatio: 1 }), "fit_1920");
  assert.equal(resolveThumbnailSize(config, { width: 1920, height: 1080, devicePixelRatio: 2 }), "fit_3840");
  assert.equal(resolveThumbnailSize(config, { width: 800, height: 480 }), "fit_1280");
  assert.equal(resolveThumbnailSize(config, { width: 10000, height: 10000 }), "fit_7680");
});

test("an explicit size is kept, thumbnails off leaves it untouched", () => {
  assert.equal(resolveThumbnailSize({ useThumbnails: true, thumbnailSize: "tile_500" }), "tile_500");
  assert.equal(resolveThumbnailSize({ useThumbnails: false, thumbnailSize: "auto" }), "auto");
});

test("missing viewport values fall back to 1920x1080", () => {
  assert.equal(resolveThumbnailSize({ useThumbnails: true, thumbnailSize: null }), "fit_1920");
});

test("each display appends the thumbnail size for its own window", () => {
  const image = {
    path: "https://pp.example/api/v1/t/abc/pv/fit_1920",
    thumbnailBase: "https://pp.example/api/v1/t/abc/pv",
  };
  const config = { useThumbnails: true, thumbnailSize: "auto" };

  assert.equal(
    imageUrlFor(image, config, { width: 3840, height: 2160 }),
    "https://pp.example/api/v1/t/abc/pv/fit_3840",
  );
  assert.equal(imageUrlFor(image, config, { width: 800, height: 480 }), "https://pp.example/api/v1/t/abc/pv/fit_1280");
  assert.equal(
    imageUrlFor(image, { ...config, thumbnailSize: "tile_500" }),
    "https://pp.example/api/v1/t/abc/pv/tile_500",
  );
  // No thumbnails: the backend's download URL as is.
  assert.equal(
    imageUrlFor({ path: "https://pp.example/api/v1/dl/abc?t=dl" }, { useThumbnails: false }),
    "https://pp.example/api/v1/dl/abc?t=dl",
  );
});
