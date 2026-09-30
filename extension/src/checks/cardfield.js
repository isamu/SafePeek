// Decides whether a form field asks for a payment card number or its security code.

const CARD_AUTOCOMPLETE = /^cc-(number|csc|exp|exp-month|exp-year)$/i;
const CARD_HINTS = [
  /card.?num|cc.?num|creditcard|card.?no(?![a-z])/i,
  /cvc|cvv|(?<![a-z])csc(?![a-z])|security.?code/i,
  /クレジットカード|カード番号|セキュリティコード/,
];
// Fields that share card vocabulary but hold something else: loyalty/membership/gift cards and one-time codes.
const NOT_CARD_HINT = /point|ポイント|member|会員|gift|ギフト|loyalty|coupon|クーポン|otp|one.?time|sms|verif|認証|ワンタイム/i;

/**
 * @param {import("../types.js").InputField} field
 * @returns {boolean}
 */
export function isCardField(field) {
  if (CARD_AUTOCOMPLETE.test(field.autocomplete.trim())) return true;
  const hints = [field.name, field.id, field.hints].join(" ");
  return CARD_HINTS.some((re) => re.test(hints)) && !NOT_CARD_HINT.test(hints);
}
