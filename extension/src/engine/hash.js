// Hex SHA-1 of a string, as the Retire.js hash extractor expects.

/**
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha1(text) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
