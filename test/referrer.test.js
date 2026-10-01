import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkReferrerLeak } from "../extension/src/checks/referrer.js";
import { inputField, loadDb, makePage } from "./helpers.js";

const db = loadDb();
const CARD = [inputField("cardno", { autocomplete: "cc-number" }), inputField("cvc", { autocomplete: "cc-csc" })];
const PASSWORD = [inputField("pass", { type: "password" })];
const OTHER_SITE = ["shop.example", "www.google-analytics.com"];

/**
 * @param {Partial<import("../extension/src/types.js").PageData>} page
 * @param {string} [policyHeader]
 * @returns {string[]}  the policies reported
 */
function check(page, policyHeader) {
  const headers = { ...makePage().headers, ...(policyHeader === undefined ? {} : { "referrer-policy": policyHeader }) };
  return checkReferrerLeak(makePage({ inputs: CARD, contactedHosts: OTHER_SITE, headers, ...page }), db.suffixes).map((f) => String(f.params.policy));
}

describe("a card or login page that hands its full URL to other sites", () => {
  it("reports the policies that send the full URL, from the header", () => {
    assert.deepEqual(check({}, "unsafe-url"), ["unsafe-url"]);
    assert.deepEqual(check({}, "no-referrer-when-downgrade"), ["no-referrer-when-downgrade"]);
    assert.deepEqual(check({ inputs: PASSWORD }, "unsafe-url"), ["unsafe-url"], "a password page");
  });

  it("does not report the policies that send the origin or nothing, or no policy at all", () => {
    for (const policy of ["strict-origin-when-cross-origin", "origin", "strict-origin", "same-origin", "no-referrer", "origin-when-cross-origin", ""]) {
      assert.deepEqual(check({}, policy), [], policy);
    }
    assert.deepEqual(check({}), [], "no header");
  });

  it("uses the last policy the browser knows in the header, and skips unknown tokens", () => {
    assert.deepEqual(check({}, "unsafe-url, strict-origin"), []);
    assert.deepEqual(check({}, "strict-origin, unsafe-url"), ["unsafe-url"]);
    assert.deepEqual(check({}, "unsafe-url, made-up-policy"), ["unsafe-url"]);
    assert.deepEqual(check({}, " UNSAFE-URL "), ["unsafe-url"]);
  });

  it("lets the last valid meta referrer override the header, with the legacy values mapped", () => {
    assert.deepEqual(check({ meta: { referrer: ["origin"] } }, "unsafe-url"), []);
    assert.deepEqual(check({ meta: { referrer: ["always"] } }, "strict-origin"), ["unsafe-url"]);
    assert.deepEqual(check({ meta: { referrer: ["never"] } }), []);
    assert.deepEqual(check({ meta: { referrer: ["default"] } }, "unsafe-url"), []);
    assert.deepEqual(check({ meta: { referrer: ["origin", "unsafe-url"] } }), ["unsafe-url"]);
    assert.deepEqual(check({ meta: { referrer: ["unsafe-url", "nonsense"] } }), ["unsafe-url"]);
    assert.deepEqual(check({ meta: { referrer: ["nonsense"] } }, "unsafe-url"), ["unsafe-url"], "an invalid meta leaves the header");
    assert.deepEqual(check({ meta: { referrer: ["UNSAFE-URL"] } }), ["unsafe-url"], "the meta value is lower-cased");
    assert.deepEqual(check({ meta: { referrer: [" unsafe-url"] } }, "origin"), [], "but not trimmed, so this one is invalid");
  });

  it("reports nothing on a page that asks for neither a card number nor a password", () => {
    assert.deepEqual(check({ inputs: [inputField("q")] }, "unsafe-url"), []);
    assert.deepEqual(check({ inputs: [inputField("cvc", { autocomplete: "cc-csc" })] }, "unsafe-url"), [], "a security code alone");
  });

  it("reports nothing when the page loads only from its own site or its own organisation", () => {
    assert.deepEqual(check({ contactedHosts: ["shop.example"] }, "unsafe-url"), []);
    assert.deepEqual(check({ contactedHosts: ["shop.example", "img.shop.example"] }, "unsafe-url"), []);
    assert.deepEqual(check({ contactedHosts: [] }, "unsafe-url"), []);
  });
});
