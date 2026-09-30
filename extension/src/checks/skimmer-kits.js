// Fake-shop and skimmer kits with published indicators (docs/fake-shop-research.md, item 10).

import { finding } from "./finding.js";

// One kind of trace alone can be a legitimate script that lists the kit's names (a vendor's skimmer detector lists
// all of them), or a generic name; the kit itself leaves two kinds at once: its file with its globals, or its code
// with its server.
const MIN_KINDS = 2;

/**
 * @typedef {object} Kit
 * @property {string} name
 * @property {string} reported  year-month it was published
 * @property {string[]} sources  reports that name the indicators
 * @property {string[]} scripts  script file names
 * @property {string[]} code  identifiers in the kit's script code
 * @property {string[]} hosts  hosts the kit contacts
 */

/**
 * Only traces count: a loaded script's file name, a contacted host, or an identifier in code the page runs. An article
 * about the kit shows the same names in its text, so the HTML and the page text are not read.
 * @param {import("../types.js").PageData} page
 * @param {Kit[]} kits
 * @returns {import("../types.js").Finding[]}
 */
export function checkSkimmerKits(page, kits) {
  const hit = kits.filter((kit) => kitTraces(page, kit).filter((kind) => kind.length > 0).length >= MIN_KINDS);
  if (hit.length === 0) return [];
  const evidence = hit.map((kit) => `${kit.name} (${kit.reported}): ${kitTraces(page, kit).flat().join(", ")} — ${kit.sources[0]}`);
  return [finding("shop_known_skimmer_kit", "high", "page", { kits: hit.map((kit) => kit.name).join(", ") }, evidence)];
}

/**
 * @param {import("../types.js").PageData} page
 * @param {Kit} kit
 * @returns {string[][]}  the kit's indicators the page carries, one list per kind: file names, hosts, code
 */
function kitTraces(page, kit) {
  const files = page.scripts.map((s) => fileName(s.src ?? ""));
  const hosts = new Set([...page.contactedHosts, ...(page.scriptHosts ?? [])]);
  const code = page.scripts.map((s) => s.content);
  return [
    kit.scripts.filter((name) => files.includes(name)),
    kit.hosts.filter((host) => hosts.has(host)),
    kit.code.filter((identifier) => code.some((body) => body.includes(identifier))),
  ];
}

/**
 * @param {string} src
 * @returns {string}  the last path segment, without query or fragment
 */
function fileName(src) {
  try {
    return new URL(src).pathname.split("/").pop() ?? "";
  } catch {
    return "";
  }
}
