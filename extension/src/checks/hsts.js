// The max-age a browser takes from a Strict-Transport-Security header, parsed as RFC 6797 section 6.1 and 8.1 say.

const DIGITS = /^\d+$/;
const QUOTE = '"';
const ESCAPE = "\\";

/**
 * Only the first header counts (fetch() joins repeated ones with ", "), directive names are case-insensitive, a quoted
 * value is unescaped, and a header repeating a directive or with a malformed max-age is ignored.
 * @param {string | undefined} header
 * @returns {number}  the max-age in seconds, 0 when the browser keeps no HSTS from this header
 */
export function hstsMaxAge(header) {
  const [first] = splitOutsideQuotes(header ?? "", ",");
  const directives = splitOutsideQuotes(first, ";")
    .map(parseDirective)
    .filter((d) => d.name !== "");
  const names = directives.map((d) => d.name);
  if (new Set(names).size !== names.length) return 0;
  const maxAge = directives.find((d) => d.name === "max-age")?.value;
  return maxAge !== undefined && DIGITS.test(maxAge) ? Number(maxAge) : 0;
}

/**
 * @param {string} part
 * @returns {{ name: string, value: string | undefined }}  value is undefined when a quoted string is left open
 */
function parseDirective(part) {
  const at = part.indexOf("=");
  const name = (at < 0 ? part : part.slice(0, at)).trim().toLowerCase();
  const raw = at < 0 ? "" : part.slice(at + 1).trim();
  return { name, value: raw.startsWith(QUOTE) ? unquote(raw) : raw };
}

/**
 * @param {string} quoted  starts with a quote
 * @returns {string | undefined}  the unescaped content, or undefined when the quote is not closed at the end
 */
function unquote(quoted) {
  const chars = [];
  for (let i = 1; i < quoted.length; i++) {
    if (quoted[i] === ESCAPE) chars.push(quoted[++i] ?? "");
    else if (quoted[i] === QUOTE) return i === quoted.length - 1 ? chars.join("") : undefined;
    else chars.push(quoted[i]);
  }
  return undefined;
}

/**
 * @param {string} text
 * @param {string} separator
 * @returns {string[]}  the parts between separators that are not inside a quoted string
 */
function splitOutsideQuotes(text, separator) {
  /** @type {string[][]} */
  const parts = [[]];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === ESCAPE) parts[parts.length - 1].push(char, text[++i] ?? "");
    else if (char === separator && !quoted) parts.push([]);
    else {
      if (char === QUOTE) quoted = !quoted;
      parts[parts.length - 1].push(char);
    }
  }
  return parts.map((part) => part.join(""));
}
