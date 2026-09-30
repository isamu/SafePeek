// Runs every engine and check over collected page data and produces the report the popup shows.

import { checkCookies, checkHeaders, checkTransport } from "./checks/headers.js";
import { checkEol, checkLibraries } from "./checks/eol.js";
import { checkPage } from "./checks/page.js";
import { checkPayment } from "./checks/payment.js";
import { detectTechnologies } from "./engine/technologies.js";
import { scanLibraries } from "./engine/retire.js";

/** Retire.js component -> fingerprint technology name, so a version found by one fills the other. */
const LIBRARY_TO_TECH = { jquery: "jQuery", angularjs: "AngularJS", vue: "Vue.js", bootstrap: "Bootstrap" };

/** @type {Record<import("./types.js").Severity, number>} */
const ORDER = { high: 0, medium: 1, low: 2, info: 3, good: 4 };

/**
 * @typedef {object} Databases
 * @property {Record<string, any>} technologies
 * @property {Record<string, { name: string, priority: number }>} categories
 * @property {Record<string, any>} retire
 * @property {{ products: Record<string, any> }} eol
 * @property {import("./checks/payment.js").Provider[]} providers
 */

/**
 * @typedef {object} Report
 * @property {"danger" | "caution" | "ok"} level
 * @property {Record<import("./types.js").Severity, number>} counts
 * @property {import("./types.js").Finding[]} findings
 * @property {import("./types.js").Technology[]} technologies
 * @property {import("./types.js").Library[]} libraries
 */

/**
 * @param {import("./types.js").PageData} page
 * @param {Databases} db
 * @param {{ today: Date, sha1: (text: string) => Promise<string> }} env
 * @returns {Promise<Report>}
 */
export async function analyze(page, db, env) {
  const libraries = await scanLibraries(page, db.retire, env.sha1);
  const technologies = mergeLibraries(detectTechnologies(page, db), libraries, db.technologies);
  const findings = [
    ...checkTransport(page),
    ...checkPayment(page, db.providers),
    ...checkLibraries(libraries),
    ...checkEol(technologies, db.eol, env.today),
    ...checkHeaders(page),
    ...checkCookies(page),
    ...checkPage(page),
  ].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const counts = { high: 0, medium: 0, low: 0, info: 0, good: 0 };
  for (const f of findings) counts[f.severity]++;
  return { level: levelOf(counts), counts, findings, technologies, libraries };
}

/**
 * A library the Retire.js scan identified fills in (or adds) the matching technology, so its
 * version also goes through the end-of-life check.
 * @param {import("./types.js").Technology[]} technologies
 * @param {import("./types.js").Library[]} libraries
 * @param {Record<string, any>} fingerprints
 * @returns {import("./types.js").Technology[]}
 */
function mergeLibraries(technologies, libraries, fingerprints) {
  for (const lib of libraries) {
    const techName = LIBRARY_TO_TECH[/** @type {keyof typeof LIBRARY_TO_TECH} */ (lib.component)];
    if (!techName) continue;
    const tech = technologies.find((t) => t.name === techName);
    if (tech) {
      tech.version ||= lib.version;
      continue;
    }
    const cats = fingerprints[techName]?.cats ?? [];
    technologies.push({ name: techName, version: lib.version, confidence: 100, categories: cats, website: "", evidence: lib.evidence });
  }
  return technologies;
}

/**
 * @param {Record<import("./types.js").Severity, number>} counts
 * @returns {"danger" | "caution" | "ok"}
 */
function levelOf(counts) {
  if (counts.high > 0) return "danger";
  if (counts.medium > 0) return "caution";
  return "ok";
}
