/*
 * Tests for lib/backend-session.js. Module-local copy, byte-identical in every
 * module that carries lib/backend-session.js - change them together.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { createClientRegistry, createInstanceHub, formatLogEntry } = require("../lib/backend-session");

const MODULE = "MMM-Test";
const REQUEST = `${MODULE}_REQUEST`;
const EVENT = `${MODULE}_EVENT`;

/** Manual clock: timers only fire when advance() passes them. */
function createClock(start = Date.parse("2026-09-23T10:00:00Z")) {
  let t = start;
  const pending = [];
  return {
    now: () => t,
    timers: {
      setTimeout(fn, ms) {
        const handle = { at: t + Math.max(0, ms), fn };
        pending.push(handle);
        return handle;
      },
      clearTimeout(handle) {
        const index = pending.indexOf(handle);
        if (index !== -1) {
          pending.splice(index, 1);
        }
      },
    },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        pending.sort((a, b) => a.at - b.at);
        const next = pending[0];
        if (!next || next.at > end) {
          break;
        }
        pending.shift();
        t = next.at;
        next.fn();
        await settle();
      }
      t = end;
      await settle();
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

class FakeSocket extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.sent = [];
    this.anyHandlers = [];
  }

  onAny(handler) {
    this.anyHandlers.push(handler);
  }

  // Server -> this browser.
  emit(notification, payload) {
    this.sent.push({ notification, payload });
    return true;
  }

  // This browser -> server.
  send(notification, payload) {
    for (const handler of this.anyHandlers) {
      handler(notification, payload);
    }
  }

  disconnect() {
    EventEmitter.prototype.emit.call(this, "disconnect");
  }
}

function createFakeIo() {
  const namespace = new EventEmitter();
  namespace.sockets = new Map();
  return {
    of: () => namespace,
    connect(id) {
      const socket = new FakeSocket(id);
      namespace.sockets.set(id, socket);
      namespace.emit("connection", socket);
      return socket;
    },
  };
}

function request(identifier, action, data) {
  return { identifier, instanceId: identifier, action, data };
}

function startHub(overrides = {}) {
  const clock = createClock();
  const io = createFakeIo();
  const broadcasts = [];
  const fetches = [];
  let behaviour = async () => ({ value: fetches.length });

  const hub = createInstanceHub({
    moduleName: MODULE,
    sendSocketNotification: (notification, payload) => broadcasts.push({ notification, payload }),
    criticalKeys: ["account"],
    lifecycleOptions: (config) => ({
      updateInterval: config.updateInterval ?? 10 * 60 * 1000,
      minUpdateInterval: 1000,
      jitterRatio: 0,
      backgroundRefresh: config.backgroundRefresh !== false,
    }),
    fetch: async (context) => {
      fetches.push(context);
      return behaviour(context);
    },
    timers: clock.timers,
    now: clock.now,
    graceMs: 60 * 1000,
    io,
    ...overrides,
  });

  return {
    hub,
    io,
    clock,
    broadcasts,
    fetches,
    setBehaviour: (fn) => {
      behaviour = fn;
    },
    events: (action) => broadcasts.filter((b) => b.payload.action === action),
  };
}

test("a new connection is asked to send its config", () => {
  const { io } = startHub();
  const socket = io.connect("s1");
  assert.equal(socket.sent[0].notification, EVENT);
  assert.equal(socket.sent[0].payload.action, "INIT_REQUIRED");
  assert.equal(socket.sent[0].payload.identifier, "*");
});

test("CONFIGURE starts the backend schedule: one fetch now, the next one after the interval", async () => {
  const { io, clock, fetches, events } = startHub();
  const socket = io.connect("s1");
  socket.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].config.account, "a");
  assert.equal(events("DATA").length, 1);

  await clock.advance(10 * 60 * 1000);
  assert.equal(fetches.length, 2, "the backend owns the cadence");
});

test("a second display of the same instance gets the cached data instead of a new fetch", async () => {
  const { io, fetches } = startHub();
  io.connect("s1").send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  const second = io.connect("s2");
  second.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  assert.equal(fetches.length, 1);
  const reply = second.sent.find((m) => m.payload.action === "DATA");
  assert.ok(reply, "the new display is served from the cache");
});

test("a client with different credentials is rejected, only that socket hears about it", async () => {
  const { io, fetches } = startHub();
  const first = io.connect("s1");
  first.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  const other = io.connect("s2");
  other.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "b" } }));
  await settle();

  const rejection = other.sent.find((m) => m.payload.action === "CONFIG_REJECTED");
  assert.deepEqual(rejection.payload.data.mismatchKeys, ["account"]);
  assert.ok(!first.sent.some((m) => m.payload.action === "CONFIG_REJECTED"));
  assert.equal(fetches.length, 1);
});

