// Backend framework inference. Server-side frameworks leave few traces in a page, so each rule adds
// up weak signals (URL conventions, field and parameter names, headers, script names and code,
// cookies, globals, error output) into a confidence, and every signal that fired is kept, with its
// weight, as evidence.

import { extractParams, extractPaths } from "./page-traces.js";

const THRESHOLD = 30;

/**
 * @typedef {object} Signal
 * @property {"link" | "param" | "html" | "source" | "script" | "cookie" | "header" | "global" | "host" | "api"} type  "api": a URL the page itself fetched
 * @property {string} pattern
 * @property {number} weight
 * @property {string} note
 * @property {string} [noteJa]
 */

/**
 * @typedef {object} BackendRule
 * @property {string} name
 * @property {string} language
 * @property {"eol" | "legacy" | "managed" | "hosting" | "info"} status
 * @property {string} [eol]
 * @property {string} [source]
 * @property {Signal[]} signals
 */

/**
 * @typedef {object} Traces
 * @property {string[]} paths
 * @property {string[]} params
 * @property {string[]} sources
 */

/**
 * Property paths the page probe must read for "global" signals.
 * @param {BackendRule[]} rules
 * @returns {string[]}
 */
export function backendGlobalPaths(rules) {
  return rules.flatMap((r) => r.signals.filter((s) => s.type === "global").map((s) => s.pattern));
}

/**
 * @param {import("../types.js").PageData} page
 * @param {BackendRule[]} rules
 * @returns {import("../types.js").Backend[]}
 */
export function inferBackends(page, rules) {
  /** @type {Traces} */
  const traces = { paths: extractPaths(page), params: extractParams(page), sources: page.scripts.map((s) => s.content).filter((c) => c) };
  /** @type {import("../types.js").Backend[]} */
  const found = [];
  for (const rule of rules) {
    const signals = [];
    for (const signal of rule.signals) {
      const match = matchSignal(signal, page, traces);
      if (match !== null) signals.push({ type: signal.type, note: signal.note, noteJa: signal.noteJa ?? signal.note, weight: signal.weight, match });
    }
    const score = signals.reduce((sum, s) => sum + s.weight, 0);
    if (score < THRESHOLD) continue;
    found.push({
      name: rule.name,
      language: rule.language,
      status: rule.status,
      eol: rule.eol ?? "",
      source: rule.source ?? "",
      confidence: Math.min(100, score),
      signals: signals.sort((a, b) => b.weight - a.weight),
    });
  }
  return found.sort((a, b) => b.confidence - a.confidence);
}

/**
 * @param {Signal} signal
 * @param {import("../types.js").PageData} page
 * @param {Traces} traces
 * @returns {string | null}  what matched, for the evidence line
 */
function matchSignal(signal, page, traces) {
  switch (signal.type) {
    case "header":
      return matchHeader(signal.pattern, page.headers ?? {});
    case "host":
      return firstMatch(signal.pattern, [hostOf(page.url)]);
    case "global":
      return signal.pattern in page.globals ? `window.${signal.pattern}` : null;
    case "link":
      return firstMatch(signal.pattern, traces.paths);
    case "api":
      return matchedRequestPart(signal.pattern, page.requests);
    case "param":
      return firstMatch(signal.pattern, traces.params);
    case "cookie":
      return firstMatch(signal.pattern, Object.keys(page.cookies));
    case "script":
      return firstMatch(
        signal.pattern,
        page.scripts.map((s) => s.src ?? ""),
      );
    case "source":
      return excerptMatch(signal.pattern, traces.sources);
    default:
      return excerptMatch(signal.pattern, [page.html]);
  }
}

/**
 * @param {string} pattern
 * @param {string[]} values
 * @returns {string | null}
 */
function firstMatch(pattern, values) {
  const regex = new RegExp(pattern, "i");
  return values.find((v) => v !== "" && regex.test(v)) ?? null;
}

/**
 * Only the host and the part the rule matched: the rest of a request path can hold a token no mask recognises.
 * @param {string} pattern
 * @param {string[]} requests
 * @returns {string | null}
 */
function matchedRequestPart(pattern, requests) {
  const regex = new RegExp(pattern, "i");
  for (const url of requests) {
    const match = regex.exec(url);
    if (match) return match.index === 0 ? match[0] : `${hostOf(url)} …${match[0]}`;
  }
  return null;
}

/**
 * @param {string} pattern
 * @param {string[]} texts
 * @returns {string | null}
 */
function excerptMatch(pattern, texts) {
  const regex = new RegExp(pattern, "i");
  for (const text of texts) {
    const match = regex.exec(text);
    if (match) {
      return text
        .slice(Math.max(0, match.index - 30), match.index + match[0].length + 30)
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  return null;
}

/**
 * @param {string} pattern  "header-name: regex"
 * @param {Record<string, string>} headers
 * @returns {string | null}
 */
function matchHeader(pattern, headers) {
  const sep = pattern.indexOf(":");
  const name = pattern.slice(0, sep).trim().toLowerCase();
  const value = headers[name];
  if (value === undefined) return null;
  return new RegExp(pattern.slice(sep + 1).trim(), "i").test(value) ? `${name}: ${value}` : null;
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
