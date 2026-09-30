// Who runs the shop's checkout: a hosted cart service, or shop software the site runs itself.

import { finding } from "./finding.js";
import { cartTraceLabels } from "./cart-traces.js";

// Traces an embedded widget, image or copied markup can leave all count as one family; runtime traces each count alone.
const ASSET_KINDS = new Set(["script", "dom", "html", "url", "page", "host"]);
const SHOWN_EVIDENCE = 3;

/**
 * @typedef {object} CheckoutPlatform
 * @property {string} name  webappanalyzer technology name
 * @property {"hosted" | "self"} kind
 * @property {string} source
 * @property {import("./cart-traces.js").CartTraces} [traces]  SafePeek's own traces, on top of the fingerprint
 * @property {string[]} [singleTraces]  evidence labels ("cookie osCsid") that are enough on their own; otherwise two
 *   families of trace are required
 * @property {string} [singleTraceReason]  why those traces are enough
 */

/**
 * @typedef {object} SeenPlatform
 * @property {string} name
 * @property {CheckoutPlatform} platform
 * @property {string[]} evidence
 */

/**
 * The families of trace behind the evidence labels: "asset" for anything an embed could leave, else "js", "cookie",
 * "header", "meta".
 * @param {string[]} evidence
 * @returns {number}
 */
function evidenceFamilies(evidence) {
  return new Set(evidence.map(familyOf)).size;
}

/**
 * @param {string} label
 * @returns {string}
 */
function familyOf(label) {
  const kind = label.split(" ")[0];
  return ASSET_KINDS.has(kind) ? "asset" : kind;
}

/**
 * Up to SHOWN_EVIDENCE labels, one from each family first, so what made the verdict pass is always shown.
 * @param {string[]} evidence
 * @returns {string[]}
 */
function shownEvidence(evidence) {
  const firstOfFamily = evidence.filter((label, i) => evidence.findIndex((other) => familyOf(other) === familyOf(label)) === i);
  return [...new Set([...firstOfFamily, ...evidence])].slice(0, SHOWN_EVIDENCE);
}

/**
 * Two families of trace, or one of the product's own singleTraces. Confidence is not used: it is summed over
 * patterns, so several weak traces of one kind add up to full confidence.
 * @param {SeenPlatform} seen
 * @returns {boolean}
 */
function isEnoughEvidence({ platform, evidence }) {
  if (evidenceFamilies(evidence) >= 2) return true;
  const allowed = new Set((platform.singleTraces ?? []).map((label) => label.toLowerCase()));
  return evidence.some((label) => allowed.has(label.toLowerCase()));
}

/**
 * The fingerprint's direct evidence (implied hits say nothing about this page) plus SafePeek's own traces.
 * @param {CheckoutPlatform} platform
 * @param {import("../types.js").Technology[]} technologies
 * @param {import("../types.js").PageData} page
 * @returns {SeenPlatform}
 */
function seenPlatform(platform, technologies, page) {
  const tech = technologies.find((t) => t.name === platform.name && !t.impliedBy);
  return { name: platform.name, platform, evidence: [...(tech?.evidence ?? []), ...cartTraceLabels(platform.traces, page)] };
}

/**
 * Products from the curated checkout-platform list that the page itself shows.
 * @param {import("../types.js").Technology[]} technologies
 * @param {CheckoutPlatform[]} platforms
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkCheckout(technologies, platforms, page) {
  const seen = platforms.map((p) => seenPlatform(p, technologies, page)).filter(isEnoughEvidence);
  const of = (/** @type {"hosted" | "self"} */ kind) => seen.filter((s) => s.platform.kind === kind);
  return [...platformFinding("checkout_saas", "info", of("hosted")), ...platformFinding("checkout_self_hosted", "info", of("self"))];
}

/**
 * @param {string} id
 * @param {import("../types.js").Severity} severity
 * @param {SeenPlatform[]} platforms
 * @returns {import("../types.js").Finding[]}
 */
function platformFinding(id, severity, platforms) {
  if (platforms.length === 0) return [];
  const evidence = platforms.flatMap((p) => shownEvidence(p.evidence).map((line) => `${p.name}: ${line}`));
  return [finding(id, severity, "payment", { platforms: platforms.map((p) => p.name).join(", ") }, evidence)];
}
