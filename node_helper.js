/* eslint-disable n/no-missing-require */
const NodeHelper = require("node_helper");
/* eslint-enable n/no-missing-require */

// Hilfsfunktion zum Bauen eines Querystrings
function withQuery(url, params) {
  const query = new URLSearchParams(params).toString();
  return url + (query ? "?" + query : "");
}

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.images = [];
    this.currentImage = null;
    this.logLevel = "info"; // default level; can be overridden by frontend CONFIG
    this.tokens = {
      download: null,
      preview: null
    };

    this.log("info", "Node helper started");
  },

  log(level, message, data = null) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const configured = this.logLevel || "info";
    const configuredLevel =
      levels[configured] !== undefined ? configured : "info";
    const msgLevel = levels[level] !== undefined ? level : "info";
    if (levels[msgLevel] <= levels[configuredLevel]) {
      if (data) {
        if (Array.isArray(data)) {
          const limitedData = data.slice(0, 3).map((item) => ({
            ID: item.ID,
            UID: item.UID,
            FileName: item.FileName,
            FileUID: item.FileUID,
            Files: item.Files,
            TakenAt: item.TakenAt,
            PlaceLabel: item.PlaceLabel
          }));
          console.log(`[MMM-Photoprism2] ${message}`, limitedData);
        } else {
          console.log(`[MMM-Photoprism2] ${message}`, data);
        }
      } else {
        console.log(`[MMM-Photoprism2] ${message}`);
      }
    }
  },

  socketNotificationReceived(notification, payload) {
    this.log("debug", `Received notification: ${notification}`);
    if (notification === "CONFIG") {
      this.config = payload;
      // adopt log level from frontend config if provided
      if (this.config && this.config.logLevel)
        this.logLevel = this.config.logLevel;
      this.log("info", "Configuration received:", {
        apiUrl: this.config.apiUrl,
        albumId: this.config.albumId,
        updateInterval: this.config.updateInterval
      });
      this.fetchAlbum();
    }
  },

  async fetchAlbum() {
    try {
      const url = `${this.config.apiUrl}/api/v1/photos`;
      const params = {
        count: 1000, // Large number to get all photos
        offset: 0,
        s: this.config.albumId,
        merged: true,
        order: "oldest"
      };

      this.log("debug", "Fetching album with params:", params);
      this.log("debug", "Making request to URL:", url);

      const fullUrl = withQuery(url, params);

      const response = await fetch(fullUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`
        }
        // timeout gibt es bei fetch nicht direkt
      });

      this.log("debug", "Response status:", response.status);
      // Header als Objekt loggen
      this.log(
        "debug",
        "Response headers:",
        Object.fromEntries(response.headers)
      );

      // Store tokens from response headers (kleingeschrieben in fetch!)
      this.tokens.download = response.headers.get("x-download-token");
      this.tokens.preview = response.headers.get("x-preview-token");
      this.log("debug", "Stored tokens:", this.tokens);

      if (!response.ok) {
        this.log("warn", "Invalid response:", await response.text());
        this.sendSocketNotification("ERROR", "Invalid response from server");
        return;
      }

      const data = await response.json();

      // The API returns the photos array directly
      if (Array.isArray(data)) {
        this.images = data;
        this.log("info", `Found ${this.images.length} images in album`);

        // Log a summary of the first few images with limited fields
        const summary = this.images.slice(0, 3).map((img) => ({
          ID: img.ID,
          UID: img.UID,
          FileName: img.FileName,
          FileUID: img.FileUID,
          Files: img.Files,
          TakenAt: img.TakenAt,
          PlaceLabel: img.PlaceLabel
        }));
        this.log("debug", "Sample of album contents:", summary);

        this.selectRandomImage();
      } else {
        this.log("warn", "Invalid response format:", data);
        this.sendSocketNotification(
          "ERROR",
          "Invalid response format from server"
        );
      }
    } catch (error) {
      this.log("error", "Error fetching album:", error.message);
      this.sendSocketNotification("ERROR", "Failed to fetch album");
    }
  },

  async selectRandomImage() {
    if (this.images.length === 0) {
      this.log("warn", "No images available in album");
      this.sendSocketNotification("ERROR", "No images available in album");
      return;
    }

    const randomIndex = Math.floor(Math.random() * this.images.length);
    const selectedImage = this.images[randomIndex];
    this.log("info", "Selected random image:", {
      ID: selectedImage.ID,
      UID: selectedImage.UID,
      FileName: selectedImage.FileName,
      FileUID: selectedImage.FileUID,
      Files: selectedImage.Files,
      TakenAt: selectedImage.TakenAt,
      PlaceLabel: selectedImage.PlaceLabel
    });

    try {
      // Get the first file from the Files array
      if (!selectedImage.Files || selectedImage.Files.length === 0) {
        this.log("warn", "No files found for image:", selectedImage);
        this.sendSocketNotification(
          "ERROR",
          "No files found for selected image"
        );
        return;
      }

      const file = selectedImage.Files[0];
      this.log("debug", "Selected file for display: ", {
        Hash: file.Hash,
        Name: file.Name,
        Type: file.Type
      });

      // Build a direct Photoprism URL that includes the preview/download token
      // so the browser can fetch it directly. This avoids any server-side
      // download or file writes.
      let imageUrl;
      if (this.config && this.config.useThumbnails) {
        const size = this.config.thumbnailSize || "fit_1920";
        const token = this.tokens.preview || this.tokens.download || "public";
        imageUrl = `${this.config.apiUrl}/api/v1/t/${file.Hash}/${token}/${size}`;
        this.log("debug", `Using thumbnail URL: ${imageUrl}`);
      } else {
        const token = this.tokens.download || "public";
        imageUrl = `${this.config.apiUrl}/api/v1/dl/${file.Hash}?t=${token}`;
        this.log("debug", `Using download URL: ${imageUrl}`);
      }

      this.currentImage = {
        path: imageUrl,
        title: selectedImage.Title || "Untitled",
        takenAt: selectedImage.TakenAt,
        fileHash: file.Hash
      };

      this.log("info", "Image URL ready for display:", this.currentImage);
      this.sendSocketNotification("IMAGE_READY", this.currentImage);
    } catch (error) {
      this.log("error", "Error preparing image URL:", error.message);
      this.sendSocketNotification("ERROR", "Failed to prepare image URL");
    }
  }
});
