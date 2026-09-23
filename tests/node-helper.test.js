const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// node_helper only exists inside MagicMirror; NodeHelper.create() just returns
// the definition, which is all these tests need.
const STUB_PATH = "/virtual/node_helper.js";
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  return request === "node_helper" ? STUB_PATH : originalResolve.call(this, request, ...rest);
};
const stub = new Module(STUB_PATH);
stub.exports = { create: (definition) => definition };
stub.loaded = true;
require.cache[STUB_PATH] = stub;

const helperDefinition = require("../node_helper");

const API_URL = "http://photoprism.test";

function photo(uid) {
  return { UID: uid, Title: `Photo ${uid}`, Files: [{ Hash: `hash_${uid}`, Primary: true }] };
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: new Map([["x-preview-token", "pt"]]),
    json: async () => body,
  };
}

/**
 * A helper without socket.io: CONFIGURE and the pushed events go through
 * socketNotificationReceived / sendSocketNotification. Stopped after the test
 * so the backend rotation does not keep node alive.
 */
function createHelper(t) {
  const helper = Object.create(helperDefinition);
  const sent = [];
  const waiters = [];
  helper.sendSocketNotification = (notification, payload) => {
    sent.push({ notification, payload });
    const index = waiters.findIndex((w) => w.identifier === payload.identifier);
    if (index !== -1) {
      waiters.splice(index, 1)[0].resolve({ notification, payload });
    }
  };
  helper.start();
  t.after(() => helper.stop());

  const nextEvent = (identifier) =>
    new Promise((resolve) => {
      waiters.push({ identifier, resolve });
    });

  // Configure an instance as its frontend would and wait for the first push.
  helper.configure = (identifier, config) => {
    const answer = nextEvent(identifier);
    helper.socketNotificationReceived("MMM-Photoprism2_REQUEST", {
      identifier,
      instanceId: identifier,
      action: "CONFIGURE",
      data: { config: { apiUrl: API_URL, logLevel: "error", ...config } },
    });
    return answer;
  };

  // Rotate once outside the schedule and wait for the push.
  helper.next = (identifier) => {
    const answer = nextEvent(identifier);
    helper.hub.fetchNow(identifier, "test");
    return answer;
  };

  return { helper, sent };
}

function stubFetch(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    return handler(parsed, options);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test("two instances on one server keep separate album indexes", async (t) => {
  const calls = stubFetch(t, (url) =>
    jsonResponse(url.searchParams.get("s") === "albumA" ? [photo("a1")] : [photo("b1")]),
  );
  const { helper } = createHelper(t);

  const first = await Promise.all([
    helper.configure("module_1_MMM-Photoprism2", { albumId: "albumA" }),
    helper.configure("module_2_MMM-Photoprism2", { albumId: "albumB" }),
  ]);
  const second = await Promise.all([helper.next("module_1_MMM-Photoprism2"), helper.next("module_2_MMM-Photoprism2")]);

  for (const [a, b] of [first, second]) {
    assert.equal(a.payload.action, "DATA");
    assert.match(a.payload.data.path, /hash_a1/);
    assert.match(b.payload.data.path, /hash_b1/);
  }
  // One listing per instance; the next rotation is served from the caches.
  assert.equal(calls.length, 2);
  assert.equal(helper.instanceStates.size, 2);
});

test("album listings beyond one page are fetched completely", async (t) => {
  const all = Array.from({ length: 1005 }, (_, i) => photo(`p${i}`));
  const calls = stubFetch(t, (url) => {
    const offset = Number(url.searchParams.get("offset"));
    const count = Number(url.searchParams.get("count"));
    return jsonResponse(all.slice(offset, offset + count));
  });
  const { helper } = createHelper(t);

  await helper.configure("module_1_MMM-Photoprism2", { albumId: "big" });

  assert.deepEqual(
    calls.map((c) => c.url.searchParams.get("offset")),
    ["0", "1000"],
  );
  assert.equal(helper.instanceStates.get("module_1_MMM-Photoprism2").albumIndex.size(), 1005);
});

test("the album listing runs with a timeout and a timed-out refresh can be retried", async (t) => {
  let fail = true;
  const calls = stubFetch(t, () => {
    if (fail) {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }
    return jsonResponse([photo("a")]);
  });
  const { helper } = createHelper(t);

  const failed = await helper.configure("module_1_MMM-Photoprism2", { albumId: "a" });
  assert.equal(failed.payload.action, "FETCH_FAILED");
  assert.equal(failed.payload.error.code, "FETCH_FAILED");
  assert.ok(calls[0].options.signal instanceof AbortSignal);

  fail = false;
  const retried = await helper.next("module_1_MMM-Photoprism2");
  assert.equal(retried.payload.action, "DATA");
});

test("an HTML page with status 200 is reported as invalid format", async (t) => {
  stubFetch(t, () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => JSON.parse("<!doctype html>"),
  }));
  const { helper } = createHelper(t);

  const answer = await helper.configure("module_1_MMM-Photoprism2", { albumId: "a" });

  assert.equal(answer.payload.action, "FETCH_FAILED");
  assert.equal(answer.payload.error.code, "INVALID_FORMAT");
});

test("photos without a title send no placeholder title", async (t) => {
  stubFetch(t, () => jsonResponse([{ ...photo("a"), Title: "" }]));
  const { helper } = createHelper(t);

  const answer = await helper.configure("module_1_MMM-Photoprism2", { albumId: "a" });

  assert.equal(answer.payload.data.title, null);
});

test("albumIndexTtl from CONFIGURE decides when the album is listed again", async (t) => {
  const calls = stubFetch(t, () => jsonResponse([photo("a"), photo("b")]));
  const { helper } = createHelper(t);

  await helper.configure("module_1_MMM-Photoprism2", { albumId: "a", albumIndexTtl: 60 * 60 * 1000 });
  await helper.next("module_1_MMM-Photoprism2");
  assert.equal(calls.length, 1, "served from the cache");

  await helper.configure("module_2_MMM-Photoprism2", { albumId: "a", albumIndexTtl: 0 });
  await helper.next("module_2_MMM-Photoprism2");
  assert.equal(calls.length, 3, "a zero TTL lists on every rotation");
});

test("a config without apiUrl or albumId is refused at CONFIGURE", async (t) => {
  const calls = stubFetch(t, () => jsonResponse([photo("a")]));
  const { helper } = createHelper(t);

  const answer = await helper.configure("module_1_MMM-Photoprism2", { albumId: "" });

  assert.equal(answer.payload.action, "CONFIG_INVALID");
  assert.equal(calls.length, 0);
});

test("the frontend no longer drives the rotation: NEXT_IMAGE is ignored", async (t) => {
  const calls = stubFetch(t, () => jsonResponse([photo("a")]));
  const { helper, sent } = createHelper(t);

  for (const action of ["NEXT_IMAGE", "REFRESH_INDEX"]) {
    helper.socketNotificationReceived("MMM-Photoprism2_REQUEST", {
      identifier: "module_1_MMM-Photoprism2",
      action,
      data: { config: { apiUrl: API_URL, albumId: "a", logLevel: "error" } },
    });
  }
  await new Promise(setImmediate);

  assert.equal(calls.length, 0);
  assert.equal(sent.length, 0);
});
