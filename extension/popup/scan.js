// Talks to the browser: loads the bundled data and gathers page data from the active tab.

import { buildDomQueries, buildGlobalPaths } from "../src/engine/queries.js";
import { parseRetireRepository, retireGlobalPaths } from "../src/engine/retire.js";
import { probeGlobals } from "../src/page/probe.js";

/**
 * @param {string} name
 * @returns {Promise<Response>}
 */
function dataFile(name) {
  return fetch(chrome.runtime.getURL(`data/${name}`));
}

/** @returns {Promise<import("../src/analyze.js").Databases & { sources: Record<string, any> }>} */
export async function loadDatabases() {
  const [technologies, categories, retireText, eol, payment, sources] = await Promise.all([
    dataFile("technologies.json").then((r) => r.json()),
    dataFile("categories.json").then((r) => r.json()),
    dataFile("retire.json").then((r) => r.text()),
    dataFile("eol.json").then((r) => r.json()),
    dataFile("payment-providers.json").then((r) => r.json()),
    dataFile("sources.json").then((r) => r.json()),
  ]);
  return { technologies, categories, retire: parseRetireRepository(retireText), eol, providers: payment.providers, sources };
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
  const paths = [...new Set([...buildGlobalPaths(db.technologies), ...retireGlobalPaths(db.retire)])];

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
