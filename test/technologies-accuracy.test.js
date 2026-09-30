// Detection rules that keep one site's traces from being read as another's.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectTechnologies } from "../extension/src/engine/technologies.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const names = (/** @type {import("../extension/src/types.js").PageData} */ page) => detectTechnologies(page, db).map((t) => t.name);

describe("technology detection", () => {
  it("does not read a tag manager's code as the site's platform", () => {
    const gtm = script("https://www.googletagmanager.com/gtm.js?id=GTM-X", 'var a="/wp-content/plugins/x";');
    assert.ok(!names(makePage({ scripts: [gtm] })).includes("WordPress"));
  });

  it("does not take a platform from a string inside the site's own bundle alone", () => {
    const bundle = script("https://shop.example/_next/static/app.js", 'fetch("/legacy/api.php?x=1"); var u="/wp-content/uploads/a.png";');
    const found = names(makePage({ scripts: [bundle] }));
    assert.ok(!found.includes("PHP"));
    assert.ok(!found.includes("WordPress"));
  });

  it("still detects a platform from direct traces", () => {
    assert.ok(names(makePage({ meta: { generator: ["WordPress 7.1.2"] } })).includes("WordPress"));
    assert.ok(names(makePage({ headers: { ...makePage().headers, "x-powered-by": "PHP/8.3.1" } })).includes("PHP"));
  });

  it("still detects a tool configured in a tag manager's code", () => {
    const gtm = script("https://www.googletagmanager.com/gtm.js?id=GTM-X", 'var s=document.createElement("script");s.src="https://live.adenzo.com/tag.js";');
    assert.ok(names(makePage({ scripts: [gtm] })).includes("Adenzo"));
  });

  it("does not report a fingerprint that only carries a confidence:0 pattern", () => {
    assert.ok(!names(makePage({ meta: { version: ["1.260928.094609-sha.d6ca6e1"] } })).includes("Fourthwall"));
  });
});
