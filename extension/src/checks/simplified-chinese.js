// Simplified Chinese on a Japanese shop page: police and 国民生活センター name it as a sign of a fake shop, which is
// often machine-translated from Chinese (docs/fake-shop-research.md, item 4).

import { finding } from "./finding.js";

// Simplified forms that Japanese normally writes differently (这 for 這, 购 for 購 …). 个 and 价 are left out: Japanese
// knows them as old or variant forms (of 個・箇 and 価).
const SIMPLIFIED_ONLY = new Set("这们东华货购优质飞说为发过买卖页务头关员设际顾选择请联运费订单实");
// A fake shop's Japanese carries a few stray simplified characters; a Japanese shop's page for Chinese-speaking
// customers is written in Chinese, so they are common there. Above this share of the kana, they are not a sign.
const MAX_SIMPLIFIED_PER_KANA = 0.1;
// Chinese text, simplified or traditional, has no kana, so Han characters far outnumbering kana mean a Chinese section;
// Japanese prose, even kanji-heavy, stays well below this.
const HAN = /[\u4e00-\u9fff]/g;
const MAX_HAN_PER_KANA = 2;
// A line with no kana is a line of Chinese (a shipping note for overseas customers …) when it has this many Han
// characters or the comma Chinese writes (，, where Japanese writes 、); a shorter one without it is a label such as
// 「休業日：365天受付」, part of the Japanese page.
const MIN_HAN_IN_CHINESE_LINE = 12;
const HAS_KANA = /[ぁ-ゖァ-ヺ]/;
const CHINESE_COMMA = "，";
// A page about learning Chinese quotes simplified text on purpose, so its characters are not a sign; the language and
// the days still are.
const CHINESE_STUDY = /中国語|簡体字|ピンイン|拼音|HSK|中検/;
const MIN_SIMPLIFIED = 3;
const KANA = /[ぁ-ゖァ-ヺ]/g;
const MIN_KANA = 200;
const SHOP_WORDS = /カート|買い物かご|ショッピング|購入|税込|送料/;
// The lang attribute itself, not one ending in -lang such as data-lang.
const CHINESE_LANG = /(?<![\w-])lang=["']?zh/i;
// 天 counts days in Chinese; Japanese writes 日 (「365天受付」 on a Japanese page). Japanese words starting with 天 (天体,
// 天然 …) follow numbers too, so only what Chinese writes after a day count, or the end of a phrase, counts.
const AFTER_DAYS = ["受付", "营业", "以内", "内", "后", "後", "左右", "无理由", "退", "包"];
const CHINESE_DAYS = new RegExp(`(?<!\\d)\\d{1,4}天(?=${AFTER_DAYS.join("|")}|[、。，,！!？?\\s）)」]|$)`);

/**
 * @param {import("../types.js").PageData} page
 * @returns {import("../types.js").Finding[]}
 */
export function checkSimplifiedChinese(page) {
  const kana = (page.text.match(KANA) ?? []).length;
  if (kana < MIN_KANA || !SHOP_WORDS.test(page.text)) return [];
  const signs = chineseSigns(page, kana);
  if (signs.length === 0) return [];
  return [finding("shop_simplified_chinese", signs.length > 1 ? "medium" : "low", "page", { count: signs.length }, signs)];
}

/**
 * @param {import("../types.js").PageData} page
 * @param {number} kana  how many kana the text has
 * @returns {string[]}  one evidence line per kind of sign
 */
function chineseSigns(page, kana) {
  // Chinese uses its characters and 天 for days as a matter of course: only the Japanese lines are read, and a page
  // written mostly in Chinese is not read at all.
  const japanese = japaneseLines(page.text);
  const occurrences = [...japanese].filter((char) => SIMPLIFIED_ONLY.has(char));
  const simplified = [...new Set(occurrences)];
  const han = (page.text.match(HAN) ?? []).length;
  const chineseSection = occurrences.length > kana * MAX_SIMPLIFIED_PER_KANA || han > kana * MAX_HAN_PER_KANA;
  const signs = [];
  if (simplified.length >= MIN_SIMPLIFIED && !chineseSection && !CHINESE_STUDY.test(page.text)) {
    signs.push(`simplified: ${simplified.slice(0, 10).join(" ")}`);
  }
  if (CHINESE_LANG.test(htmlTag(page.html))) signs.push('<html lang="zh…">');
  const days = CHINESE_DAYS.exec(japanese);
  if (days && !chineseSection) signs.push(days[0]);
  return signs;
}

/**
 * @param {string} text
 * @returns {string}  the text without its lines of Chinese
 */
function japaneseLines(text) {
  const isChinese = (/** @type {string} */ line) =>
    !HAS_KANA.test(line) && (line.includes(CHINESE_COMMA) || (line.match(HAN) ?? []).length >= MIN_HAN_IN_CHINESE_LINE);
  return text
    .split("\n")
    .filter((line) => !isChinese(line))
    .join("\n");
}

/**
 * @param {string} html
 * @returns {string}  the opening <html …> tag, or "" when there is none
 */
function htmlTag(html) {
  const start = html.search(/<html\b/i);
  return start < 0 ? "" : html.slice(start, html.indexOf(">", start) + 1);
}
