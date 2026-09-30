import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkWeakShopSigns } from "../extension/src/checks/weak-shop-signs.js";
import { makePage } from "./helpers.js";

const JAPANESE_SHOP = "こちらの商品は税込価格で表示しています。送料は全国一律です。「カートに入れる」ボタンからどうぞ。".repeat(10);
const FREE_MAIL = "お問い合わせ：shop.support@gmail.com";
const BANK_ONLY = "お支払い方法：銀行振込（前払い）のみ承ります。";
const DISCOUNTS = "全品80%OFF！ 本日限り90%OFF 最大75％オフ";

/** @param {string} extra @param {string} [url] */
const shop = (extra, url = "https://shop.example/") => makePage({ url, text: `${JAPANESE_SHOP}\n${extra}`, html: "<html></html>" });
const signs = (/** @type {import("../extension/src/types.js").PageData} */ page) => checkWeakShopSigns(page).map((f) => [f.severity, f.evidence]);

describe("weak fake-shop signs, only together", () => {
  it("reports nothing for any one sign alone", () => {
    for (const extra of [FREE_MAIL, BANK_ONLY, DISCOUNTS]) assert.deepEqual(signs(shop(extra)), [], extra);
    assert.deepEqual(signs(shop("", "https://cheap-bags.xyz/")), [], "the TLD alone");
  });

  it("is low for two signs and medium for three or more, naming each", () => {
    assert.deepEqual(signs(shop(FREE_MAIL, "https://cheap-bags.xyz/")), [["low", ["TLD .xyz", "free email only (gmail.com)"]]]);
    const all = signs(shop(`${FREE_MAIL}\n${BANK_ONLY}\n${DISCOUNTS}`, "https://cheap-bags.top/"));
    assert.equal(all[0][0], "medium");
    assert.deepEqual(all[0][1], ["TLD .top", "free email only (gmail.com)", "bank transfer only", "3 discounts of 70% or more"]);
  });

  it("does not count free email when any address is not a free service's, the shop's own or another", () => {
    assert.deepEqual(signs(shop(`${FREE_MAIL}\ninfo@shop.example\n${BANK_ONLY}`)), [], "its own domain");
    assert.deepEqual(signs(shop(`${FREE_MAIL}\nsupport@helpdesk-partner.jp\n${BANK_ONLY}`)), [], "another company's");
  });

  it("does not count bank transfer when the payment section names another method", () => {
    const mixed = "お支払い方法：銀行振込、クレジットカード、コンビニ払い";
    assert.deepEqual(signs(shop(`${mixed}\n${FREE_MAIL}`, "https://shop.example/")), []);
  });

  it("reads every payment section: a later list naming cards clears an earlier bank-only line", () => {
    const faq = "よくある質問：お支払い方法は銀行振込のみですか？";
    const list = "お支払方法一覧\nクレジットカード、PayPay、銀行振込";
    assert.deepEqual(signs(shop(`${faq}\n${"商品説明です。".repeat(40)}\n${list}\n${FREE_MAIL}`)), []);
    assert.equal(signs(shop(`${faq}\n${FREE_MAIL}`)).length, 1, "with no other section, bank only still counts");
  });

  it("reads full-width digits in discounts", () => {
    assert.deepEqual(signs(shop(`全品８０％OFF ９０％OFF ７５％オフ\n${FREE_MAIL}`))[0][1], ["free email only (gmail.com)", "3 discounts of 70% or more"]);
  });

  it("does not count a few or small discounts", () => {
    assert.deepEqual(signs(shop(`全品80%OFF 90%OFF\n${FREE_MAIL}`)), [], "two steep ones");
    assert.deepEqual(signs(shop(`10%OFF 20%OFF 30%OFF 50%OFF\n${FREE_MAIL}`)), [], "not steep");
  });

  it("stays out of pages that do not offer to buy", () => {
    const page = makePage({
      url: "https://cheap-bags.xyz/",
      text: `${"税込価格と送料のご案内をこちらにまとめています。".repeat(20)}\n${FREE_MAIL}`,
      html: "<html></html>",
    });
    assert.deepEqual(signs(page), []);
  });
});
