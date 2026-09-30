// Runs in the page's own JavaScript world (MAIN), because library globals such as window.jQuery
// are invisible from the extension's isolated world. It only reads property paths; it never
// evaluates code strings. It must stay self-contained: chrome.scripting serialises this one function.

/**
 * @param {string[]} paths  dotted property paths, e.g. "jQuery.fn.jquery"
 * @returns {Record<string, string | number | boolean>}
 */
export function probeGlobals(paths) {
  /** @type {Record<string, string | number | boolean>} */
  const found = {};
  for (const path of paths) {
    let value = /** @type {any} */ (globalThis);
    try {
      for (const key of path.split(".")) {
        if (value === null || value === undefined) break;
        value = value[key];
      }
    } catch {
      continue;
    }
    if (value === undefined || value === null) continue;
    if (typeof value === "string") found[path] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean") found[path] = value;
    else found[path] = true;
  }
  return found;
}
