// The hosts and URLs a page loaded or called, and the domain patterns data files match them with.

/**
 * Hosts the page loaded resources from: the timing record, plus script, style, image and frame URLs it may already
 * have dropped.
 * @param {import("../types.js").PageData} page
 * @returns {string[]}
 */
export function resourceHosts(page) {
  const urls = [...page.scripts.map((s) => s.src ?? ""), ...page.stylesheets, ...page.images, ...page.iframes];
  return [...(page.contactedHosts ?? []), ...parseAll(urls).map((url) => url.hostname)];
}

/**
 * Hosts the page's own API calls went to.
 * @param {import("../types.js").PageData} page
 * @returns {string[]}
 */
export function requestHosts(page) {
  return parseAll(page.requests ?? []).map((url) => url.hostname);
}

/**
 * Hosts the page loaded anything from or called, including its API calls and form targets.
 * @param {import("../types.js").PageData} page
 * @returns {string[]}
 */
export function pageHosts(page) {
  return [...(page.contactedHosts ?? []), ...pageUrls(page).map((url) => url.hostname)];
}

/**
 * Every URL the page loaded or called: its own API calls (already masked), scripts, styles, images, frames, form
 * targets.
 * @param {import("../types.js").PageData} page
 * @returns {URL[]}
 */
export function pageUrls(page) {
  const raw = [
    ...(page.requests ?? []),
    ...page.scripts.map((s) => s.src ?? ""),
    ...page.stylesheets,
    ...page.images,
    ...page.iframes,
    ...page.forms.map((f) => f.action),
  ];
  return parseAll(raw);
}

/**
 * @param {unknown[]} raw
 * @returns {URL[]}
 */
function parseAll(raw) {
  return raw.flatMap((text) => {
    try {
      return typeof text === "string" ? [new URL(text)] : [];
    } catch {
      return [];
    }
  });
}

/**
 * A domain pattern without "*" matches the domain and its subdomains. A pattern with "*" matches hosts with exactly
 * as many labels, each "*" standing for one ("cognito-idp.*.amazonaws.com").
 * @param {string} pattern
 * @param {string} host
 * @returns {boolean}
 */
export function hostMatches(pattern, host) {
  const want = pattern.split(".");
  const have = host.toLowerCase().replace(/\.$/, "").split(".");
  if (want.includes("*") && have.length !== want.length) return false;
  const tail = have.slice(-want.length);
  return want.every((label, i) => label === "*" || label === tail[i]);
}

/**
 * @param {string} pattern  "domain-pattern/path-prefix", the domain pattern as in hostMatches
 * @param {URL} url
 * @returns {boolean}
 */
export function urlMatches(pattern, url) {
  const slash = pattern.indexOf("/");
  return hostMatches(pattern.slice(0, slash), url.hostname) && url.pathname.startsWith(pattern.slice(slash));
}
