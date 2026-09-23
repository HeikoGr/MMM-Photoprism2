Module.register("MMM-Photoprism2", {
  defaults: {
    apiUrl: "http://photoprism.local:2342",
    apiKey: "", // see README for how to obtain (curl is easiest)
    albumId: "", // you can find it in the URL when you browse to your album
    updateInterval: 5 * 60 * 1000, // how often the displayed image changes
    // How long the node helper reuses a cached album listing. Picking the next
    // image works off that cache and costs no HTTP request at all.
    albumIndexTtl: 60 * 60 * 1000,
    // Keep rotating images while the module is hidden (e.g. under MMM-Carousel)
    // so a fresh image is ready the moment it becomes visible again.
    backgroundRefresh: true,
    // Optional window without any polling, e.g. { from: "23:00", to: "06:00" }.
    quietHours: null,
    fadeSpeed: 1000, // Fade speed in milliseconds
    // Size limits for this instance. Set them when several instances share the
    // screen, e.g. maxWidth: "40vw", maxHeight: "50vh".
    maxWidth: "100%",
    maxHeight: "100%",
    // Optional thumbnail usage to avoid downloading full images
    useThumbnails: true,
    // Optional exact thumbnail size string (e.g. "fit_1920" or "tile_500").
    // Use "auto" to pick a sensible size based on the browser window (default).
    thumbnailSize: "auto",
    // Whether to preload images into the browser cache (hidden <img>)
    preloadInBrowser: true,
    // Optional: "none", "error", "warn", "info", "debug". Output goes through
    // MagicMirror's Log, so the global logLevel decides; this can only narrow it.
    logLevel: null,
  },

  getScripts() {
    return [this.file("lib/mmm-shared/mmm-shared.js"), this.file("lib/thumbnail-size.js")];
  },

  getStyles() {
    return ["MMM-Photoprism2.css"];
  },

  start() {
    this.shared = globalThis.MMModuleShared;
    this.logger = this.shared.createLogger({
      moduleName: "MMM-Photoprism2",
      identifier: this.identifier,
      consoleRef: globalThis.Log || console,
      getLevel: () => this.config.logLevel || "debug",
      structured: false,
      redact: true,
    });
    // The core-assigned identifier is unique per instance and stable across
    // browser reloads, so the helper keeps one state per instance.
    this.transport = this.shared.createTransport({
      moduleName: "MMM-Photoprism2",
      identifier: this.identifier,
      sendSocketNotification: this.sendSocketNotification.bind(this),
    });
    this.notifications = this.transport.notifications;

    this.logger.info("Starting module");
    this.currentImage = null;
    this.loaded = false;
    this.error = null;
    this.preloadImg = null; // hidden image element used to force browser caching

    // The config goes to the backend once; it owns the rotation schedule
    // (node_helper + lib/backend-session.js) and pushes each image.
    this.sendConfigure();

    // Only rendering and the active/paused report stay in the browser.
    this.lifecycle = this.shared.createLifecycle({
      module: this,
      logger: this.logger,
      updateInterval: 0,
      backgroundRefresh: this.config.backgroundRefresh !== false,
      onSessionState: ({ state }) => this.transport.sendRequest("SESSION_STATE", { state }),
    });
    this.lifecycle.start();
  },

  /**
   * Send the config to the backend - at start, and again when the backend asks
   * for it (INIT_REQUIRED, e.g. after a server restart). The thumbnail size is
   * resolved here because it depends on this browser's window.
   */
  sendConfigure() {
    const cfg = this.getEffectiveConfig();
    if (cfg) {
      this.transport.sendRequest("CONFIGURE", { config: cfg });
    }
  },

  async socketNotificationReceived(notification, payload) {
    if (notification !== this.notifications.EVENT) {
      return;
    }

    if (payload?.action === "INIT_REQUIRED") {
      if (payload.identifier === this.identifier || payload.identifier === "*") {
        this.sendConfigure();
      }
      return;
    }

    if (payload?.identifier !== this.identifier) {
      return;
    }

    if (payload.action === "DATA") {
      // The path carries a PhotoPrism session token; keep it out of the default log.
      this.logger.debug("New image ready", { requestId: payload?.requestId });

      try {
        await this.preloadImage(payload?.data?.path);
      } catch (e) {
        this.logger.warn("Error during preload:", e);
      }

      this.currentImage = payload.data;
      this.loaded = true;
      this.error = null;
      this.lifecycle.markDataReceived();
      this.lifecycle.render(this.config.fadeSpeed);
      return;
    }

    if (["FETCH_FAILED", "CONFIG_INVALID", "CONFIG_REJECTED"].includes(payload.action)) {
      this.logger.error("Error received", payload?.error);
      this.error =
        payload.action === "CONFIG_REJECTED"
          ? `Config differs from the running instance: ${(payload.data?.mismatchKeys || []).join(", ")}`
          : payload?.error?.message || "Unknown error";
      this.loaded = true;
      this.lifecycle.render();
    }
  },

  suspend() {
    this.lifecycle.suspend();
  },

  resume() {
    this.lifecycle.resume();
  },

  // Preload an image into the browser (hidden) to warm the cache.
  preloadImage(url) {
    if (!this.config?.preloadInBrowser || !url) return Promise.resolve();

    return new Promise((resolve) => {
      try {
        // If we already have a preload image with same src, keep it
        if (this.preloadImg && this.preloadImg.src === url) {
          this.logger.debug("Preload image already present");
          return resolve();
        }

        // Remove old preload if present
        if (this.preloadImg?.parentNode) {
          try {
            this.preloadImg.parentNode.removeChild(this.preloadImg);
          } catch {
            /* ignore removal error */
          }
        }

        const img = document.createElement("img");
        img.style.display = "none";
        img.className = "photoprism-preload";
        img.onload = () => {
          this.logger.debug("Preload complete for:", url);
          resolve();
        };
        img.onerror = (e) => {
          this.logger.warn("Preload failed for:", { url, type: e?.type });
          // still resolve so UI can continue
          resolve();
        };
        img.src = url;
        // append to body so it persists even when module DOM is re-rendered or suspended
        (document.body || document.documentElement).appendChild(img);
        this.preloadImg = img;
      } catch (err) {
        this.logger.error("Preload exception:", err);
        resolve();
      }
    });
  },

  // The config sent to the node helper, with the thumbnail size resolved for
  // this browser window (lib/thumbnail-size.js).
  getEffectiveConfig() {
    if (!this.config) return null;
    return {
      ...this.config,
      thumbnailSize: window.Photoprism2ThumbnailSize.resolveThumbnailSize(this.config, {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      }),
    };
  },

  getDom() {
    this.logger.debug("Creating DOM");
    const wrapper = document.createElement("div");
    wrapper.className = "photoprism-container";
    wrapper.style.maxWidth = this.config.maxWidth;
    wrapper.style.maxHeight = this.config.maxHeight;

    if (!this.currentImage) {
      if (this.error) {
        wrapper.textContent = `Error: ${this.error}`;
      } else {
        wrapper.textContent = this.loaded ? "No image available" : "Loading...";
      }
      return wrapper;
    }

    this.logger.debug("Creating image element for:", this.currentImage.path);
    const img = document.createElement("img");
    img.src = this.currentImage.path;
    img.className = "photoprism-image";
    wrapper.appendChild(img);

    // Title and location come from PhotoPrism metadata (PlaceLabel even from
    // reverse geocoding), so they are set as text, never as HTML.
    if (this.currentImage.title || this.currentImage.location) {
      const infoContainer = document.createElement("div");
      infoContainer.className = "photoprism-info";

      if (this.currentImage.title) {
        const title = document.createElement("div");
        title.className = "photoprism-title";
        title.textContent = this.currentImage.title;
        infoContainer.appendChild(title);
      }

      if (this.currentImage.location) {
        const location = document.createElement("div");
        location.className = "photoprism-location";
        location.textContent = this.currentImage.location;
        infoContainer.appendChild(location);
      }

      wrapper.appendChild(infoContainer);
    }

    // A failed refresh keeps the last image on screen and only adds a hint.
    if (this.error) {
      const notice = document.createElement("div");
      notice.className = "photoprism-error";
      notice.textContent = `Error: ${this.error}`;
      wrapper.appendChild(notice);
    }

    return wrapper;
  },
});
