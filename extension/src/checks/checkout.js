// Who runs the shop's checkout: a hosted cart service, or shop software the site runs itself.

import { finding } from "./finding.js";

const FULL_CONFIDENCE = 100;

/**
 * @typedef {object} CheckoutPlatform
 * @property {string} name  webappanalyzer technology name
 * @property {"hosted" | "self"} kind
 * @property {string} source
 * @property {string} [singleTraceReason]  why one kind of trace is enough for this product; otherwise two are required
 */

/**
 * The kinds of trace behind a detection: "js", "script", "meta", "dom", "header", "cookie" …, from its evidence labels.
 * @param {import("../types.js").Technology} tech
 * @returns {number}
 */
function evidenceKinds(tech) {
  return new Set(tech.evidence.map((label) => label.split(" ")[0])).size;
}

/**
 * Two kinds of trace, or one for a product whose every full-confidence trace comes from the shop itself. A trace the
 * fingerprint marks as lower confidence (Magento's `frontend` cookie, PrestaShop's `priceDisplayMethod`) is generic.
 * @param {import("../types.js").Technology} tech
 * @param {CheckoutPlatform} platform
 * @returns {boolean}
 */
function isEnoughEvidence(tech, platform) {
  const kinds = evidenceKinds(tech);
  if (kinds >= 2) return true;
  return platform.singleTraceReason !== undefined && tech.confidence >= FULL_CONFIDENCE;
}

/**
 * Directly seen products from the curated checkout-platform list. Implied ones are left out: only what the page
 * itself shows says who runs its checkout.
 * @param {import("../types.js").Technology[]} technologies
 * @param {CheckoutPlatform[]} platforms
 * @returns {import("../types.js").Finding[]}
 */
export function checkCheckout(technologies, platforms) {
  const byName = new Map(platforms.map((p) => [p.name, p]));
  const seen = technologies.filter((t) => {
    const platform = byName.get(t.name);
    return platform !== undefined && !t.impliedBy && isEnoughEvidence(t, platform);
  });
  const of = (/** @type {"hosted" | "self"} */ kind) => seen.filter((t) => byName.get(t.name)?.kind === kind);
  return [...platformFinding("checkout_saas", "good", of("hosted")), ...platformFinding("checkout_self_hosted", "info", of("self"))];
}

/**
 * @param {string} id
 * @param {import("../types.js").Severity} severity
 * @param {import("../types.js").Technology[]} techs
 * @returns {import("../types.js").Finding[]}
 */
function platformFinding(id, severity, techs) {
  if (techs.length === 0) return [];
  const evidence = techs.flatMap((t) => t.evidence.slice(0, 3).map((line) => `${t.name}: ${line}`));
  return [finding(id, severity, "payment", { platforms: techs.map((t) => t.name).join(", ") }, evidence)];
}
