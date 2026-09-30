// Decides which form fields ask for a payment card: its number, security code or expiry.

const CARD_AUTOCOMPLETE = /^cc-(number|csc|exp|exp-month|exp-year)$/i;
const NUMBER_HINT = /card.?num|cc.?num|creditcard|card.?no(?![a-z])|クレジットカード|カード番号/i;
const SECURITY_HINT = /cvc|cvv|(?<![a-z])csc(?![a-z])|security.?code|セキュリティコード/i;
const EXPIRY_HINT = /expir|(?<![a-z])(?:cc.?)?exp.?(?:month|year|date|mm|yy)|有効期限/i;
// Fields that share card vocabulary but hold something else: loyalty/membership/gift cards and one-time codes.
const NOT_CARD_HINT = /(?<![a-z])(point|member|gift|loyalty|coupon|otp)|one.?time|sms|ポイント|会員|ギフト|クーポン|ワンタイム|認証/i;

/**
 * @param {import("../types.js").InputField} field
 * @returns {"number" | "security" | "expiry" | null}  what the field asks for, when it is part of a card
 */
export function cardFieldKind(field) {
  const autocomplete = CARD_AUTOCOMPLETE.exec(field.autocomplete.trim());
  if (autocomplete) return autocompleteKind(autocomplete[1].toLowerCase());
  const hints = [field.name, field.id, field.hints].join(" ");
  if (NOT_CARD_HINT.test(hints)) return null;
  if (SECURITY_HINT.test(hints)) return "security";
  if (NUMBER_HINT.test(hints)) return "number";
  return EXPIRY_HINT.test(hints) ? "expiry" : null;
}

/**
 * @param {string} token  the part after "cc-"
 * @returns {"number" | "security" | "expiry"}
 */
function autocompleteKind(token) {
  if (token === "number") return "number";
  return token === "csc" ? "security" : "expiry";
}

/**
 * The fields that take a payment card. An expiry field alone is not one (coupons and points expire too).
 * In a form with a password field — a login — a "card number" is usually a membership card, so there it
 * counts only when the same form also asks for a security code or an expiry date.
 * @param {import("../types.js").InputField[]} inputs
 * @param {import("../types.js").FormInfo[]} forms
 * @returns {import("../types.js").InputField[]}
 */
export function cardFields(inputs, forms) {
  const kinds = inputs.map((field) => ({ field, kind: cardFieldKind(field) }));
  const confirmed = (/** @type {number} */ form) => kinds.some((k) => k.field.form === form && (k.kind === "security" || k.kind === "expiry"));
  return kinds
    .filter(({ field, kind }) => {
      if (kind === null || (kind === "expiry" && !CARD_AUTOCOMPLETE.test(field.autocomplete.trim()))) return false;
      return !forms[field.form]?.hasPassword || confirmed(field.form);
    })
    .map(({ field }) => field);
}
