// Guards for the promises the README makes. If one of these fails, the change needs a conscious
// decision and a README update, not a test tweak.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MESSAGE_IDS } from "../extension/popup/i18n.js";

const root = fileURLToPath(new URL("../extension/", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

/** @returns {string[]} */
function sourceFiles(dir = root) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "data" ? [] : sourceFiles(path);
    return /\.(js|html)$/.test(name) ? [path] : [];
  });
}

describe("security policy", () => {
  it("asks only for activeTab and scripting", () => {
    assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting"]);
    for (const key of [
      "host_permissions",
      "optional_permissions",
      "optional_host_permissions",
      "content_scripts",
      "background",
      "externally_connectable",
      "web_accessible_resources",
    ]) {
      assert.equal(manifest[key], undefined, `${key} must not be declared`);
    }
  });

  it("lets extension pages load and connect to nothing but the extension itself", () => {
    const csp = manifest.content_security_policy.extension_pages;
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'self'/);
  });

  it("contains no remote code, eval or HTML injection", () => {
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /<script[^>]+src=["']https?:/i, `${file}: remote script`);
      assert.doesNotMatch(text, /\beval\(|new Function\(|\.innerHTML\s*=|insertAdjacentHTML/, `${file}: dynamic code or HTML`);
      assert.doesNotMatch(text, /import\s*\(\s*["']https?:/, `${file}: remote import`);
    }
  });

  it("only fetches the page's own resources or bundled data", () => {
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /fetch\(\s*["'`]https?:/, `${file}: fetches a hard-coded remote URL`);
      assert.doesNotMatch(text, /XMLHttpRequest|sendBeacon|WebSocket\(/, `${file}: other network API`);
    }
  });
});

describe("messages", () => {
  it("has the same message ids in every language", () => {
    assert.deepEqual([...MESSAGE_IDS.ja].sort(), [...MESSAGE_IDS.en].sort());
  });

  it("has a message for every finding a check can emit", () => {
    const emitted = new Set();
    for (const file of sourceFiles(join(root, "src"))) {
      for (const match of readFileSync(file, "utf8").matchAll(/finding\(\s*"([a-z_]+)"/g)) emitted.add(match[1]);
    }
    assert.ok(emitted.size > 20);
    for (const id of emitted) assert.ok(MESSAGE_IDS.en.includes(id), `missing message for ${id}`);
  });
});

describe("bundled data", () => {
  it("has valid end-of-life cycles", () => {
    const eol = JSON.parse(readFileSync(join(root, "data", "eol.json"), "utf8"));
    for (const [name, product] of Object.entries(eol.products)) {
      for (const cycle of /** @type {any} */ (product).cycles) {
        assert.ok(!Number.isNaN(Date.parse(cycle.eol)), `${name} ${cycle.label}`);
        assert.match(cycle.below, /^\d+(\.\d+)*$/);
      }
    }
  });

  it("has compilable payment-provider patterns", () => {
    const { providers } = JSON.parse(readFileSync(join(root, "data", "payment-providers.json"), "utf8"));
    for (const provider of providers) {
      for (const re of provider.tokenScripts ?? []) assert.doesNotThrow(() => new RegExp(re), provider.name);
    }
  });
});
