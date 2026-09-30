// Technology detection against the webappanalyzer (Wappalyzer-format) fingerprints.

import { matchPattern, parsePattern, toList } from "./patterns.js";
import { normalizeDom } from "./queries.js";
import { mostSpecificVersion } from "./version.js";

const MAX_SUBJECT = 300_000;
const SCRIPT_CONTENT = "script content";
/** CMS, ecommerce, blogs, web frameworks, web servers, programming languages, databases: what the site is built on. */
const PLATFORM_CATEGORIES = new Set([1, 6, 11, 18, 22, 27, 34]);

/**
 * @typedef {object} Hit
 * @property {number} confidence
 * @property {string[]} versions
 * @property {string[]} evidence
 * @property {boolean} [direct]  seen in something other than script code (a header, URL, meta tag, global …)
 * @property {string} [impliedBy]  set when the only reason for the hit is another technology's "implies"
 */

/**
 * @typedef {(name: string, result: { version: string, confidence: number } | null, evidence: string) => void} Report
 */

/**
 * @param {import("../types.js").PageData} page
 * @param {{ technologies: Record<string, any>, categories: Record<string, { name: string, priority: number }> }} db
 * @returns {import("../types.js").Technology[]}
 */
export function detectTechnologies(page, db) {
  /** @type {Map<string, Hit>} */
  const hits = new Map();
  /** @type {Report} */
  const report = (name, result, evidence) => {
    if (!result) return;
    const hit = hits.get(name) ?? { confidence: 0, versions: [], evidence: [] };
    hit.confidence = Math.min(100, hit.confidence + result.confidence);
    if (result.version) hit.versions.push(result.version);
    if (hit.evidence.length < 5) hit.evidence.push(evidence);
    hit.direct ||= evidence !== SCRIPT_CONTENT;
    hits.set(name, hit);
  };
  for (const [name, tech] of Object.entries(db.technologies)) {
    matchTechnology(name, tech, page, report);
  }
  dropUnsupported(hits, db.technologies);
  applyImplies(hits, db.technologies);
  applyRequirements(hits, db.technologies);
  return toResults(hits, db);
}

/**
 * @param {string} name
 * @param {any} tech
 * @param {import("../types.js").PageData} page
 * @param {Report} report
 */
function matchTechnology(name, tech, page, report) {
  matchKeyed(tech.headers, page.headers ?? {}, (key, value) => report(name, value, `header ${key}`), true);
  matchKeyed(tech.cookies, page.cookies, (key, value) => report(name, value, `cookie ${key}`), true);
  matchKeyed(tech.js, page.globals, (key, value) => report(name, value, `js ${key}`), false);
  matchMeta(tech.meta, page.meta, (key, value) => report(name, value, `meta ${key}`));
  const srcs = page.scripts.map((s) => s.src).filter((s) => s !== null);
  matchEach(tech.scriptSrc, srcs, (value, subject) => report(name, value, `script ${subject}`));
  const bodies = page.scripts.map((s) => s.content.slice(0, MAX_SUBJECT));
  matchEach(tech.scripts, bodies, (value) => report(name, value, SCRIPT_CONTENT));
  matchEach(tech.html, [page.html], (value) => report(name, value, "html"));
  matchEach(tech.text, [page.text], (value) => report(name, value, "page text"));
  matchEach(tech.url, [page.url], (value) => report(name, value, "url"));
  matchDom(tech.dom, page.dom, (value, selector) => report(name, value, `dom ${selector}`));
}

/**
 * Matches {key: pattern} objects against a {key: value} map. An empty pattern means "present".
 * @param {unknown} rules
 * @param {Record<string, unknown>} values
 * @param {(key: string, result: { version: string, confidence: number } | null) => void} onMatch
 * @param {boolean} lowerKeys
 */
function matchKeyed(rules, values, onMatch, lowerKeys) {
  if (!rules || typeof rules !== "object") return;
  for (const [rawKey, patternValue] of Object.entries(rules)) {
    const key = lowerKeys ? rawKey.toLowerCase() : rawKey;
    for (const actualKey of matchingKeys(key, values)) {
      const value = values[actualKey];
      if (value === undefined || value === null) continue;
      for (const pattern of toList(patternValue)) {
        onMatch(actualKey, testValue(pattern, value));
      }
    }
  }
}

/**
 * Cookie rules may end in "*" (a prefix); everything else is an exact key.
 * @param {string} key
 * @param {Record<string, unknown>} values
 * @returns {string[]}
 */
function matchingKeys(key, values) {
  if (!key.endsWith("*")) return key in values ? [key] : [];
  const prefix = key.slice(0, -1);
  return Object.keys(values).filter((k) => k.startsWith(prefix));
}

/**
 * @param {string} pattern
 * @param {unknown} value
 * @returns {{ version: string, confidence: number } | null}
 */
