import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkTemplateLeftovers } from "../extension/src/checks/template-leftovers.js";
import { makePage } from "./helpers.js";

const JAPANESE_SHOP = "こちらの商品は税込価格で表示しています。送料は全国一律です。「カートに入れる」ボタンからどうぞ。".repeat(10);
/** @param {string} extra */
const shop = (extra) => makePage({ text: `${JAPANESE_SHOP}\n${extra}`, html: "<html></html>" });

describe("template leftovers on a shop page", () => {
  it("names each kind of placeholder, not the text around it", () => {
    const [found] = checkTemplateLeftovers(shop("販売業者 株式会社〇〇\n電話番号 000-0000-0000\n所在地 〒000-0000 東京都"));
    assert.deepEqual([found.id, found.severity, found.evidence], ["shop_template_leftovers", "low", ["株式会社〇〇", "000-0000-0000", "〒000-0000"]]);
  });

  it("reads the common variants", () => {
    for (const text of [
      "販売業者 ○○ショップ",
      "運営会社 有限会社××",
      "TEL 00-000-0000",
      "Lorem ipsum dolor sit amet",
      "Your Store Name",
      "Default Store View",
    ]) {
      assert.equal(checkTemplateLeftovers(shop(text)).length, 1, text);
    }
  });

  it("does not take real numbers with zeros, or a single 〇, for placeholders", () => {
    for (const text of [
      "電話番号 03-0000-1234",
      "TEL 0120-000-000",
      "所在地 〒100-0001",
      "販売業者 株式会社〇丸",
      "〇月〇日発送",
      "電話番号 100-0000-0000",
      "電話番号 000-0000-00005",
      "販売業者 〇ショップ",
    ]) {
      assert.deepEqual(checkTemplateLeftovers(shop(text)), [], text);
    }
  });

  it("does not take an example of how to fill in a form for a leftover", () => {
    for (const text of [
      "電話番号（入力例：000-0000-0000）",
      "郵便番号 例）〒000-0000",
      "会社名 入力例：◯◯◯◯◯株式会社",
      "電話番号はハイフンなしで 00000000000",
    ]) {
      assert.deepEqual(checkTemplateLeftovers(shop(text)), [], text);
    }
  });

  it("counts a masked name or zero number only where the seller's identity is given", () => {
    for (const text of ["株式会社××との提携商品", "〇〇様からのレビュー：〇〇株式会社さんの商品です", "000-0000-0000"]) {
      assert.deepEqual(checkTemplateLeftovers(shop(text)), [], text);
    }
  });

  it("does not take a product called Lorem Ipsum for template filler", () => {
    assert.deepEqual(checkTemplateLeftovers(shop("Tシャツ「Lorem Ipsum」ホワイト")), []);
  });

  it("stays out of pages that are not Japanese shops", () => {
    assert.deepEqual(checkTemplateLeftovers(makePage({ text: "Lorem ipsum dolor sit amet. Your Store Name.", html: "<html></html>" })), []);
  });
});
