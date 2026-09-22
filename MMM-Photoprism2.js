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
    // How verbose logging should be in the browser console.
    // One of: "error", "warn", "info", "debug". Default is "info".
    logLevel: "info",
  },

  getScripts() {
    return [this.file("lib/mmm-shared/mmm-shared.js")];
  },

  getStyles() {
    return ["MMM-Photoprism2.css"];
  },

  start() {
    this.shared = globalThis.MMModuleShared;
    this.logger = this.shared.createLogger({
      moduleName: "MMM-Photoprism2",
      identifier: this.identifier,
      getLevel: () => this.config.logLevel || "info",
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

    this.log("info", "Starting module");
    this.currentImage = null;
    this.loaded = false;
    this.error = null;
    this.preloadImg = null; // hidden image element used to force browser caching

    this.lifecycle = this.shared.createLifecycle({
      module: this,
      logger: this.logger,
      updateInterval: this.config.updateInterval,
      minUpdateInterval: 30 * 1000,
      backgroundRefresh: this.config.backgroundRefresh !== false,
      quietHours: this.config.quietHours,
      onFetch: ({ reason }) => this.requestNextImage(reason),
    });
    this.lifecycle.start();
  },

  /**
   * Ask the node helper for the next image. The helper picks it from its cached
   * album index and only re-lists the album when that cache expired.
   *
   * @param {string} reason - Lifecycle reason, for logging only
   */
  requestNextImage(reason) {
    const cfg = this.getEffectiveConfig();
    if (!cfg) {
      return;
    }

    this.log("debug", `Requesting next image (${reason})`);
    this.transport.sendRequest("NEXT_IMAGE", { config: cfg });
  },

  async socketNotificationReceived(notification, payload) {
    if (payload?.identifier !== this.identifier) {
      return;
    }

    this.log("debug", `Received socket notification: ${notification}`);
    if (notification === this.notifications.RESPONSE && payload?.action === "NEXT_IMAGE") {
      this.log("info", "New image ready:", payload);

      try {
        await this.preloadImage(payload?.data?.path);
      } catch (e) {
        this.log("warn", "Error during preload:", e);
      }

      this.currentImage = payload.data;
      this.loaded = true;
      this.error = null;
      this.lifecycle.markDataReceived();
      this.lifecycle.render(this.config.fadeSpeed);
    } else if (notification === this.notifications.ERROR) {
      this.log("error", "Error received:", payload);
      this.error = payload?.error?.message || "Unknown error";
      this.loaded = true;
      this.lifecycle.markFetchFailed();
      this.lifecycle.render();
    }
  },

  suspend() {
    this.lifecycle.suspend();
  },

  resume() {
    this.lifecycle.resume();
  },

  // Log through the shared logger so verbosity follows `logLevel`.
  log(level, message, context) {
    const write = this.logger?.[level] || this.logger?.info;
    if (write) {
      write(message, context);
    }
  },

  // Preload an image into the browser (hidden) to warm the cache.
  preloadImage(url) {
    if (!this.config || !this.config.preloadInBrowser || !url)
      return Promise.resolve();

    return new Promise((resolve) => {
      try {
        // If we already have a preload image with same src, keep it
        if (this.preloadImg && this.preloadImg.src === url) {
          this.log("debug", "Preload image already present");
          return resolve();
        }

        // Remove old preload if present
        if (this.preloadImg && this.preloadImg.parentNode) {
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
          this.log("debug", "Preload complete for:", url);
          resolve();
        };
        img.onerror = (e) => {
          this.log("warn", "Preload failed for:", { url, type: e?.type });
          // still resolve so UI can continue
          resolve();
        };
        img.src = url;
        // append to body so it persists even when module DOM is re-rendered or suspended
        (document.body || document.documentElement).appendChild(img);
        this.preloadImg = img;
      } catch (err) {
        this.log("error", "Preload exception:", err);
        resolve();
      }
    });
  },

  // Build an effective config to send to the node helper. If thumbnailSize is
  // set to 'auto' (or null), derive a sensible fit_<size> based on the browser
  // window and devicePixelRatio. This keeps server requests aligned with the
  // display resolution and avoids downloading unnecessarily large thumbnails.
  getEffectiveConfig() {
    if (!this.config) return null;
    const cfg = { ...this.config };

    if (cfg.useThumbnails) {
      let size = cfg.thumbnailSize;
      if (!size || size === "auto") {
        try {
          const dpr = window.devicePixelRatio || 1;
          const maxPx =
            Math.max(window.innerWidth || 1920, window.innerHeight || 1080) *
            dpr;
          // Photoprism standard sizes (increasing). We'll pick the smallest fit_ value
          // that is >= maxPx, otherwise the largest available.
          const available = [
            720, 1280, 1600, 1920, 2048, 2560, 3840, 4096, 5120, 7680,
          ];
          const chosen =
            available.find((s) => s >= Math.ceil(maxPx)) ||
            available[available.length - 1];
          size = `fit_${chosen}`;
        } catch {
          // Fallback to a sensible default
          size = "fit_1920";
        }
      }
      cfg.thumbnailSize = size;
    }

    return cfg;
  },

  getDom() {
    this.log("debug", "Creating DOM");
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

    this.log("debug", "Creating image element for:", this.currentImage.path);
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
