/*
 * Which PhotoPrism thumbnail to request. Loaded in the browser (getScripts)
 * and by the tests (require).
 */
/* global window, module */

// PhotoPrism's fit_ sizes, ascending.
const FIT_SIZES = [720, 1280, 1600, 1920, 2048, 2560, 3840, 4096, 5120, 7680];

/**
 * @param {object} config - Module config (useThumbnails, thumbnailSize)
 * @param {object} [viewport] - { width, height, devicePixelRatio }
 * @returns {string|undefined} e.g. "fit_1920"; the configured value when it is
 *   not "auto"; undefined when thumbnails are off
 */
function resolveThumbnailSize(config, viewport = {}) {
  if (!config?.useThumbnails) {
    return config?.thumbnailSize;
  }

  const size = config.thumbnailSize;
  if (size && size !== "auto") {
    return size;
  }

  // The smallest fit_ size that covers the longer screen side in device
  // pixels, otherwise the largest one.
  const dpr = Number(viewport.devicePixelRatio) || 1;
  const longest = Math.max(Number(viewport.width) || 1920, Number(viewport.height) || 1080) * dpr;
  const chosen = FIT_SIZES.find((s) => s >= Math.ceil(longest)) || FIT_SIZES[FIT_SIZES.length - 1];
  return `fit_${chosen}`;
}

if (typeof window !== "undefined") {
  window.Photoprism2ThumbnailSize = { resolveThumbnailSize };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { resolveThumbnailSize, FIT_SIZES };
}