test("an instance without any display is released after the grace period", async () => {
  const { io, clock, fetches, hub } = startHub();
  const socket = io.connect("s1");
  socket.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  socket.disconnect();
  await clock.advance(59 * 1000);
  assert.equal(hub.has("m1"), true, "a reload within the grace period keeps the instance");

  await clock.advance(2 * 1000);
  assert.equal(hub.has("m1"), false);
  await clock.advance(60 * 60 * 1000);
  assert.equal(fetches.length, 1, "no more fetches for a display that went away");
});

test("a reconnect within the grace period keeps the instance", async () => {
  const { io, clock, hub } = startHub();
  const socket = io.connect("s1");
  socket.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  socket.disconnect();
  await clock.advance(30 * 1000);
  io.connect("s2").send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await clock.advance(5 * 60 * 1000);
  assert.equal(hub.has("m1"), true);
});

test("a failed fetch is retried with backoff instead of waiting for the next interval", async () => {
  const { io, clock, fetches, setBehaviour, events } = startHub();
  setBehaviour(async () => {
    throw new Error("network down");
  });
  io.connect("s1").send(
    REQUEST,
    request("m1", "CONFIGURE", { config: { account: "a", updateInterval: 6 * 60 * 60 * 1000 } }),
  );
  await settle();
  assert.equal(events("FETCH_FAILED").length, 1);

  setBehaviour(async () => ({ ok: true }));
  await clock.advance(2 * 60 * 1000);
  assert.equal(fetches.length, 2, "retried within minutes, not after 6 h");
  assert.equal(events("DATA").length, 1);
});

test("isFailure data is delivered and still retried", async () => {
  const { io, clock, fetches, events } = startHub({ isFailure: (data) => data.value === 1 });
  io.connect("s1").send(
    REQUEST,
    request("m1", "CONFIGURE", { config: { account: "a", updateInterval: 6 * 60 * 60 * 1000 } }),
  );
  await settle();
  assert.equal(events("DATA").length, 1, "partial data still reaches the display");

  await clock.advance(2 * 60 * 1000);
  assert.equal(fetches.length, 2);
});

test("a fetch requested while one runs is run afterwards", async () => {
  const { io, hub, fetches, setBehaviour } = startHub();
  let release;
  setBehaviour(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true });
      }),
  );
  io.connect("s1").send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  hub.fetchNow("m1", "user-action");
  await settle();
  assert.equal(fetches.length, 1);

  release();
  await settle();
  assert.equal(fetches.length, 2);
  assert.equal(fetches[1].reason, "follow-up");
  release();
  await settle();
});

test("with backgroundRefresh off, fetching pauses while every display is paused", async () => {
  const { io, clock, fetches } = startHub();
  const socket = io.connect("s1");
  socket.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a", backgroundRefresh: false } }));
  await settle();
  assert.equal(fetches.length, 1);

  socket.send(REQUEST, request("m1", "SESSION_STATE", { state: "paused" }));
  await clock.advance(30 * 60 * 1000);
  assert.equal(fetches.length, 1, "nobody sees it, nothing is fetched");

  socket.send(REQUEST, request("m1", "SESSION_STATE", { state: "active" }));
  await settle();
  assert.equal(fetches.length, 2, "stale data is refreshed when a display shows it again");
});

