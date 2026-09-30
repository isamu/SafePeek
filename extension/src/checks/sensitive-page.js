// On a page where you type a card number or a password into the page itself, every script from another site can
// read what you type. This counts those scripts; it does not judge whether each one is trustworthy.

import { finding } from "./finding.js";
import { cardFields } from "./cardfield.js";
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
  const hosts = otherSiteScriptHosts(page, providers, suffixes);
  if (hosts.length === 0) return [];
  const id = kind === "card" ? "card_page_third_party" : "login_page_third_party";
  return [finding(id, kind === "card" ? "medium" : "low", "page", { count: hosts.length }, hosts.slice(0, 20))];
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {"card" | "password" | null}  what is typed into the page itself; a provider's card frame is not
 */
function sensitiveKind(page) {
  if (cardFields(page.inputs).length > 0) return "card";
  if (page.inputs.some((i) => i.type === "password") || page.forms.some((f) => f.hasPassword)) return "password";
  return null;
}

/**
 * Hosts of scripts from other domains than the page's, leaving out hosts that look like the same organisation's
 * (see isRelatedHost) and payment providers, whose scripts on a card page are the expected tokenizer. An asset
 * domain whose name shares nothing with the site's (a "…assets.com", an image CDN) is still counted.
 * @param {import("../types.js").PageData} page
 * @param {import("./payment.js").Provider[]} providers
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {string[]}
 */
function otherSiteScriptHosts(page, providers, suffixes) {
  const pageHost = new URL(page.url).hostname;
  const hosts = page.scripts.flatMap((s) => {
    try {
      return s.src ? [new URL(s.src).hostname] : [];
    } catch {
      return [];
    }
  });
  const others = hosts.filter((h) => h !== pageHost && !isRelatedHost(pageHost, h, suffixes) && !providerForHost(h, providers));
  return [...new Set(others)];
}
