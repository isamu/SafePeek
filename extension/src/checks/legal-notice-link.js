// A Japanese shop page that nowhere mentions the 特定商取引法 notice mail-order sellers must show
// (docs/fake-shop-research.md, item 3). Every public body's fake-shop checklist starts here.

import { finding } from "./finding.js";
import { isJapaneseShop, offersToBuy } from "./japanese-shop.js";

// Link text and page names for the notice, old and new wording.
const NOTICE_MENTION = /特定商取引|特商法|通信販売法|通信販売に関する表示|法律に基づく表[記示]|法令に基づく表[記示]/;
// Cart and checkout pages often drop the footer on purpose, so they are not judged.
const CART_PATH = /(?:^|[/_.-])(?:cart|basket|checkout|order|shoppingcart|kago)(?:[/_.?-]|$)/i;
// What the collector keeps of a page (src/page/collector.js): a page cut there may have lost its footer.
export const HTML_LIMIT = 500_000;
export const TEXT_LIMIT = 100_000;

/**
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkLegalNoticeLink(page) {
  if (!isJapaneseShop(page.text) || !offersToBuy(page.text) || CART_PATH.test(pathOf(page.url))) return [];
  if (page.html.length >= HTML_LIMIT || page.text.length >= TEXT_LIMIT) return [];
  if (NOTICE_MENTION.test(page.html) || NOTICE_MENTION.test(page.text)) return [];
  return [finding("legal_notice_link_missing", "medium", "page")];
}

/**
 * @param {string} url
 * @returns {string}
 */
function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
