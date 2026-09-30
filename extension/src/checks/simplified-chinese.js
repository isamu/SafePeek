// Simplified Chinese on a Japanese shop page: police and 国民生活センター name it as a sign of a fake shop, which is
// often machine-translated from Chinese (docs/fake-shop-research.md, item 4).

import { finding } from "./finding.js";

// Simplified forms that Japanese writes differently (这 for 這, 购 for 購 …), so none of them occurs in Japanese text.
const SIMPLIFIED_ONLY = new Set("这们东华货购优价质飞说为发过买卖页务头关员个设际顾选择请联运费订单实");
const MIN_SIMPLIFIED = 3;
const KANA = /[ぁ-ゖァ-ヺ]/g;
const MIN_KANA = 200;
const SHOP_WORDS = /カート|買い物かご|ショッピング|購入|税込|送料/;
const CHINESE_LANG = /\blang=["']?zh/i;
// 天 counts days in Chinese; Japanese writes 日 (「365天受付」 on a Japanese page).
const CHINESE_DAYS = /(?<!\d)\d{1,4}天/;

/**
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkSimplifiedChinese(page) {
  if ((page.text.match(KANA) ?? []).length < MIN_KANA || !SHOP_WORDS.test(page.text)) return [];
  const signs = chineseSigns(page);
  if (signs.length === 0) return [];
  return [finding("shop_simplified_chinese", signs.length > 1 ? "medium" : "low", "page", { count: signs.length }, signs)];
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {string[]}  one evidence line per kind of sign
 */
function chineseSigns(page) {
  const simplified = [...new Set([...page.text].filter((char) => SIMPLIFIED_ONLY.has(char)))];
  const signs = [];
  if (simplified.length >= MIN_SIMPLIFIED) signs.push(`simplified: ${simplified.slice(0, 10).join(" ")}`);
  if (CHINESE_LANG.test(htmlTag(page.html))) signs.push('<html lang="zh…">');
  const days = CHINESE_DAYS.exec(page.text);
  if (days) signs.push(days[0]);
  return signs;
}

/**
 * @param {string} html
 * @returns {string}  the opening <html …> tag, or "" when there is none
 */
function htmlTag(html) {
  const start = html.search(/<html\b/i);
  return start < 0 ? "" : html.slice(start, html.indexOf(">", start) + 1);
}
