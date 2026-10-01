// The page's markup without its text: tags (with their attributes) and comments, read as the HTML Standard tokenizes
// them. A trace a running app leaves in its markup (an XML namespace, a meta tag, a comment, a URL in an attribute)
// is looked for here, so the same words in a page's text (an article showing the code) are never taken for one.
// https://html.spec.whatwg.org/multipage/parsing.html#tokenization

// Elements whose content is not markup: raw text (scripts, styles …; noscript too, since the page is read with
// scripting on) and escapable raw text (title, textarea).
const TEXT_ONLY_ELEMENTS = new Set(["script", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "title", "textarea"]);
const TAG_START = /[A-Za-z/]/;
const LETTER = /[A-Za-z]/;
const TAG_NAME = /^\/?([A-Za-z][^\s/>]*)/;

/**
 * @param {string} html
 * @returns {string}  every tag and comment, one per line, in document order
 */
export function markupOnly(html) {
  const parts = [];
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf("<", at);
    if (open < 0) break;
    const end = markupEnd(html, open);
    if (end < 0) {
      at = open + 1;
      continue;
    }
    const token = html.slice(open, end);
    parts.push(token);
    at = skipTextContent(html, token, end);
  }
  return parts.join("\n");
}

/**
 * @param {string} html
 * @param {number} open  the index of a "<"
 * @returns {number}  the index just after the tag or comment that starts there, or -1 when "<" starts text
 */
function markupEnd(html, open) {
  if (html.startsWith("<!--", open)) {
    const close = html.indexOf("-->", open + 4);
    return close < 0 ? html.length : close + 3;
  }
  const next = html[open + 1] ?? "";
  if (next === "!" || next === "?") {
    const close = html.indexOf(">", open);
    return close < 0 ? html.length : close + 1;
  }
  return startsTag(html, open) ? tagEnd(html, open) : -1;
}

/**
 * "<" followed by a letter, or by "/" and a letter: anything else ("< 3", "<=") is text.
 * @param {string} html
 * @param {number} open
 * @returns {boolean}
 */
function startsTag(html, open) {
  const next = html[open + 1] ?? "";
  const nameStart = next === "/" ? (html[open + 2] ?? "") : next;
  return TAG_START.test(next) && LETTER.test(nameStart);
}

/**
 * The ">" that ends a tag, skipping any inside a quoted attribute value.
 * @param {string} html
 * @param {number} open
 * @returns {number}  the index just after the tag, or the end of the input for a tag cut off by truncation
 */
function tagEnd(html, open) {
  /** @type {string | null} */
  let quote = null;
  for (let i = open + 1; i < html.length; i++) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      if (/[=\s]/.test(html[i - 1] ?? "")) quote = char;
    } else if (char === ">") {
      return i + 1;
    }
  }
  return html.length;
}

/**
 * After the start tag of an element whose content is text (a script, a style, a title …), the index of its end tag,
 * so that content is never read as markup.
 * @param {string} html
 * @param {string} token
 * @param {number} end
 * @returns {number}
 */
function skipTextContent(html, token, end) {
  const name = TAG_NAME.exec(token.slice(1))?.[1]?.toLowerCase() ?? "";
  if (token.startsWith("</") || !TEXT_ONLY_ELEMENTS.has(name)) return end;
  const close = html.toLowerCase().indexOf(`</${name}`, end);
  return close < 0 ? html.length : close;
}
