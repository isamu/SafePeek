// Server-side secrets that ended up in what the page sends to every visitor.

import { finding } from "./finding.js";

/**
 * @typedef {object} SecretFormat
 * @property {string} kind  for maintainers only; never shown (SPEC S9)
 * @property {string} pattern  regular expression whose first group is the random part
 * @property {string[]} sources  documentation of the format
 */

// A placeholder such as sk_live_xxxxxxxx… repeats a few characters; a real random part does not.
const MIN_DISTINCT_CHARACTERS = 12;

/**
 * Reports only that a secret was found: its kind, value and place would mainly help an attacker (SPEC S9).
 * @param {import("../types.js").PageData} page
 * @param {SecretFormat[]} formats
 * @returns {import("../types.js").Finding[]}
 */
export function checkExposedSecrets(page, formats) {
  const texts = [page.html, ...page.scripts.map((s) => s.content)];
  const found = formats.some((format) => texts.some((text) => containsSecret(text, format.pattern)));
  return found ? [finding("secret_in_page", "medium", "page")] : [];
}

/**
 * @param {string} text
 * @param {string} pattern
 * @returns {boolean}
 */
function containsSecret(text, pattern) {
  return [...text.matchAll(new RegExp(pattern, "g"))].some((match) => new Set(match[1]).size >= MIN_DISTINCT_CHARACTERS);
}
