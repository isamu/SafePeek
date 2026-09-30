// On a page showing the notice the 特定商取引法 requires of mail-order sellers, whether each required item is there.
// Required items: https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html

import { finding } from "./finding.js";

const NOTICE_HEADING = /特定商取引法|特商法|特定商取引に関する法律|通信販売に関する表示/;
const HEADINGS = /<(title|h1|h2)\b[^>]*>([^<]{0,200})<\/\1>/gi;
// 特定商取引法 11 lets a seller leave some items out when it says it will give them without delay on request.
const ON_REQUEST = /請求[^。]{0,30}(?:遅滞なく|速やかに)|(?:遅滞なく|速やかに)[^。]{0,30}(?:開示|提供|通知)/;
const IDENTITY_ITEMS = ["販売業者", "所在地", "電話番号"];
const ITEMS = [
  { label: "販売業者", pattern: /販売業者|販売事業者|事業者|会社名|商号|運営会社|販売元|店舗名/, onRequest: false },
  { label: "所在地", pattern: /所在地|住所/, onRequest: true },
  { label: "電話番号", pattern: /電話|TEL|連絡先/i, onRequest: true },
  { label: "代表者または責任者", pattern: /代表者|代表取締役|責任者/, onRequest: true },
  { label: "支払方法", pattern: /支払|決済/, onRequest: false },
  { label: "引渡し時期", pattern: /引渡|引き渡|発送|配送|お届け/, onRequest: false },
  { label: "返品・キャンセル", pattern: /返品|返金|キャンセル|交換|解約/, onRequest: false },
];

/**
 * Only which kinds of item are missing is reported, never the values that are there.
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkLegalNotice(page) {
  if (!isNoticePage(page.html)) return [];
  const onRequest = ON_REQUEST.test(page.text);
  const missing = ITEMS.filter((item) => !item.pattern.test(page.text) && !(item.onRequest && onRequest)).map((item) => item.label);
  if (missing.length === 0) return [];
  const severity = missing.some((label) => IDENTITY_ITEMS.includes(label)) ? "medium" : "low";
  return [finding("legal_notice_incomplete", severity, "page", { count: missing.length }, missing)];
}

/**
 * The page's title or a top heading names the notice; a footer link to it on every page does not.
 * @param {string} html
 * @returns {boolean}
 */
function isNoticePage(html) {
  return [...html.matchAll(HEADINGS)].some((match) => NOTICE_HEADING.test(match[2]));
}
