// The max-age a browser takes from a Strict-Transport-Security header, parsed as RFC 6797 section 6.1 and 8.1 say.

// A token of digits, or the same in quotes; anything else makes the header one the browser ignores.
const MAX_AGE_VALUE = /^(?:\d+|"\d+")$/;

/**
 * Only the first header counts (fetch() joins repeated ones with ", ", and a valid one has no comma), directive
 * names are case-insensitive, and a header repeating a directive or with a malformed max-age is ignored.
 * @param {string | undefined} header
 * @returns {number}  the max-age in seconds, 0 when the browser keeps no HSTS from this header
 */
export function hstsMaxAge(header) {
  const directives = (header ?? "")
    .split(",")[0]
    .split(";")
    .map(parseDirective)
    .filter((d) => d.name !== "");
  const names = directives.map((d) => d.name);
  if (new Set(names).size !== names.length) return 0;
  const maxAge = directives.find((d) => d.name === "max-age");
  return maxAge && MAX_AGE_VALUE.test(maxAge.value) ? Number(maxAge.value.replaceAll('"', "")) : 0;
}

/**
 * @param {string} part
 * @returns {{ name: string, value: string }}
 */
function parseDirective(part) {
  const [name, ...rest] = part.split("=");
  return { name: name.trim().toLowerCase(), value: rest.join("=").trim() };
}
