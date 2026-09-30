// Talks to the browser: loads the bundled data and gathers page data from the active tab.

import { buildDomQueries, buildGlobalPaths } from "../src/engine/queries.js";
import { retireGlobalPaths } from "../src/engine/retire.js";
import { loadDatabases as loadFromData } from "../src/data.js";
import { probeGlobals } from "../src/page/probe.js";
import { backendGlobalPaths } from "../src/engine/backend.js";

/** @returns {ReturnType<typeof loadFromData>} */
export function loadDatabases() {
  return loadFromData((name) => fetch(chrome.runtime.getURL(`data/${name}`)).then((r) => r.text()));
}

/**
 * @param {number} tabId
 * @param {import("../src/analyze.js").Databases} db
 * @returns {Promise<import("../src/types.js").PageData>}
 */
export async function collectFromTab(tabId, db) {
  const target = { tabId };
  const domQueries = buildDomQueries(db.technologies);
  const paymentHosts = db.providers.flatMap((p) => p.hosts);
  const paths = [...new Set([...buildGlobalPaths(db.technologies), ...retireGlobalPaths(db.retire), ...backendGlobalPaths(db.backends)])];

  await chrome.scripting.executeScript({ target, files: ["src/page/collector.js"] });
  const [collected] = await chrome.scripting.executeScript({
    target,
    func: (queries, hosts) => /** @type {any} */ (globalThis).SafePeekCollector.collect(queries, hosts),
    args: [domQueries, paymentHosts],
  });
  const [probed] = await chrome.scripting.executeScript({ target, world: "MAIN", func: probeGlobals, args: [paths] });
  if (!collected?.result) throw new Error("no data from page");
  return { ...collected.result, globals: probed?.result ?? {} };
}
