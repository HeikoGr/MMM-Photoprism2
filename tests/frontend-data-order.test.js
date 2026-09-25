const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "MMM-Photoprism2.js"), "utf8");

function loadModule() {
  let definition = null;
  vm.runInNewContext(source, { Module: { register: (_name, d) => (definition = d) } });
  const module = Object.create(definition);
  module.identifier = "module_1_MMM-Photoprism2";
  module.config = { ...definition.defaults };
  module.notifications = { EVENT: "MMM-Photoprism2_EVENT" };
  module.logger = { debug() {}, info() {}, warn() {}, error() {} };
  module.lifecycle = { markDataReceived() {}, render() {} };
  module.imageUrl = (image) => image.path;
  // Preloads finish when the test says so.
  module.pending = new Map();
  module.preloadImage = (url) => new Promise((resolve) => module.pending.set(url, resolve));
  return module;
}

const data = (name) => ({ identifier: "module_1_MMM-Photoprism2", action: "DATA", data: { path: name } });

test("an older image whose preload finishes last does not replace the newer one", async () => {
  const module = loadModule();

  const older = module.socketNotificationReceived("MMM-Photoprism2_EVENT", data("older.jpg"));
  const newer = module.socketNotificationReceived("MMM-Photoprism2_EVENT", data("newer.jpg"));
  module.pending.get("newer.jpg")();
  await newer;
  module.pending.get("older.jpg")();
  await older;

  assert.equal(module.currentImage.path, "newer.jpg");
});
