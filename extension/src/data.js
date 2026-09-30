// Loads the bundled databases through a caller-supplied reader, so the same code works in the
// extension (fetch from the package) and in Node (read from disk).

import { parseRetireRepository } from "./engine/retire.js";
import { indexPublicSuffixes } from "./engine/public-suffix.js";

/**
 * @typedef {(name: string) => Promise<string>} ReadText  returns the text of data/<name>
 */

/**
 * @param {ReadText} readText
 * @returns {Promise<import("./analyze.js").Databases & { sources: Record<string, any> }>}
 */
export async function loadDatabases(readText) {
  const json = async (/** @type {string} */ name) => JSON.parse(await readText(name));
  const [technologies, categories, retireText, eol, payment, backends, wordpress, checkout, auth, publicSuffixes, sources] = await Promise.all([
    json("technologies.json"),
    json("categories.json"),
    readText("retire.json"),
    json("eol.json"),
    json("payment-providers.json"),
    json("backend-signatures.json"),
    json("wordpress.json"),
    json("checkout-platforms.json"),
    json("auth-services.json"),
    json("public-suffixes.json"),
    json("sources.json"),
  ]);
  return {
    technologies,
    categories,
    retire: parseRetireRepository(retireText),
    eol,
    providers: payment.providers,
    backends: backends.backends,
    wordpress,
    checkout: checkout.platforms,
    auth: auth.services,
    suffixes: indexPublicSuffixes(publicSuffixes),
    sources,
  };
}
