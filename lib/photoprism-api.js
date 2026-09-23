/*
 * PhotoPrism album listing: paged, with a timeout per request and a format
 * check. Failures are thrown as Errors carrying the helper's error codes
 * (FETCH_FAILED, INVALID_RESPONSE, INVALID_FORMAT).
 */

// Album listing is paged; a page shorter than PAGE_SIZE is the last one.
const PAGE_SIZE = 1000;
// Upper bound so a server that ignores `offset` cannot loop us forever.
const MAX_PAGES = 100;
// A server that never answers must not block the instance forever.
const FETCH_TIMEOUT_MS = 30 * 1000;

const SILENT_LOGGER = Object.freeze({ debug() {}, info() {}, warn() {}, error() {} });

function codedError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function withQuery(url, params) {
  const query = new URLSearchParams(params).toString();
  return url + (query ? `?${query}` : "");
}

/**
 * Fetch one page of the album listing.
 *
 * @param {object} config - { apiUrl, apiKey, albumId }
 * @param {number} offset - Index of the first photo on this page
 * @param {object} logger - { debug, info, warn, error }
 * @returns {Promise<{photos: Array, tokens: object}>} The page
 */
async function fetchAlbumPage(config, offset, logger) {
  const url = `${config.apiUrl}/api/v1/photos`;
  const params = {
    count: PAGE_SIZE,
    offset,
    s: config.albumId,
    merged: true,
    order: "oldest",
  };

  logger.debug("Fetching album listing", { url, params });

  let response;
  try {
    response = await fetch(withQuery(url, params), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error("Error fetching album", error.message);
    throw codedError("FETCH_FAILED", error.message);
  }

  if (!response.ok) {
    logger.warn("Invalid response", { status: response.status });
    throw codedError("INVALID_RESPONSE", "Invalid response from server", {
      status: response.status,
    });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    // e.g. an HTML login page served with status 200
    data = null;
  }

  if (!Array.isArray(data)) {
    logger.warn("Invalid response format");
    throw codedError("INVALID_FORMAT", "Invalid response format from server");
  }

  return {
    photos: data,
    tokens: {
      download: response.headers.get("x-download-token"),
      preview: response.headers.get("x-preview-token"),
    },
  };
}

/**
 * Fetch the complete album listing.
 *
 * @param {object} config - { apiUrl, apiKey, albumId }
 * @param {object} [options] - { logger: { debug, info, warn, error } }
 * @returns {Promise<{photos: Array, tokens: object|null}>} All photos and the session tokens
 */
async function fetchAlbumListing(config, options = {}) {
  const logger = options.logger || SILENT_LOGGER;
  const photos = [];
  let tokens = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchAlbumPage(config, page * PAGE_SIZE, logger);
    // Tokens are per session, the first page's are as good as any.
    tokens ??= result.tokens;
    photos.push(...result.photos);
    if (result.photos.length < PAGE_SIZE) {
      break;
    }

    if (page === MAX_PAGES - 1) {
      logger.warn(`Album listing stopped after ${photos.length} images`);
    }
  }

  return { photos, tokens };
}

module.exports = {
  SILENT_LOGGER,
  codedError,
  FETCH_TIMEOUT_MS,
  PAGE_SIZE,
  fetchAlbumListing,
};
