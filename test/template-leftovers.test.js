import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkTemplateLeftovers } from "../extension/src/checks/template-leftovers.js";
import { makePage } from "./helpers.js";

/** @param {string} text @param {string} [title] */
const notice = (text, title = "特定商取引法に基づく表記 | ショップ") =>
  makePage({ text, html: `<html><head><title>${title}</title></head><body></body></html>` });

describe("template leftovers in the 特定商取引法 notice", () => {
  it("names each kind of placeholder, not the text around it", () => {
    const [found] = checkTemplateLeftovers(notice("販売業者 株式会社〇〇\n電話番号 000-0000-0000\n所在地 〒000-0000 東京都"));
    assert.deepEqual([found.id, found.severity, found.evidence], ["shop_template_leftovers", "low", ["株式会社〇〇", "000-0000-0000", "〒000-0000"]]);
  });

  it("reads the common variants", () => {
    for (const text of ["販売業者 ○○ショップ", "運営会社 有限会社××", "TEL 00-000-0000"]) {
      assert.equal(checkTemplateLeftovers(notice(text)).length, 1, text);
    }
  });

  it("reads a value on the line after its label, and a 0000-00-0000 phone", () => {
    const [found] = checkTemplateLeftovers(notice("販売業者\n株式会社〇〇\n電話番号\n\n0000-00-0000"));
    assert.deepEqual(found.evidence, ["株式会社〇〇", "000-0000-0000"]);
    assert.deepEqual(checkTemplateLeftovers(notice("電話番号\n入力例：000-0000-0000")), [], "an example on the next line is still an example");
    assert.deepEqual(checkTemplateLeftovers(notice("お知らせ\n000-0000-0000")), [], "a zero number under no identity label is not read");
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
      assert.deepEqual(checkTemplateLeftovers(notice(text)), [], text);
    }
  });

  it("does not take an example of how to fill in a form for a leftover", () => {
    for (const text of [
      "電話番号（入力例：000-0000-0000）",
      "郵便番号 例）〒000-0000",
      "会社名 入力例：◯◯◯◯◯株式会社",
      "電話番号はハイフンなしで 00000000000",
    ]) {
      assert.deepEqual(checkTemplateLeftovers(notice(text)), [], text);
    }
  });

  it("reads only the notice itself, so a product page's print template or a guide does not count", () => {
    const stamp = makePage({
      text: "会社名 株式会社〇〇〇\n連絡先・SNS\nTEL▷000-0000-0000\nカートに入れる",
      html: "<html><head><title>名入れゴム印</title></head></html>",
    });
    assert.deepEqual(checkTemplateLeftovers(stamp), [], "what a buyer wants printed");
    assert.deepEqual(checkTemplateLeftovers(notice("販売業者 株式会社〇〇", "特定商取引法に基づく表記の書き方")), [], "a guide to writing the notice");
    assert.deepEqual(
      checkTemplateLeftovers(notice("販売業者 株式会社〇〇", "特定商取引法に基づく表記 | 通販マニュアル")),
      [],
      "a manual whose title starts with the notice name",
    );
    assert.deepEqual(checkTemplateLeftovers(notice("株式会社××との提携\n〇〇様からのレビュー")), [], "no identity label");
  });

  it("does not take English template wording for a leftover, since real shops use it too", () => {
    for (const text of ["Please enter your store name when you register.", "Default Store View", "Lorem ipsum dolor sit amet"]) {
      assert.deepEqual(checkTemplateLeftovers(notice(text)), [], text);
    }
  });
});
