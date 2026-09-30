// Whether a page reads as a Japanese shop: enough kana to be Japanese, and words only a shop uses.

const KANA = /[ぁ-ゖァ-ヺ]/g;
const MIN_KANA = 200;
const SHOP_WORDS = /カート|買い物かご|ショッピング|購入|税込|送料/;

/**
 * @param {string} text
 * @returns {number}
 */
export function countKana(text) {
  return (text.match(KANA) ?? []).length;
}

/**
 * @param {string} text  the page's visible text
 * @returns {boolean}
 */
export function isJapaneseShop(text) {
  return countKana(text) >= MIN_KANA && SHOP_WORDS.test(text);
}
