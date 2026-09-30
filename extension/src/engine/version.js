// Version helpers.

/**
 * Numeric comparison of dotted versions, ignoring non-numeric suffixes ("1.1.1w" -> 1.1.1).
 * @param {string} a
 * @param {string} b
 * @returns {number} negative when a < b, 0 when equal, positive when a > b
 */
export function compareVersions(a, b) {
  const pa = numericParts(a);
  const pb = numericParts(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * @param {string} version
 * @returns {number[]}
 */
function numericParts(version) {
  return String(version)
    .split(/[.\-_]/)
    .map((part) => /^\d+/.exec(part))
    .filter((m) => m !== null)
    .map((m) => parseInt(m[0], 10));
}

/**
 * Retire.js's own ordering, which treats pre-release suffixes the way its database expects.
 * Ported from Retire.js (Apache-2.0), node/lib/retire.js `isAtOrAbove`.
 * @param {string} version1
 * @param {string} version2
 * @returns {boolean}
 */
export function isAtOrAbove(version1, version2) {
  const v1 = version1.split(/[.-]/g);
  const v2 = version2.split(/[.-]/g);
  const length = Math.max(v1.length, v2.length);
  for (let i = 0; i < length; i++) {
    const c1 = toComparable(v1[i]);
    const c2 = toComparable(v2[i]);
    if (typeof c1 !== typeof c2) return typeof c1 === "number";
    if (c1 > c2) return true;
    if (c1 < c2) return false;
  }
  return true;
}

/**
 * @param {string | undefined} part
 * @returns {number | string}
 */
function toComparable(part) {
  if (part === undefined) return 0;
  return /^\d+$/.test(part) ? parseInt(part, 10) : part;
}

/**
 * Picks the most specific of several detected versions (the one with the most parts, then the highest).
 * @param {string[]} versions
 * @returns {string}
 */
export function mostSpecificVersion(versions) {
  const candidates = versions.filter((v) => v && /\d/.test(v));
  if (candidates.length === 0) return "";
  return candidates.reduce((best, v) => {
    const diff = numericParts(v).length - numericParts(best).length;
    if (diff !== 0) return diff > 0 ? v : best;
    return compareVersions(v, best) > 0 ? v : best;
  });
}
