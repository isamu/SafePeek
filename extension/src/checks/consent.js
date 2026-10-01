// A consent banner on screen that the visitor has not answered yet, while tracking services have already stored the
// cookies that identify the visitor. What SafePeek sees: the banner's element in the markup, the absence of the
// cookie the banner sets once answered, and the identifier cookies readable from the page.

import { finding } from "./finding.js";
import { readMarkup } from "../engine/markup.js";

/**
 * @typedef {object} ConsentBanner
 * @property {string} name
 * @property {string[]} elementIds  the ids of the banner's own element
 * @property {string[]} answeredCookies  set once the visitor answers or closes the banner
 * @property {string[]} sources
 */

/**
 * @typedef {object} TrackingIdentifier
 * @property {string} service
 * @property {string[]} cookies
 * @property {string[]} sources
 */

/**
 * @typedef {object} ConsentData
 * @property {ConsentBanner[]} banners
 * @property {TrackingIdentifier[]} identifiers
 */

/**
 * @param {import("../types.js").PageData} page
 * @param {ConsentData} data
 * @returns {import("../types.js").Finding[]}
 */
export function checkIdentifiersBeforeConsent(page, data) {
  const cookieNames = Object.keys(page.cookies);
  const tags = readMarkup(page.html).tags;
  const waiting = data.banners.filter((b) => b.elementIds.some((id) => hasElementId(tags, id)) && !b.answeredCookies.some((c) => cookieNames.includes(c)));
  if (waiting.length === 0) return [];
  const set = data.identifiers.filter((i) => i.cookies.some((c) => cookieNames.includes(c)));
  if (set.length === 0) return [];
  const params = { banner: waiting.map((b) => b.name).join(", "), services: set.map((i) => i.service).join(", ") };
  const evidence = set.flatMap((i) => i.cookies.filter((c) => cookieNames.includes(c)).map((c) => `cookie ${c} (${i.service})`));
  return [finding("identifiers_before_consent", "info", "destinations", params, evidence)];
}

/**
 * @param {string} tags  the page's start tags, one per line
 * @param {string} id  a fixed element id from the data
 * @returns {boolean}
 */
function hasElementId(tags, id) {
  return new RegExp(`\\sid\\s*=\\s*["']?${id}(?:["'\\s/>]|$)`).test(tags);
}
