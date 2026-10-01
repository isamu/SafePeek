// Whether a page asks for a card number or a password in the page itself.

import { cardFieldKind, cardFields } from "./cardfield.js";

/**
 * @param {import("../types.js").PageData} page
 * @returns {boolean}
 */
export function asksForCardNumber(page) {
  return cardFields(page.inputs).some((f) => cardFieldKind(f) === "number");
}

/**
 * @param {import("../types.js").PageData} page
 * @returns {boolean}
 */
export function asksForPassword(page) {
  return page.inputs.some((i) => i.type.toLowerCase() === "password") || page.forms.some((f) => f.hasPassword);
}
