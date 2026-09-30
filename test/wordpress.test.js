import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractWordPress } from "../extension/src/engine/wordpress.js";
import { checkWordPress } from "../extension/src/checks/wordpress.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage } from "./helpers.js";

const db = loadDb();
const today = new Date("2026-09-30T00:00:00Z");
const ids = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => x.id);

const WP_HTML = `<html><head>
<link rel="stylesheet" href="https://blog.example/wp-content/plugins/contact-form-7/includes/css/styles.css?ver=5.1.1">
<link rel="stylesheet" href="https://blog.example/wp-content/themes/twentyseventeen/style.css?ver=4.9.8">
<link rel="pingback" href="https://blog.example/xmlrpc.php">
<script src="https://blog.example/wp-includes/js/jquery/jquery.js?ver=1.12.4"></script>
<script src="https://blog.example/wp-includes/js/wp-embed.min.js?ver=4.9.8"></script>
<script src="https://blog.example/wp-includes/js/wp-emoji-release.min.js?ver=4.9.8"></script>
<script src="https://blog.example/wp-content/plugins/woocommerce/assets/js/frontend/cart.js?ver=3.4.5"></script>
</head></html>`;

describe("extractWordPress", () => {
  it("reads core version, plugins, themes and XML-RPC from asset URLs", () => {
    const wp = extractWordPress(makePage({ url: "https://blog.example/", html: WP_HTML }));
    assert.equal(wp.detected, true);
    assert.equal(wp.version, "4.9.8", "the most common ?ver= of /wp-includes/ wins over jQuery's own");
    assert.equal(wp.versionSource, "?ver= of WordPress core assets");
    assert.deepEqual(wp.plugins, [
      { slug: "contact-form-7", version: "5.1.1" },
      { slug: "woocommerce", version: "3.4.5" },
    ]);
    assert.deepEqual(wp.themes, [{ slug: "twentyseventeen", version: "4.9.8" }]);
    assert.equal(wp.xmlrpc, true);
  });

  it("does not take a bundled library's ?ver= for the WordPress version", () => {
    const html = [
      '<script src="/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script>',
      '<script src="/wp-includes/js/jquery/jquery-migrate.min.js?ver=3.4.1"></script>',
      '<script src="/wp-includes/js/dist/vendor/react.min.js?ver=18.3.1"></script>',
    ].join("");
    const wp = extractWordPress(makePage({ html }));
    assert.equal(wp.detected, true);
    assert.equal(wp.version, "");
    assert.deepEqual(checkWordPress(wp, db.wordpress, today), []);
  });

  it("reads the version from core styles, blocks and scripts", () => {
    for (const path of ["css/dist/block-library/style.min.css", "js/dist/hooks.min.js", "js/wp-emoji-release.min.js", "js/comment-reply.min.js"]) {
      assert.equal(extractWordPress(makePage({ html: `<link href="/wp-includes/${path}?ver=7.1.2">` })).version, "7.1.2", path);
    }
  });

  it("prefers the generator meta tag", () => {
    const wp = extractWordPress(makePage({ html: WP_HTML, meta: { generator: ["WordPress 6.2.1"] } }));
    assert.equal(wp.version, "6.2.1");
    assert.equal(wp.versionSource, "meta generator");
  });

  it("does nothing on other sites", () => {
    assert.equal(extractWordPress(makePage()).detected, false);
  });
});

describe("checkWordPress", () => {
  const facts = db.wordpress;
  /** @param {string} version */
  const wp = (version) => ({ detected: true, version, versionSource: "meta generator", plugins: [], themes: [], xmlrpc: false });

  it("flags versions without any security updates as high", () => {
    const findings = checkWordPress(wp("4.6.1"), facts, today);
    assert.equal(findings[0].id, "wp_core_eol");
    assert.equal(findings[0].severity, "high");
  });

  it("flags any series older than the latest as outdated", () => {
    assert.equal(checkWordPress(wp("6.4.2"), facts, today)[0].id, "wp_core_outdated");
    assert.equal(checkWordPress(wp("7.0.6"), facts, today)[0].id, "wp_core_outdated");
  });

  it("only notes the exposed version on the latest series", () => {
    assert.deepEqual(ids(checkWordPress(wp("7.1.2"), facts, today)), ["wp_version_exposed"]);
  });

  it("lists plugins with a vulnerability lookup link", () => {
    const info = { ...wp(""), plugins: [{ slug: "contact-form-7", version: "5.1.1" }], xmlrpc: true };
    const findings = checkWordPress(info, facts, today);
    assert.deepEqual(ids(findings), ["wp_xmlrpc", "wp_components"]);
    assert.equal(
      findings[1].evidence[0],
      "plugin contact-form-7 5.1.1 — https://www.wordfence.com/threat-intel/vulnerabilities/wordpress-plugins/contact-form-7",
    );
  });
});

describe("analyze with WordPress", () => {
  it("rates an old-series WordPress site as caution", async () => {
    const report = await analyze(makePage({ url: "https://blog.example/", html: WP_HTML }), db, { today, sha1 });
    assert.equal(report.level, "caution");
    assert.ok(ids(report.findings).includes("wp_core_outdated"));
    assert.equal(report.wordpress.plugins.length, 2);
  });
});
