/* eslint-disable n/no-missing-require */
const NodeHelper = require("node_helper");
/* eslint-enable n/no-missing-require */
const { createLevelLogger } = require("./lib/runtime-utils");

function withQuery(url, params) {
  const query = new URLSearchParams(params).toString();
  return url + (query ? "?" + query : "");
}

function buildInstanceState() {
  return {
    config: null,
    images: [],
    currentImage: null,
    logLevel: "info",
    tokens: {
      download: null,
      preview: null,
    },
  };
}

module.exports = NodeHelper.create({
  start() {
    this.instanceStates = new Map();
    this.baseLogger = createLevelLogger({
      prefix: "[MMM-Photoprism2]",
      getLevel: () => "info",
    });
    this.log("info", "Node helper started");
  },

  getInstanceState(instanceId = "default") {
    if (!this.instanceStates.has(instanceId)) {
      this.instanceStates.set(instanceId, buildInstanceState());
    }

    return this.instanceStates.get(instanceId);
  },

  log(level, message, data = null, instanceId = "global") {
    const logger = createLevelLogger({
      prefix:
        instanceId === "global"
          ? "[MMM-Photoprism2]"
          : `[MMM-Photoprism2:${instanceId}]`,
      getLevel: () =>
        instanceId === "global"
          ? "info"
          : this.getInstanceState(instanceId).logLevel || "info",
    });

    if (Array.isArray(data)) {
      const limitedData = data.slice(0, 3).map((item) => ({
        ID: item.ID,
        UID: item.UID,
        FileName: item.FileName,
        FileUID: item.FileUID,
        Files: item.Files,
        TakenAt: item.TakenAt,
        PlaceLabel: item.PlaceLabel,
      }));
      logger.log(level, message, limitedData);
      return;
    }

    if (data !== null && data !== undefined) {
      logger.log(level, message, data);
      return;
    }

    logger.log(level, message);
  },

  socketNotificationReceived(notification, payload) {
    const instanceId = payload?.instanceId || "default";
    const state = this.getInstanceState(instanceId);

    this.log(
      "debug",
      `Received notification: ${notification}`,
      null,
      instanceId,
    );
    if (notification === "CONFIG") {
      state.config = { ...payload };
      // adopt log level from frontend config if provided
      if (state.config && state.config.logLevel) {
        state.logLevel = state.config.logLevel;
      }
      this.log(
        "info",
        "Configuration received:",
        {
          apiUrl: state.config.apiUrl,
          albumId: state.config.albumId,
          updateInterval: state.config.updateInterval,
        },
        instanceId,
      );
      this.fetchAlbum(instanceId);
    }
  },

  async fetchAlbum(instanceId = "default") {
    const state = this.getInstanceState(instanceId);

    try {
      const url = `${state.config.apiUrl}/api/v1/photos`;
      const params = {
        count: 1000, // Large number to get all photos
        offset: 0,
        s: state.config.albumId,
        merged: true,
        order: "oldest",
      };

      this.log("debug", "Fetching album with params:", params, instanceId);
      this.log("debug", "Making request to URL:", url, instanceId);

      const fullUrl = withQuery(url, params);

      const response = await fetch(fullUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${state.config.apiKey}`,
        },
        // fetch does not provide a direct timeout option
      });

      this.log("debug", "Response status:", response.status, instanceId);
      // Header als Objekt loggen
      this.log(
        "debug",
        "Response headers:",
        Object.fromEntries(response.headers),
        instanceId,
      );

      // Store tokens from response headers (kleingeschrieben in fetch!)
      state.tokens.download = response.headers.get("x-download-token");
      state.tokens.preview = response.headers.get("x-preview-token");
      this.log("debug", "Stored tokens:", state.tokens, instanceId);

      if (!response.ok) {
        this.log(
          "warn",
          "Invalid response:",
          await response.text(),
          instanceId,
        );
        this.sendSocketNotification("ERROR", {
          instanceId,
          message: "Invalid response from server",
        });
        return;
      }

      const data = await response.json();

      // The API returns the photos array directly
      if (Array.isArray(data)) {
        state.images = data;
        this.log(
          "info",
          `Found ${state.images.length} images in album`,
          null,
          instanceId,
        );

        // Log a summary of the first few images with limited fields
        const summary = state.images.slice(0, 3).map((img) => ({
          ID: img.ID,
          UID: img.UID,
          FileName: img.FileName,
          FileUID: img.FileUID,
          Files: img.Files,
          TakenAt: img.TakenAt,
          PlaceLabel: img.PlaceLabel,
        }));
        this.log("debug", "Sample of album contents:", summary, instanceId);

        this.selectRandomImage(instanceId);
      } else {
        this.log("warn", "Invalid response format:", data, instanceId);
        this.sendSocketNotification("ERROR", {
          instanceId,
          message: "Invalid response format from server",
        });
      }
    } catch (error) {
      this.log("error", "Error fetching album:", error.message, instanceId);
      this.sendSocketNotification("ERROR", {
        instanceId,
        message: "Failed to fetch album",
      });
    }
  },

  async selectRandomImage(instanceId = "default") {
    const state = this.getInstanceState(instanceId);

    if (state.images.length === 0) {
      this.log("warn", "No images available in album", null, instanceId);
      this.sendSocketNotification("ERROR", {
        instanceId,
        message: "No images available in album",
      });
      return;
    }

    const randomIndex = Math.floor(Math.random() * state.images.length);
    const selectedImage = state.images[randomIndex];
    this.log(
      "info",
      "Selected random image:",
      {
        ID: selectedImage.ID,
        UID: selectedImage.UID,
        FileName: selectedImage.FileName,
        FileUID: selectedImage.FileUID,
        Files: selectedImage.Files,
        TakenAt: selectedImage.TakenAt,
        PlaceLabel: selectedImage.PlaceLabel,
      },
      instanceId,
    );

    try {
      // Get the first file from the Files array
      if (!selectedImage.Files || selectedImage.Files.length === 0) {
        this.log(
          "warn",
          "No files found for image:",
          selectedImage,
          instanceId,
        );
        this.sendSocketNotification("ERROR", {
          instanceId,
          message: "No files found for selected image",
        });
        return;
      }

      const file = selectedImage.Files[0];
      this.log(
        "debug",
        "Selected file for display: ",
        {
          Hash: file.Hash,
          Name: file.Name,
          Type: file.Type,
        },
        instanceId,
      );

      // Build a direct Photoprism URL that includes the preview/download token
      // so the browser can fetch it directly. This avoids any server-side
      // download or file writes.
      let imageUrl;
      if (state.config && state.config.useThumbnails) {
        const size = state.config.thumbnailSize || "fit_1920";
        const token = state.tokens.preview || state.tokens.download || "public";
        imageUrl = `${state.config.apiUrl}/api/v1/t/${file.Hash}/${token}/${size}`;
        this.log("debug", `Using thumbnail URL: ${imageUrl}`, null, instanceId);
      } else {
        const token = state.tokens.download || "public";
        imageUrl = `${state.config.apiUrl}/api/v1/dl/${file.Hash}?t=${token}`;
        this.log("debug", `Using download URL: ${imageUrl}`, null, instanceId);
      }

      state.currentImage = {
        path: imageUrl,
        title: selectedImage.Title || "Untitled",
        takenAt: selectedImage.TakenAt,
        fileHash: file.Hash,
      };

      this.log(
        "info",
        "Image URL ready for display:",
        state.currentImage,
        instanceId,
      );
      this.sendSocketNotification("IMAGE_READY", {
        ...state.currentImage,
        instanceId,
      });
    } catch (error) {
      this.log(
        "error",
        "Error preparing image URL:",
        error.message,
        instanceId,
      );
      this.sendSocketNotification("ERROR", {
        instanceId,
        message: "Failed to prepare image URL",
      });
    }
  },
});
