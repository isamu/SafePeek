// On a page showing the notice the 特定商取引法 requires of mail-order sellers, whether each required item is there.
// Items, and which may be left out on request: https://www.no-trouble.caa.go.jp/what/mailorder/ (広告の表示事項を省略できる場合)

import { finding } from "./finding.js";

// A title part or heading that is the notice's own name, not one about the law (特商法とは) or the notice (…の書き方).
const NOTICE_TITLE = /^(?:(?:特定商取引法|特商法|特定商取引に関する法律)(?:に基づく|による|に関する|上の)?(?:表記|表示)|通信販売に関する表示)(?:について)?$/;
// Separators between a page's name and the site's name in a title.
const TITLE_SEPARATORS = /[|｜:：/／\-－–—]/;
const TRAILING_NOTE = /[（(][^）)]{0,20}[）)]$/;
const HEADINGS = /<(title|h1|h2)\b[^>]*>([\s\S]{0,400}?)<\/\1>/gi;
// 特定商取引法 11 lets a seller leave some items out when the notice says it will give them without delay when the
// consumer asks; only phrasings of such a request count, so billing prose (請求書, 請求額) never does, and the details
// must be provided, not merely notified.
const REQUEST_PHRASES = ["があった場合", "がある場合", "があれば", "あり次第", "次第", "により", "された場合", "に応じ", "を受け"];
const POLITE_REQUEST_PHRASES = ["いただいた場合", "いただければ", "いただきましたら", "いただき次第"];
const ON_REQUEST = new RegExp(
  `(?:請求|申し?出)(?:${REQUEST_PHRASES.join("|")}|を?(?:${POLITE_REQUEST_PHRASES.join("|")}))[^。]{0,40}遅滞なく[^。]{0,40}(?:提供|開示|交付|送付)`,
);
// What 11 has the seller provide on request is the omitted matters, so a sentence sending an invoice or the goods is not
// the statement: 提供 / 交付 / 送付 count only with the information named; 開示 always names it.
const DISCLOSED_DETAILS = /開示|書面|電子メール|電磁的記録|事項|情報|内容|詳細/;
const POSTAL_CODE = /〒\s?\d{3}-?\d{4}/;
const PREFECTURE_AND_CITY = /(?:東京都|北海道|京都府|大阪府|\S{2,3}県)\S{1,8}?[市区町村郡]/;
const SHIPPED_GOODS = /発送|配送|お届け|配達|宅配/;
// One unread term on an otherwise complete notice is far more often a wording SafePeek does not know than a gap, so the
// other terms are reported only when several are missing; the seller's identity and the returns (never omittable) always are.
const MIN_MISSING_TERMS = 2;
const ALWAYS_REPORTED = ["販売業者", "所在地", "電話番号", "返品"];
// A number under a label such as 連絡先 is the phone even without 電話 or TEL; full-width digits and separators too.
const PHONE_NUMBER = /(?:[0０]|\+81[- ]?)[0-9０-９]{1,4}[-‐－―(（)） ]?[0-9０-９]{1,4}[-‐－―(（)） ]?[0-9０-９]{3,4}/;
const IDENTITY_ITEMS = ["販売業者", "所在地", "電話番号"];
// onRequest: the law lets the item be left out after the on-request statement (price and shipping too, when they are
// not all shown: https://www.no-trouble.caa.go.jp/qa/advertising.html Q5). The return terms never may.
const ITEMS = [
  // Any word for the one who sells (販売業者, 販売者, 販売主, 販売元 …) or its name; an individual seller writes 氏名.
  {
    label: "販売業者",
    pattern: /販売(?:業者|事業者|者|主|元|会社|店)|事業者|会社名|商号|運営(?:会社|者|元|主体)|店舗名|屋号|法人名|名称|氏名/,
    onRequest: true,
  },
  // Some notices put the address under the seller's name without a label: a postal code or prefecture-and-city counts.
  { label: "所在地", pattern: new RegExp(["所在地|住所", POSTAL_CODE.source, PREFECTURE_AND_CITY.source].join("|")), onRequest: true },
  { label: "電話番号", pattern: new RegExp(["電話|TEL", PHONE_NUMBER.source].join("|"), "i"), onRequest: true },
  { label: "代表者または責任者", pattern: /代表者|代表取締役|責任者/, onRequest: true },
  // 「商品代金以外の必要料金」 and 「代金引換」 are about other charges and payment, not the price.
  // A service states its price as a fee (利用料金, 月額, 受講料, 会費 …).
  { label: "販売価格", pattern: /価格|対価|代金(?!以外|引換|引き換)|利用料|月額|年額|受講料|会費|表示金額|支払い?金額/, onRequest: true },
  // Shipping applies to goods sent to the buyer, so a notice for a service or a right is not asked for it.
  { label: "送料", pattern: /送料|配送料|必要な?(?:料金|費用)|負担[^。\n]{0,12}(?:料金|費用)|手数料/, onRequest: true, onlyWhen: SHIPPED_GOODS },
  // Payment timing may be left out only on conditions the page cannot show, so only the method is checked.
  { label: "支払方法", pattern: /支払|決済/, onRequest: true },
  // The law's wording covers services and rights too: 役務の提供時期, 権利の移転時期.
  {
    label: "引渡し時期",
    pattern:
      /引渡|引き渡|受渡|受け渡|発送|配送|お届け|提供時期|役務の提供|サービス(?:の)?提供|利用開始|移転時期|開始時期|サービス開始|提供開始|始期|利用期間|提供期間/,
    onRequest: true,
  },
  // The statute words it as 引取り or 返還 after delivery.
  { label: "返品", pattern: /返品|返金|キャンセル|交換|解約|引取|引き取|返還/, onRequest: false },
];

/**
 * Only which kinds of item are missing is reported, never the values that are there.
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkLegalNotice(page) {
  if (!isNoticePage(page.html)) return [];
  const onRequest = hasGeneralOnRequest(page.text);
  const asked = ITEMS.filter((item) => !item.onlyWhen || item.onlyWhen.test(page.text));
  const missing = asked.filter((item) => !item.pattern.test(page.text) && !(item.onRequest && onRequest)).map((item) => item.label);
  if (!missing.some((label) => ALWAYS_REPORTED.includes(label)) && missing.length < MIN_MISSING_TERMS) return [];
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
  return text
    .split(/[。\n]/)
    .some((sentence) => ON_REQUEST.test(sentence) && DISCLOSED_DETAILS.test(sentence) && !ITEMS.some((item) => item.pattern.test(sentence)));
}

/**
 * The page's title or a top heading names the notice; a footer link to it on every page does not.
 * @param {string} html
 * @returns {boolean}
 */
export function isNoticePage(html) {
  return [...html.matchAll(HEADINGS)].some((match) => withoutTags(match[2]).split(TITLE_SEPARATORS).some(isNoticeTitle));
}

/**
 * @param {string} part  one separated part of a title or heading
 * @returns {boolean}
 */
function isNoticeTitle(part) {
  return NOTICE_TITLE.test(part.replace(/\s/g, "").replace(TRAILING_NOTE, ""));
}

/**
 * @param {string} markup
 * @returns {string}  the text between tags
 */
function withoutTags(markup) {
  return markup
    .split("<")
    .map((part, index) => (index === 0 ? part : part.slice(part.indexOf(">") + 1)))
    .join("");
}
