// Findings for backend frameworks inferred from the page.

import { finding } from "./finding.js";

/** Confidence at or above which an inference counts as strong enough for the higher severity. */
const STRONG = 60;

/**
 * @param {import("../types.js").Backend[]} backends
 * @param {Date} today
 * @returns {import("../types.js").Finding[]}
 */
export function checkBackends(backends, today) {
  const findings = [];
  for (const b of backends) {
    const f = backendFinding(b, today);
    if (f) findings.push({ ...f, signals: b.signals });
  }
  return findings;
}

/**
 * @param {import("../types.js").Backend} b
 * @param {Date} today
 * @returns {import("../types.js").Finding | null}
 */
function backendFinding(b, today) {
  const strong = b.confidence >= STRONG;
  const params = { name: b.name, language: b.language, confidence: b.confidence, date: b.eol };
  const evidence = b.source ? [b.source] : [];
  if (b.status === "eol" && b.eol && Date.parse(b.eol) <= today.getTime()) {
    return finding("backend_eol", strong ? "high" : "medium", "backend", params, evidence);
  }
  if (b.status === "legacy") return finding("backend_legacy", strong ? "medium" : "low", "backend", params, evidence);
  if (b.status === "managed" && strong) return finding("backend_managed", "info", "backend", params, evidence);
  if (b.status === "hosting" && strong) return finding("backend_hosting", "info", "backend", params, evidence);
  return null;
}
