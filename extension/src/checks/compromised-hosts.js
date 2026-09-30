// Scripts loaded from a CDN domain that is known to have served malicious code to the sites using it.

import { finding } from "./finding.js";
import { hostMatches } from "./page-urls.js";

/**
 * @typedef {object} CompromisedHost
 * @property {string} domain  matches the domain and its subdomains
 * @property {string} incident  year-month it became known
 * @property {string[]} sources  reports that name the domain
 */

/**
 * @param {import("../types.js").PageData} page
 * @param {CompromisedHost[]} compromised
 * @returns {import("../types.js").Finding[]}
 */
export function checkCompromisedHosts(page, compromised) {
  const fromDom = page.scripts.flatMap((s) => {
    try {
      return s.src ? [new URL(s.src).hostname] : [];
    } catch {
      return [];
    }
  });
  // A script a tag manager inserted and then removed is gone from the DOM but still in the loading record.
  const scriptHosts = [...fromDom, ...(page.scriptHosts ?? [])];
  const hit = compromised.filter((c) => scriptHosts.some((h) => hostMatches(c.domain, h)));
  if (hit.length === 0) return [];
  const evidence = hit.map((c) => `${c.domain} (${c.incident}): ${c.sources[0]}`);
  return [finding("script_compromised_host", "high", "page", { domains: hit.map((c) => c.domain).join(", ") }, evidence)];
}
