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

// After a failed background refresh the previous listing is used this long before the next try.
const REFRESH_RETRY_MS = 5 * 60 * 1000;

/**
 * List the album into the instance's index. A listing that finishes after the
 * instance switched albums is dropped.
 *
 * @param {object} state - Instance state (config, albumIndex, albumKey)
 * @param {object} logger - { debug, info, warn, error }
 */
async function refreshListing(state, logger) {
  const albumKey = state.albumKey;
  const { photos, tokens } = await fetchAlbumListing(state.config, { logger });
  if (state.albumKey !== albumKey) return;
  const size = state.albumIndex.setPhotos(photos, tokens);
  logger.info(`Album index refreshed with ${size} images`);
}

/**
 * Start a listing without waiting for it; at most one runs per instance, and a
 * failure pauses further tries for REFRESH_RETRY_MS.
 *
 * @param {object} state - Instance state
 * @param {object} logger - { debug, info, warn, error }
 */
function refreshInBackground(state, logger) {
  if (state.refreshing || Date.now() < state.refreshRetryAt) return;
  state.refreshing = refreshListing(state, logger)
    .catch((error) => {
      state.refreshRetryAt = Date.now() + REFRESH_RETRY_MS;
      logger.warn(`Album listing failed, rotating through the previous ${state.albumIndex.size()} images`, {
        code: error?.code || null,
        message: error?.message || String(error),
      });
    })
    .finally(() => {
      state.refreshing = null;
    });
}

/**
 * @param {object} [options] - { getLogger: (identifier) => { debug, info, warn, error } }
 * @returns {object} { states, stateOf, configure, next }
 */
function createImageSource(options = {}) {
  const getLogger = options.getLogger || (() => SILENT_LOGGER);
  /** Module identifier -> { config, logLevel, albumIndex, albumKey, refreshing, refreshRetryAt } */
  const states = new Map();

  function stateOf(identifier = "default") {
    if (!states.has(identifier)) {
      states.set(identifier, {
        config: null,
        logLevel: undefined,
        albumIndex: createAlbumIndex({ ttlMs: DEFAULT_TTL_MS }),
        albumKey: null,
        refreshing: null,
        refreshRetryAt: 0,
      });
    }
    return states.get(identifier);
  }

  return {
    states,
    stateOf,

    /**
     * Take over an instance's config, once, when its first display configures it.
     *
     * @param {string} identifier - Module instance (the core-assigned identifier)
     * @param {object} config - Config as sent with CONFIGURE
     */
    configure(identifier, config) {
      const state = stateOf(identifier);
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
        state.refreshRetryAt = 0;
      }
    },

    /**
     * Pick the next image. The album listing is only fetched when the cached
     * index is missing or stale - a rotation step costs zero HTTP requests.
     *
     * @param {string} identifier - Module instance
     * @returns {Promise<object>} The image to show
     */
    async next(identifier) {
      const state = stateOf(identifier);
      const logger = getLogger(identifier);

      if (state.albumIndex.size() === 0) {
        // Nothing to show yet: this step waits for the listing, and a failure reaches the hub.
        await refreshListing(state, logger);
      } else if (state.albumIndex.isStale()) {
        // The rotation goes on with the previous listing while the new one loads.
        refreshInBackground(state, logger);
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
      };
    },
  };
}

module.exports = { createImageSource };