function testValue(pattern, value) {
  if (parsePattern(pattern).source === "") return { version: "", confidence: parsePattern(pattern).confidence };
  if (typeof value === "object") return null;
  return matchPattern(pattern, String(value));
}

/**
 * @param {unknown} rules
 * @param {Record<string, string[]>} meta
 * @param {(key: string, result: { version: string, confidence: number } | null) => void} onMatch
 */
function matchMeta(rules, meta, onMatch) {
  if (!rules || typeof rules !== "object") return;
  for (const [key, patternValue] of Object.entries(rules)) {
    for (const content of meta[key.toLowerCase()] ?? []) {
      for (const pattern of toList(patternValue)) onMatch(key, testValue(pattern, content));
    }
  }
}

/**
 * @param {unknown} patterns
 * @param {string[]} subjects
 * @param {(result: { version: string, confidence: number } | null, subject: string) => void} onMatch
 */
function matchEach(patterns, subjects, onMatch) {
  for (const pattern of toList(patterns)) {
    for (const subject of subjects) {
      if (subject) onMatch(matchPattern(pattern, subject), subject);
    }
  }
}

/**
 * @param {unknown} dom
 * @param {Record<string, import("../types.js").DomResult>} results
 * @param {(result: { version: string, confidence: number } | null, selector: string) => void} onMatch
 */
function matchDom(dom, results, onMatch) {
  for (const rule of normalizeDom(dom)) {
    const found = results[rule.selector];
    if (!found || found.count === 0) continue;
    if (rule.exists) onMatch({ version: "", confidence: 100 }, rule.selector);
    for (const [attr, pattern] of Object.entries(rule.attributes)) {
      for (const value of found.attributes[attr] ?? []) onMatch(testValue(pattern, value), rule.selector);
    }
    if (rule.text !== null) {
      const textPattern = rule.text;
      for (const value of found.texts) onMatch(testValue(textPattern, value), rule.selector);
    }
  }
}

/**
 * Drops hits that are not evidence on their own: patterns marked confidence:0 (they only add a version),
 * and a platform known only from a string inside script code — a bundle that mentions ".php?" or
 * "/wp-content" talks about another site as often as about this one.
 * @param {Map<string, Hit>} hits
 * @param {Record<string, any>} technologies
 */
function dropUnsupported(hits, technologies) {
  for (const [name, hit] of [...hits]) {
    const platform = (technologies[name]?.cats ?? []).some((/** @type {number} */ c) => PLATFORM_CATEGORIES.has(c));
    if (hit.confidence === 0 || (platform && !hit.direct)) hits.delete(name);
  }
}

/**
 * @param {Map<string, Hit>} hits
 * @param {Record<string, any>} technologies
 */
function applyImplies(hits, technologies) {
  const queue = [...hits.keys()];
  while (queue.length > 0) {
    const name = queue.shift() ?? "";
    for (const implied of toList(technologies[name]?.implies)) {
      const pattern = parsePattern(implied);
      if (!technologies[pattern.source] || hits.has(pattern.source)) continue;
      hits.set(pattern.source, { confidence: pattern.confidence, versions: [], evidence: [`implied by ${name}`], impliedBy: name });
      queue.push(pattern.source);
    }
  }
}

/**
 * @param {Map<string, Hit>} hits
 * @param {Record<string, any>} technologies
 */
function applyRequirements(hits, technologies) {
  const detectedCats = new Set([...hits.keys()].flatMap((n) => technologies[n]?.cats ?? []));
  for (const name of [...hits.keys()]) {
    const tech = technologies[name] ?? {};
    const required = toList(tech.requires);
    const requiredCats = toList(tech.requiresCategory).map(Number);
    const missing = required.some((r) => !hits.has(r)) || requiredCats.some((c) => !detectedCats.has(c));
    if (missing) hits.delete(name);
  }
  for (const name of [...hits.keys()]) {
    for (const excluded of toList(technologies[name]?.excludes)) hits.delete(excluded);
  }
}

/**
 * @param {Map<string, Hit>} hits
 * @param {{ technologies: Record<string, any>, categories: Record<string, { name: string, priority: number }> }} db
 * @returns {import("../types.js").Technology[]}
 */
function toResults(hits, db) {
  const priority = (/** @type {number[]} */ cats) => Math.min(99, ...cats.map((c) => db.categories[c]?.priority ?? 99));
  return [...hits.entries()]
    .map(([name, hit]) => ({
      name,
      version: mostSpecificVersion(hit.versions),
      confidence: hit.confidence,
      categories: db.technologies[name]?.cats ?? [],
      website: db.technologies[name]?.website ?? "",
      evidence: hit.evidence,
      impliedBy: hit.impliedBy ?? "",
    }))
    .sort((a, b) => priority(a.categories) - priority(b.categories) || a.name.localeCompare(b.name));
}
