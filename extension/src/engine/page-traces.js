// Traces of the server side that can be read out of a page: the URL paths it links to and the
// names of the parameters it sends.

const MAX = 3000;
const ATTRIBUTE_URL = /\b(?:href|action|src)\s*=\s*["']([^"'#\s]+)["']/gi;
const FIELD_NAME = /<(?:input|select|textarea|button)\b[^>]*?\bname\s*=\s*["']([^"']+)["']/gi;

/**
 * @param {string} raw
 * @param {string} base
 * @returns {URL | null}  the URL when it is on the page's own origin
 */
function sameOrigin(raw, base) {
  try {
    const url = new URL(raw.replace(/&amp;/g, "&"), base);
    return url.origin === new URL(base).origin ? url : null;
  } catch {
    return null;
  }
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {URL[]}
 */
function sameOriginUrls(page) {
  const raws = [page.url, ...page.forms.map((f) => f.action), ...[...page.html.matchAll(ATTRIBUTE_URL)].map((m) => m[1])];
  const urls = [];
  for (const raw of raws.slice(0, MAX)) {
    const url = sameOrigin(raw, page.url);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Same-origin URL paths the page links to, submits to or loads, plus its own path. The session id
 * Java servers rewrite into URLs (";jsessionid=...") is stripped so the extension stays visible.
 * @param {import("../types.js").PageData} page
 * @returns {string[]}
 */
export function extractPaths(page) {
  return [...new Set(sameOriginUrls(page).map((url) => url.pathname.replace(/;jsessionid=[^/?]*/i, "")))];
}

/**
 * Form field names in the HTML (hidden ones included) and query parameter names of same-origin URLs.
 * @param {import("../types.js").PageData} page
 * @returns {string[]}
 */
export function extractParams(page) {
  const names = new Set([...page.html.matchAll(FIELD_NAME)].slice(0, MAX).map((m) => m[1].replace(/&amp;/g, "&")));
  for (const url of sameOriginUrls(page)) {
    for (const key of url.searchParams.keys()) names.add(key);
  }
  return [...names];
}
