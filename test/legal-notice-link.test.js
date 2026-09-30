import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkLegalNoticeLink, HTML_LIMIT, TEXT_LIMIT } from "../extension/src/checks/legal-notice-link.js";
import { makePage } from "./helpers.js";

const JAPANESE_SHOP = "こちらの商品は税込価格で表示しています。送料は全国一律です。「カートに入れる」ボタンからどうぞ。".repeat(10);

/** @param {string} footer */
const shop = (footer) => makePage({ text: `${JAPANESE_SHOP}\n${footer}`, html: `<html lang="ja"><body><footer>${footer}</footer></body></html>` });

describe("a link to the 特定商取引法 notice", () => {
  it("reports a Japanese shop page that nowhere mentions the notice", () => {
    const [found] = checkLegalNoticeLink(shop("会社概要 お問い合わせ"));
    assert.deepEqual([found.id, found.severity, found.evidence], ["legal_notice_link_missing", "medium", []]);
  });

  it("accepts the ways shops name the notice, in the text or only in the HTML", () => {
    for (const name of [
      "特定商取引法に基づく表記",
      "特商法表記",
      "特定商取引に関する法律に基づく表示",
      "通信販売に関する表示",
      "法律に基づく表示",
      "通信販売法に基づく表記",
    ]) {
      assert.deepEqual(checkLegalNoticeLink(shop(name)), [], name);
    }
    const imageLink = makePage({ text: JAPANESE_SHOP, html: '<html><body><a href="/law"><img alt="特定商取引法に基づく表記"></a></body></html>' });
    assert.deepEqual(checkLegalNoticeLink(imageLink), [], "named only in an alt text");
  });

  it("accepts the notice named only in the visible text, as when a link is drawn by script", () => {
    const page = makePage({ text: `${JAPANESE_SHOP}\n特定商取引法表示`, html: "<html><body><div id=app></div></body></html>" });
    assert.deepEqual(checkLegalNoticeLink(page), []);
  });

  it("does not judge cart, checkout or order pages, which often drop the footer", () => {
    for (const path of ["/cart", "/shop/cart/", "/basket", "/checkout/step1", "/order/confirm", "/shoppingcart.aspx", "/kago.html", "/p/cart.php"]) {
      const page = makePage({ url: `https://shop.example${path}`, text: JAPANESE_SHOP, html: "<html></html>" });
      assert.deepEqual(checkLegalNoticeLink(page), [], path);
    }
    const product = makePage({ url: "https://shop.example/items/cartridge-001", text: JAPANESE_SHOP, html: "<html></html>" });
    assert.equal(checkLegalNoticeLink(product).length, 1, "a product whose name starts with cart is still judged");
  });

  it("does not judge a page that talks about shops without offering to buy", () => {
    const platform = "ネットショップを始めるならこちら。カート機能、税込表示、送料設定、購入導線まで簡単に作れます。".repeat(10);
    assert.deepEqual(checkLegalNoticeLink(makePage({ text: platform, html: "<html></html>" })), []);
  });

  it("does not judge a page that is not a Japanese shop", () => {
    assert.deepEqual(checkLegalNoticeLink(makePage({ text: "Welcome to our store. Add to cart.".repeat(20), html: "<html></html>" })), []);
    assert.deepEqual(
      checkLegalNoticeLink(makePage({ text: "こちらは会社の紹介ページです。".repeat(30), html: "<html></html>" })),
      [],
      "Japanese but no shop words",
    );
  });

  it("does not judge a page cut at the collector's limit, whose footer may be lost", () => {
    assert.deepEqual(checkLegalNoticeLink(makePage({ text: JAPANESE_SHOP, html: `<html>${"x".repeat(HTML_LIMIT)}</html>` })), []);
    assert.deepEqual(checkLegalNoticeLink(makePage({ text: JAPANESE_SHOP.padEnd(TEXT_LIMIT, "あ"), html: "<html></html>" })), []);
  });

  it("uses the collector's limits", () => {
    const collector = readFileSync(new URL("../extension/src/page/collector.js", import.meta.url), "utf8");
    assert.match(collector, new RegExp(`MAX_HTML = ${HTML_LIMIT.toLocaleString("en").replace(/,/g, "_")};`));
    assert.match(collector, new RegExp(`MAX_TEXT = ${TEXT_LIMIT.toLocaleString("en").replace(/,/g, "_")};`));
  });
});
