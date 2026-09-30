// The max-age a browser takes from a Strict-Transport-Security header, parsed as RFC 6797 section 6.1 and 8.1 say.

const DIGITS = /^\d+$/;
// RFC 9110 token characters: a directive name, and an unquoted value.
const TOKEN = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;
const QUOTE = '"';
const ESCAPE = "\\";

/**
 * Only the first header counts (fetch() joins repeated ones with ", "), and a browser ignores the whole header unless
 * every directive is well-formed: a token name, a token or quoted value, no directive twice, includeSubDomains without
 * a value, and a max-age of digits.
 * @param {string | undefined} header
 * @returns {number}  the max-age in seconds, 0 when the browser keeps no HSTS from this header
 */
export function hstsMaxAge(header) {
  const [first] = splitOutsideQuotes(header ?? "", ",");
  const directives = splitOutsideQuotes(first, ";")
    .filter((part) => part.trim() !== "")
    .map(parseDirective);
  const names = directives.map((d) => d.name);
  if (new Set(names).size !== names.length || !directives.every(isWellFormed)) return 0;
  const maxAge = directives.find((d) => d.name === "max-age")?.value;
  return maxAge !== undefined && DIGITS.test(maxAge) ? Number(maxAge) : 0;
}

/**
 * @param {Directive} directive
 * @returns {boolean}
 */
function isWellFormed({ name, value, quoted, bare }) {
  if (!TOKEN.test(name) || value === undefined) return false;
  if (name === "includesubdomains") return bare;
  return bare || quoted || TOKEN.test(value);
}

/**
 * @typedef {object} Directive
 * @property {string} name  lower-cased
 * @property {string | undefined} value  undefined when a quoted string is left open
 * @property {boolean} quoted
 * @property {boolean} bare  no "=" at all
 */

/**
 * @param {string} part
 * @returns {Directive}
 */
function parseDirective(part) {
  const at = part.indexOf("=");
  const name = (at < 0 ? part : part.slice(0, at)).trim().toLowerCase();
  const raw = at < 0 ? "" : part.slice(at + 1).trim();
  const quoted = raw.startsWith(QUOTE);
  return { name, value: quoted ? unquote(raw) : raw, quoted, bare: at < 0 };
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
