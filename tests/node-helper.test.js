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

function createHelper() {
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

  // Send a request as the frontend with the given identifier and wait for the answer.
  helper.request = (identifier, config, action = "NEXT_IMAGE") =>
    new Promise((resolve) => {
      waiters.push({ identifier, resolve });
      helper.socketNotificationReceived("MMM-Photoprism2_REQUEST", {
        identifier,
        instanceId: identifier,
        action,
        data: { config: { apiUrl: API_URL, logLevel: "error", ...config } },
      });
    });

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
  const { helper } = createHelper();

  const first = await Promise.all([
    helper.request("module_1_MMM-Photoprism2", { albumId: "albumA" }),
    helper.request("module_2_MMM-Photoprism2", { albumId: "albumB" }),
  ]);
  const second = await Promise.all([
    helper.request("module_1_MMM-Photoprism2", { albumId: "albumA" }),
    helper.request("module_2_MMM-Photoprism2", { albumId: "albumB" }),
  ]);

  for (const [a, b] of [first, second]) {
    assert.match(a.payload.data.path, /hash_a1/);
    assert.match(b.payload.data.path, /hash_b1/);
  }
  // One listing per instance; the second round is served from the caches.
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
  const { helper } = createHelper();

  await helper.request("module_1_MMM-Photoprism2", { albumId: "big" });

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
  const { helper } = createHelper();

  const failed = await helper.request("module_1_MMM-Photoprism2", { albumId: "a" });
  assert.equal(failed.notification, "MMM-Photoprism2_ERROR");
  assert.equal(failed.payload.error.code, "FETCH_FAILED");
  assert.ok(calls[0].options.signal instanceof AbortSignal);

  // Real requests arrive as separate socket events, after the failed refresh settled.
  await new Promise(setImmediate);
  fail = false;
  const retried = await helper.request("module_1_MMM-Photoprism2", { albumId: "a" });
  assert.equal(retried.notification, "MMM-Photoprism2_RESPONSE");
});

test("an HTML page with status 200 is reported as invalid format", async (t) => {
  stubFetch(t, () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => JSON.parse("<!doctype html>"),
  }));
  const { helper } = createHelper();

  const answer = await helper.request("module_1_MMM-Photoprism2", { albumId: "a" });

  assert.equal(answer.notification, "MMM-Photoprism2_ERROR");
  assert.equal(answer.payload.error.code, "INVALID_FORMAT");
});

test("photos without a title send no placeholder title", async (t) => {
  stubFetch(t, () => jsonResponse([{ ...photo("a"), Title: "" }]));
  const { helper } = createHelper();

  const answer = await helper.request("module_1_MMM-Photoprism2", { albumId: "a" });

  assert.equal(answer.payload.data.title, null);
});
