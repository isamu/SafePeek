// Which login and identity services the page uses: from the hosts and URLs it contacts, and the webappanalyzer
// products listed for each service. Unlisted authentication products are left out: some, like Facebook Login, match
// any page that loads the vendor's general SDK.

import { finding } from "./finding.js";
import { hostMatches, pageHosts, pageUrls, urlMatches } from "./page-urls.js";

const EVIDENCE_PER_SERVICE = 2;

/**
 * @typedef {object} AuthService
 * @property {string} name
 * @property {string[]} sources  pages that document its traces
 * @property {string[]} [technologies]  webappanalyzer names
 * @property {string[]} [hosts]  domain patterns (see hostMatches)
 * @property {string[]} [urls]  "domain-pattern/path-prefix"
 * @property {string[]} [paths]  fragments of a URL path, on any host
 */

/**
 * @typedef {object} SeenService
 * @property {string} name
 * @property {string[]} evidence
 */

/**
 * @param {import("../types.js").Technology[]} technologies
 * @param {AuthService[]} services
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkAuth(technologies, services, page) {
  const direct = technologies.filter((t) => !t.impliedBy);
  const seen = services.map((s) => seenService(s, direct, page)).filter((s) => s.evidence.length > 0);
  if (seen.length === 0) return [];
  const evidence = seen.flatMap((s) => s.evidence.slice(0, EVIDENCE_PER_SERVICE).map((line) => `${s.name}: ${line}`));
  return [finding("auth_services", "info", "auth", { services: seen.map((s) => s.name).join(", ") }, evidence)];
}

/**
 * Evidence labels name the pattern that matched, and a technology only by the kind of its trace, never the URL,
 * which can carry tenant or user identifiers.
 * @param {AuthService} service
 * @param {import("../types.js").Technology[]} direct
 * @param {import("../types.js").PageData} page
 * @returns {SeenService}
 */
function seenService(service, direct, page) {
  const hosts = pageHosts(page);
  const urls = pageUrls(page);
  const techs = direct.filter((t) => (service.technologies ?? []).includes(t.name));
  const evidence = [
    ...techs.map((t) => `${t.name} (${(t.evidence[0] ?? "").split(" ")[0]})`),
    ...(service.hosts ?? []).filter((p) => hosts.some((h) => hostMatches(p, h))).map((p) => `host ${p}`),
    ...(service.urls ?? []).filter((p) => urls.some((u) => urlMatches(p, u))).map((p) => `url ${p}`),
    ...(service.paths ?? []).filter((p) => urls.some((u) => u.pathname.includes(p))).map((p) => `path ${p}`),
  ];
  return { name: service.name, evidence };
}

/**
 * Whether a host, or a URL on it, belongs to a listed sign-in service: by host, by URL prefix, or by path fragment.
 * With only the host known, a URL prefix is matched by its domain part and a path fragment cannot match.
 * @param {string} host
 * @param {URL | null} url
 * @param {AuthService[]} services
 * @returns {boolean}
 */
export function isSignInService(host, url, services) {
  const byUrl = (/** @type {string} */ pattern) => (url ? urlMatches(pattern, url) : hostMatches(pattern.slice(0, pattern.indexOf("/")), host));
  return services.some(
    (s) =>
      (s.hosts ?? []).some((p) => hostMatches(p, host)) ||
      (s.urls ?? []).some(byUrl) ||
      (url !== null && (s.paths ?? []).some((p) => url.pathname.includes(p))),
  );
}
