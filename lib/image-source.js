/*
 * Per-instance image selection: the instance's config, its cached album index
 * and the next image to show. The hub (mmm-shared/backend-session.js) decides when.
 */
const { createAlbumIndex, buildImageUrl, DEFAULT_TTL_MS } = require("./album-index");
const { SILENT_LOGGER, codedError, fetchAlbumListing } = require("./photoprism-api");

function summarizePhoto(photo) {
  if (!photo) {
    return null;
  }

  return {
    ID: photo.ID,
    UID: photo.UID,
    FileName: photo.FileName,
    TakenAt: photo.TakenAt,
    PlaceLabel: photo.PlaceLabel,
  };
}

/**
 * @param {object} [options] - { getLogger: (instanceId) => { debug, info, warn, error } }
 * @returns {object} { states, stateOf, configure, next }
 */
function createImageSource(options = {}) {
  const getLogger = options.getLogger || (() => SILENT_LOGGER);
  /** instanceId -> { config, logLevel, albumIndex, albumKey } */
  const states = new Map();

  function stateOf(instanceId = "default") {
    if (!states.has(instanceId)) {
      states.set(instanceId, {
        config: null,
        logLevel: undefined,
        albumIndex: createAlbumIndex({ ttlMs: DEFAULT_TTL_MS }),
        albumKey: null,
      });
    }
    return states.get(instanceId);
  }

  return {
    states,
    stateOf,

    /**
     * Take over an instance's config, once, when its first display configures it.
     *
     * @param {string} instanceId - Module instance (the core-assigned identifier)
     * @param {object} config - Config as sent with CONFIGURE
     */
    configure(instanceId, config) {
      const state = stateOf(instanceId);
      state.config = { ...config };
      state.logLevel = state.config.logLevel;
      state.albumIndex.setTtl(
        Number.isFinite(state.config.albumIndexTtl) ? state.config.albumIndexTtl : DEFAULT_TTL_MS,
      );

      // Switching albums (or servers) invalidates the cached listing.
      const albumKey = `${state.config.apiUrl}|${state.config.albumId}`;
      if (state.albumKey !== albumKey) {
        state.albumIndex.clear();
        state.albumKey = albumKey;
      }
    },

    /**
     * Pick the next image. The album listing is only fetched when the cached
     * index is missing or stale - a rotation step costs zero HTTP requests.
     *
     * @param {string} instanceId - Module instance
     * @returns {Promise<object>} The image to show
     */
    async next(instanceId) {
      const state = stateOf(instanceId);
      const logger = getLogger(instanceId);

      if (state.albumIndex.isStale()) {
        // The hub runs one fetch per instance at a time, so no join logic here.
        const { photos, tokens } = await fetchAlbumListing(state.config, { logger });
        const size = state.albumIndex.setPhotos(photos, tokens);
        logger.info(`Album index refreshed with ${size} images`);
      } else {
        logger.debug(
          `Using cached album index (age=${Math.round((state.albumIndex.getAge() || 0) / 1000)}s, size=${state.albumIndex.size()})`,
        );
      }

      const photo = state.albumIndex.pick();
      if (!photo) {
        logger.warn("No images available in album");
        throw codedError("NO_IMAGES", "No images available in album");
      }

      const imageInfo = buildImageUrl(photo, state.config, state.albumIndex.getTokens());
      if (!imageInfo) {
        logger.warn("No files found for image", summarizePhoto(photo));
        throw codedError("NO_FILES", "No files found for selected image");
      }

      logger.debug("Image ready for display", summarizePhoto(photo));
      return {
        path: imageInfo.url,
        thumbnailBase: imageInfo.thumbnailBase || null,
        title: photo.Title || null,
        location: photo.PlaceLabel || null,
        takenAt: photo.TakenAt,
        fileHash: imageInfo.fileHash,
        instanceId,
      };
    },
  };
}

module.exports = { createImageSource };
