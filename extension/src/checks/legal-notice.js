// On a page showing the notice the 特定商取引法 requires of mail-order sellers, whether each required item is there.
// Items, and which may be left out on request: https://www.no-trouble.caa.go.jp/what/mailorder/ (広告の表示事項を省略できる場合)

import { finding } from "./finding.js";

// The notice itself (…に基づく表記 / 表示), not a page about the law (特商法とは).
const NOTICE_HEADING = /(?:特定商取引法|特商法|特定商取引に関する法律)[\s\S]{0,12}?(?:表記|表示)|通信販売に関する表示/;
const HEADINGS = /<(title|h1|h2)\b[^>]*>([\s\S]{0,400}?)<\/\1>/gi;
// 特定商取引法 11 lets a seller leave some items out when the notice says it will give them without delay when the
// consumer asks; only phrasings of such a request count, so billing prose (請求書, 請求額) never does, and the details
// must be provided, not merely notified.
const REQUEST_PHRASES = ["があった場合", "がある場合", "があれば", "あり次第", "次第", "により", "された場合", "に応じ", "を受け"];
const POLITE_REQUEST_PHRASES = ["いただいた場合", "いただければ", "いただきましたら", "いただき次第"];
const ON_REQUEST = new RegExp(
  `(?:請求|申し?出)(?:${REQUEST_PHRASES.join("|")}|を?(?:${POLITE_REQUEST_PHRASES.join("|")}))[^。]{0,40}遅滞なく[^。]{0,40}(?:提供|開示|交付|送付)`,
);
const IDENTITY_ITEMS = ["販売業者", "所在地", "電話番号"];
// onRequest: the law lets the item be left out after the on-request statement. Price and returns never may.
const ITEMS = [
  { label: "販売業者", pattern: /販売業者|販売事業者|事業者|会社名|商号|運営会社|販売元|店舗名/, onRequest: true },
  { label: "所在地", pattern: /所在地|住所/, onRequest: true },
  { label: "電話番号", pattern: /電話|TEL/i, onRequest: true },
  { label: "代表者または責任者", pattern: /代表者|代表取締役|責任者/, onRequest: true },
  // 「商品代金以外の必要料金」 and 「代金引換」 are about other charges and payment, not the price.
  { label: "販売価格", pattern: /価格|代金(?!以外|引換|引き換)/, onRequest: false },
  { label: "送料", pattern: /送料|配送料|必要料金|手数料/, onRequest: false },
  // Payment timing may be left out only on conditions the page cannot show, so only the method is checked.
  { label: "支払方法", pattern: /支払|決済/, onRequest: true },
  // The law's wording covers services and rights too: 役務の提供時期, 権利の移転時期.
  { label: "引渡し時期", pattern: /引渡|引き渡|受渡|受け渡|発送|配送|お届け|提供時期|役務の提供|サービス(?:の)?提供|利用開始|移転時期/, onRequest: true },
  { label: "返品", pattern: /返品|返金|キャンセル|交換|解約/, onRequest: false },
];

/**
 * Only which kinds of item are missing is reported, never the values that are there.
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkLegalNotice(page) {
  if (!isNoticePage(page.html)) return [];
  const onRequest = hasGeneralOnRequest(page.text);
  const missing = ITEMS.filter((item) => !item.pattern.test(page.text) && !(item.onRequest && onRequest)).map((item) => item.label);
  if (missing.length === 0) return [];
  const severity = missing.some((label) => IDENTITY_ITEMS.includes(label)) ? "medium" : "low";
  return [finding("legal_notice_incomplete", severity, "page", { count: missing.length }, missing)];
}

/**
 * An on-request sentence that names an item already puts that item's label in the text, so only one naming no item
 * ("上記以外の事項は…") stands in for the items left out; a promise about the phone alone excuses nothing else.
 * @param {string} text
 * @returns {boolean}
 */
function hasGeneralOnRequest(text) {
  return text.split(/[。\n]/).some((sentence) => ON_REQUEST.test(sentence) && !ITEMS.some((item) => item.pattern.test(sentence)));
}

/**
 * The page's title or a top heading names the notice; a footer link to it on every page does not.
 * @param {string} html
 * @returns {boolean}
 */
function isNoticePage(html) {
  return [...html.matchAll(HEADINGS)].some((match) => NOTICE_HEADING.test(match[2]));
}
