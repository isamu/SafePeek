// Other systems of the same organisation the page hands off to (an order system on another host, an API host),
// and what their URL shapes suggest about them. The page's own backend is inferred elsewhere.

const MAX_URLS = 3000;
const ABSOLUTE_URL = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'`<>()\\]*)?/gi;
const ATTRIBUTE_URL = /\b(?:href|action|src)\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
const MIN_BRAND_LENGTH = 4;
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
 * @returns {string}  e.g. "misumi-ec.com" for "jp.misumi-ec.com", "example.co.jp" for "www.example.co.jp"
 */
export function registrableDomain(host) {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const size = SECOND_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.slice(-size).join(".");
}

/**
 * The words of a registrable domain's name that can identify the organisation ("misumi" from "misumi-ec.com").
 * @param {string} host
 * @returns {string[]}
 */
function brandWords(host) {
  const name = registrableDomain(host).split(".")[0];
  return name.split("-").filter((word) => word.length >= MIN_BRAND_LENGTH);
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
  const theirs = brandWords(host);
  return brandWords(pageHost).some((word) => theirs.includes(word));
}

/**
 * Absolute URLs the page mentions or calls: its HTML attributes, form targets, API calls and script bodies.
 * @param {import("../types.js").PageData} page
 * @returns {URL[]}
 */
function mentionedUrls(page) {
  const raw = [
    ...[...page.html.matchAll(ATTRIBUTE_URL)].map((m) => m[1]),
    ...page.forms.map((f) => f.action),
    ...(page.requests ?? []),
    ...page.scripts.flatMap((s) => [...(s.content ?? "").matchAll(ABSOLUTE_URL)].map((m) => m[0])),
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
  for (const url of mentionedUrls(page).filter((u) => isRelatedHost(pageHost, u.hostname))) {
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
