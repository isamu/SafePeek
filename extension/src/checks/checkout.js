// Who runs the shop's checkout: a hosted cart service, or shop software on the site's own server.

import { finding } from "./finding.js";

const ECOMMERCE = 6;

/** A claim about who runs the checkout needs more than one trace: a lone global or a link out also appears on
 * pages that merely advertise or link to a shop (Amazon ads define window.amzn; BASE's own site links to shops). */
const MIN_EVIDENCE = 2;

/**
 * Directly seen ecommerce products that webappanalyzer marks as hosted (saas) or self-run (oss), each backed by at
 * least two different traces. Implied ones are left out: only what the page itself shows says who runs its checkout.
 * @param {import("../types.js").Technology[]} technologies
 * @param {Record<string, { saas?: boolean, oss?: boolean }>} fingerprints
 * @returns {import("../types.js").Finding[]}
 */
export function checkCheckout(technologies, fingerprints) {
  const shops = technologies.filter((t) => !t.impliedBy && t.categories.includes(ECOMMERCE) && new Set(t.evidence).size >= MIN_EVIDENCE);
  const hosted = shops.filter((t) => fingerprints[t.name]?.saas === true).map((t) => t.name);
  const selfRun = shops.filter((t) => fingerprints[t.name]?.oss === true).map((t) => t.name);
  const findings = [];
  if (hosted.length > 0) findings.push(finding("checkout_saas", "good", "payment", { platforms: hosted.join(", ") }));
  if (selfRun.length > 0) findings.push(finding("checkout_self_hosted", "info", "payment", { platforms: selfRun.join(", ") }));
  return findings;
}
