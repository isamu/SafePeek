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
 * A form with a password field — a login or sign-up — holds a payment card only when it asks for both a card
 * number and a security code or expiry date; anything less there (a membership card number, a login
 * "security code") is not reported. This deliberately misses a login form that takes a bare card number.
 * @param {import("../types.js").InputField[]} inputs
 * @returns {import("../types.js").InputField[]}
 */
export function cardFields(inputs) {
  const kinds = inputs.map((field) => ({ field, kind: countedKind(field) }));
  const formHas = (/** @type {number} */ form, /** @type {(kind: string | null) => boolean} */ test) =>
    kinds.some((k) => k.field.form === form && test(k.kind));
  const holdsCard = (/** @type {number} */ form) =>
    formHas(form, (kind) => kind === "number") && formHas(form, (kind) => kind === "security" || kind === "expiry");
  return kinds.filter(({ field, kind }) => kind !== null && (!field.inPasswordForm || holdsCard(field.form))).map(({ field }) => field);
}

/**
 * The kind a field counts as. An expiry date counts only when the field says so with cc-exp* autocomplete;
 * a label such as 有効期限 alone may belong to a coupon, points or a membership card.
 * @param {import("../types.js").InputField} field
 * @returns {"number" | "security" | "expiry" | null}
 */
function countedKind(field) {
  const kind = cardFieldKind(field);
  return kind === "expiry" && !CARD_AUTOCOMPLETE.test(field.autocomplete.trim()) ? null : kind;
}
