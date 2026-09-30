import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSimplifiedChinese } from "../extension/src/checks/simplified-chinese.js";
import { makePage } from "./helpers.js";

const JAPANESE_SHOP = "こちらの商品はカートに入れてご購入いただけます。税込価格で表示しています。送料は全国一律です。".repeat(10);

/** @param {string} text @param {string} [html] */
const shop = (text, html = '<html lang="ja"><body></body></html>') => makePage({ text, html });

describe("simplified Chinese on a Japanese shop", () => {
  it("says nothing about an ordinary Japanese shop", () => {
    assert.deepEqual(checkSimplifiedChinese(shop(JAPANESE_SHOP)), []);
  });

  it("reports several simplified-only characters, and shows which", () => {
    const [found] = checkSimplifiedChinese(shop(`${JAPANESE_SHOP}优质商品，这是我们的新货。`));
    assert.equal(found.id, "shop_simplified_chinese");
    assert.equal(found.severity, "low");
    assert.match(found.evidence[0], /^simplified: /);
    for (const char of "优质这们货") assert.ok(found.evidence[0].includes(char), char);
  });

  it("is medium when two kinds of sign appear together", () => {
    const [found] = checkSimplifiedChinese(shop(`${JAPANESE_SHOP}休業日：365天受付`, '<html lang="zh-CN"><body></body></html>'));
    assert.deepEqual([found.severity, found.evidence], ["medium", ['<html lang="zh…">', "365天"]]);
  });

  it("needs three distinct characters: two, such as a quoted name, are not enough", () => {
    assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}上海の「东货」ブランド`)), []);
    assert.equal(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}「东货购」`)).length, 1);
  });

  it("reports the language or the days on their own", () => {
    assert.deepEqual(
      checkSimplifiedChinese(shop(JAPANESE_SHOP, '<html lang="zh-Hans"><body></body></html>')).map((f) => [f.severity, f.evidence]),
      [["low", ['<html lang="zh…">']]],
    );
    assert.deepEqual(
      checkSimplifiedChinese(shop(`${JAPANESE_SHOP}24天以内に発送`)).map((f) => [f.severity, f.evidence]),
      [["low", ["24天"]]],
    );
  });

  it("counts neither characters nor 天 on a page with a section written in Chinese, as for Chinese-speaking customers", () => {
    const chineseBody = "欢迎光临！我们提供优质商品，免税购买，请联系客服。运费说明：订单满额免费，14天内可退货。".repeat(8);
    assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}${chineseBody}`)), []);
    const declared = shop(`${JAPANESE_SHOP}${chineseBody}`, '<html lang="zh-CN"><body></body></html>');
    assert.deepEqual(
      checkSimplifiedChinese(declared).map((f) => f.evidence),
      [['<html lang="zh…">']],
      "the declared language still counts",
    );
  });

  it("skips a short section written in Chinese on a Japanese page, but not stray characters in Japanese lines", () => {
    const shipping = ["国际配送说明：我们提供海外配送服务，订单确认后发货。", "运费根据地区计算，请联系客服了解详情。", "订购后3天发货，节假日除外。"].join(
      "\n",
    );
    assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}\n${shipping}\n`)), []);
    const stray = `${JAPANESE_SHOP}\n优质商品です。这是新货をお届けします。我们のお店です。\n休業日：365天受付`;
    const [found] = checkSimplifiedChinese(shop(stray));
    assert.equal(found?.evidence.length, 2, "stray characters in a Japanese line and a short label both count");
  });

  it("treats a section in Traditional Chinese as a Chinese section too", () => {
    const traditional = "歡迎光臨本店。購物指南：訂購後3天發貨，海外配送費用請參閱說明。會員註冊免費，支援信用卡付款。".repeat(20);
    assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}${traditional}3天`)), []);
    const kanjiHeavyJapanese = "国内正規品販売店。中古商品在庫一覧、送料無料対象商品多数、即日発送可能。".repeat(10);
    assert.equal(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}${kanjiHeavyJapanese}365天受付`)).length, 1, "a kanji-heavy Japanese page is still Japanese");
  });

  it("does not count the characters a page about learning Chinese quotes, nor 个", () => {
    const textbook = `${JAPANESE_SHOP}中国語テキスト：例文「这是我们的新书，请订购。」`;
    assert.deepEqual(checkSimplifiedChinese(shop(textbook)), []);
    assert.deepEqual(
      checkSimplifiedChinese(shop(`${textbook}365天受付`)).map((f) => f.evidence),
      [["365天"]],
      "other signs still count",
    );
    assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}「个东货」`)), [], "个 is not counted, so this is two");
    assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}「价东货」`)), [], "nor 价");
  });

  it("stays out of pages that are not Japanese shops", () => {
    // Shop words, but hardly any kana: a Chinese-language shop, not a Japanese one.
    const chinese = `${"优质商品，这是我们的新货。请联系客服。".repeat(20)}カート 購入`;
    assert.deepEqual(checkSimplifiedChinese(shop(chinese, '<html lang="zh-CN"><body></body></html>')), [], "a Chinese-language site");
    // Plenty of kana, but no shop words: a Japanese page about Chinese.
    const article = "中国語の簡体字では、这や们や优のように書きます。".repeat(30);
    assert.deepEqual(checkSimplifiedChinese(shop(article)), [], "a Japanese page about Chinese, with no shop words");
  });

  it("reads the lang attribute itself, not data-lang", () => {
    assert.deepEqual(checkSimplifiedChinese(shop(JAPANESE_SHOP, '<html lang="ja" data-lang="zh-CN"><body></body></html>')), []);
  });

  it("reads the language only from the <html> tag, not from an element inside the page", () => {
    const quoted = '<html lang="ja"><body><span lang="zh-CN">北京</span></body></html>';
    assert.deepEqual(
      checkSimplifiedChinese(shop(`${JAPANESE_SHOP}休業日：365天受付`, quoted)).map((f) => f.evidence),
      [["365天"]],
    );
  });

  it("does not take a Japanese word starting with 天 after a number for days", () => {
    for (const text of ["10天体セット", "全12天体の図鑑", "3天然石ブレスレット"]) {
      assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}${text}`)), [], text);
    }
    for (const text of ["365天受付", "7天无理由退货", "3天后发货", "お届けまで5天。"]) {
      assert.equal(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}${text}`)).length, 1, text);
    }
  });

  it("does not take 天 in Japanese words for days", () => {
    assert.deepEqual(checkSimplifiedChinese(shop(`${JAPANESE_SHOP}天然素材、天気、晴天の日に発送`)), []);
  });
});
