// Other hosts that look like the same organisation's (an order system, an API host), named by the page's own HTML,
// forms, API calls or first-party scripts, and what their URL shapes suggest. The page's own backend is inferred
// elsewhere.

const MAX_URLS = 3000;
const ABSOLUTE_URL = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'`<>()\\]*)?/gi;
const ATTRIBUTE_URL = /\b(?:href|action|src)\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
const MIN_BRAND_LENGTH = 4;
// Shared hosting where each subdomain is a different customer: the registrable domain is one label below these.
const SHARED_HOSTING_SUFFIXES = [
  "github.io",
  "gitlab.io",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "herokuapp.com",
  "web.app",
  "firebaseapp.com",
  "appspot.com",
  "run.app",
  "amplifyapp.com",
  "cloudfront.net",
  "azurewebsites.net",
  "blogspot.com",
  "wixsite.com",
  "myshopify.com",
  "square.site",
  "onrender.com",
  "fly.dev",
  "glitch.me",
  "s3.amazonaws.com",
  "shop-pro.jp",
  "thebase.in",
  "stores.jp",
  "base.shop",
  "wordpress.com",
  "hatenablog.com",
];
// Words too common in domain names to identify an organisation.
const GENERIC_WORDS = new Set([
  "shop",
  "store",
  "online",
  "mall",
  "bank",
  "news",
  "tokyo",
  "japan",
  "osaka",
  "official",
  "group",
  "global",
  "media",
  "info",
  "service",
  "services",
  "cloud",
  "digital",
  "life",
  "home",
  "web",
  "site",
  "portal",
  "market",
  "select",
  "direct",
  "club",
  "net",
  "world",
  "plus",
  "smart",
  "style",
  "design",
  "studio",
  "labs",
]);
// Second-level suffixes under which the registrable domain has three labels. Not a full public suffix list: a
// miss only makes two hosts of one organisation look unrelated.
const SECOND_LEVEL_SUFFIXES = new Set([
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "go.jp",
  "ad.jp",
  "ed.jp",
  "gr.jp",
  "lg.jp",
  "co.uk",
  "org.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.kr",
  "com.br",
  "com.cn",
  "com.tw",
  "com.hk",
  "co.nz",
  "com.sg",
  "com.mx",
  "co.in",
]);

/**
 * @typedef {object} RelatedHint
 * @property {string} backend
 * @property {string} note
 * @property {string} noteJa
 * @property {string} match  the part of the path the rule matched
 */

/**
 * @typedef {object} RelatedSystem
 * @property {string} host
 * @property {RelatedHint[]} hints
 */

/**
 * @param {string} host
 * @returns {string}  e.g. "acme-ec.com" for "jp.acme-ec.com", "example.co.jp" for "www.example.co.jp"
 */
export function registrableDomain(host) {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const shared = sharedHostingSuffix(host);
  if (shared) return labels.slice(-(shared.split(".").length + 1)).join(".");
  const size = SECOND_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.slice(-size).join(".");
}

/**
 * The words of a registrable domain's name that can identify the organisation ("acme" from "acme-ec.com").
 * @param {string} host
 * @returns {string[]}
 */
function brandWords(host) {
  const name = registrableDomain(host).split(".")[0];
  return name.split("-").filter((word) => word.length >= MIN_BRAND_LENGTH && !GENERIC_WORDS.has(word));
}

/**
 * A different host of the same registrable domain, or one whose domain name shares a brand word.
 * @param {string} pageHost
 * @param {string} host
 * @returns {boolean}
 */
export function isRelatedHost(pageHost, host) {
  if (host === pageHost) return false;
  if (registrableDomain(host) === registrableDomain(pageHost)) return true;
  if (sharedHostingSuffix(host) || sharedHostingSuffix(pageHost)) return false;
  const theirs = brandWords(host);
  return brandWords(pageHost).some((word) => theirs.includes(word));
}

/**
 * Absolute URLs the page itself names or calls: its HTML attributes, form targets, API calls, and the bodies of its
 * inline and same-host scripts. A third-party script's body is left out: its URLs are the vendor's, not the site's.
 * @param {import("../types.js").PageData} page
 * @param {string} pageHost
 * @returns {URL[]}
 */
function mentionedUrls(page, pageHost) {
  const firstParty = page.scripts.filter((s) => !s.src || hostOf(s.src) === pageHost);
  const raw = [
    ...[...page.html.matchAll(ATTRIBUTE_URL)].map((m) => m[1]),
    ...page.forms.map((f) => f.action),
    ...(page.requests ?? []),
    ...firstParty.flatMap((s) => firstMatches(s.content ?? "", ABSOLUTE_URL)),
  ];
  return raw.slice(0, MAX_URLS).flatMap((text) => {
    try {
      return [new URL(text.replace(/&amp;/g, "&"))];
    } catch {
      return [];
    }
  });
}

/**
 * Related hosts with the backend URL-shape rules their paths match. Hosts without a match are left out.
 * @param {import("../types.js").PageData} page
 * @param {import("./backend.js").BackendRule[]} rules
 * @returns {RelatedSystem[]}
 */
export function inferRelatedSystems(page, rules) {
  const pageHost = new URL(page.url).hostname;
  /** @type {Map<string, Set<string>>} */
  const pathsByHost = new Map();
  for (const url of mentionedUrls(page, pageHost).filter((u) => isRelatedHost(pageHost, u.hostname))) {
    const paths = pathsByHost.get(url.hostname) ?? new Set();
    paths.add(url.pathname.replace(/;jsessionid=[^/?]*/i, ""));
    pathsByHost.set(url.hostname, paths);
  }
  return [...pathsByHost].map(([host, paths]) => ({ host, hints: hintsFor([...paths], rules) })).filter((s) => s.hints.length > 0);
}

/**
 * The first URL-shape rule of each backend that one of the paths matches.
 * @param {string[]} paths
 * @param {import("./backend.js").BackendRule[]} rules
 * @returns {RelatedHint[]}
 */
function hintsFor(paths, rules) {
  return rules.flatMap((rule) => {
    for (const signal of rule.signals.filter((s) => s.type === "link")) {
      const regex = new RegExp(signal.pattern, "i");
      const hit = paths.map((p) => regex.exec(p)).find((m) => m !== null);
      if (hit) return [{ backend: rule.name, note: signal.note, noteJa: signal.noteJa ?? signal.note, match: hit[0] }];
    }
    return [];
  });
}

/**
 * @param {string} text
 * @param {RegExp} pattern  global
 * @returns {string[]}  at most MAX_URLS matches, without scanning past them
 */
function firstMatches(text, pattern) {
  const found = [];
  for (const m of text.matchAll(pattern)) {
    found.push(m[0]);
    if (found.length >= MAX_URLS) break;
  }
  return found;
}

/**
 * @param {string} url
 * @returns {string}
 */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * @param {string} host
 * @returns {string | undefined}  the shared hosting suffix the host is a customer of
 */
function sharedHostingSuffix(host) {
  const name = host.toLowerCase().replace(/\.$/, "");
  return SHARED_HOSTING_SUFFIXES.find((suffix) => name.endsWith(`.${suffix}`));
}
