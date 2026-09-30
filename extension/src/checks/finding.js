// Constructor for findings shared by every check.

/** @typedef {import("../types.js").Finding} Finding */

/**
 * @param {string} id
 * @param {import("../types.js").Severity} severity
 * @param {string} area
 * @param {Record<string, string | number>} [params]
 * @param {string[]} [evidence]
 * @returns {Finding}
 */
export function finding(id, severity, area, params = {}, evidence = []) {
  return { id, severity, area, params, evidence };
}
