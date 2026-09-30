// Whether a pattern can only ever match text written in the pattern itself.

/**
 * Literals, escaped characters, anchors, \b and (?:a|b) alternations are fixed; a class, ".", a quantifier or a
 * class escape (\w, \d …) can match text the page supplies, which may hold a token, a path or an address (SPEC S9).
 * @param {string} pattern
 * @returns {boolean}
 */
export function isFixedText(pattern) {
  return !/\[|(?<!\\)\.|[*+{?]|\\[wWsSdD]/.test(pattern.replaceAll("(?:", "("));
}
