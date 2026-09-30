// Where a password form sends the password. To another organisation's domain is a sign of phishing or of a
// misconfigured form, unless that domain is a known sign-in service.

import { finding } from "./finding.js";
import { isSignInService } from "./auth.js";
import { isRelatedHost } from "../engine/related-systems.js";

/**
 * @param {import("../types.js").PageData} page
 * @param {import("./auth.js").AuthService[]} auth
 * @param {import("../engine/public-suffix.js").SuffixIndex} suffixes
 * @returns {import("../types.js").Finding[]}
 */
export function checkCredentialTarget(page, auth, suffixes) {
  const pageHost = new URL(page.url).hostname;
  const targets = page.forms
    .filter((f) => f.hasPassword)
    .flatMap((f) => {
      try {
        return [new URL(f.action)];
      } catch {
        return [];
      }
    })
    .filter((url) => url.hostname !== pageHost && !isRelatedHost(pageHost, url.hostname, suffixes) && !isSignInService(url.hostname, url, auth));
  const hosts = [...new Set(targets.map((u) => u.hostname))];
  if (hosts.length === 0) return [];
  return [finding("password_other_site", "medium", "page", { hosts: hosts.join(", ") }, hosts)];
}
