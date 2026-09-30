// A shop page that names another organisation's site as its own address. A scraped copy of a real shop keeps the
// original's canonical link or og:url (docs/fake-shop-research.md, item 8).

import { finding } from "./finding.js";
import { isJapaneseShop, offersToBuy } from "./japanese-shop.js";
import { isRelatedHost } from "../engine/related-systems.js";
import { registrable } from "../engine/public-suffix.js";
import { hrefOf, openingTags } from "../engine/html-tags.js";

const MAX_LINK_TAGS = 50;
const CANONICAL_REL = /\brel\s*=\s*["']?canonical\b/i;

/**
 * Only the other site's registrable domain is shown: a full host could be someone's internal or staging name (SPEC S9).
 * @param {import("../types.js").PageData} page
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {import("../types.js").Finding[]}
 */
export function checkCopiedShop(page, suffixes) {
  if (!isJapaneseShop(page.text) || !offersToBuy(page.text)) return [];
  const pageHost = hostOf(page.url, page.url);
  const others = declaredAddresses(page)
    .map((address) => hostOf(address, page.url))
    .filter((host) => host !== "" && host !== pageHost && !isRelatedHost(pageHost, host, suffixes))
    .map((host) => registrable(host, suffixes))
    // An IP address or a single-label name has no registrable domain to show, and may be internal (S9).
    .flatMap((r) => (r && r.suffix !== "" ? [r.domain] : []));
  const domains = [...new Set(others)];
  if (domains.length === 0) return [];
  return [finding("shop_names_other_site", "medium", "page", { domains: domains.join(", ") }, domains)];
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {string[]}  the canonical link targets and og:url values
 */
function declaredAddresses(page) {
  const canonical = openingTags(page.html, "link", MAX_LINK_TAGS)
    .filter((tag) => CANONICAL_REL.test(tag))
    .map(hrefOf);
  return [...canonical, ...(page.meta["og:url"] ?? [])];
}

/**
 * @param {string} url
 * @param {string} base
 * @returns {string}  the host, or "" when the URL cannot be read
 */
function hostOf(url, base) {
  try {
    return new URL(url, base).hostname;
  } catch {
    return "";
  }
}
