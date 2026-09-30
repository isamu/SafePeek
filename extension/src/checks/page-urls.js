// The hosts and URLs a page loaded or called, and the domain patterns data files match them with.

/**
 * Hosts the page loaded anything from, including resources the timing record may already have dropped.
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
  return raw.flatMap((text) => {
    try {
      return [new URL(text)];
    } catch {
      return [];
    }
  });
}

/**
 * A domain pattern matches the domain itself and its subdomains; a leading "*." label or a "*" label in the middle
 * stands for exactly one label ("cognito-idp.*.amazonaws.com").
 * @param {string} pattern
 * @param {string} host
 * @returns {boolean}
 */
export function hostMatches(pattern, host) {
  const want = pattern.split(".");
  const have = host.toLowerCase().split(".");
  const tail = have.slice(-want.length);
  return want.every((label, i) => label === "*" || label === tail[i]);
}
