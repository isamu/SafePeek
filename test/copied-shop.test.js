import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkCopiedShop } from "../extension/src/checks/copied-shop.js";
import { loadDb, makePage } from "./helpers.js";

const { suffixes } = loadDb();
const JAPANESE_SHOP = "こちらの商品は税込価格で表示しています。送料は全国一律です。「カートに入れる」ボタンからどうぞ。".repeat(10);

/** @param {string} head @param {Record<string, string[]>} [meta] @param {string} [url] */
const shop = (head, meta = {}, url = "https://fake-outlet.shop/items/1") =>
  makePage({ url, text: JAPANESE_SHOP, html: `<html><head>${head}</head><body></body></html>`, meta });

describe("a shop page naming another site as its own", () => {
  it("reports a canonical link to another organisation, showing only its registrable domain", () => {
    const [found] = checkCopiedShop(shop('<link rel="canonical" href="https://www.real-brand.co.jp/items/1">'), suffixes);
    assert.deepEqual([found.id, found.severity, found.evidence], ["shop_names_other_site", "medium", ["real-brand.co.jp"]]);
  });

  it("reads og:url, and attribute order and quoting do not matter", () => {
    assert.equal(checkCopiedShop(shop("", { "og:url": ["https://real-brand.co.jp/"] }), suffixes).length, 1);
    assert.equal(checkCopiedShop(shop("<LINK href=https://real-brand.co.jp/x REL=canonical>"), suffixes).length, 1);
  });

  it("does not report its own host, a relative link, a subdomain, or the brand's other country domain", () => {
    for (const href of ["https://fake-outlet.shop/items/1", "/items/1", "https://www.fake-outlet.shop/items/1"]) {
      assert.deepEqual(checkCopiedShop(shop(`<link rel="canonical" href="${href}">`), suffixes), [], href);
    }
    const brand = shop('<link rel="canonical" href="https://brand-store.com/items/1">', {}, "https://brand-store.jp/items/1");
    assert.deepEqual(checkCopiedShop(brand, suffixes), [], "brand-store.jp and brand-store.com");
  });

  it("never shows an internal-looking target: an IP address, a single-label name, or a bare suffix", () => {
    const privateAddress = [192, 168, 0, 10].join(".");
    for (const href of ["https://staging/items/1", `https://${privateAddress}/items/1`, "https://[fd00::1]/items/1", "https://co.jp/"]) {
      assert.deepEqual(checkCopiedShop(shop(`<link rel="canonical" href="${href}">`), suffixes), [], href);
    }
  });

  it("ignores links that are not canonical, and pages that are not Japanese shops", () => {
    assert.deepEqual(checkCopiedShop(shop('<link rel="alternate" href="https://real-brand.co.jp/en">'), suffixes), []);
    const article = makePage({
      url: "https://news.example/a",
      text: "記事です。".repeat(60),
      html: '<html><head><link rel="canonical" href="https://other.example/a"></head></html>',
    });
    assert.deepEqual(checkCopiedShop(article, suffixes), []);
  });
});
