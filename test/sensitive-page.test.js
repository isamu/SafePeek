import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSensitivePage } from "../extension/src/checks/sensitive-page.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { inputField, loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
const cardInputs = [inputField("cardno", { autocomplete: "cc-number" }), inputField("cvc", { autocomplete: "cc-csc" })];
const check = (/** @type {Partial<import("../extension/src/types.js").PageData>} */ over) =>
  checkSensitivePage(makePage({ url: "https://www.shop.example.co.jp/checkout", ...over }), db.providers, db.suffixes);
const summary = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => `${x.id}:${x.severity}:${x.params.count}`);

describe("scripts from other sites where a card number or password is typed", () => {
  it("counts other sites' scripts on a card page, not the site's own hosts or the payment provider", () => {
    const scripts = [
      script("https://www.googletagmanager.com/gtag/js?id=G-1"),
      script("https://static.shop.example.co.jp/app.js"),
      script("https://js.stripe.com/v3/"),
      script("https://p01.mul-pay.jp/ext/js/token.js"),
      script("", "inline();"),
    ];
    const [f] = check({ inputs: cardInputs, scripts });
    assert.deepEqual(summary([f]), ["card_page_third_party:medium:1"]);
    assert.deepEqual(f.evidence, ["www.googletagmanager.com"]);
  });

  it("counts them on a login page at a lower severity", () => {
    const found = check({ inputs: [inputField("password", { type: "password" })], scripts: [script("https://connect.facebook.net/en_US/fbevents.js")] });
    assert.deepEqual(summary(found), ["login_page_third_party:low:1"]);
  });

  it("says nothing when the card is typed into a provider's frame, or no other site's script runs", () => {
    assert.deepEqual(
      check({ iframes: ["https://js.stripe.com/v3/elements-inner-card.html"], scripts: [script("https://www.googletagmanager.com/gtm.js")] }),
      [],
    );
    assert.deepEqual(check({ inputs: cardInputs, scripts: [script("https://cdn.shop.example.co.jp/app.js")] }), []);
    assert.deepEqual(check({ scripts: [script("https://www.googletagmanager.com/gtm.js")] }), [], "no card or password field");
  });

  it("leaves out a host that looks like the same organisation's", () => {
    const found = checkSensitivePage(
      makePage({
        url: "https://acme.jp/login",
        inputs: [inputField("password", { type: "password" })],
        scripts: [script("https://frontend.st-acme.com/app.js")],
      }),
      db.providers,
      db.suffixes,
    );
    assert.deepEqual(found, [], "'acme' is a word of 'st-acme'");
  });

  it("keeps two sites under one multi-label suffix apart", () => {
    const found = check({ inputs: cardInputs, scripts: [script("https://cdn.other-shop.co.jp/x.js")] });
    assert.deepEqual(summary(found), ["card_page_third_party:medium:1"]);
  });

  it("is reported from real page data", async () => {
    const page = makePage({ url: "https://shop.example.jp/pay", inputs: cardInputs, scripts: [script("https://www.googletagmanager.com/gtm.js")] });
    const report = await analyze(page, db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    assert.ok(report.findings.some((f) => f.id === "card_page_third_party" && f.severity === "medium"));
  });
});
