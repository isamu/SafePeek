// Placeholder text a shop template ships with, left on a live shop page. Fake shops are built from shared kits and
// often keep it (docs/fake-shop-research.md, item 13).

import { finding } from "./finding.js";
import { isJapaneseShop } from "./japanese-shop.js";

// A name of 〇 / × or a number of zeros is a leftover only where the seller's identity is given; elsewhere it is a
// masked name (〇〇様) or a partner (株式会社××との提携). A line showing an example of how to fill in a form is never one.
const IDENTITY_LABEL = /販売業者|販売者|運営会社|運営者|会社名|事業者|店舗名|所在地|住所|電話|TEL|連絡先|代表/i;
const EXAMPLE_WORDS = /例|入力|記入|サンプル|形式|フォーマット|半角|ハイフン/;
const IDENTITY_PLACEHOLDERS = [
  { label: "株式会社〇〇", pattern: /(?:株式会社|有限会社|合同会社)[〇○◯×✕]{2,6}|[〇○◯×✕]{2,6}(?:株式会社|商店|ショップ)/ },
  { label: "000-0000-0000", pattern: /(?<![\d-])0{2,4}-0{3,4}-0{4}(?![\d-])/ },
  { label: "〒000-0000", pattern: /〒\s?000-?0000/ },
];
// A template's own filler, which no shop writes on purpose; "Lorem Ipsum" alone can be a product's name.
const TEMPLATE_FILLER = [
  { label: "Lorem ipsum", pattern: /lorem ipsum dolor sit amet/i },
  { label: "Your Store Name", pattern: /your (?:store|shop) name|default store view/i },
];

/**
 * Only the kind of placeholder is shown; the text around it is the page's. Input placeholders are not read: they are
 * nearly always examples of how to fill in the field.
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkTemplateLeftovers(page) {
  if (!isJapaneseShop(page.text)) return [];
  const identityLines = page.text.split("\n").filter((line) => IDENTITY_LABEL.test(line) && !EXAMPLE_WORDS.test(line));
  const found = [
    ...IDENTITY_PLACEHOLDERS.filter(({ pattern }) => identityLines.some((line) => pattern.test(line))),
    ...TEMPLATE_FILLER.filter(({ pattern }) => pattern.test(page.text)),
  ].map(({ label }) => label);
  return found.length > 0 ? [finding("shop_template_leftovers", "low", "page", { count: found.length }, found)] : [];
}
