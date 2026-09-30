import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCheckout } from "../extension/src/checks/checkout.js";
import { analyze } from "../extension/src/analyze.js";
import { sha1 } from "../extension/src/engine/hash.js";
import { loadDb, makePage, script } from "./helpers.js";

const db = loadDb();
/** @returns {import("../extension/src/types.js").Technology} */
const tech = (/** @type {string} */ name, evidence = ["js a", "script b"], impliedBy = "") => ({
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
    assert.deepEqual(
      summary(checkCheckout([tech("EC-CUBE", ["script https://shop.example/html/template/default/js/eccube.js", "html eccube"])], db.checkout)),
      ["checkout_self_hosted:EC-CUBE"],
    );
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

  it("needs two kinds of trace by default, since one generic trace also appears on pages that are not the shop", () => {
    assert.deepEqual(
      checkCheckout([tech("Base", ["dom link[href*='.thebase.in/']", "dom a[href*='.thebase.in/']"])], db.checkout),
      [],
      "two labels of one kind",
    );
    assert.deepEqual(checkCheckout([tech("BigCommerce", ["dom img[src*='.bigcommerce.com']"])], db.checkout), [], "an embedded BigCommerce image");
    assert.deepEqual(checkCheckout([tech("Shopify", ["js Shopify"])], db.checkout), []);
    assert.deepEqual(summary(checkCheckout([tech("Base", ["script https://thebase.in/js/shop.js", "js BASE_API.shop_id"])], db.checkout)), [
      "checkout_saas:Base",
    ]);
  });

  it("takes one trace only for products whose every trace comes from the shop itself", () => {
    assert.deepEqual(summary(checkCheckout([tech("stores.jp", ["js STORES_JP"])], db.checkout)), ["checkout_saas:stores.jp"]);
    assert.deepEqual(summary(checkCheckout([tech("Zen Cart", ["meta generator"])], db.checkout)), ["checkout_self_hosted:Zen Cart"]);
  });

  it("does not take one trace an embedded asset or copied markup could leave", () => {
    const embeddable = [
      tech("MakeShop", ["dom img[src*='gigaplus.makeshop.jp']"]),
      tech("Future Shop", ["script https://blog.example/js/future-shop-widget.js"]),
      tech("osCommerce", ["dom td.infoBoxHeading"]),
      tech("EC-CUBE", ["script https://shop.example/js/eccube.js"]),
    ];
    for (const t of embeddable) assert.deepEqual(checkCheckout([t], db.checkout), [], t.evidence[0]);
  });

  it("does not take a trace the fingerprint marks as generic", async () => {
    const today = new Date("2026-09-30T00:00:00Z");
    const cookieOnly = await analyze(makePage({ cookies: { frontend: "abc" } }), db, { today, sha1 });
    assert.ok(!cookieOnly.findings.some((f) => f.id.startsWith("checkout_")), "Magento's frontend cookie");
    const globalOnly = await analyze(makePage({ globals: { priceDisplayMethod: true } }), db, { today, sha1 });
    assert.ok(!globalOnly.findings.some((f) => f.id.startsWith("checkout_")), "PrestaShop's priceDisplayMethod");
    const mageCookie = await analyze(makePage({ cookies: { "mage-cache-storage": "{}" } }), db, { today, sha1 });
    assert.deepEqual(summary(mageCookie.findings.filter((f) => f.id.startsWith("checkout_"))), ["checkout_self_hosted:Magento"]);
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
    const report = await analyze(
      makePage({ globals: { Shopify: true }, scripts: [script("https://cdn.shopify.com/s/files/1/0001/t/1/assets/theme.js")] }),
      db,
      { today: new Date("2026-09-30T00:00:00Z"), sha1 },
    );
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
      if ("singleTraceReason" in p) {
        assert.ok(typeof p.singleTraceReason === "string" && p.singleTraceReason.length > 20, "says why one trace is enough");
        const fp = db.technologies[p.name];
        assert.ok(
          ["js", "cookies", "headers", "meta"].some((k) => k in fp),
          "has a runtime trace that one trace could be",
        );
      }
    });
  }
});
