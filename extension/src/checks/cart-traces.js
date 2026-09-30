// SafePeek's own traces of a cart platform: hosts the page loaded from, globals it defines, cookies it holds.

/**
 * @typedef {object} CartTraces
 * @property {string[]} [hosts]  domains; a host matches itself and its subdomains
 * @property {string[]} [globals]  JavaScript property paths
 * @property {string[]} [cookies]  names; a trailing "*" matches a prefix
 */

/**
 * Evidence labels for the traces the page shows. A label names the trace pattern, not the value seen, so a cookie
 * name carrying a shop id is not repeated.
 * @param {CartTraces | undefined} traces
 * @param {import("../types.js").PageData} page
 * @returns {string[]}
 */
export function cartTraceLabels(traces, page) {
  if (!traces) return [];
  const hosts = pageHosts(page);
  const cookieNames = Object.keys(page.cookies);
  return [
    ...(traces.hosts ?? []).filter((d) => hosts.some((h) => h === d || h.endsWith(`.${d}`))).map((d) => `host ${d}`),
    ...(traces.globals ?? []).filter((path) => path in page.globals).map((path) => `js ${path}`),
    ...(traces.cookies ?? []).filter((name) => cookieNames.some((c) => cookieMatches(name, c))).map((name) => `cookie ${name}`),
  ];
}

/**
 * @param {string} pattern
 * @param {string} name
 * @returns {boolean}
 */
function cookieMatches(pattern, name) {
  return pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

/**
 * Hosts the page loaded anything from, including resources the timing record may already have dropped.
 * @param {import("../types.js").PageData} page
 * @returns {string[]}
 */
function pageHosts(page) {
  const urls = [...page.scripts.map((s) => s.src ?? ""), ...page.stylesheets, ...page.images, ...page.iframes];
  return [...(page.contactedHosts ?? []), ...urls.map(hostOf)].filter((h) => h !== "");
}

/**
 * @param {string} url
 * @returns {string}
 */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Every JavaScript property path the checkout-platform list reads from the page.
 * @param {{ traces?: CartTraces }[]} platforms
 * @returns {string[]}
 */
export function checkoutGlobalPaths(platforms) {
  return platforms.flatMap((p) => p.traces?.globals ?? []);
}
