// Where the page sends data about its visitors: session replay, error and log monitoring, advertising, analytics and
// marketing services, from the hosts it contacts and the webappanalyzer products it runs.

import { finding } from "./finding.js";
import { hostMatches, pageHosts } from "./page-urls.js";

const MENTION_LABELS = ["script content", "page text", "html"];

/**
 * @typedef {object} DestinationService
 * @property {string} name
 * @property {string} purpose  one of the purpose ids
 * @property {string[]} sources  pages that document its hosts
 * @property {string[]} [technologies]  webappanalyzer names
 * @property {string[]} [hosts]  domain patterns (see hostMatches)
 */

/**
 * @typedef {object} DestinationPurpose
 * @property {string} id
 * @property {number[]} [categories]  webappanalyzer categories that mean this purpose, for products not listed as services
 */

/**
 * @typedef {object} Destinations
 * @property {DestinationPurpose[]} purposes  in report order; the first matching category wins
 * @property {DestinationService[]} services
 */

/**
 * @typedef {object} SeenDestination
 * @property {string} name
 * @property {string} purpose
 * @property {string[]} evidence
 */

/**
 * One info finding per purpose the page sends data for.
 * @param {import("../types.js").Technology[]} technologies
 * @param {Destinations} destinations
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkDestinations(technologies, destinations, page) {
  const direct = technologies.filter((t) => !t.impliedBy && t.evidence.some(isTrace));
  const seen = [...listedServices(destinations.services, direct, page), ...categorised(destinations, direct)];
  return destinations.purposes.flatMap(({ id }) => {
    const here = seen.filter((s) => s.purpose === id);
    if (here.length === 0) return [];
    const evidence = here.map((s) => `${s.name}: ${s.evidence[0]}`);
    return [finding(`dest_${id}`, "info", "destinations", { services: here.map((s) => s.name).join(", ") }, evidence)];
  });
}

/**
 * Listed services, seen through a host the page contacted or one of their products. A product is named only by the
 * kind of its trace, since its evidence can be a URL carrying account ids.
 * @param {DestinationService[]} services
 * @param {import("../types.js").Technology[]} direct
 * @param {import("../types.js").PageData} page
 * @returns {SeenDestination[]}
 */
function listedServices(services, direct, page) {
  const hosts = pageHosts(page);
  return services
    .map((service) => ({
      name: service.name,
      purpose: service.purpose,
      evidence: [
        ...direct.filter((t) => (service.technologies ?? []).includes(t.name)).map((t) => `${t.name} (${kindOf(t)})`),
        ...(service.hosts ?? []).filter((p) => hosts.some((h) => hostMatches(p, h))).map((p) => `host ${p}`),
      ],
    }))
    .filter((s) => s.evidence.length > 0);
}

/**
 * Products that are not listed as a service, by their webappanalyzer category.
 * @param {Destinations} destinations
 * @param {import("../types.js").Technology[]} direct
 * @returns {SeenDestination[]}
 */
function categorised(destinations, direct) {
  const listed = new Set(destinations.services.flatMap((s) => s.technologies ?? []));
  return direct.flatMap((t) => {
    if (listed.has(t.name)) return [];
    const purpose = destinations.purposes.find((p) => (p.categories ?? []).some((c) => t.categories.includes(c)));
    return purpose ? [{ name: t.name, purpose: purpose.id, evidence: [`${t.name} (${kindOf(t)})`] }] : [];
  });
}

/**
 * @param {import("../types.js").Technology} tech
 * @returns {string}
 */
function kindOf(tech) {
  return (tech.evidence.find(isTrace) ?? "").split(" ")[0];
}

/**
 * A product named in a script body, the HTML or the page text is mentioned, not necessarily run: only a global, a
 * cookie, a header, a meta tag, a script URL or a DOM element shows it is on the page.
 * @param {string} label
 * @returns {boolean}
 */
function isTrace(label) {
  return !MENTION_LABELS.some((prefix) => label.startsWith(prefix));
}
