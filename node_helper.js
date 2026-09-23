/*
 * Wiring only: the rotation schedule lives in lib/mmm-shared/backend-session.js, image
 * selection in lib/image-source.js, the PhotoPrism API in lib/photoprism-api.js.
 */
const NodeHelper = require("node_helper");
const shared = require("./lib/mmm-shared/mmm-shared");
const { createInstanceHub, formatLogEntry } = require("./lib/mmm-shared/backend-session");
const { createImageSource } = require("./lib/image-source");

// MagicMirror's logger carries the global logLevel; outside MagicMirror (tests) console.
const Log = (() => {
  try {
    return require("logger");
  } catch {
    return console;
  }
})();

// One line per entry. Defined in this file on purpose: MagicMirror tags each line
// with the folder of the file that calls Log, so it reads [MMM-...], not [mmm-shared].
const logSink = Object.fromEntries(
  ["debug", "info", "warn", "error"].map((method) => [method, (entry) => Log[method](formatLogEntry(entry))]),
);

/** Two displays of one instance must show the same album from the same server. */
const CRITICAL_CONFIG_KEYS = Object.freeze(["apiUrl", "apiKey", "albumId"]);

module.exports = NodeHelper.create({
  start() {
    this.loggers = new Map();
    this.imageSource = createImageSource({
      getLogger: (instanceId) => this.getLogger(instanceId),
    });
    // Per-instance config and album index, keyed by the core-assigned identifier.
    this.instanceStates = this.imageSource.states;
    this.getLogger("global").info("Node helper started");

    /*
     * The frontend sends its config once (CONFIGURE) and reports whether it is
     * visible (SESSION_STATE). The hub runs the image rotation per instance
     * (updateInterval) on the backend and pushes each image as a DATA event.
     */
    this.hub = createInstanceHub({
      moduleName: "MMM-Photoprism2",
      sendSocketNotification: this.sendSocketNotification.bind(this),
      logger: this.getLogger("global"),
      criticalKeys: CRITICAL_CONFIG_KEYS,
      prepareConfig: (config) => {
        if (!config.apiUrl || !config.albumId) {
          throw new Error("apiUrl and albumId are required");
        }
        return { ...config };
      },
      lifecycleOptions: (config) => ({
        updateInterval: config.updateInterval,
        minUpdateInterval: 30 * 1000,
        backgroundRefresh: config.backgroundRefresh !== false,
        quietHours: config.quietHours,
      }),
      onConfigured: (identifier, config) => this.imageSource.configure(identifier, config),
      fetch: ({ identifier }) => this.imageSource.next(identifier),
      // Tests inject a clock and timers here.
      ...this.hubOptions,
    });
    this.hub.attach(this.io);
  },

  stop() {
    this.hub?.stop();
  },

  socketNotificationReceived(notification, payload) {
    // CONFIGURE and SESSION_STATE are the only requests the frontend sends.
    this.hub.socketNotificationReceived(notification, payload);
  },

  getLogger(instanceId) {
    if (!this.loggers.has(instanceId)) {
      this.loggers.set(
        instanceId,
        shared.createLogger({
          moduleName: "MMM-Photoprism2",
          identifier: instanceId,
          consoleRef: logSink,
          // The instance's own logLevel narrows the global one.
          getLevel: () => this.instanceStates.get(instanceId)?.logLevel,
          structured: true,
          redact: true,
        }),
      );
    }

    return this.loggers.get(instanceId);
  },
});
