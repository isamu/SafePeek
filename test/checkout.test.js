import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkCheckout } from "../extension/src/checks/checkout.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage } from "./helpers.js";

const db = loadDb();
/** @returns {import("../extension/src/types.js").Technology} */
const tech = (/** @type {string} */ name, impliedBy = "", evidence = ["js a", "script b"]) => ({
  name,
  version: "",
  confidence: 100,
  categories: db.technologies[name]?.cats ?? [],
  website: "",
  evidence,
  impliedBy,
});
const summary = (/** @type {import("../extension/src/types.js").Finding[]} */ f) => f.map((x) => `${x.id}:${x.params.platforms}`);

describe("who runs the checkout", () => {
  it("tells a hosted cart service from shop software on the site's own server", () => {
    assert.deepEqual(summary(checkCheckout([tech("Shopify")], db.technologies)), ["checkout_saas:Shopify"]);
    assert.deepEqual(summary(checkCheckout([tech("EC-CUBE")], db.technologies)), ["checkout_self_hosted:EC-CUBE"]);
    assert.deepEqual(summary(checkCheckout([tech("MakeShop"), tech("WooCommerce")], db.technologies)), [
      "checkout_saas:MakeShop",
      "checkout_self_hosted:WooCommerce",
    ]);
  });

  it("says nothing for shop features that are neither, or for products only implied", () => {
    assert.deepEqual(checkCheckout([tech("Cart Functionality")], db.technologies), []);
    assert.deepEqual(checkCheckout([tech("WooCommerce", "WordPress")], db.technologies), []);
    assert.deepEqual(checkCheckout([tech("Google Analytics")], db.technologies), []);
  });

  it("needs two traces, since a lone global or a link out also appears on pages that are not the shop", () => {
    assert.deepEqual(checkCheckout([tech("Amazon Webstore", "", ["js amzn"])], db.technologies), []);
    assert.deepEqual(checkCheckout([tech("Base", "", ["dom link[href*='.thebase.in/']", "dom link[href*='.thebase.in/']"])], db.technologies), []);
  });

  it("reports it with the payment findings from real page data", async () => {
    const report = await analyze(makePage({ globals: { Shopify: true, ShopifyAnalytics: true } }), db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    const found = report.findings.find((f) => f.id === "checkout_saas");
    assert.equal(found?.area, "payment");
    assert.equal(found?.severity, "good");
  });
});
