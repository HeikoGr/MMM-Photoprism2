/*
 * Backend half of "config once, the backend owns the cadence" (MODULE-PLAN C1-C3).
 *
 * Module-local copy, the same code in MMM-CalDAV-Tasks, MMM-HomeConnect2,
 * MMM-LibraryMonitor and MMM-Photoprism2 (lib/backend-session.js, with
 * tests/backend-session.test.js; byte-identical, the shared Biome config formats them alike).
 * It is a candidate for lib/mmm-shared; until then, change every copy together.
 *
 * - createClientRegistry(): which browser sockets show which module instance.
 *   MagicMirror gives every module instance its own socket in the module's
 *   namespace, so a disconnect is an exact signal that a display went away -
 *   no heartbeat and no "not heard from in 24 h" guess. A new connection is
 *   greeted with INIT_REQUIRED, which makes the frontends send CONFIGURE again
 *   (e.g. after a server restart without a page reload).
 * - createInstanceHub(): one backend lifecycle (createLifecycle from mmm-shared,
 *   run against a stand-in module object) per instance. The frontend sends its
 *   config once (CONFIGURE) and reports active/paused (SESSION_STATE); the hub
 *   fetches on the backend's schedule and pushes DATA / FETCH_FAILED events.
 */

const shared = require("./mmm-shared/mmm-shared");

const DEFAULT_GRACE_MS = 10 * 60 * 1000;

function parsePayload(payload) {
  if (typeof payload !== "string") {
    return payload;
  }
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

/**
 * JSON with sorted object keys, so key order never makes two configs differ
 * (same as stableStringify in mmm-shared from 0.3.0 on, MODULE-PLAN S3).
 */
function stableStringify(value) {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return Object.keys(current)
        .sort()
        .reduce((sorted, key) => {
          sorted[key] = current[key];
          return sorted;
        }, {});
    }
    return current;
  });
}

function sameValue(a, b) {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}

/**
 * Track which sockets show which instance, and whether each one is visible.
 *
 * @param {object} options - Options
 * @param {object} [options.io] - Socket.io server as given to the node helper
 * @param {string} options.namespace - The module name (socket.io namespace)
 * @param {Function} options.keyOf - (payload) => instance key or null
 * @param {Function} [options.onConnect] - (socket) => void, for new connections
 * @param {Function} [options.onMessage] - (socket, notification, payload, key) => void
 * @param {Function} [options.onGone] - (key) => void, no socket left after the grace period
 * @param {number} [options.graceMs] - How long an instance without sockets is kept
 * @param {object} [options.timers] - { setTimeout, clearTimeout } for tests
 * @returns {object} Registry API
 */
function createClientRegistry(options = {}) {
  const setTimer = options.timers?.setTimeout || setTimeout;
  const clearTimer = options.timers?.clearTimeout || clearTimeout;
  const graceMs = Number.isFinite(options.graceMs) ? options.graceMs : DEFAULT_GRACE_MS;

  const socketsByKey = new Map();
  const keysBySocket = new Map();
  const pausedBySocketKey = new Map();
  const goneTimers = new Map();

  function register(socketId, key) {
    if (!socketsByKey.has(key)) {
      socketsByKey.set(key, new Set());
    }
    socketsByKey.get(key).add(socketId);
    if (!keysBySocket.has(socketId)) {
      keysBySocket.set(socketId, new Set());
    }
    keysBySocket.get(socketId).add(key);

    const pending = goneTimers.get(key);
    if (pending) {
      clearTimer(pending);
      goneTimers.delete(key);
    }
  }

  function release(socketId) {
    const keys = keysBySocket.get(socketId) || new Set();
    keysBySocket.delete(socketId);

    for (const key of keys) {
      pausedBySocketKey.delete(`${socketId}|${key}`);
      const sockets = socketsByKey.get(key);
      if (!sockets) {
        continue;
      }
      sockets.delete(socketId);
      if (sockets.size > 0 || goneTimers.has(key)) {
        continue;
      }
      goneTimers.set(
        key,
        setTimer(() => {
          goneTimers.delete(key);
          if ((socketsByKey.get(key)?.size || 0) === 0) {
            socketsByKey.delete(key);
            options.onGone?.(key);
          }
        }, graceMs),
      );
    }
  }

  function handleConnection(socket) {
    options.onConnect?.(socket);
    socket.onAny((notification, rawPayload) => {
      const payload = parsePayload(rawPayload);
      const key = options.keyOf(payload);
      if (key) {
        register(socket.id, key);
      }
      options.onMessage?.(socket, notification, payload, key);
    });
    socket.on("disconnect", () => release(socket.id));
  }

  const api = {
    attached: false,

    attach(io, namespace = options.namespace) {
      if (!io || typeof io.of !== "function") {
        return api;
      }
      const ns = io.of(namespace);
      ns.on("connection", handleConnection);
      // Sockets that connected before the helper started.
      for (const socket of ns.sockets?.values?.() || []) {
        handleConnection(socket);
      }
      api.attached = true;
      return api;
    },

    /** @returns {boolean} True when at least one socket shows this instance */
    hasClients(key) {
      return (socketsByKey.get(key)?.size || 0) > 0;
    },

    setPaused(socketId, key, paused) {
      pausedBySocketKey.set(`${socketId}|${key}`, paused === true);
    },

    /** @returns {boolean} True when every socket showing the instance reports paused */
    isPaused(key) {
      const sockets = socketsByKey.get(key);
      if (!sockets || sockets.size === 0) {
        return false;
      }
      return [...sockets].every((socketId) => pausedBySocketKey.get(`${socketId}|${key}`) === true);
    },

    stop() {
      for (const timer of goneTimers.values()) {
        clearTimer(timer);
      }
      goneTimers.clear();
    },
  };

  if (options.io) {
    api.attach(options.io);
  }

  return api;
}

