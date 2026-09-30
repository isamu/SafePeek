// Translates the fingerprint database into the questions the page collector has to answer.

import { toList } from "./patterns.js";

/**
 * @typedef {object} DomRule
 * @property {string} selector
 * @property {Record<string, string>} attributes  attribute -> pattern
 * @property {string | null} text  pattern for textContent, or null
 * @property {boolean} exists  whether mere presence is a match
 */

/**
 * @param {unknown} dom  the `dom` field of a technology
 * @returns {DomRule[]}
 */
export function normalizeDom(dom) {
  if (dom === undefined || dom === null) return [];
  if (typeof dom === "string" || Array.isArray(dom)) {
    return toList(dom).map((selector) => ({ selector, attributes: {}, text: null, exists: true }));
  }
  if (typeof dom !== "object") return [];
  return Object.entries(dom).map(([selector, spec]) => {
    const s = spec && typeof spec === "object" ? spec : {};
    return {
      selector,
      attributes: s.attributes && typeof s.attributes === "object" ? s.attributes : {},
      text: typeof s.text === "string" ? s.text : null,
      exists: "exists" in s || (!s.attributes && typeof s.text !== "string" && !s.properties),
    };
  });
}

/**
 * Every DOM selector the database cares about, merged per selector.
 * @param {Record<string, any>} technologies
 * @returns {import("../types.js").DomQuery[]}
 */
export function buildDomQueries(technologies) {
  /** @type {Map<string, import("../types.js").DomQuery>} */
  const bySelector = new Map();
  for (const tech of Object.values(technologies)) {
    for (const rule of normalizeDom(tech.dom)) {
      const query = bySelector.get(rule.selector) ?? { selector: rule.selector, attributes: [], text: false };
      for (const attr of Object.keys(rule.attributes)) {
        if (!query.attributes.includes(attr)) query.attributes.push(attr);
      }
      query.text = query.text || rule.text !== null;
      bySelector.set(rule.selector, query);
    }
  }
  return [...bySelector.values()];
}

/**
 * Every JavaScript property path the database reads from the page.
 * @param {Record<string, any>} technologies
 * @returns {string[]}
 */
export function buildGlobalPaths(technologies) {
  const paths = new Set();
  for (const tech of Object.values(technologies)) {
    if (tech.js && typeof tech.js === "object") {
      for (const path of Object.keys(tech.js)) paths.add(path);
    }
  }
  return [...paths];
}

/**
 * Retire.js "func" extractors are JavaScript expressions. Instead of evaluating them (which would
 * need eval inside the page), the simple, common shapes are rewritten into plain property paths.
 * Anything more complex is skipped.
 *   "angular.version.full"                         -> ["angular.version.full"]
 *   "(window.jQuery || window.$).fn.jquery"        -> ["jQuery.fn.jquery", "$.fn.jquery"]
 *   "Ext && Ext.version"                           -> ["Ext.version"]
 * @param {string} expression
 * @returns {string[]}
 */
export function funcToPaths(expression) {
  const expr = expression.trim();
  const alternatives = /^\(([^()]+)\)((?:\.[\w$]+)+)$/.exec(expr);
  if (alternatives) {
    const heads = alternatives[1].split("||").map((h) => h.trim());
    if (!heads.every(isPath)) return [];
    return heads.map((head) => stripWindow(head) + alternatives[2]);
  }
  const last = expr.split("&&").pop()?.trim() ?? "";
  return isPath(last) ? [stripWindow(last)] : [];
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isPath(text) {
  return /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(text);
}

/**
 * @param {string} path
 * @returns {string}
 */
function stripWindow(path) {
  return path.replace(/^window\./, "");
}
