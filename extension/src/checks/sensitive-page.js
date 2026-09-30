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
 * @property {URL} url
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
  const counted = scripts.filter((s) => !tokenizerFor(s.url.href, context.providers));
  if (counted.length === 0) return [];
  const evidence = labelled(counted);
  return [finding("card_page_third_party", "medium", "page", { count: evidence.length }, evidence)];
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
  const evidence = labelled(counted);
  return [finding("login_page_third_party", severity, "page", { count: evidence.length }, evidence)];
}

/**
 * @param {OtherScript[]} scripts
 * @returns {string[]}  one "role: host" line per host, ads and unknown hosts first
 */
function labelled(scripts) {
  const order = ["other", "ads", "analytics", "sign-in", "bot check"];
  const lines = scripts.map((s) => ({ rank: order.indexOf(s.role), line: `${s.role}: ${s.url.hostname}` }));
  return [...new Set(lines.sort((a, b) => a.rank - b.rank).map((l) => l.line))].slice(0, 20);
}

/**
 * Scripts from other domains than the page's, leaving out hosts that look like the same organisation's (see
 * isRelatedHost). An asset domain whose name shares nothing with the site's still counts.
 * @param {import("../types.js").PageData} page
 * @param {SensitiveContext} context
 * @returns {OtherScript[]}
 */
function otherDomainScripts(page, context) {
  const pageHost = new URL(page.url).hostname;
  const categoriesByUrl = scriptCategories(context.technologies);
  return page.scripts.flatMap((s) => {
    try {
      const url = s.src ? new URL(s.src) : null;
      if (!url || url.hostname === pageHost || isRelatedHost(pageHost, url.hostname, context.suffixes)) return [];
      return [{ url, role: roleOf(url, categoriesByUrl.get(s.src ?? "") ?? [], context) }];
    } catch {
      return [];
    }
  });
}

/**
 * @param {URL} url
 * @param {number[]} categories  of the products webappanalyzer detected from this script URL
 * @param {SensitiveContext} context
 * @returns {Role}
 */
function roleOf(url, categories, context) {
  if (context.botChecks.some((b) => b.urls.some((p) => urlMatches(p, url)))) return "bot check";
  if (categories.includes(AUTHENTICATION_CATEGORY) || isSignInService(url, context.auth)) return "sign-in";
  if (categories.some((c) => ADVERTISING_CATEGORIES.includes(c))) return "ads";
  if (categories.some((c) => ANALYTICS_CATEGORIES.includes(c))) return "analytics";
  return "other";
}

/**
 * @param {URL} url
 * @param {import("./auth.js").AuthService[]} auth
 * @returns {boolean}
 */
function isSignInService(url, auth) {
  return auth.some((s) => (s.hosts ?? []).some((p) => hostMatches(p, url.hostname)) || (s.urls ?? []).some((p) => urlMatches(p, url)));
}

/**
 * The categories of the products each script URL gave away, from the "script <url>" evidence of direct detections.
 * @param {import("../types.js").Technology[]} technologies
 * @returns {Map<string, number[]>}
 */
function scriptCategories(technologies) {
  /** @type {Map<string, number[]>} */
  const byUrl = new Map();
  for (const t of technologies.filter((tech) => !tech.impliedBy)) {
    for (const label of t.evidence.filter((l) => l.startsWith("script http"))) {
      const url = label.slice("script ".length);
      byUrl.set(url, [...(byUrl.get(url) ?? []), ...t.categories]);
    }
  }
  return byUrl;
}
