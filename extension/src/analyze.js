// Runs every engine and check over collected page data and produces the report the popup shows.

import { checkCookies, checkHeaders, checkTransport } from "./checks/headers.js";
import { checkEol, checkLibraries } from "./checks/eol.js";
import { checkPage } from "./checks/page.js";
import { checkPayment } from "./checks/payment.js";
import { checkCheckout } from "./checks/checkout.js";
import { checkSensitivePage } from "./checks/sensitive-page.js";
import { checkCredentialTarget } from "./checks/credential-target.js";
import { checkCompromisedHosts } from "./checks/compromised-hosts.js";
import { checkExposedSecrets } from "./checks/secrets.js";
import { checkLegalNotice } from "./checks/legal-notice.js";
import { checkAuth } from "./checks/auth.js";
import { checkDestinations } from "./checks/destinations.js";
import { checkBackends } from "./checks/backend.js";
import { inferBackends } from "./engine/backend.js";
import { inferRelatedSystems } from "./engine/related-systems.js";
import { checkRelatedSystems } from "./checks/related.js";
import { checkWordPress } from "./checks/wordpress.js";
import { extractWordPress } from "./engine/wordpress.js";
import { detectTechnologies } from "./engine/technologies.js";
import { scanLibraries } from "./engine/retire.js";

/** Retire.js component -> fingerprint technology name, so a version found by one fills the other. */
const LIBRARY_TO_TECH = { jquery: "jQuery", angularjs: "AngularJS", vue: "Vue.js", bootstrap: "Bootstrap" };

/** @type {Record<import("./types.js").Severity, number>} */
const ORDER = { high: 0, medium: 1, low: 2, info: 3, good: 4 };

/**
 * @typedef {object} Databases
 * @property {Record<string, any>} technologies
 * @property {Record<string, { name: string, priority: number }>} categories
 * @property {Record<string, any>} retire
 * @property {{ products: Record<string, any> }} eol
 * @property {import("./checks/payment.js").Provider[]} providers
 * @property {import("./engine/backend.js").BackendRule[]} backends
 * @property {import("./checks/wordpress.js").WordPressFacts} wordpress
 * @property {import("./checks/checkout.js").CheckoutPlatform[]} checkout
 * @property {import("./checks/compromised-hosts.js").CompromisedHost[]} compromised
 * @property {import("./checks/secrets.js").SecretFormat[]} secrets
 * @property {import("./engine/public-suffix.js").SuffixIndex} suffixes
 * @property {import("./checks/auth.js").AuthService[]} auth
 * @property {{ name: string, sources: string[], urls: string[] }[]} botChecks
 * @property {import("./checks/destinations.js").Destinations} destinations
 */

/**
 * @typedef {object} Report
 * @property {string} url  the inspected page, without query string or fragment
 * @property {"danger" | "caution" | "ok"} level
 * @property {Record<import("./types.js").Severity, number>} counts
 * @property {import("./types.js").Finding[]} findings
 * @property {import("./types.js").Technology[]} technologies
 * @property {import("./types.js").Library[]} libraries
 * @property {import("./types.js").Backend[]} backends  inferred server-side frameworks and languages
 * @property {import("./engine/wordpress.js").WordPressInfo} wordpress
 */

/**
 * @param {import("./types.js").PageData} page
 * @param {Databases} db
 * @param {{ today: Date, sha1: (text: string) => Promise<string> }} env
 * @returns {Promise<Report>}
 */
export async function analyze(page, db, env) {
  const libraries = await scanLibraries(page, db.retire, env.sha1);
  const backends = inferBackends(page, db.backends);
  const detected = mergeLibraries(detectTechnologies(page, db), libraries, db.technologies);
  const technologies = dropImpliedServerStack(detected, backends);
  const wordpress = extractWordPress(page);
  wordpress.version ||= technologies.find((t) => t.name === "WordPress")?.version ?? "";
  const findings = [
    ...checkTransport(page),
    ...checkPayment(page, db.providers),
    ...checkCheckout(technologies, db.checkout, page),
    ...checkAuth(technologies, db.auth, page),
    ...checkDestinations(technologies, db.destinations, page),
    ...checkBackends(backends, env.today),
    ...checkRelatedSystems(inferRelatedSystems(page, db.backends, db.suffixes)),
    ...checkWordPress(wordpress, db.wordpress, env.today),
    ...checkLibraries(libraries),
    ...checkEol(technologies, db.eol, env.today),
    ...checkHeaders(page),
    ...checkCookies(page),
    ...checkPage(page),
    ...checkCredentialTarget(page, db.auth, db.suffixes),
    ...checkSensitivePage(page, {
      providers: db.providers,
      suffixes: db.suffixes,
      technologies,
      botChecks: db.botChecks,
      auth: db.auth,
      destinations: db.destinations.services,
      fingerprints: db.technologies,
    }),
    ...checkCompromisedHosts(page, db.compromised),
    ...checkExposedSecrets(page, db.secrets),
    ...checkLegalNotice(page),
  ].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const counts = { high: 0, medium: 0, low: 0, info: 0, good: 0 };
  for (const f of findings) counts[f.severity]++;
  return { url: page.url.split(/[?#]/)[0], level: levelOf(counts), counts, findings, technologies, libraries, backends, wordpress };
}

/**
 * A library the Retire.js scan identified fills in (or adds) the matching technology, so its
 * version also goes through the end-of-life check.
 * @param {import("./types.js").Technology[]} technologies
 * @param {import("./types.js").Library[]} libraries
 * @param {Record<string, any>} fingerprints
 * @returns {import("./types.js").Technology[]}
 */
function mergeLibraries(technologies, libraries, fingerprints) {
  for (const lib of libraries) {
    const techName = LIBRARY_TO_TECH[/** @type {keyof typeof LIBRARY_TO_TECH} */ (lib.component)];
    if (!techName) continue;
    const tech = technologies.find((t) => t.name === techName);
    if (tech) {
      tech.version ||= lib.version;
      continue;
    }
    const cats = fingerprints[techName]?.cats ?? [];
    technologies.push({ name: techName, version: lib.version, confidence: 100, categories: cats, website: "", evidence: lib.evidence });
  }
  return technologies;
}

/**
 * @param {Record<import("./types.js").Severity, number>} counts
 * @returns {"danger" | "caution" | "ok"}
 */
function levelOf(counts) {
  if (counts.high > 0) return "danger";
  if (counts.medium > 0) return "caution";
  return "ok";
}

/** Web frameworks, web servers, programming languages, databases. */
const SERVER_CATEGORIES = new Set([18, 22, 27, 34]);

/**
 * When the page comes from a managed platform (BaaS, serverless, static or edge hosting) inferred from
 * strong traces, a server stack that only appears through another fingerprint's "implies" contradicts
 * it and is dropped: none of these platforms runs PHP or MySQL for the page. Anything seen directly is kept.
 * @param {import("./types.js").Technology[]} technologies
 * @param {import("./types.js").Backend[]} backends
 * @returns {import("./types.js").Technology[]}
 */
function dropImpliedServerStack(technologies, backends) {
  const managed = backends.some((b) => (b.status === "managed" || b.status === "hosting") && b.confidence >= 60);
  if (!managed) return technologies;
  return technologies.filter((t) => !t.impliedBy || !t.categories.some((c) => SERVER_CATEGORIES.has(c)));
}
