// WordPress traces: core version, plugins and themes, read from the asset URLs a WordPress page loads.

const ASSET_URL = /\b(?:href|src)\s*=\s*["']([^"']*\/wp-(?:content|includes)\/[^"']*)["']/gi;
const PLUGIN = /\/wp-content\/plugins\/([a-z0-9._-]+)\//i;
const THEME = /\/wp-content\/themes\/([a-z0-9._-]+)\//i;
const CORE_ASSET = /\/wp-includes\//i;

/**
 * @typedef {object} WpComponent
 * @property {string} slug
 * @property {string} version  from the asset's ?ver= parameter, or ""
 */

/**
 * @typedef {object} WordPressInfo
 * @property {boolean} detected
 * @property {string} version  core version, or ""
 * @property {string} versionSource  where the core version was read from
 * @property {WpComponent[]} plugins
 * @property {WpComponent[]} themes
 * @property {boolean} xmlrpc  the page advertises XML-RPC (pingback)
 */

/**
 * @param {string} url
 * @returns {string}
 */
function verParam(url) {
  const match = /[?&]ver=(\d[\da-z.-]*)/i.exec(url.replace(/&amp;/g, "&"));
  return match ? match[1] : "";
}

/**
 * @param {Map<string, string>} into  slug -> version
 * @param {string} slug
 * @param {string} version
 */
function remember(into, slug, version) {
  // Keep the first version seen; fill it in if the first sighting had none.
  if (!into.get(slug)) into.set(slug, version);
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {WordPressInfo}
 */
export function extractWordPress(page) {
  const urls = [
    ...[...page.html.matchAll(ASSET_URL)].map((m) => m[1]),
    ...page.scripts.map((s) => s.src ?? "").filter((s) => s.includes("/wp-")),
    ...page.stylesheets.filter((s) => s.includes("/wp-")),
  ];
  /** @type {Map<string, string>} */
  const plugins = new Map();
  /** @type {Map<string, string>} */
  const themes = new Map();
  const coreVersions = [];
  for (const url of urls) {
    const plugin = PLUGIN.exec(url);
    const theme = THEME.exec(url);
    if (plugin) remember(plugins, plugin[1], verParam(url));
    else if (theme) remember(themes, theme[1], verParam(url));
    else if (CORE_ASSET.test(url) && verParam(url)) coreVersions.push(verParam(url));
  }
  const generator = (page.meta.generator ?? []).map((g) => /^WordPress\s+([\d.]+)/i.exec(g)).find((m) => m);
  const version = generator ? generator[1] : mostCommon(coreVersions);
  const toList = (/** @type {Map<string, string>} */ m) =>
    [...m.entries()].map(([slug, v]) => ({ slug, version: v })).sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    detected: urls.length > 0 || Boolean(generator),
    version,
    versionSource: versionSource(Boolean(generator), version),
    plugins: toList(plugins),
    themes: toList(themes),
    xmlrpc: Boolean(page.headers?.["x-pingback"]) || /<link[^>]+rel=["']pingback["']/i.test(page.html),
  };
}

/**
 * @param {string[]} values
 * @returns {string}
 */
function mostCommon(values) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

/**
 * @param {boolean} fromGenerator
 * @param {string} version
 * @returns {string}
 */
function versionSource(fromGenerator, version) {
  if (fromGenerator) return "meta generator";
  return version ? "?ver= of /wp-includes/ assets" : "";
}
