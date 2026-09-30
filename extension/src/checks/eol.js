// End-of-life software and known-vulnerable libraries.

import { finding } from "./finding.js";
import { compareVersions } from "../engine/version.js";

const SOON_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} Cycle
 * @property {string} below
 * @property {string} eol
 * @property {string} label
 */

/**
 * @typedef {object} Product
 * @property {string} kind  server | cms | frontend
 * @property {string} source
 * @property {Cycle[]} cycles
 */

/**
 * @param {string} version
 * @param {Cycle[]} cycles
 * @returns {Cycle | undefined}
 */
export function cycleFor(version, cycles) {
  return [...cycles].sort((a, b) => compareVersions(a.below, b.below)).find((c) => compareVersions(version, c.below) < 0);
}

/**
 * @param {import("../types.js").Technology[]} technologies
 * @param {{ products: Record<string, Product> }} eolDb
 * @param {Date} today
 * @returns {import("../types.js").Finding[]}
 */
export function checkEol(technologies, eolDb, today) {
  const findings = [];
  for (const tech of technologies) {
    const product = eolDb.products[tech.name];
    if (!product || !tech.version) continue;
    const cycle = cycleFor(tech.version, product.cycles);
    if (!cycle) continue;
    const daysLeft = Math.floor((Date.parse(cycle.eol) - today.getTime()) / DAY_MS);
    const params = { name: tech.name, version: tech.version, label: cycle.label, date: cycle.eol };
    const evidence = [...tech.evidence, product.source];
    if (daysLeft < 0) {
      findings.push(finding("eol", product.kind === "frontend" ? "medium" : "high", "eol", params, evidence));
    } else if (daysLeft <= SOON_DAYS) {
      findings.push(finding("eol_soon", "low", "eol", { ...params, days: daysLeft }, evidence));
    }
  }
  return findings;
}

const SEVERITY_RANK = { critical: 3, high: 3, medium: 2, low: 1 };

/**
 * @param {import("../types.js").Library[]} libraries
 * @returns {import("../types.js").Finding[]}
 */
export function checkLibraries(libraries) {
  return libraries
    .filter((lib) => lib.vulnerabilities.length > 0)
    .map((lib) => {
      const rank = Math.max(...lib.vulnerabilities.map((v) => SEVERITY_RANK[/** @type {keyof typeof SEVERITY_RANK} */ (v.severity)] ?? 2));
      const severity = severityForRank(rank);
      const cves = [...new Set(lib.vulnerabilities.flatMap((v) => v.cves))];
      const params = { component: lib.component, version: lib.version, count: lib.vulnerabilities.length, cves: cves.slice(0, 5).join(", ") };
      return finding("vulnerable_library", severity, "libraries", params, [...lib.evidence, ...cves.slice(0, 10)]);
    });
}

/**
 * @param {number} rank
 * @returns {import("../types.js").Severity}
 */
function severityForRank(rank) {
  if (rank >= 3) return "high";
  if (rank === 2) return "medium";
  return "low";
}
