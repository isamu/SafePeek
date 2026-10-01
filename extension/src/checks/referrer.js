// A page where a card number or a password is typed, whose referrer policy hands its full URL (path and query, which
// can hold an order or session number) to every other site it loads from.

import { finding } from "./finding.js";
import { asksForCardNumber, asksForPassword } from "./typed-secrets.js";
import { isRelatedHost } from "../engine/related-systems.js";
import { hostOf } from "./page.js";

// Policies that send the full URL to other sites. A page without a policy gets the browsers' default,
// strict-origin-when-cross-origin, which sends only the origin.
const FULL_URL_POLICIES = new Set(["unsafe-url", "no-referrer-when-downgrade"]);
const POLICIES = new Set([
  "no-referrer",
  "no-referrer-when-downgrade",
  "same-origin",
  "origin",
  "strict-origin",
  "origin-when-cross-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
]);
// The HTML Standard's legacy <meta name="referrer"> values (https://html.spec.whatwg.org/multipage/semantics.html).
const LEGACY_META = new Map([
  ["never", "no-referrer"],
  ["default", "strict-origin-when-cross-origin"],
  ["always", "unsafe-url"],
  ["origin-when-crossorigin", "origin-when-cross-origin"],
]);

/**
 * @param {import("../types.js").PageData} page
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {import("../types.js").Finding[]}
 */
export function checkReferrerLeak(page, suffixes) {
  if (!asksForCardNumber(page) && !asksForPassword(page)) return [];
  const { policy, from } = effectivePolicy(page);
  if (!FULL_URL_POLICIES.has(policy)) return [];
  const pageHost = hostOf(page.url);
  const others = page.contactedHosts.filter((host) => host !== pageHost && !isRelatedHost(pageHost, host, suffixes));
  if (others.length === 0) return [];
  return [finding("referrer_leaks_url", "low", "headers", { policy }, [`${from}: ${policy}`])];
}

/**
 * The policy the browser applies: the last valid <meta name="referrer"> overrides the header (its value lower-cased,
 * not trimmed, as the HTML Standard reads it); in the header, the last policy the browser knows wins.
 * @param {import("../types.js").PageData} page
 * @returns {{ policy: string, from: string }}
 */
function effectivePolicy(page) {
  const metas = (page.meta["referrer"] ?? []).map((v) => v.toLowerCase()).map((v) => LEGACY_META.get(v) ?? v);
  const meta = metas.filter((v) => POLICIES.has(v)).pop();
  if (meta) return { policy: meta, from: '<meta name="referrer">' };
  const header = (page.headers?.["referrer-policy"] ?? "").split(",").map((v) => v.trim().toLowerCase());
  return { policy: header.filter((v) => POLICIES.has(v)).pop() ?? "", from: "Referrer-Policy" };
}
