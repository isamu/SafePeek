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

// A storefront offers to buy; a page about running a shop (a cart platform's own site, a guide) only talks about it.
const BUY_ACTION = /カートに入れる|カートへ入れる|カートに追加|買い物かごに入れる|買い物かごへ|購入手続き|今すぐ購入|購入する/;

/**
 * @param {string} text  the page's visible text
 * @returns {boolean}
 */
export function offersToBuy(text) {
  return BUY_ACTION.test(text);
}

/**
 * @param {string} text  the page's visible text
 * @returns {boolean}
 */
export function isJapaneseShop(text) {
  return countKana(text) >= MIN_KANA && SHOP_WORDS.test(text);
}
