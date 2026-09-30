import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCheckout } from "../extension/src/checks/checkout.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage } from "./helpers.js";

const db = loadDb();
/** @returns {import("../extension/src/types.js").Technology} */
const tech = (/** @type {string} */ name, evidence = ["js a"], impliedBy = "") => ({
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
  it("tells a hosted cart service from shop software the site runs itself", () => {
    assert.deepEqual(summary(checkCheckout([tech("Shopify")], db.checkout)), ["checkout_saas:Shopify"]);
    assert.deepEqual(summary(checkCheckout([tech("EC-CUBE", ["script https://shop.example/html/template/default/js/eccube.js"])], db.checkout)), [
      "checkout_self_hosted:EC-CUBE",
    ]);
    assert.deepEqual(summary(checkCheckout([tech("MakeShop"), tech("WooCommerce")], db.checkout)), [
      "checkout_saas:MakeShop",
      "checkout_self_hosted:WooCommerce",
    ]);
  });

  it("says nothing for products outside the list, or only implied", () => {
    for (const name of ["Amazon Webstore", "Shopware", "1C-Bitrix", "Cart Functionality", "Squarespace Commerce"])
      assert.deepEqual(checkCheckout([tech(name)], db.checkout), [], name);
    assert.deepEqual(checkCheckout([tech("WooCommerce", ["implied by WordPress"], "WordPress")], db.checkout), []);
  });

  it("asks BASE for two kinds of trace, since its link rule also fires on pages that only link to shops", () => {
    assert.deepEqual(checkCheckout([tech("Base", ["dom link[href*='.thebase.in/']", "dom link[href*='.thebase.in/']"])], db.checkout), []);
    assert.deepEqual(
      checkCheckout([tech("Base", ["dom link[href*='.thebase.in/']", "dom a[href*='.thebase.in/']"])], db.checkout),
      [],
      "two labels of one kind",
    );
    assert.deepEqual(summary(checkCheckout([tech("Base", ["script https://thebase.in/js/shop.js", "js BASE_API.shop_id"])], db.checkout)), [
      "checkout_saas:Base",
    ]);
  });

  it("says nothing for a plain Squarespace site, whose server header every Squarespace site sends", async () => {
    const report = await analyze(makePage({ headers: { ...makePage().headers, server: "Squarespace" } }), db, {
      today: new Date("2026-09-30T00:00:00Z"),
      sha1,
    });
    assert.ok(!report.findings.some((f) => f.id === "checkout_saas"));
  });

  it("carries the evidence it rests on", () => {
    const [f] = checkCheckout([tech("Shopify", ["js Shopify", "meta shopify-digital-wallet"])], db.checkout);
    assert.deepEqual(f.evidence, ["Shopify: js Shopify", "Shopify: meta shopify-digital-wallet"]);
  });

  it("reports it with the payment findings from real page data", async () => {
    const report = await analyze(makePage({ globals: { Shopify: true, ShopifyAnalytics: true } }), db, { today: new Date("2026-09-30T00:00:00Z"), sha1 });
    const found = report.findings.find((f) => f.id === "checkout_saas");
    assert.equal(found?.area, "payment");
    assert.equal(found?.severity, "good");
  });
});

describe("checkout-platforms.json", () => {
  const { platforms } = JSON.parse(readFileSync(new URL("../extension/data/checkout-platforms.json", import.meta.url), "utf8"));
  for (const p of platforms) {
    it(p.name, () => {
      assert.ok(db.technologies[p.name], "is a webappanalyzer technology");
      assert.ok(db.technologies[p.name].cats.includes(6), "is an ecommerce product");
      assert.ok(p.kind === "hosted" || p.kind === "self", "kind");
      assert.match(p.source, /^https:\/\//, "source link");
    });
  }
});
