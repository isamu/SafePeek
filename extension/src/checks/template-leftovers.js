// Placeholder text a shop template ships with, left in a shop's 特定商取引法 notice. Fake shops are built from shared kits
// and often keep it (docs/fake-shop-research.md, item 13).

import { finding } from "./finding.js";
import { isNoticePage } from "./legal-notice.js";

// Only the notice is read: there the identity is the seller's own. Elsewhere 会社名 or TEL can be what a buyer wants
// printed on a stamp or card, a masked name (〇〇様), or a partner (株式会社××との提携).
const IDENTITY_LABEL = /販売業者|販売者|運営会社|運営者|会社名|事業者|店舗名|所在地|住所|電話|TEL|連絡先|代表/i;
// A demo or test store says so, and shows placeholders on purpose; a fake shop never calls itself one.
const DEMO_STORE = /デモサイト|デモストア|デモショップ|サンプルショップ|デモ用|テスト用|テストサイト/;
// A FAX of zeros means the seller has no fax, not a template left unfilled.
const FAX_NUMBER = /FAX\s{0,2}[:：]?\s{0,2}[\d-]{1,20}/gi;
// A line showing an example of how to fill in a form is never a leftover.
const EXAMPLE_WORDS = /例|入力|記入|サンプル|形式|フォーマット|半角|ハイフン/;
const IDENTITY_PLACEHOLDERS = [
  { label: "株式会社〇〇", pattern: /(?:株式会社|有限会社|合同会社)[〇○◯×✕]{2,6}|[〇○◯×✕]{2,6}(?:株式会社|商店|ショップ)/ },
  { label: "000-0000-0000", pattern: /(?<![\d-])0{2,4}-0{2,4}-0{3,4}(?![\d-])/ },
  { label: "〒000-0000", pattern: /〒\s?000-?0000/ },
];
// Template filler is not used: real shops keep lorem ipsum in size guides, write "your store name" in prose, and leave
// Magento's "Default Store View" label as it is.

/**
 * Only the kind of placeholder is shown; the text around it is the page's. Input placeholders are not read: they are
 * nearly always examples of how to fill in the field.
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkTemplateLeftovers(page) {
  if (!isNoticePage(page.html) || DEMO_STORE.test(page.text)) return [];
  const identityLines = identityBlocks(page.text)
    .filter((block) => !EXAMPLE_WORDS.test(block))
    .map((block) => block.replace(FAX_NUMBER, ""));
  const found = IDENTITY_PLACEHOLDERS.filter(({ pattern }) => identityLines.some((line) => pattern.test(line))).map(({ label }) => label);
  return found.length > 0 ? [finding("shop_template_leftovers", "low", "page", { count: found.length }, found)] : [];
}

/**
 * Each line with an identity label, with the line after it: notices often put the label and the value on separate lines.
 * @param {string} text
 * @returns {string[]}
 */
function identityBlocks(text) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  return lines.flatMap((line, i) => (IDENTITY_LABEL.test(line) ? [`${line}\n${lines[i + 1] ?? ""}`] : []));
}
