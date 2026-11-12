const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "MMM-Photoprism2.js"), "utf8");
const en = require("../translations/en.json");
const de = require("../translations/de.json");

/** MagicMirror's Module.translate(): the language file, then English, then the key; {name} placeholders. */
function translatorFor(table) {
  return (key, variables = {}) =>
    (table[key] ?? en[key] ?? key).replace(/\{([^}]+)\}/g, (match, name) =>
      name in variables ? variables[name] : match,
    );
}

/** Just enough DOM for getDom(): text, children, style. */
function fakeDocument() {
  const element = () => ({
    children: [],
    style: {},
    ownText: "",
    set textContent(value) {
      this.ownText = String(value);
    },
    get textContent() {
      return this.ownText + this.children.map((child) => child.textContent).join(" ");
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  });
  return { createElement: element };
}

function germanModule() {
  let definition = null;
  vm.runInNewContext(source, {
    Module: { register: (_name, d) => (definition = d) },
    document: fakeDocument(),
  });
  const module = Object.create(definition);
  Object.assign(module, {
    identifier: "m1",
    config: { ...definition.defaults },
    notifications: { EVENT: "EVENT" },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    lifecycle: { markDataReceived() {}, render() {} },
    translate: translatorFor(de),
  });
  return module;
}

test("en and de carry the same keys, every key in use exists and none is unused", () => {
  const used = new Set([...source.matchAll(/translate\("([A-Z_]+)"/g)].map(([, key]) => key));
  // getDom picks LOADING or NO_IMAGE with a conditional.
  for (const [, a, b] of source.matchAll(/translate\(this\.\w+ \? "([A-Z_]+)" : "([A-Z_]+)"\)/g)) {
    used.add(a);
    used.add(b);
  }
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  assert.deepEqual([...used].sort(), Object.keys(en).sort());
});

test("with language de no visible status text stays English", () => {
  const module = germanModule();
  const shown = [module.getDom().textContent];

  module.loaded = true;
  shown.push(module.getDom().textContent);

  module.socketNotificationReceived("EVENT", { identifier: "m1", action: "FETCH_FAILED", error: {} });
  shown.push(module.getDom().textContent);

  module.socketNotificationReceived("EVENT", {
    identifier: "m1",
    action: "CONFIG_REJECTED",
    data: { mismatchKeys: ["albums"] },
  });
  shown.push(module.getDom().textContent);

  // An image stays on screen when a later refresh fails; the notice is translated too.
  module.currentImage = { path: "a.jpg", title: "Strand" };
  module.error = "timeout";
  shown.push(module.getDom().textContent);

  assert.deepEqual(shown, [
    "Lade …",
    "Kein Bild verfügbar",
    "Fehler: Unbekannter Fehler",
    "Fehler: Die Konfiguration weicht von der laufenden Instanz ab: albums",
    " Strand Fehler: timeout",
  ]);
  for (const english of ["Loading", "No image", "Error", "Unknown", "Config differs"]) {
    assert.ok(!shown.join("|").includes(english), english);
  }
});
