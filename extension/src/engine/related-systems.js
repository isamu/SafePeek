// Other hosts that look like the same organisation's (an order system, an API host), named by the page's own HTML,
// forms, API calls or first-party scripts, and what their URL shapes suggest. The page's own backend is inferred
// elsewhere.

import { registrable } from "./public-suffix.js";

const MAX_URLS = 3000;
const ABSOLUTE_URL = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'`<>()\\]*)?/gi;
const ATTRIBUTE_URL = /\b(?:href|action|src)\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi;
const MIN_NAME_LENGTH = 4;

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
 * Two hosts look like one organisation's when they share a registrable domain, or when one domain's whole name is
 * one of the words of the other's ("acme" and "acme-ec"). Sharing one word in the middle ("example-hotel" and
 * "hotel-alpha") is not enough, and customers of one shared host are never related by name.
 * @param {string} pageHost
 * @param {string} host
 * @param {import("./public-suffix.js").SuffixIndex} suffixes
 * @returns {boolean}
 */
export function isRelatedHost(pageHost, host, suffixes) {
  if (host === pageHost) return false;
  const ours = registrable(pageHost, suffixes);
  const theirs = registrable(host, suffixes);
  if (!ours || !theirs) return false;
  if (ours.domain === theirs.domain) return true;
  if (ours.shared || theirs.shared) return false;
  const a = nameOf(ours);
  const b = nameOf(theirs);
  return (a.length >= MIN_NAME_LENGTH && b.split("-").includes(a)) || (b.length >= MIN_NAME_LENGTH && a.split("-").includes(b));
}

/**
 * @param {import("./public-suffix.js").Registrable} r
 * @returns {string}  the label left of the suffix, e.g. "acme-ec" for "acme-ec.com"
 */
function nameOf(r) {
  return r.domain.slice(0, -(r.suffix.length + 1));
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
 * @param {import("./public-suffix.js").SuffixIndex} suffixes
 * @returns {RelatedSystem[]}
 */
export function inferRelatedSystems(page, rules, suffixes) {
  const pageHost = new URL(page.url).hostname;
  /** @type {Map<string, Set<string>>} */
  const pathsByHost = new Map();
  for (const url of mentionedUrls(page, pageHost).filter((u) => isRelatedHost(pageHost, u.hostname, suffixes))) {
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
