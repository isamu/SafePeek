// Vulnerable JavaScript library detection against the Retire.js repository.
// Matching rules follow Retire.js (Apache-2.0, https://github.com/RetireJS/retire.js),
// node/lib/retire.js, re-implemented here as an ES module without eval.

import { funcToPaths } from "./queries.js";
import { isAtOrAbove } from "./version.js";

const VERSION_REGEX = "[0-9][0-9.a-z_\\\\-]+";

/**
 * Parses the raw jsrepository.json text, expanding the §§version§§ placeholder as Retire.js does.
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function parseRetireRepository(text) {
  return JSON.parse(text.replace(/§§version§§/g, VERSION_REGEX));
}

/**
 * Property paths the page probe should read for Retire.js "func" extractors.
 * @param {Record<string, any>} repo
 * @returns {string[]}
 */
export function retireGlobalPaths(repo) {
  const paths = new Set();
  for (const entry of Object.values(repo)) {
    for (const expression of entry.extractors?.func ?? []) {
      for (const path of funcToPaths(expression)) paths.add(path);
    }
  }
  return [...paths];
}

/**
 * @param {import("../types.js").PageData} page
 * @param {Record<string, any>} repo
 * @param {(text: string) => Promise<string>} sha1  hex SHA-1 of a string
 * @returns {Promise<import("../types.js").Library[]>}
 */
export async function scanLibraries(page, repo, sha1) {
  /** @type {Map<string, import("../types.js").Library>} */
  const found = new Map();
  const add = (/** @type {string} */ component, /** @type {string} */ version, /** @type {string} */ evidence) => {
    const cleanVersion = version.replace(/[.-]min$/, "");
    const key = `${component}@${cleanVersion}`;
    const lib = found.get(key) ?? { component, version: cleanVersion, vulnerabilities: [], evidence: [] };
    if (!lib.evidence.includes(evidence)) lib.evidence.push(evidence);
    found.set(key, lib);
  };
  for (const script of page.scripts) {
    if (script.src) scanUrl(script.src, repo, add);
    if (script.content) await scanContent(script, repo, sha1, add);
  }
  scanGlobals(page.globals, repo, add);
  for (const lib of found.values()) lib.vulnerabilities = vulnerabilitiesOf(lib, repo);
  return [...found.values()];
}

/**
 * @typedef {(component: string, version: string, evidence: string) => void} Add
 */

/**
 * @param {string} url
 * @param {Record<string, any>} repo
 * @param {Add} add
 */
function scanUrl(url, repo, add) {
  const fileName = url.split(/[?#]/)[0].split("/").pop() ?? "";
  for (const [component, entry] of Object.entries(repo)) {
    for (const regex of entry.extractors?.uri ?? []) {
      for (const version of allMatches(regex, url)) add(component, version, `url ${url}`);
    }
    for (const regex of entry.extractors?.filename ?? []) {
      for (const version of allMatches(`^${regex}$`, fileName)) add(component, version, `file name ${url}`);
    }
  }
}

/**
 * @param {import("../types.js").ScriptInfo} script
 * @param {Record<string, any>} repo
 * @param {(text: string) => Promise<string>} sha1
 * @param {Add} add
 */
async function scanContent(script, repo, sha1, add) {
  const content = script.content.replace(/(\r\n|\r)/g, "\n");
  const where = script.src ? `content of ${script.src}` : "inline script";
  let matched = false;
  for (const [component, entry] of Object.entries(repo)) {
    for (const regex of entry.extractors?.filecontent ?? []) {
      for (const version of allMatches(regex, content)) {
        add(component, version, where);
        matched = true;
      }
    }
  }
  if (matched) return;
  matched = scanReplacements(content, repo, (component, version) => add(component, version, where));
  if (matched || !script.fetched) return;
  const hash = await sha1(content);
  for (const [component, entry] of Object.entries(repo)) {
    const version = entry.extractors?.hashes?.[hash];
    if (version) add(component, version, `hash of ${script.src}`);
  }
}

/**
 * "filecontentreplace" extractors look like "/regex/replacement/".
 * @param {string} content
 * @param {Record<string, any>} repo
 * @param {(component: string, version: string) => void} add
 * @returns {boolean}
 */
function scanReplacements(content, repo, add) {
  let matched = false;
  for (const [component, entry] of Object.entries(repo)) {
    for (const spec of entry.extractors?.filecontentreplace ?? []) {
      const parts = /^\/(.*[^\\])\/([^/]+)\/$/.exec(spec);
      const regex = parts ? safeRegex(parts[1], "g") : null;
      if (!parts || !regex) continue;
      for (const match of content.matchAll(regex)) {
        add(component, match[0].replace(new RegExp(parts[1]), parts[2]));
        matched = true;
      }
    }
  }
  return matched;
}

/**
 * @param {Record<string, unknown>} globals
 * @param {Record<string, any>} repo
 * @param {Add} add
 */
function scanGlobals(globals, repo, add) {
  for (const [component, entry] of Object.entries(repo)) {
    for (const expression of entry.extractors?.func ?? []) {
      for (const path of funcToPaths(expression)) {
        const value = globals[path];
        if ((typeof value === "string" || typeof value === "number") && /^\d/.test(String(value))) {
          add(component, String(value), `js ${path}`);
        }
      }
    }
  }
}

/**
 * @param {string} source
 * @param {string} subject
 * @returns {string[]}
 */
function allMatches(source, subject) {
  const regex = safeRegex(source, "g");
  if (!regex) return [];
  return [...subject.matchAll(regex)].map((m) => m[1]).filter((v) => v !== undefined);
}

/**
 * @param {string} source
 * @param {string} flags
 * @returns {RegExp | null}
 */
function safeRegex(source, flags) {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/**
 * @param {import("../types.js").Library} lib
 * @param {Record<string, any>} repo
 * @returns {import("../types.js").Vulnerability[]}
 */
function vulnerabilitiesOf(lib, repo) {
  const vulns = repo[lib.component]?.vulnerabilities ?? [];
  return vulns
    .filter((/** @type {any} */ v) => {
      if (v.below !== undefined && isAtOrAbove(lib.version, v.below)) return false;
      if (v.atOrAbove !== undefined && !isAtOrAbove(lib.version, v.atOrAbove)) return false;
      return !(Array.isArray(v.excludes) && v.excludes.includes(lib.version));
    })
    .map((/** @type {any} */ v) => ({
      severity: String(v.severity ?? "medium"),
      summary: String(v.identifiers?.summary ?? ""),
      cves: v.identifiers?.CVE ?? [],
      info: v.info ?? [],
    }));
}
