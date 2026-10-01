// Loads the bundled databases through a caller-supplied reader, so the same code works in the
// extension (fetch from the package) and in Node (read from disk).

import { parseRetireRepository } from "./engine/retire.js";
import { indexPublicSuffixes } from "./engine/public-suffix.js";

/**
 * @typedef {(name: string) => Promise<string>} ReadText  returns the text of data/<name>
 */

// Every JSON data file, by the name the loader refers to it by. Order does not matter.
const JSON_FILES = {
  auth: "auth-services.json",
  backends: "backend-signatures.json",
  botChecks: "bot-checks.json",
  categories: "categories.json",
  checkout: "checkout-platforms.json",
  compromised: "compromised-script-hosts.json",
  consent: "consent-banners.json",
  kits: "fake-shop-kits.json",
  destinations: "data-destinations.json",
  eol: "eol.json",
  payment: "payment-providers.json",
  publicSuffixes: "public-suffixes.json",
  secrets: "secret-formats.json",
  sources: "sources.json",
  technologies: "technologies.json",
  wordpress: "wordpress.json",
};

/**
 * @param {ReadText} readText
 * @returns {Promise<import("./analyze.js").Databases & { sources: Record<string, any> }>}
 */
export async function loadDatabases(readText) {
  const [files, retireText] = await Promise.all([readAll(readText), readText("retire.json")]);
  return {
    technologies: files.technologies,
    categories: files.categories,
    retire: parseRetireRepository(retireText),
    eol: files.eol,
    providers: files.payment.providers,
    backends: files.backends.backends,
    wordpress: files.wordpress,
    checkout: files.checkout.platforms,
    auth: files.auth.services,
    destinations: { purposes: files.destinations.purposes, services: files.destinations.services },
    compromised: files.compromised.hosts,
    kits: files.kits.kits,
    secrets: files.secrets.formats,
    suffixes: indexPublicSuffixes(files.publicSuffixes),
    botChecks: files.botChecks.services,
    consent: { banners: files.consent.banners, identifiers: files.consent.identifiers },
    sources: files.sources,
  };
}

/**
 * @param {ReadText} readText
 * @returns {Promise<Record<keyof typeof JSON_FILES, any>>}  each JSON file, parsed, under its name
 */
async function readAll(readText) {
  const entries = await Promise.all(Object.entries(JSON_FILES).map(async ([key, file]) => [key, JSON.parse(await readText(file))]));
  return Object.fromEntries(entries);
}
