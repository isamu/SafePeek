// On a page where you type a card number or a password into the page itself, every script from another domain can
// read what you type. This lists those scripts by what they are; it does not judge whether each one is trustworthy.
// The balance behind what counts where is in docs/decisions.md.

import { finding } from "./finding.js";
import { cardFieldKind, cardFields } from "./cardfield.js";
import { tokenizerFor } from "./payment.js";
import { hostMatches, urlMatches } from "./page-urls.js";
import { isRelatedHost } from "../engine/related-systems.js";

const ANALYTICS_CATEGORIES = [10, 42];
const ADVERTISING_CATEGORIES = [36, 71, 77];
const AUTHENTICATION_CATEGORY = 69;
const MAX_EVIDENCE = 20;

/**
 * @typedef {object} SensitiveContext
 * @property {import("./payment.js").Provider[]} providers
 * @property {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @property {import("../types.js").Technology[]} technologies
 * @property {{ urls: string[] }[]} botChecks
 * @property {import("./auth.js").AuthService[]} auth
 */

/**
 * @typedef {"bot check" | "sign-in" | "analytics" | "ads" | "other"} Role
 */

/**
 * @typedef {object} OtherScript
 * @property {string} host
 * @property {URL | null} url  null for a script known only from the loading record, which keeps hosts only
 * @property {Role} role
 */

/**
 * @param {import("../types.js").PageData} page
 * @param {SensitiveContext} context
 * @returns {import("../types.js").Finding[]}
 */
export function checkSensitivePage(page, context) {
  const scripts = otherDomainScripts(page, context);
  return [...cardPageFinding(page, scripts, context), ...loginPageFinding(page, scripts)];
}

/**
 * Every script from another domain counts where a card number is typed, well-known tools included: skimming has
 * come in through tag managers and analytics tags. Only a provider's own tokenizer, on its own host, is left out.
 * @param {import("../types.js").PageData} page
 * @param {OtherScript[]} scripts
 * @param {SensitiveContext} context
 * @returns {import("../types.js").Finding[]}
 */
function cardPageFinding(page, scripts, context) {
  if (!cardFields(page.inputs).some((f) => cardFieldKind(f) === "number")) return [];
  const counted = scripts.filter((s) => !isProviderTokenizer(s, context.providers));
  if (counted.length === 0) return [];
  const { count, evidence } = labelled(counted);
  return [finding("card_page_third_party", "medium", "page", { count }, evidence)];
}

/**
 * Where a password is typed, bot checks and sign-in services are expected and left out; analytics and tag managers
 * alone make it information; ads or unknown hosts make it low.
 * @param {import("../types.js").PageData} page
 * @param {OtherScript[]} scripts
 * @returns {import("../types.js").Finding[]}
 */
function loginPageFinding(page, scripts) {
  const hasPassword = page.inputs.some((i) => i.type.toLowerCase() === "password") || page.forms.some((f) => f.hasPassword);
  if (!hasPassword) return [];
  const counted = scripts.filter((s) => s.role !== "bot check" && s.role !== "sign-in");
  if (counted.length === 0) return [];
  const severity = counted.every((s) => s.role === "analytics") ? "info" : "low";
  const { count, evidence } = labelled(counted);
  return [finding("login_page_third_party", severity, "page", { count }, evidence)];
}

/**
 * @param {OtherScript[]} scripts
 * @returns {{ count: number, evidence: string[] }}  how many hosts, and one "role: host" line per host (ads and
 *   unknown hosts first), the lines capped for display
 */
function labelled(scripts) {
  const order = ["other", "ads", "analytics", "sign-in", "bot check"];
  const lines = scripts.map((s) => ({ rank: order.indexOf(s.role), line: `${s.role}: ${s.host}` }));
  const unique = [...new Set(lines.sort((a, b) => a.rank - b.rank).map((l) => l.line))];
  return { count: new Set(scripts.map((s) => s.host)).size, evidence: unique.slice(0, MAX_EVIDENCE) };
}

/**
 * A provider's tokenizer on its own host. A script known only by its host from the loading record cannot show its
 * path, so on a provider's host it is given the benefit of the doubt; see docs/decisions.md.
 * @param {OtherScript} script
 * @param {import("./payment.js").Provider[]} providers
 * @returns {boolean}
 */
