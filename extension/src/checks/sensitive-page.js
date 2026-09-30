// On a page where you type a card number or a password into the page itself, every script from another site can
// read what you type. This counts those scripts; it does not judge whether each one is trustworthy.

import { finding } from "./finding.js";
import { cardFieldKind, cardFields } from "./cardfield.js";
import { providerForHost } from "./payment.js";
import { isRelatedHost } from "../engine/related-systems.js";

/**
 * @param {import("../types.js").PageData} page
 * @param {import("./payment.js").Provider[]} providers
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {import("../types.js").Finding[]}
 */
export function checkSensitivePage(page, providers, suffixes) {
  const kind = sensitiveKind(page);
  if (!kind) return [];
  const hosts = otherDomainScriptHosts(page, kind === "card" ? providers : [], suffixes);
  if (hosts.length === 0) return [];
  const id = kind === "card" ? "card_page_third_party" : "login_page_third_party";
  return [finding(id, kind === "card" ? "medium" : "low", "page", { count: hosts.length }, hosts.slice(0, 20))];
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {"card" | "password" | null}  what is typed into the page itself: a card NUMBER field (a security code
 *   or expiry alone is not a card number), or a password. A provider's card frame is not the page itself.
 */
function sensitiveKind(page) {
  if (cardFields(page.inputs).some((f) => cardFieldKind(f) === "number")) return "card";
  if (page.inputs.some((i) => i.type.toLowerCase() === "password") || page.forms.some((f) => f.hasPassword)) return "password";
  return null;
}

/**
 * A provider's tokenizer: the script's host is the provider's, and its URL matches one of that provider's
 * tokenScripts. A URL on another host that merely contains the pattern is not one.
 * @param {URL} url
 * @param {import("./payment.js").Provider[]} tokenizers
 * @returns {boolean}
 */
function isTokenizer(url, tokenizers) {
  const provider = providerForHost(url.hostname, tokenizers);
  return (provider?.tokenScripts ?? []).some((re) => new RegExp(re, "i").test(url.href));
}

/**
 * Hosts of scripts from other domains than the page's, leaving out hosts that look like the same organisation's
 * (see isRelatedHost) and, on a card page, the payment providers' own tokenizer scripts (their listed tokenScripts;
 * any other script of a provider still runs in the page and counts). An asset domain whose name shares nothing with
 * the site's (a "…assets.com", an image CDN) is still counted.
 * @param {import("../types.js").PageData} page
 * @param {import("./payment.js").Provider[]} tokenizers  providers whose tokenScripts are expected here
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {string[]}
 */
function otherDomainScriptHosts(page, tokenizers, suffixes) {
  const pageHost = new URL(page.url).hostname;
  const hosts = page.scripts.flatMap((s) => {
    try {
      const url = s.src ? new URL(s.src) : null;
      return url && !isTokenizer(url, tokenizers) ? [url.hostname] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(hosts.filter((h) => h !== pageHost && !isRelatedHost(pageHost, h, suffixes)))];
}