test("without socket.io the hub still works through socketNotificationReceived", async () => {
  const { hub, broadcasts, fetches } = startHub({ io: undefined });
  const consumed = hub.socketNotificationReceived(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  assert.equal(consumed, true);
  assert.equal(fetches.length, 1);
  assert.equal(broadcasts.at(-1).payload.action, "DATA");
  assert.equal(hub.socketNotificationReceived(REQUEST, request("m1", "OTHER", {})), false);
});

test("the registry reports clients and pause state per instance", async () => {
  const clock = createClock();
  const io = createFakeIo();
  const gone = [];
  const registry = createClientRegistry({
    io,
    namespace: MODULE,
    keyOf: (payload) => payload?.instanceId || null,
    onGone: (key) => gone.push(key),
    graceMs: 1000,
    timers: clock.timers,
  });

  const a = io.connect("a");
  const b = io.connect("b");
  a.send(REQUEST, { instanceId: "x" });
  b.send(REQUEST, { instanceId: "x" });
  registry.setPaused("a", "x", true);
  assert.equal(registry.hasClients("x"), true);
  assert.equal(registry.isPaused("x"), false, "one display still shows it");
  registry.setPaused("b", "x", true);
  assert.equal(registry.isPaused("x"), true);

  a.disconnect();
  b.disconnect();
  await clock.advance(1500);
  assert.deepEqual(gone, ["x"]);
  assert.equal(registry.hasClients("x"), false);
});

test("an invalid config is answered with CONFIG_INVALID and starts nothing", async () => {
  const { io, fetches, hub } = startHub({
    prepareConfig: (config) => {
      if (!config.account) {
        throw new Error("account is required");
      }
      return { ...config, normalized: true };
    },
  });
  const socket = io.connect("s1");
  socket.send(REQUEST, request("m1", "CONFIGURE", { config: {} }));
  await settle();

  const reply = socket.sent.find((m) => m.payload.action === "CONFIG_INVALID");
  assert.match(reply.payload.error.message, /account is required/);
  assert.equal(hub.has("m1"), false);
  assert.equal(fetches.length, 0);

  socket.send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();
  assert.equal(fetches[0].config.normalized, true, "the fetch works off the prepared config");
});

test("a routed request gets the instance config and one answer for exactly that request", async () => {
  const { io, hub, broadcasts } = startHub();
  io.connect("s1").send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();

  const calls = [];
  hub.route("WRITE", async ({ identifier, config, data }) => {
    calls.push({ identifier, account: config.account, data });
    return { written: true };
  });
  hub.socketNotificationReceived(REQUEST, { ...request("m1", "WRITE", { value: 1 }), requestId: "r1" });
  await settle();

  assert.deepEqual(calls, [{ identifier: "m1", account: "a", data: { value: 1 } }]);
  const answer = broadcasts.find((b) => b.notification === `${MODULE}_RESPONSE`);
  assert.equal(answer.payload.requestId, "r1");
  assert.deepEqual(answer.payload.data, { written: true });
});

test("a routed request for an unknown instance asks for CONFIGURE and fails cleanly", async () => {
  const { hub, broadcasts } = startHub();
  let called = false;
  hub.route("WRITE", async () => {
    called = true;
  });
  hub.socketNotificationReceived(REQUEST, request("m9", "WRITE", {}));
  await settle();

  assert.equal(called, false);
  assert.ok(broadcasts.some((b) => b.payload.action === "INIT_REQUIRED" && b.payload.identifier === "m9"));
  const error = broadcasts.find((b) => b.notification === `${MODULE}_ERROR`);
  assert.equal(error.payload.error.code, "CONFIG_MISSING");
});

test("a failing routed request keeps its error code", async () => {
  const { io, hub, broadcasts } = startHub();
  io.connect("s1").send(REQUEST, request("m1", "CONFIGURE", { config: { account: "a" } }));
  await settle();
  hub.route("WRITE", async () => {
    throw Object.assign(new Error("412 Precondition Failed"), { code: "WRITE_CONFLICT" });
  });
  hub.route("OTHER", async () => {
    throw new Error("boom");
  });
  hub.socketNotificationReceived(REQUEST, request("m1", "WRITE", {}));
  hub.socketNotificationReceived(REQUEST, request("m1", "OTHER", {}));
  await settle();

  const codes = broadcasts.filter((b) => b.notification === `${MODULE}_ERROR`).map((b) => b.payload.error.code);
  assert.deepEqual(codes, ["WRITE_CONFLICT", "OTHER_FAILED"]);
});

test("config key order does not count as a difference", async () => {
  const { io, fetches } = startHub({ criticalKeys: ["account"] });
  io.connect("s1").send(REQUEST, request("m1", "CONFIGURE", { config: { account: { user: "u", url: "x" } } }));
  await settle();
  const second = io.connect("s2");
  second.send(REQUEST, request("m1", "CONFIGURE", { config: { account: { url: "x", user: "u" } } }));
  await settle();

  assert.ok(!second.sent.some((m) => m.payload.action === "CONFIG_REJECTED"));
  assert.equal(fetches.length, 1);
});

test("formatLogEntry turns a structured entry into one line", () => {
  const entry = (identifier, context) => ({
    ts: 1,
    level: "info",
    module: "MMM-X",
    identifier,
    message: "done",
    context,
  });
  assert.equal(formatLogEntry(entry("node_helper", {})), "done");
  assert.equal(formatLogEntry(entry("module_8_MMM-X", { size: 3 })), '[module_8_MMM-X] done {"size":3}');
  assert.equal(formatLogEntry(entry("global", "timeout")), "[global] done timeout");
  assert.equal(formatLogEntry("plain text"), "plain text");
});
