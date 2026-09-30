// Where a password form sends the password. To another organisation's domain is a sign of phishing or of a
// misconfigured form, unless that domain is a known sign-in service.

import { finding } from "./finding.js";
import { isSignInService } from "./auth.js";
import { registrable } from "../engine/public-suffix.js";

/**
 * @param {import("../types.js").PageData} page
 * @param {import("./auth.js").AuthService[]} auth
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {import("../types.js").Finding[]}
 */
export function checkCredentialTarget(page, auth, suffixes) {
  const pageHost = new URL(page.url).hostname;
  // A path fragment fits any host, so a form target is let off only by a sign-in service's host or URL prefix.
  const byHostOrUrl = auth.map(({ hosts, urls, name, sources }) => ({ hosts, urls, name, sources }));
  const targets = page.forms
    .filter((f) => f.hasPassword)
    .flatMap((f) => {
      try {
        return [new URL(f.action)];
      } catch {
        return [];
      }
    })
    .filter((url) => !sameSite(pageHost, url.hostname, suffixes) && !isSignInService(url.hostname, url, byHostOrUrl));
  const hosts = [...new Set(targets.map((u) => u.hostname))];
  if (hosts.length === 0) return [];
  return [finding("password_other_site", "medium", "page", { hosts: hosts.join(", ") }, hosts)];
}

/**
 * The same registrable domain. Stricter than the related-systems rule on purpose: the same name under another
 * suffix (mybank.co.jp and mybank.net) is exactly how a look-alike phishing domain is made.
 * @param {string} pageHost
 * @param {string} host
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {boolean}
 */
function sameSite(pageHost, host, suffixes) {
  const a = registrable(pageHost, suffixes)?.domain ?? pageHost;
  const b = registrable(host, suffixes)?.domain ?? host;
  return a === b;
}
