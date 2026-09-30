import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkLegalNotice } from "../extension/src/checks/legal-notice.js";
import { makePage } from "./helpers.js";

const COMPLETE = [
  "販売業者 株式会社サンプル",
  "運営責任者 山田太郎",
  "所在地 東京都千代田区1-1-1",
  "電話番号 03-0000-0000",
  "販売価格 各商品ページに記載 送料 全国一律500円",
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

  it("reports a missing representative or person responsible", () => {
    const text = COMPLETE.split("\n")
      .filter((line) => !/責任者/.test(line))
      .join("\n");
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", text));
    assert.deepEqual([found.severity, found.evidence], ["low", ["代表者または責任者"]]);
  });

  it("is low when only terms such as returns are missing", () => {
    const text = COMPLETE.split("\n")
      .filter((line) => !/返品/.test(line))
      .join("\n");
    const [found] = checkLegalNotice(notice("特商法表記", text));
    assert.deepEqual([found.severity, found.evidence], ["low", ["返品"]]);
  });

  it("lets the on-request statement stand in for the items the law allows, but never for returns", () => {
    const omittable = /販売業者|所在地|電話番号|責任者|販売価格|支払|引渡し/;
    const kept = COMPLETE.split("\n").filter((line) => !omittable.test(line));
    for (const statement of [
      "※ご請求があれば遅滞なく開示いたします",
      "請求があった場合には、遅滞なく電子メールにて提供します",
      "上記以外の事項は、ご請求いただければ遅滞なく書面を交付いたします",
      "上記以外の事項は、ご請求あり次第、遅滞なく開示いたします",
      "上記以外の事項は、請求された場合には遅滞なく電子メールで提供します",
      "上記以外の事項は、ご請求をいただきましたら遅滞なく提供いたします",
      "上記以外の事項は、お申し出次第、遅滞なく開示いたします",
      "上記以外の事項は、お申出があれば遅滞なく書面を送付いたします",
    ]) {
      assert.deepEqual(checkLegalNotice(notice("特定商取引法に基づく表記", [...kept, statement].join("\n"))), [], statement);
    }
    const noReturns = kept.filter((line) => !/返品/.test(line));
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", [...noReturns, "※ご請求があれば遅滞なく開示いたします"].join("\n")));
    assert.deepEqual(found.evidence, ["返品"]);
  });

  it("lets an on-request promise about one item excuse nothing else", () => {
    const text = COMPLETE.split("\n").filter((line) => !/電話番号|引渡し/.test(line));
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", [...text, "電話番号は請求があった場合には遅滞なく開示します"].join("\n")));
    assert.deepEqual(found.evidence, ["引渡し時期"]);
  });

  it("does not take an invoice sentence, 速やかに, or a mere 通知 for the on-request statement", () => {
    const withoutAddress = COMPLETE.split("\n").filter((line) => !/所在地/.test(line));
    for (const sentence of [
      "請求書は遅滞なく送付いたします",
      "ご請求いただければ速やかに開示します",
      "遅滞なく発送します。ご請求は不要です",
      "ご請求額は遅滞なくお振込みください",
      "代金の請求額は遅滞なく通知します",
      "ご請求があれば遅滞なく通知します",
    ]) {
      const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", [...withoutAddress, sentence].join("\n")));
      assert.deepEqual(found?.evidence, ["所在地"], sentence);
    }
  });

  it("does not take other charges or cash on delivery for the price", () => {
    const withoutPrice = COMPLETE.split("\n").filter((line) => !/販売価格/.test(line));
    const text = [...withoutPrice, "商品代金以外の必要料金 送料500円", "お支払方法 代金引換"].join("\n");
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", text));
    assert.deepEqual(found.evidence, ["販売価格"]);
  });

  it("reads a heading whose text sits in nested markup", () => {
    const nested = makePage({ html: '<html><body><h1 class="t"><span>特定商取引法に基づく<br>表記</span></h1></body></html>', text: COMPLETE });
    assert.deepEqual(checkLegalNotice(nested), []);
    const nestedIncomplete = makePage({ html: "<html><body><h1><span>特定商取引法に基づく<br>表記</span></h1></body></html>", text: "" });
    assert.equal(checkLegalNotice(nestedIncomplete).length, 1);
  });

  it("reads the timing of a service or a right as the delivery timing", () => {
    const goods = COMPLETE.split("\n").filter((line) => !/引渡し/.test(line));
    for (const label of ["役務の提供時期 お申込み後すぐ", "サービス提供時期 決済完了後", "提供時期 即時", "利用開始日 お申込み当日"]) {
      assert.deepEqual(checkLegalNotice(notice("特定商取引法に基づく表記", [...goods, label].join("\n"))), [], label);
    }
  });

  it("reads the ways a notice names the charges besides the price", () => {
    const withoutShipping = COMPLETE.split("\n").map((line) => line.replace(/ 送料 全国一律500円/, ""));
    for (const label of [
      "商品代金以外に必要な料金 振込手数料",
      "商品代金以外にご負担いただく費用 梱包料",
      "購入者が負担すべき料金 返送料",
      "商品代金以外の必要料金 なし",
    ]) {
      assert.deepEqual(checkLegalNotice(notice("特定商取引法に基づく表記", [...withoutShipping, label].join("\n"))), [], label);
    }
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", withoutShipping.join("\n")));
    assert.deepEqual(found.evidence, ["送料"]);
  });

  it("reads common label variants", () => {
    const variants = [
      "事業者の名称 株式会社サンプル",
      "運営統括責任者 山田太郎",
      "住所 大阪府大阪市1-1",
      "TEL 06-0000-0000",
      "販売価格 表示価格（税込）",
      "商品代金以外の必要料金 送料",
      "お支払方法 代金引換",
      "商品受渡し時期 入金確認後",
      "役務の提供時期 お申込み後すぐ",
      "返品特約 未開封に限る",
    ];
    assert.deepEqual(checkLegalNotice(notice("特定商取引法に基づく表記", variants.join("\n"))), []);
  });

  it("recognises the notice by an h1 or h2 as well, but not by a footer link", () => {
    const h2 = makePage({ html: '<html><body><h2 class="x">特定商取引に関する法律に基づく表示</h2></body></html>', text: "" });
    assert.equal(checkLegalNotice(h2).length, 1);
    const footer = makePage({ html: '<html><body><footer><a href="/law">特定商取引法に基づく表記</a></footer></body></html>', text: "" });
    assert.deepEqual(checkLegalNotice(footer), []);
    const page = (/** @type {string} */ heading) => makePage({ html: `<html><head>${heading}</head><body></body></html>`, text: "" });
    for (const heading of [
      "<title>特商法とは？わかりやすく解説</title>",
      "<h1>特定商取引法の改正について</h1>",
      "<title>特定商取引法に基づく表記の書き方 | ブログ</title>",
      "<h1>通信販売に関する表示のルールと注意点</h1>",
    ]) {
      assert.deepEqual(checkLegalNotice(page(heading)), [], heading);
    }
    for (const heading of [
      "<title>特商法表記</title>",
      "<h1>特定商取引法による表示</h1>",
      "<h2>通信販売に関する表示</h2>",
      "<title>ショップ名 - 特定商取引法に基づく表記</title>",
      "<title>特定商取引法に基づく表記（通信販売） ｜ ショップ名</title>",
      "<h1>特定商取引法に基づく表記について</h1>",
    ]) {
      assert.equal(checkLegalNotice(page(heading)).length, 1, heading);
    }
  });

  it("never shows a value from the page", () => {
    const [found] = checkLegalNotice(notice("特定商取引法に基づく表記", "所在地 東京都千代田区1-1-1"));
    assert.ok(!JSON.stringify(found).includes("千代田"));
  });
});