function isProviderTokenizer(script, providers) {
  if (script.url) return tokenizerFor(script.url.href, providers) !== undefined;
  return providers.some((p) => (p.tokenScripts ?? []).length > 0 && p.hosts.some((h) => hostMatches(h, script.host)));
}

/**
 * Scripts from other domains than the page's: the script elements, plus hosts the loading record shows scripts came
 * from (a script can be inserted and removed). Hosts that look like the same organisation's (see isRelatedHost) are
 * left out; an asset domain whose name shares nothing with the site's still counts. One entry per URL, or per host
 * for a host known only from the record.
 * @param {import("../types.js").PageData} page
 * @param {SensitiveContext} context
 * @returns {OtherScript[]}
 */
function otherDomainScripts(page, context) {
  const pageHost = new URL(page.url).hostname;
  const isOther = (/** @type {string} */ host) => host !== pageHost && !isRelatedHost(pageHost, host, context.suffixes);
  const categories = hostCategories(context.technologies);
  const urls = page.scripts.flatMap((s) => {
    try {
      return s.src ? [new URL(s.src)] : [];
    } catch {
      return [];
    }
  });
  const fromDom = urls.filter((u) => isOther(u.hostname)).map((url) => ({ host: url.hostname, url, role: roleOf(url.hostname, url, categories, context) }));
  const seen = new Set(fromDom.map((s) => s.host));
  const fromRecord = (page.scriptHosts ?? [])
    .filter((host) => isOther(host) && !seen.has(host))
    .map((host) => ({ host, url: null, role: roleOf(host, null, categories, context) }));
  return [...fromDom, ...fromRecord];
}

/**
 * @param {string} host
 * @param {URL | null} url
 * @param {Map<string, number[]>} categories  of the products detected from each host's scripts
 * @param {SensitiveContext} context
 * @returns {Role}
 */
function roleOf(host, url, categories, context) {
  const cats = categories.get(host) ?? [];
  const matchesUrl = (/** @type {string} */ pattern) => (url ? urlMatches(pattern, url) : hostMatches(pattern.slice(0, pattern.indexOf("/")), host));
  if (context.botChecks.some((b) => b.urls.some(matchesUrl))) return "bot check";
  if (cats.includes(AUTHENTICATION_CATEGORY) || isSignInService(host, url, matchesUrl, context.auth)) return "sign-in";
  if (cats.some((c) => ADVERTISING_CATEGORIES.includes(c))) return "ads";
  if (cats.some((c) => ANALYTICS_CATEGORIES.includes(c))) return "analytics";
  return "other";
}

/**
 * A sign-in service by any of the traces auth-services.json lists: host, URL prefix, or a path fragment (the last
 * needs the script's path, so a host-only script cannot match it).
 * @param {string} host
 * @param {URL | null} url
 * @param {(pattern: string) => boolean} matchesUrl
 * @param {import("./auth.js").AuthService[]} auth
 * @returns {boolean}
 */
function isSignInService(host, url, matchesUrl, auth) {
  return auth.some(
    (s) =>
      (s.hosts ?? []).some((p) => hostMatches(p, host)) ||
      (s.urls ?? []).some(matchesUrl) ||
      (url !== null && (s.paths ?? []).some((p) => url.pathname.includes(p))),
  );
}

/**
 * The categories of the products each script host gave away, from the "script <url>" evidence of direct detections.
 * By host, not URL: a product's evidence keeps only a few of its script URLs, and its other scripts on the same host
 * are the same product.
 * @param {import("../types.js").Technology[]} technologies
 * @returns {Map<string, number[]>}
 */
function hostCategories(technologies) {
  /** @type {Map<string, number[]>} */
  const byHost = new Map();
  for (const t of technologies.filter((tech) => !tech.impliedBy)) {
    for (const label of t.evidence.filter((l) => l.startsWith("script http"))) {
      try {
        const host = new URL(label.slice("script ".length)).hostname;
        byHost.set(host, [...(byHost.get(host) ?? []), ...t.categories]);
      } catch {
        // an unparsable URL gives nothing away
      }
    }
  }
  return byHost;
}
