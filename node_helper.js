const NodeHelper = require("node_helper");
const shared = require("./lib/mmm-shared/mmm-shared");
const { createAlbumIndex, buildImageUrl, DEFAULT_TTL_MS } = require("./lib/album-index");

function withQuery(url, params) {
  const query = new URLSearchParams(params).toString();
  return url + (query ? "?" + query : "");
}

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

module.exports = NodeHelper.create({
  start() {
    this.instanceStates = new Map();
    this.notifications = shared.buildNotifications("MMM-Photoprism2");
    this.transport = shared.createNodeTransport({
      moduleName: "MMM-Photoprism2",
      sendSocketNotification: this.sendSocketNotification.bind(this),
    });
    this.errorFactory = shared.createErrorFactory();
    this.log("info", "Node helper started");
  },

  getInstanceState(instanceId = "default", config = null) {
    if (!this.instanceStates.has(instanceId)) {
      const ttlMs = Number.isFinite(config?.albumIndexTtl) ? config.albumIndexTtl : DEFAULT_TTL_MS;
      this.instanceStates.set(instanceId, {
        config: null,
        logLevel: "info",
        albumIndex: createAlbumIndex({ ttlMs }),
        albumKey: null,
        refreshInFlight: null,
      });
    }

    return this.instanceStates.get(instanceId);
  },

  log(level, message, data = null, instanceId = "global") {
    const logger = shared.createLogger({
      moduleName: "MMM-Photoprism2",
      identifier: instanceId,
      getLevel: () =>
        instanceId === "global" ? "info" : this.getInstanceState(instanceId).logLevel || "info",
      structured: true,
      redact: true,
    });

    if (data !== null && data !== undefined) {
      logger[level](message, data);
      return;
    }

    logger[level](message);
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== this.notifications.REQUEST) {
      return;
    }

    const action = payload?.action;
    // FETCH_IMAGE is the pre-split action name and still forces a fresh listing.
    if (action !== "NEXT_IMAGE" && action !== "REFRESH_INDEX" && action !== "FETCH_IMAGE") {
      return;
    }

    const instanceId = payload?.instanceId || payload?.identifier || "default";
    const config = payload?.data?.config || {};
    const state = this.getInstanceState(instanceId, config);

    state.config = { ...config };
    if (state.config.logLevel) {
      state.logLevel = state.config.logLevel;
    }

    // Switching albums (or servers) invalidates the cached listing.
    const albumKey = `${state.config.apiUrl}|${state.config.albumId}`;
    if (state.albumKey !== albumKey) {
      state.albumIndex.clear();
      state.albumKey = albumKey;
    }

    const forceRefresh = action !== "NEXT_IMAGE";
    this.serveImage(instanceId, payload, forceRefresh).catch((error) => {
      this.log("error", "Unhandled request failure", error.message, instanceId);
      this.transport.sendError(
        payload,
        this.errorFactory.fromException(error, {
          code: "FETCH_FAILED",
          retryable: true,
          details: { instanceId },
        }),
      );
    });
  },

  /**
   * Answer a request for the next image. The album listing is only fetched when
   * the cached index is missing, stale or explicitly invalidated — a plain
   * NEXT_IMAGE costs zero HTTP requests.
   *
   * @param {string} instanceId - Module instance
   * @param {object} requestEnvelope - Incoming request envelope
   * @param {boolean} forceRefresh - Refresh the listing regardless of its age
   * @returns {Promise<void>} Resolves once a response has been sent
   */
  async serveImage(instanceId, requestEnvelope, forceRefresh) {
    const state = this.getInstanceState(instanceId);

    if (forceRefresh || state.albumIndex.isStale()) {
      const refreshed = await this.refreshAlbumIndex(instanceId, requestEnvelope);
      if (!refreshed) {
        return;
      }
    } else {
      this.log(
        "debug",
        `Using cached album index (age=${Math.round((state.albumIndex.getAge() || 0) / 1000)}s, size=${state.albumIndex.size()})`,
        null,
        instanceId,
      );
    }

    const photo = state.albumIndex.pick();
    if (!photo) {
      this.log("warn", "No images available in album", null, instanceId);
      this.transport.sendError(
        requestEnvelope,
        this.errorFactory.createError(
          "NO_IMAGES",
          "No images available in album",
          { instanceId },
          true,
          "warn",
        ),
      );
      return;
    }

    const imageInfo = buildImageUrl(photo, state.config, state.albumIndex.getTokens());
    if (!imageInfo) {
      this.log("warn", "No files found for image", summarizePhoto(photo), instanceId);
      this.transport.sendError(
        requestEnvelope,
        this.errorFactory.createError(
          "NO_FILES",
          "No files found for selected image",
          { instanceId },
          true,
          "warn",
        ),
      );
      return;
    }

    const image = {
      path: imageInfo.url,
      title: photo.Title || "Untitled",
      location: photo.PlaceLabel || null,
      takenAt: photo.TakenAt,
      fileHash: imageInfo.fileHash,
      instanceId,
    };

    this.log("info", "Image ready for display", summarizePhoto(photo), instanceId);
    this.transport.sendSuccess(requestEnvelope, image);
  },

  /**
   * Fetch the album listing and fill the index. Concurrent callers share one
   * in-flight request.
   *
   * @param {string} instanceId - Module instance
   * @param {object} requestEnvelope - Request that triggered the refresh
   * @returns {Promise<boolean>} True when the index holds a usable listing
   */
  refreshAlbumIndex(instanceId, requestEnvelope) {
    const state = this.getInstanceState(instanceId);

    if (state.refreshInFlight) {
      this.log("debug", "Joining in-flight album refresh", null, instanceId);
      return state.refreshInFlight;
    }

    state.refreshInFlight = this.fetchAlbum(instanceId, requestEnvelope).finally(() => {
      state.refreshInFlight = null;
    });

    return state.refreshInFlight;
  },

  async fetchAlbum(instanceId, requestEnvelope) {
    const state = this.getInstanceState(instanceId);

    const url = `${state.config.apiUrl}/api/v1/photos`;
    const params = {
      count: 1000, // Large number to get all photos
      offset: 0,
      s: state.config.albumId,
      merged: true,
      order: "oldest",
    };

    this.log("debug", "Fetching album listing", { url, params }, instanceId);

    let response;
    try {
      response = await fetch(withQuery(url, params), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${state.config.apiKey}`,
        },
      });
    } catch (error) {
      this.log("error", "Error fetching album", error.message, instanceId);
      this.transport.sendError(
        requestEnvelope,
        this.errorFactory.fromException(error, {
          code: "FETCH_FAILED",
          retryable: true,
          details: { instanceId },
        }),
      );
      return false;
    }

    if (!response.ok) {
      this.log("warn", "Invalid response", { status: response.status }, instanceId);
      this.transport.sendError(
        requestEnvelope,
        this.errorFactory.createError(
          "INVALID_RESPONSE",
          "Invalid response from server",
          { instanceId, status: response.status },
          true,
          "error",
        ),
      );
      return false;
    }

    const tokens = {
      download: response.headers.get("x-download-token"),
      preview: response.headers.get("x-preview-token"),
    };

    const data = await response.json();
    if (!Array.isArray(data)) {
      this.log("warn", "Invalid response format", null, instanceId);
      this.transport.sendError(
        requestEnvelope,
        this.errorFactory.createError(
          "INVALID_FORMAT",
          "Invalid response format from server",
          { instanceId },
          true,
          "error",
        ),
      );
      return false;
    }

    const size = state.albumIndex.setPhotos(data, tokens);
    this.log("info", `Album index refreshed with ${size} images`, null, instanceId);
    return true;
  },
});
