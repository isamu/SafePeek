// Reports the other systems of the same organisation that the page hands off to, with what their URL shapes suggest.

import { finding } from "./finding.js";

/**
 * @param {import("../engine/related-systems.js").RelatedSystem[]} systems
 * @returns {import("../types.js").Finding[]}
 */
export function checkRelatedSystems(systems) {
  if (systems.length === 0) return [];
  const evidence = systems.flatMap((s) => s.hints.map((h) => `${s.host}: ${h.backend} (${h.note}: ${h.match})`));
  return [finding("backend_related", "info", "backend", { hosts: systems.map((s) => s.host).join(", ") }, evidence)];
}
