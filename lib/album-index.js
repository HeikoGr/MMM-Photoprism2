/**
 * Album index for MMM-Photoprism2.
 *
 * Splits the two things that used to be one operation: listing an album (an
 * HTTP round trip that only changes when the album changes) and picking the
 * next image from it (pure `Math.random()` over the cached listing).
 *
 * The cache is intentionally dumb and synchronous — the node helper owns the
 * HTTP call and feeds the result in here.
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000;

function photoIdentity(photo) {
  if (!photo || typeof photo !== "object") {
    return null;
  }

  return photo.UID || photo.ID || photo.FileUID || null;
}

/**
 * Create a TTL cache over an album listing plus the tokens that belong to it.
 *
 * @param {object} [options] - Cache options
 * @param {number} [options.ttlMs] - How long a listing stays usable
 * @param {Function} [options.now] - Clock injection for tests
 * @param {Function} [options.random] - RNG injection for tests
 * @returns {object} Album index API
 */
function createAlbumIndex(options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? Math.max(0, options.ttlMs) : DEFAULT_TTL_MS;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const random = typeof options.random === "function" ? options.random : Math.random;

  let photos = [];
  let tokens = { download: null, preview: null };
  let fetchedAt = null;
  let lastSelectedId = null;

  return {
    /** @returns {boolean} True when the listing is missing or older than the TTL */
    isStale() {
      return fetchedAt === null || photos.length === 0 || now() - fetchedAt >= ttlMs;
    },

    /**
     * Replace the cached listing.
     *
     * @param {Array} list - Photos as returned by the PhotoPrism API
     * @param {{download?: string, preview?: string}} [newTokens] - Tokens of the same response
     * @returns {number} Number of cached photos
     */
    setPhotos(list, newTokens) {
      photos = Array.isArray(list) ? list.filter((photo) => photo && typeof photo === "object") : [];
      fetchedAt = now();
      if (newTokens) {
        tokens = {
          download: newTokens.download || null,
          preview: newTokens.preview || null,
        };
      }

      return photos.length;
    },

    clear() {
      photos = [];
      fetchedAt = null;
      lastSelectedId = null;
    },

    size() {
      return photos.length;
    },

    getTokens() {
      return { ...tokens };
    },

    /** @returns {number|null} Age of the listing in ms, null when never filled */
    getAge() {
      return fetchedAt === null ? null : now() - fetchedAt;
    },

    /**
     * Pick a random photo, avoiding an immediate repeat when the album has more
     * than one entry.
     *
     * @returns {object|null} The selected photo, or null for an empty album
     */
    pick() {
      if (photos.length === 0) {
        return null;
      }

      if (photos.length === 1) {
        lastSelectedId = photoIdentity(photos[0]);
        return photos[0];
      }

      let selected = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = photos[Math.floor(random() * photos.length)];
        const identity = photoIdentity(candidate);
        if (identity === null || identity !== lastSelectedId) {
          selected = candidate;
          break;
        }
      }

      if (selected === null) {
        selected = photos[Math.floor(random() * photos.length)];
      }

      lastSelectedId = photoIdentity(selected);
      return selected;
    },
  };
}

/**
 * Build a browser-loadable PhotoPrism URL for a photo's first file.
 *
 * @param {object} photo - Photo record from the API
 * @param {object} config - Module config (apiUrl, useThumbnails, thumbnailSize)
 * @param {{download?: string, preview?: string}} tokens - Tokens of the listing response
 * @returns {{url: string, fileHash: string}|null} URL info, or null when the photo has no file
 */
function buildImageUrl(photo, config, tokens = {}) {
  const file = Array.isArray(photo?.Files) ? photo.Files[0] : null;
  if (!file || !file.Hash) {
    return null;
  }

  const apiUrl = config?.apiUrl || "";

  if (config?.useThumbnails) {
    const size = config.thumbnailSize || "fit_1920";
    const token = tokens.preview || tokens.download || "public";
    return {
      url: `${apiUrl}/api/v1/t/${file.Hash}/${token}/${size}`,
      fileHash: file.Hash,
    };
  }

  const token = tokens.download || "public";
  return {
    url: `${apiUrl}/api/v1/dl/${file.Hash}?t=${token}`,
    fileHash: file.Hash,
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  createAlbumIndex,
  buildImageUrl,
};