/**
 * One backend lifecycle per module instance.
 *
 * @param {object} options - Options
 * @param {string} options.moduleName - Module name (notification prefix, namespace)
 * @param {Function} options.sendSocketNotification - The helper's broadcast
 * @param {Function} options.fetch - async ({ identifier, config, reason }) => data; throws on failure
 * @param {Function} options.lifecycleOptions - (config) => createLifecycle options (interval, quiet hours, ...)
 * @param {string[]} [options.criticalKeys] - Config keys two clients of one instance must agree on
 * @param {Function} [options.prepareConfig] - (config) => effective config; throws when invalid
 * @param {Function} [options.isFailure] - (data) => true when data arrived but counts as a failed fetch
 * @param {Function} [options.onConfigured] - (identifier, config) => void, once per new instance
 * @param {object} [options.io] - Socket.io server; without it replies go out as broadcasts
 * @param {object} [options.logger] - { debug, info, warn, error }
 * @param {number} [options.graceMs] - See createClientRegistry
 * @param {object} [options.timers] - { setTimeout, clearTimeout } for tests
 * @param {Function} [options.now] - Clock for tests
 * @param {Function} [options.random] - Jitter source for tests
 * @returns {object} Hub API
 */
function createInstanceHub(options = {}) {
  const { moduleName } = options;
  const notifications = shared.buildNotifications(moduleName);
  const errorFactory = shared.createErrorFactory();
  const transport = shared.createNodeTransport({
    moduleName,
    sendSocketNotification: options.sendSocketNotification,
  });
  // action -> handler for module-specific requests (MODULE-PLAN S1)
  const routes = new Map();
  const logger = options.logger || null;
  const setTimer = options.timers?.setTimeout || setTimeout;
  const clearTimer = options.timers?.clearTimeout || clearTimeout;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const criticalKeys = options.criticalKeys || [];

  const instances = new Map();

  function log(level, message, context) {
    logger?.[level]?.(message, context);
  }

  function envelope(identifier, action, data, error = null) {
    return shared.createEnvelope({
      identifier,
      instanceId: identifier,
      action,
      ok: !error,
      data,
      error,
    });
  }

  function broadcast(identifier, action, data, error) {
    options.sendSocketNotification(notifications.EVENT, envelope(identifier, action, data, error));
  }

  const registry = createClientRegistry({
    namespace: moduleName,
    keyOf: (payload) => payload?.identifier || null,
    graceMs: options.graceMs,
    timers: options.timers,
    onConnect: (socket) => socket.emit(notifications.EVENT, envelope("*", "INIT_REQUIRED", null)),
    onMessage: (socket, notification, payload) => {
      if (notification === notifications.REQUEST) {
        handleRequest(payload, socket.id, (identifier, action, data, error) =>
          socket.emit(notifications.EVENT, envelope(identifier, action, data, error)),
        );
      }
    },
    onGone: (identifier) => {
      const instance = instances.get(identifier);
      if (instance) {
        stopInstance(instance);
        instances.delete(identifier);
        log("info", "instance released, no display left", { identifier });
      }
    },
  });

  function clearRetry(instance) {
    if (instance.retryTimer) {
      clearTimer(instance.retryTimer);
      instance.retryTimer = null;
    }
  }

  function stopInstance(instance) {
    clearRetry(instance);
    instance.lifecycle.stop();
  }

  /**
   * A failed fetch grows the lifecycle backoff and schedules the retry itself:
   * the backoff alone only blocks attempts, it never starts one (MODULE-PLAN S4).
   */
  function registerFailure(instance) {
    instance.lifecycle.markFetchFailed();
    // mmm-shared from 0.3.0 on schedules the retry itself (it reports
    // retryTimerArmed); only older versions need the timer here.
    if (instance.retryTimer || instance.lifecycle.getState().retryTimerArmed !== undefined) {
      return;
    }
    const delay = Math.max(1000, instance.lifecycle.getState().retryNotBefore - now());
    instance.retryTimer = setTimer(() => {
      instance.retryTimer = null;
      instance.lifecycle.requestFetch("retry");
    }, delay);
  }

  async function runFetch(identifier, reason) {
    const instance = instances.get(identifier);
    if (!instance) {
      return;
    }
    // One fetch per instance; a request in between (e.g. after a user action)
    // runs right after it instead of getting lost.
    if (instance.inFlight) {
      instance.followUp = true;
      return;
    }

    instance.inFlight = true;
    try {
      const data = await options.fetch({ identifier, config: instance.config, reason });
      if (instances.get(identifier) !== instance) {
        return;
      }
      instance.lastData = data;
      instance.lastError = null;
      if (options.isFailure?.(data)) {
        registerFailure(instance);
      } else {
        clearRetry(instance);
        instance.lifecycle.markDataReceived();
      }
      broadcast(identifier, "DATA", data);
    } catch (error) {
      if (instances.get(identifier) !== instance) {
        return;
      }
      const failure = errorFactory.fromException(error, {
        // Keep a domain code the fetch attached (e.g. NO_IMAGES).
        code: error?.code || "FETCH_FAILED",
        retryable: true,
        details: { identifier },
      });
      instance.lastError = failure;
      log("error", "fetch failed", { identifier, reason, message: failure.message });
      registerFailure(instance);
      broadcast(identifier, "FETCH_FAILED", null, failure);
    } finally {
      instance.inFlight = false;
      if (instance.followUp && instances.get(identifier) === instance) {
        instance.followUp = false;
        runFetch(identifier, "follow-up");
      }
    }
  }

  async function handleRoute(handler, payload) {
    const identifier = payload?.identifier;
    const config = instances.get(identifier)?.config;
    if (!config) {
      // The backend lost this instance (restart, or its display was away): the
      // frontend has to configure it again before anything else.
      broadcast(identifier, "INIT_REQUIRED", null);
      transport.sendError(
        payload,
        errorFactory.createError("CONFIG_MISSING", "Module not configured yet, please try again", { identifier }, true),
      );
      return;
    }

    try {
      const result = await handler({ identifier, config, data: payload?.data || {}, payload });
      transport.sendSuccess(payload, result === undefined ? null : result);
    } catch (error) {
      log("error", "request failed", {
        identifier,
        action: payload?.action,
        message: error instanceof Error ? error.message : String(error),
      });
      transport.sendError(
        payload,
        errorFactory.fromException(error, {
          code: error?.code || `${payload?.action}_FAILED`,
          retryable: true,
          details: { identifier },
        }),
      );
    }
  }

  function applyVisibility(identifier) {
    const instance = instances.get(identifier);
    if (!instance) {
      return;
    }
    const paused = registry.isPaused(identifier);
    instance.host.hidden = paused;
    if (paused) {
      instance.lifecycle.suspend("all-displays-paused");
    } else {
      instance.lifecycle.resume("display-active");
    }
  }

  function configure(identifier, config, reply) {
    const existing = instances.get(identifier);
    if (existing) {
      const mismatchKeys = criticalKeys.filter((key) => !sameValue(existing.rawConfig[key], config[key]));
      if (mismatchKeys.length > 0) {
        log("warn", "rejecting client: config differs from the running instance", { identifier, mismatchKeys });
        reply(identifier, "CONFIG_REJECTED", { mismatchKeys });
        return;
      }
      const differing = Object.keys({ ...existing.rawConfig, ...config }).filter(
        (key) => !sameValue(existing.rawConfig[key], config[key]),
      );
      if (differing.length > 0) {
        log("warn", "client config differs, the running config keeps precedence", { identifier, keys: differing });
      }
      if (existing.lastData !== undefined) {
        reply(identifier, "DATA", existing.lastData);
      } else if (existing.lastError) {
        reply(identifier, "FETCH_FAILED", null, existing.lastError);
      }
      return;
    }

    let effectiveConfig;
    try {
      effectiveConfig = options.prepareConfig ? options.prepareConfig(config) : { ...config };
    } catch (error) {
      const failure = errorFactory.fromException(error, {
        code: "CONFIG_INVALID",
        details: { identifier },
      });
      log("error", "invalid config", { identifier, message: failure.message });
      reply(identifier, "CONFIG_INVALID", null, failure);
      return;
    }

    const host = { hidden: registry.isPaused(identifier), data: {} };
    const instance = {
      config: effectiveConfig,
      rawConfig: { ...config },
      host,
      lifecycle: null,
      lastData: undefined,
      lastError: null,
      inFlight: false,
      followUp: false,
      retryTimer: null,
    };
    instance.lifecycle = shared.createLifecycle({
      ...options.lifecycleOptions(instance.config),
      module: host,
      logger,
      timers: options.timers,
      now: options.now,
      random: options.random,
      onFetch: ({ reason }) => {
        runFetch(identifier, reason);
      },
    });
    instances.set(identifier, instance);
    options.onConfigured?.(identifier, instance.config);
    log("info", "instance configured", { identifier });
    instance.lifecycle.start("configure");
  }

  /**
   * Handle CONFIGURE and SESSION_STATE.
   * @returns {boolean} True when the request was one of them
   */
  function handleRequest(payload, socketId, reply) {
    const identifier = payload?.identifier;
    const action = payload?.action;
    if (!identifier || (action !== "CONFIGURE" && action !== "SESSION_STATE")) {
      return false;
    }

    if (action === "CONFIGURE") {
      configure(identifier, payload?.data?.config || {}, reply);
      return true;
    }

    registry.setPaused(socketId, identifier, payload?.data?.state === "paused");
    applyVisibility(identifier);
    return true;
  }

  const api = {
    notifications,

    /** Wire the socket.io server; call from the helper's start(). */
    attach(io) {
      registry.attach(io, moduleName);
      return api;
    },

    /**
     * Call from socketNotificationReceived. With sockets attached the requests
     * were already handled per socket; this only reports them as consumed.
     * @returns {boolean} True when the notification belongs to the hub
     */
    socketNotificationReceived(notification, payload) {
      if (notification !== notifications.REQUEST) {
        return false;
      }
      const action = payload?.action;
      if (routes.has(action)) {
        handleRoute(routes.get(action), payload);
        return true;
      }
      if (action !== "CONFIGURE" && action !== "SESSION_STATE") {
        return false;
      }
      if (!registry.attached) {
        handleRequest(payload, "default", broadcast);
      }
      return true;
    },

    /**
     * Route a module-specific request (e.g. a write triggered in the frontend).
     * The hub resolves the instance and its config, answers INIT_REQUIRED when
     * the instance is unknown, and turns the handler's result into RESPONSE or
     * ERROR for exactly that request.
     *
     * @param {string} action - Request action
     * @param {Function} handler - async ({ identifier, config, data, payload }) => result
     * @returns {object} The hub API
     */
    route(action, handler) {
      routes.set(action, handler);
      return api;
    },

    has(identifier) {
      return instances.has(identifier);
    },

    /** Fetch now, outside the schedule (e.g. after a write). */
    fetchNow(identifier, reason = "manual") {
      return runFetch(identifier, reason);
    },

    stop() {
      for (const instance of instances.values()) {
        stopInstance(instance);
      }
      instances.clear();
      registry.stop();
    },
  };

  if (options.io) {
    api.attach(options.io);
  }

  return api;
}

/**
 * One log line from a structured createLogger entry: "[identifier] message {context}".
 * A node_helper hands it to MagicMirror's Log, which puts timestamp, level and
 * the module folder in front. Anything that is not such an entry passes through.
 *
 * @param {*} entry - What createLogger({ structured: true }) wrote
 * @returns {*} The line, or the entry unchanged
 */
function formatLogEntry(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.message !== "string") {
    return entry;
  }
  const tag = entry.identifier && entry.identifier !== "node_helper" ? `[${entry.identifier}] ` : "";
  let context = "";
  if (typeof entry.context === "string" || typeof entry.context === "number") {
    context = ` ${entry.context}`;
  } else if (entry.context && typeof entry.context === "object" && Object.keys(entry.context).length > 0) {
    try {
      context = ` ${JSON.stringify(entry.context)}`;
    } catch {
      context = " [unserializable context]";
    }
  }
  return `${tag}${entry.message}${context}`;
}

module.exports = {
  createClientRegistry,
  createInstanceHub,
  formatLogEntry,
};
