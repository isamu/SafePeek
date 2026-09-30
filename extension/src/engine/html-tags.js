// Opening tags of one element, as written in the page's HTML, without parsing the whole document.

const HREF = /\bhref\s*=\s*["']?([^"'\s>]+)/i;

/**
 * @param {string} html
 * @param {string} name  element name, lower case (link, a …)
 * @param {number} max  at most this many
 * @returns {string[]}  the opening tags, as written
 */
export function openingTags(html, name, max) {
  const lower = html.toLowerCase();
  const open = `<${name}`;
  const tags = [];
  for (let at = lower.indexOf(open); at >= 0 && tags.length < max; at = lower.indexOf(open, at + 1)) {
    const next = lower[at + open.length] ?? "";
    if (/[\s>/]/.test(next)) tags.push(html.slice(at, html.indexOf(">", at) + 1));
  }
  return tags;
}

/**
 * @param {string} tag
 * @returns {string}  the href value, or ""
 */
export function hrefOf(tag) {
  return HREF.exec(tag)?.[1] ?? "";
}
