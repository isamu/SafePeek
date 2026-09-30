// Placeholder text a shop template ships with, left on a live shop page. Fake shops are built from shared kits and
// often keep it (docs/fake-shop-research.md, item 13).

import { finding } from "./finding.js";
import { isJapaneseShop } from "./japanese-shop.js";

// Each is a placeholder no real shop publishes: a company or shop name made of ○ or ×, a phone or postal code of
// zeros, a template's own filler.
const PLACEHOLDERS = [
  { label: "株式会社〇〇", pattern: /(?:株式会社|有限会社|合同会社)[〇○◯×✕]{2,6}|[〇○◯×✕]{2,6}(?:株式会社|商店|ショップ)/ },
  { label: "000-0000-0000", pattern: /(?<![\d-])0{2,4}-0{3,4}-0{4}(?![\d-])/ },
  { label: "〒000-0000", pattern: /〒\s?000-?0000/ },
  { label: "Lorem ipsum", pattern: /lorem ipsum/i },
  { label: "Your Store Name", pattern: /your (?:store|shop) name|default store view/i },
];

/**
 * Only the kind of placeholder is shown; the text around it is the page's.
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkTemplateLeftovers(page) {
  if (!isJapaneseShop(page.text)) return [];
  const found = PLACEHOLDERS.filter(({ pattern }) => pattern.test(page.text)).map(({ label }) => label);
  return found.length > 0 ? [finding("shop_template_leftovers", "low", "page", { count: found.length }, found)] : [];
}
