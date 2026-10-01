import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkIdentifiersBeforeConsent } from "../extension/src/checks/consent.js";
import { analyze } from "../extension/src/analyze.js";
import { MESSAGE_IDS } from "../extension/popup/i18n.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage } from "./helpers.js";

const db = loadDb();
const ONETRUST = '<div id="onetrust-banner-sdk" class="otFlat"><p>Cookie</p></div>';
const COOKIEBOT = "<div id=CybotCookiebotDialog role=dialog></div>";

/**
 * @param {string} html
 * @param {Record<string, string>} cookies
 * @returns {{ banner: string, services: string } | null}
 */
function check(html, cookies) {
  const found = checkIdentifiersBeforeConsent(makePage({ html, cookies }), db.consent);
  return found.length === 0 ? null : { banner: String(found[0].params.banner), services: String(found[0].params.services) };
}

describe("identifier cookies before the consent banner is answered", () => {
  it("reports identifier cookies stored while a banner waits for an answer", () => {
    assert.deepEqual(check(ONETRUST, { _ga: "GA1.1.1.1", _fbp: "fb.1.1.1" }), { banner: "OneTrust", services: "Google Analytics, Meta Pixel" });
    assert.deepEqual(check(COOKIEBOT, { _gcl_au: "1.1.123", _clck: "x" }), { banner: "Cookiebot", services: "Google Ads, Microsoft Clarity" });
  });

  it("reports nothing once the banner is answered, or where its service set the answer itself", () => {
    assert.equal(check(ONETRUST, { _ga: "x", OptanonAlertBoxClosed: "2026-10-01T00:00:00.000Z" }), null);
    assert.equal(check(COOKIEBOT, { _ga: "x", CookieConsent: "-1" }), null);
  });

  it("reports nothing without an identifier cookie, as a tag can contact its host before consent with none", () => {
    assert.equal(check(ONETRUST, { OptanonConsent: "groups=C0001:1", _gid: "x" }), null);
    assert.equal(check(ONETRUST, {}), null);
  });

  it("reads the banner only from an element's id, never from text, a class or another id", () => {
    assert.equal(check("<p>onetrust-banner-sdk</p>", { _ga: "x" }), null);
    assert.equal(check('<div class="onetrust-banner-sdk"></div>', { _ga: "x" }), null);
    assert.equal(check('<div id="onetrust-banner-sdk-wrapper"></div>', { _ga: "x" }), null);
    assert.equal(check('<div data-id="onetrust-banner-sdk"></div>', { _ga: "x" }), null);
    assert.equal(check('<div data-template=" id=onetrust-banner-sdk "></div>', { _ga: "x" }), null, "inside another attribute's value");
    assert.equal(check("<meta content='x id=\"CybotCookiebotDialog\"'>", { _ga: "x" }), null);
    assert.equal(check('<div id="ONETRUST-BANNER-SDK"></div>', { _ga: "x" }), null, "ids are case-sensitive");
    assert.ok(check('<div ID="onetrust-banner-sdk"></div>', { _ga: "x" }), "attribute names are not");
    assert.equal(check('<script>var t = "<div id=onetrust-banner-sdk>";</script>', { _ga: "x" }), null);
    assert.ok(check("<div\nid='onetrust-banner-sdk'>", { _ga: "x" }), "another quote and whitespace");
    assert.ok(check("<p>x</p><div id=onetrust-banner-sdk", { _ga: "x" }), "a tag cut off where the collected HTML ends");
  });

  it("is wired into analyze and has messages in both languages", async () => {
    const report = await analyze(makePage({ html: ONETRUST, cookies: { _ga: "x" } }), db, { today: new Date("2026-10-01T00:00:00Z"), sha1 });
    assert.ok(report.findings.some((f) => f.id === "identifiers_before_consent"));
    assert.ok(MESSAGE_IDS.ja.includes("identifiers_before_consent") && MESSAGE_IDS.en.includes("identifiers_before_consent"));
  });
});

describe("consent-banners.json", () => {
  for (const banner of db.consent.banners) {
    it(banner.name, () => {
      assert.ok(banner.sources.length > 0 && banner.sources.every((u) => u.startsWith("https://")), "source links");
      for (const id of banner.elementIds) assert.match(id, /^[A-Za-z][\w-]*$/, "an id safe to put in a pattern");
      assert.ok(banner.answeredCookies.length > 0);
    });
  }
  for (const identifier of db.consent.identifiers) {
    it(identifier.service, () => {
      assert.ok(identifier.sources.length > 0 && identifier.sources.every((u) => u.startsWith("https://")), "source links");
      assert.ok(identifier.cookies.length > 0);
    });
  }
});
