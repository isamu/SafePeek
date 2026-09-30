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

  it("does not let a script-only tool bring a platform in through implies", () => {
    const found = names(makePage({ scripts: [script("https://app.example/build/app.js", "import('media-library-pro-core')")] }));
    assert.ok(!found.includes("Laravel"), found.join(", "));
    assert.ok(!found.includes("PHP"), found.join(", "));
  });

  it("still lets a directly seen platform imply others", () => {
    const found = names(makePage({ meta: { generator: ["WordPress 7.1.2"] } }));
    assert.ok(found.includes("PHP") && found.includes("MySQL"), found.join(", "));
  });

  it("still detects a platform from direct traces", () => {
    assert.ok(names(makePage({ meta: { generator: ["WordPress 7.1.2"] } })).includes("WordPress"));
    assert.ok(names(makePage({ headers: { ...makePage().headers, "x-powered-by": "PHP/8.3.1" } })).includes("PHP"));
  });

  it("still detects a tool configured in a tag manager's code", () => {
    const gtm = script("https://www.googletagmanager.com/gtm.js?id=GTM-X", 'var s=document.createElement("script");s.src="https://live.adenzo.com/tag.js";');
    assert.ok(names(makePage({ scripts: [gtm] })).includes("Adenzo"));
  });

  it("keeps a platform that a directly seen technology implies, whatever implied it first", () => {
    // AScript (script-only) reaches Framework and Language first; CDirect reaches Framework one step later via Mid.
    const tiny = {
      technologies: {
        AScript: { scripts: "ascript-marker", implies: "Framework", cats: [] },
        CDirect: { meta: { generator: "^CDirect$" }, implies: "Mid", cats: [] },
        Mid: { implies: "Framework", cats: [] },
        Framework: { implies: "Language", cats: [18] },
        Language: { cats: [27] },
      },
      categories: {},
    };
    const page = makePage({ meta: { generator: ["CDirect"] }, scripts: [script("https://site.example/a.js", "ascript-marker")] });
    assert.deepEqual(
      detectTechnologies(page, tiny)
        .map((t) => t.name)
        .sort(),
      ["AScript", "CDirect", "Framework", "Language", "Mid"],
    );
  });

  it("keeps a platform seen only in script code when a directly seen technology implies it", () => {
    const page = makePage({
      meta: { generator: ["WordPress 6.9.9"] },
      scripts: [script("https://news.example/app.js", 'fetch("/wp-admin/admin-ajax.php?action=x")')],
    });
    const php = detectTechnologies(page, db).find((t) => t.name === "PHP");
    assert.ok(php, "PHP implied by WordPress");
    assert.equal(php.impliedBy, "WordPress");
    assert.ok(php.evidence.includes("implied by WordPress"), php.evidence.join(", "));
  });

  it("records which technology implied it even when the evidence list is full", () => {
    const bundles = Array.from({ length: 6 }, (_, i) => script(`https://news.example/app${i}.js`, 'fetch("/x.php?a=1")'));
    const php = detectTechnologies(makePage({ meta: { generator: ["WordPress 6.9.9"] }, scripts: bundles }), db).find((t) => t.name === "PHP");
    assert.equal(php?.evidence.length, 5);
    assert.equal(php?.evidence.at(-1), "implied by WordPress");
  });

  it("does not let a confidence:0 hit imply anything", () => {
    const tiny = {
      technologies: { Theme: { meta: { version: "^(.+)$\\;version:\\1\\;confidence:0" }, implies: "Shop", cats: [] }, Shop: { cats: [] } },
      categories: {},
    };
    assert.deepEqual(detectTechnologies(makePage({ meta: { version: ["1.2.3"] } }), tiny), []);
  });

  it("does not report a fingerprint that only carries a confidence:0 pattern", () => {
    assert.ok(!names(makePage({ meta: { version: ["1.260928.094609-sha.d6ca6e1"] } })).includes("Fourthwall"));
  });
});
