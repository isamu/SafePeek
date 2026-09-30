// Signs JC3 and 国民生活センター list for fake shops that legitimate shops also show, so none is reported alone:
// only two or more together (docs/fake-shop-research.md, items 6, 7, 11, 12).

import { finding } from "./finding.js";
import { isJapaneseShop, offersToBuy } from "./japanese-shop.js";
import { hrefOf, openingTags } from "../engine/html-tags.js";

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
const PAYMENT_HEADING = /(?:お)?支払(?:い)?方法|決済方法/g;
const PAYMENT_WINDOW = 200;
const BANK_TRANSFER = /銀行振込|銀行振り込み|お振込/;
const OTHER_PAYMENTS = /クレジット|カード|コンビニ|代引|代金引換|後払い|PayPay|PayPal|Amazon ?Pay|楽天ペイ|d払い|au PAY|キャリア決済|電子マネー/i;
const DISCOUNT = /(\d{2})\s?[%％]\s?(?:OFF|オフ|引き|割引)/gi;
const MIN_STEEP_DISCOUNT = 70;
const FULL_WIDTH_DIGIT = /[０-９]/g;
const FULL_WIDTH_ZERO = "０".charCodeAt(0);
const MIN_STEEP_DISCOUNTS = 3;
// Social networks whose icons a shop shows. Icons that all point at a network's home page, not a profile, are what
// BEYOND PHISH found on fraudulent shops (https://yancomm.net/papers/2023%20-%20SP%20-%20Beyond%20Phish.pdf).
const SOCIAL_HOSTS = new Set(["facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com", "line.me"]);
const MAX_ANCHORS = 2000;
// Share and intent buttons say nothing about the shop's own accounts: they neither count as a profile nor as a
// home-page link. Small real shops often show only these.
const SHARE_PATH = /^\/(?:intent|share|sharer|sharer\.php|share\.php|dialog\/share|r\/msg\/text)(?:\/|$)/i;
const MIN_SIGNS = 2;
const MEDIUM_SIGNS = 3;

/**
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkWeakShopSigns(page) {
  if (!isJapaneseShop(page.text) || !offersToBuy(page.text)) return [];
  const host = new URL(page.url).hostname;
  const signs = [abusedTld(host), freeMailOnly(page.text), bankTransferOnly(page.text), steepDiscounts(page.text), socialLinksGoNowhere(page)].filter(
    (sign) => sign !== "",
  );
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
 * A payment section names bank transfer, and none of them (a FAQ, the footer, the actual list) names another method.
 * @param {string} text
 * @returns {string}
 */
function bankTransferOnly(text) {
  const sections = [...text.matchAll(PAYMENT_HEADING)].map((m) => text.slice(m.index, m.index + PAYMENT_WINDOW));
  const bank = sections.some((section) => BANK_TRANSFER.test(section));
  return bank && !sections.some((section) => OTHER_PAYMENTS.test(section)) ? "bank transfer only" : "";
}

/**
 * @param {string} text
 * @returns {string}
 */
function steepDiscounts(text) {
  const steep = [...halfWidthDigits(text).matchAll(DISCOUNT)].filter((m) => Number(m[1]) >= MIN_STEEP_DISCOUNT);
  return steep.length >= MIN_STEEP_DISCOUNTS ? `${steep.length} discounts of ${MIN_STEEP_DISCOUNT}% or more` : "";
}

/**
 * @param {string} text
 * @returns {string}  full-width digits (７０％) turned into ASCII ones
 */
function halfWidthDigits(text) {
  return text.replace(FULL_WIDTH_DIGIT, (digit) => String(digit.charCodeAt(0) - FULL_WIDTH_ZERO));
}

/**
 * The page links to social networks, and every such link is the network's home page rather than a profile. A shop
 * with no social links at all is common and not counted.
 * @param {import("../types.js").PageData} page
 * @returns {string}
 */
function socialLinksGoNowhere(page) {
  const social = openingTags(page.html, "a", MAX_ANCHORS)
    .map((tag) => socialLink(hrefOf(tag), page.url))
    .filter((link) => link !== null);
  return social.length > 0 && social.every((link) => link.path === "") ? "social links go to home pages only" : "";
}

/**
 * @param {string} href
 * @param {string} base
 * @returns {{ path: string } | null}  the path on a social network, without slashes; null when not a social link, or
 *   only a share button
 */
function socialLink(href, base) {
  try {
    const url = new URL(href, base);
    const host = url.hostname.replace(/^(?:www|m)\./, "");
    if (!SOCIAL_HOSTS.has(host) || SHARE_PATH.test(url.pathname)) return null;
    return { path: url.pathname.replaceAll("/", "") };
  } catch {
    return null;
  }
}
