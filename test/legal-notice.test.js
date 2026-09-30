import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkLegalNotice } from "../extension/src/checks/legal-notice.js";
import { makePage } from "./helpers.js";

const COMPLETE = [
  "販売業者 株式会社サンプル",
  "運営責任者 山田太郎",
  "所在地 東京都千代田区1-1-1",
  "電話番号 03-0000-0000",
  "お支払い方法 クレジットカード",
  "引渡し時期 ご注文から3日以内に発送",
  "返品・交換 到着後7日以内",
].join("\n");

/** @param {string} title @param {string} text */
const notice = (title, text) => makePage({ html: `<html><head><title>${title}</title></head><body></body></html>`, text });

describe("特定商取引法 notice", () => {
  it("says nothing about a complete notice", () => {
    assert.deepEqual(checkLegalNotice(notice("特定商取引法に基づく表記 | ショップ", COMPLETE)), []);
  });

  it("lists the missing kinds, medium when the seller's identity is missing", () => {
    const text = COMPLETE.split("\n")
      .filter((line) => !/所在地|電話番号/.test(line))
      .join("\n");
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", text));
    assert.equal(found.id, "legal_notice_incomplete");
    assert.equal(found.severity, "medium");
    assert.deepEqual(found.evidence, ["所在地", "電話番号"]);
  });

  it("is low when only terms such as returns are missing", () => {
    const text = COMPLETE.split("\n")
      .filter((line) => !/返品/.test(line))
      .join("\n");
    const [found] = checkLegalNotice(notice("特商法表記", text));
    assert.deepEqual([found.severity, found.evidence], ["low", ["返品・キャンセル"]]);
  });

  it("accepts the on-request statement the law allows for the address, phone and representative", () => {
    const text = [...COMPLETE.split("\n").filter((line) => !/所在地|電話番号|責任者/.test(line)), "※ご請求があれば遅滞なく開示いたします"].join("\n");
    assert.deepEqual(checkLegalNotice(notice("特定商取引法に基づく表記", text)), []);
  });

  it("recognises the notice by an h1 or h2 as well, but not by a footer link", () => {
    const h2 = makePage({ html: '<html><body><h2 class="x">特定商取引に関する法律に基づく表示</h2></body></html>', text: "" });
    assert.equal(checkLegalNotice(h2).length, 1);
    const footer = makePage({ html: '<html><body><footer><a href="/law">特定商取引法に基づく表記</a></footer></body></html>', text: "" });
    assert.deepEqual(checkLegalNotice(footer), []);
  });

  it("never shows a value from the page", () => {
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", "所在地 東京都千代田区1-1-1"));
    assert.ok(!JSON.stringify(found).includes("千代田"));
  });
});
