/* eslint-disable no-console */
function createInstanceId(prefix = "photoprism") {
  return `${prefix}_${Date.now().toString(36)}`;
}

Module.register("MMM-Photoprism2", {
  updateTimer: null,
  defaults: {
    apiUrl: "http://photoprism.local:2342",
    apiKey: "", // see README for how to obtain (curl is easiest)
    albumId: "", // you can find it in the URL when you browse to your album
    updateInterval: 5 * 60 * 1000, // 5 minutes in milliseconds
    fadeSpeed: 1000, // Fade speed in milliseconds
    maxWidth: "100%",
    maxHeight: "100%",
    cacheRetentionDays: 1, // Number of days to keep cached images
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
    this.instanceId = createInstanceId();
    this.sharedContext = this.shared.createModuleContext(
      "MMM-Photoprism2",
      this.identifier,
      {
        instanceId: this.instanceId,
        logLevel: this.config.logLevel || "info",
        logStructured: true,
        logRedaction: true,
      },
    );
    this.transport = this.shared.createTransport({
      moduleName: "MMM-Photoprism2",
      identifier: this.identifier,
      instanceId: this.instanceId,
      sendSocketNotification: this.sendSocketNotification.bind(this),
    });
    this.notifications = this.transport.notifications;

    this.log("info", "Starting module");
    this.currentImage = null;
    this.loaded = false;
    this.error = null;
    this.preloadImg = null; // hidden image element used to force browser caching
    this.isSuspended = false;

    // Try to send initial configuration to the node helper early so the
    // node side can start fetching images even if MagicMirror hasn't
    // called `resume()` yet (some setups may delay resume/suspend calls).
    // This makes the module more robust w.r.t. startup/suspended state.
    try {
      const cfg = this.getEffectiveConfig();
      if (cfg) {
        this.transport.sendRequest("FETCH_IMAGE", {
          config: cfg,
        });
        this.hasRequestedConfig = true;
      }
    } catch (e) {
      this.log("error", "Failed to send initial CONFIG:", e);
    }
  },

  notificationReceived(notification) {
    if (notification === "DOM_OBJECTS_CREATED") {
      this.log("info", "DOM objects created, starting update interval");
      this.clearUpdateTimer();
      this.startUpdateTimer();
    }
  },

  async socketNotificationReceived(notification, payload) {
    if (payload?.instanceId && payload.instanceId !== this.instanceId) {
      return;
    }

    this.log("debug", `Received socket notification: ${notification}`);
    if (
      notification === this.notifications.RESPONSE &&
      payload?.identifier === this.identifier &&
      payload?.action === "FETCH_IMAGE"
    ) {
      this.log("info", "New image ready:", payload);

      try {
        await this.preloadImage(payload?.data?.path);
      } catch (e) {
        this.log("warn", "Error during preload:", e);
      }

      this.currentImage = payload.data;
      this.loaded = true;
      this.error = null;
      this.updateDom(this.config.fadeSpeed);
    } else if (
      notification === this.notifications.ERROR &&
      payload?.identifier === this.identifier
    ) {
      this.log("error", "Error received:", payload);
      this.error = payload?.error?.message || "Unknown error";
      this.loaded = true;
      this.updateDom();
    }
  },

  suspend() {
    this.log("info", "Module suspended");

    this.isSuspended = true;
    this.error = null;
    this.clearUpdateTimer();
  },

  resume() {
    this.log("info", "Module resumed");

    const cfg = this.getEffectiveConfig();
    this.transport.sendRequest("FETCH_IMAGE", {
      config: cfg,
    });
    this.startUpdateTimer();
    this.isSuspended = false;
  },

  startUpdateTimer() {
    if (this.updateTimer) {
      return;
    }

    this.updateTimer = setInterval(() => {
      this.log("debug", "Interval triggered, requesting new image");
      this.error = null;
      const cfg = this.getEffectiveConfig();
      this.transport.sendRequest("FETCH_IMAGE", {
        config: cfg,
      });
    }, this.config.updateInterval);
  },

  clearUpdateTimer() {
    if (!this.updateTimer) {
      return;
    }

    clearInterval(this.updateTimer);
    this.updateTimer = null;
  },

  // Simple log helper to control verbosity from the module config
  log(level, ...args) {
    if (!this.moduleLogger && this.shared?.createLogger) {
      this.moduleLogger = this.shared.createLogger({
        moduleName: "MMM-Photoprism2",
        identifier: this.identifier,
        getLevel: () =>
          (this.config && this.config.logLevel) || this.defaults.logLevel || "info",
        structured: false,
        redact: true,
      });
    }

    if (this.moduleLogger) {
      try {
        if (typeof this.moduleLogger[level] === "function") {
          this.moduleLogger[level](args[0], args.slice(1));
        } else {
          this.moduleLogger.info(args[0], args.slice(1));
        }
      } catch {
        // ignore any console errors
      }
      return;
    }

    try {
      if (level === "error") console.error("[MMM-Photoprism2]", ...args);
      else if (level === "warn") console.warn("[MMM-Photoprism2]", ...args);
      else if (level === "debug") console.debug("[MMM-Photoprism2]", ...args);
      else console.info("[MMM-Photoprism2]", ...args);
    } catch {
      // ignore any console errors
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
          this.log("warn", "Preload failed for:", url, e);
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
    const cfg = {
      ...this.config,
      instanceId: this.instanceId,
    };

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

    if (this.error) {
      this.log("error", "Showing error:", this.error);
      wrapper.innerHTML = `Error: ${this.error}`;
      return wrapper;
    }

    if (!this.loaded) {
      this.log(
        "debug",
        "Module not loaded yet or suspended, showing loading message",
      );
      wrapper.innerHTML = "Loading...";
      return wrapper;
    }

    if (this.currentImage) {
      this.log("debug", "Creating image element for:", this.currentImage.path);
      const img = document.createElement("img");
      img.src = this.currentImage.path;
      img.className = "photoprism-image";
      wrapper.appendChild(img);

      if (this.currentImage.title || this.currentImage.location) {
        this.log("debug", "Adding title and location");
        const infoContainer = document.createElement("div");
        infoContainer.className = "photoprism-info";

        if (this.currentImage.title) {
          const title = document.createElement("div");
          title.className = "photoprism-title";
          title.innerHTML = this.currentImage.title;
          infoContainer.appendChild(title);
        }

        if (this.currentImage.location) {
          const location = document.createElement("div");
          location.className = "photoprism-location";
          location.innerHTML = this.currentImage.location;
          infoContainer.appendChild(location);
        }

        wrapper.appendChild(infoContainer);
      }
    } else {
      this.log("debug", "No image available to display");
      wrapper.innerHTML = "No image available";
    }

    return wrapper;
  },
});
