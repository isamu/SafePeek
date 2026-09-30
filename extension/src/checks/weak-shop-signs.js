// Signs JC3 and 国民生活センター list for fake shops that legitimate shops also show, so none is reported alone:
// only two or more together (docs/fake-shop-research.md, items 6, 7, 11, 12).

import { finding } from "./finding.js";
import { isJapaneseShop, offersToBuy } from "./japanese-shop.js";

// TLDs JC3 names as commonly used by bad shops (https://www.jc3.or.jp/threats/topics/article-374.html).
const ABUSED_TLDS = new Set(["xyz", "top", "bid"]);
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.co.jp",
  "ymail.ne.jp",
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.jp",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "qq.com",
  "163.com",
  "126.com",
]);
const EMAIL_DOMAIN = /[\w.+-]{1,64}@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,4})/gi;
const PAYMENT_HEADING = /(?:お)?支払(?:い)?方法|決済方法/;
const PAYMENT_WINDOW = 200;
const BANK_TRANSFER = /銀行振込|銀行振り込み|お振込/;
const OTHER_PAYMENTS = /クレジット|カード|コンビニ|代引|代金引換|後払い|PayPay|PayPal|Amazon ?Pay|楽天ペイ|d払い|au PAY|キャリア決済|電子マネー/i;
const DISCOUNT = /(\d{2})\s?[%％]\s?(?:OFF|オフ|引き|割引)/gi;
const MIN_STEEP_DISCOUNT = 70;
const MIN_STEEP_DISCOUNTS = 3;
const MIN_SIGNS = 2;
const MEDIUM_SIGNS = 3;

/**
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkWeakShopSigns(page) {
  if (!isJapaneseShop(page.text) || !offersToBuy(page.text)) return [];
  const host = new URL(page.url).hostname;
  const signs = [abusedTld(host), freeMailOnly(page.text), bankTransferOnly(page.text), steepDiscounts(page.text)].filter((sign) => sign !== "");
  if (signs.length < MIN_SIGNS) return [];
  return [finding("shop_weak_signs", signs.length >= MEDIUM_SIGNS ? "medium" : "low", "page", { count: signs.length }, signs)];
}

/**
 * @param {string} host
 * @returns {string}  the evidence line, or "" when the sign is absent
 */
function abusedTld(host) {
  const tld = host.split(".").pop() ?? "";
  return ABUSED_TLDS.has(tld) ? `TLD .${tld}` : "";
}

/**
 * Every address given is a free email service's; an address on the shop's own domain, or any other, clears it.
 * @param {string} text
 * @returns {string}
 */
function freeMailOnly(text) {
  const domains = [...new Set([...text.matchAll(EMAIL_DOMAIN)].map((m) => m[1].toLowerCase()))];
  return domains.length > 0 && domains.every((d) => FREE_MAIL_DOMAINS.has(d)) ? `free email only (${domains.join(", ")})` : "";
}

/**
 * The payment section names bank transfer and no other method.
 * @param {string} text
 * @returns {string}
 */
function bankTransferOnly(text) {
  const at = text.search(PAYMENT_HEADING);
  if (at < 0) return "";
  const section = text.slice(at, at + PAYMENT_WINDOW);
  return BANK_TRANSFER.test(section) && !OTHER_PAYMENTS.test(section) ? "bank transfer only" : "";
}

/**
 * @param {string} text
 * @returns {string}
 */
function steepDiscounts(text) {
  const steep = [...text.matchAll(DISCOUNT)].filter((m) => Number(m[1]) >= MIN_STEEP_DISCOUNT);
  return steep.length >= MIN_STEEP_DISCOUNTS ? `${steep.length} discounts of ${MIN_STEEP_DISCOUNT}% or more` : "";
}
