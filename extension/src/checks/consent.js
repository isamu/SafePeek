// A consent banner on screen that the visitor has not answered yet, while cookies that tracking services use to
// identify a visitor are already present. What SafePeek sees: the banner's element in the markup, the absence of the
// cookie the banner sets once answered, and the identifier cookies readable now. When they were stored, it cannot see.

import { finding } from "./finding.js";
import { markupTokens, tagAttributes } from "../engine/markup.js";

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
  const ids = elementIds(page.html);
  const waiting = data.banners.filter((b) => b.elementIds.some((id) => ids.has(id)) && !b.answeredCookies.some((c) => cookieNames.includes(c)));
  if (waiting.length === 0) return [];
  const set = data.identifiers.filter((i) => i.cookies.some((c) => cookieNames.includes(c)));
  if (set.length === 0) return [];
  const params = { banner: waiting.map((b) => b.name).join(", "), services: set.map((i) => i.service).join(", ") };
  const evidence = set.flatMap((i) => i.cookies.filter((c) => cookieNames.includes(c)).map((c) => `cookie ${c} (${i.service})`));
  return [finding("identifiers_before_consent", "info", "destinations", params, evidence)];
}

/**
 * @param {string} html
 * @returns {Set<string>}  the id of every element in the markup
 */
function elementIds(html) {
  const startTags = markupTokens(html).filter((t) => t.kind === "startTag");
  return new Set(
    startTags.flatMap((t) =>
      tagAttributes(html.slice(t.start, t.end))
        .filter((a) => a.name === "id")
        .map((a) => a.value),
    ),
  );
}
