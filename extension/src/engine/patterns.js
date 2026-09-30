// Parsing of Wappalyzer-style patterns: "regex\;version:\1\;confidence:50".

/**
 * @typedef {object} Pattern
 * @property {RegExp | null} regex  null when the source regex is invalid in this engine
 * @property {string} source
 * @property {string} version
 * @property {number} confidence
 */

/** @type {Map<string, Pattern>} */
const cache = new Map();

/**
 * @param {string} value
 * @returns {Pattern}
 */
export function parsePattern(value) {
  const cached = cache.get(value);
  if (cached) return cached;
  const [source = "", ...attrs] = String(value).split("\\;");
  const pattern = { regex: compile(source), source, version: "", confidence: 100 };
  for (const attr of attrs) {
    const sep = attr.indexOf(":");
    const key = attr.slice(0, sep);
    const val = attr.slice(sep + 1);
    if (key === "version") pattern.version = val;
    if (key === "confidence") pattern.confidence = parseInt(val, 10) || 0;
  }
  cache.set(value, pattern);
  return pattern;
}

/**
 * @param {string} source
 * @returns {RegExp | null}
 */
function compile(source) {
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

/**
 * Normalises the string | string[] shapes used throughout the fingerprint data.
 * @param {unknown} value
 * @returns {string[]}
 */
export function toList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/**
 * Fills \1-style references (and the "\1?yes:no" ternary) from a regex match.
 * @param {string} template
 * @param {RegExpExecArray} match
 * @returns {string}
 */
export function resolveVersion(template, match) {
  if (!template) return "";
  let version = template;
  match.forEach((group, index) => {
    const ternary = new RegExp(`\\\\${index}\\?([^:]*):(.*)$`).exec(version);
    if (ternary) version = version.replace(ternary[0], group ? ternary[1] : ternary[2]);
    version = version.replace(new RegExp(`\\\\${index}`, "g"), group ?? "");
  });
  return version.trim();
}

/**
 * Tests one pattern against one value.
 * @param {string} patternValue
 * @param {string} subject
 * @returns {{ version: string, confidence: number } | null}
 */
export function matchPattern(patternValue, subject) {
  const pattern = parsePattern(patternValue);
  if (!pattern.regex) return null;
  const match = pattern.regex.exec(subject);
  if (!match) return null;
  return { version: resolveVersion(pattern.version, match), confidence: pattern.confidence };
}
