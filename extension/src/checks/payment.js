// How this page handles card numbers.

import { cardFields } from "./cardfield.js";
import { finding } from "./finding.js";
import { hostOf } from "./page.js";

/**
 * @typedef {object} Provider
 * @property {string} name
 * @property {string[]} hosts
 * @property {string[]} [tokenScripts]
 * @property {string[]} [cardFrames]  iframe URL patterns known to hold card entry; only these make card_hosted_iframe
 * @property {string[]} [checkoutLinks]  link URL patterns that start a payment with the provider
 */

/**
 * @param {string} host
 * @param {Provider[]} providers
 * @returns {Provider | undefined}
 */
export function providerForHost(host, providers) {
  return providers.find((p) => p.hosts.some((h) => host === h || host.endsWith("." + h)));
}

/**
 * The provider whose tokenizer this script is: the script is on that provider's host and its URL matches one of that
 * provider's tokenScripts. A URL on another host that merely contains the pattern is not a tokenizer.
 * @param {string} src
 * @param {Provider[]} providers
 * @returns {Provider | undefined}
 */
export function tokenizerFor(src, providers) {
  const provider = providerForHost(hostOf(src), providers);
  return (provider?.tokenScripts ?? []).some((re) => new RegExp(re, "i").test(src)) ? provider : undefined;
}

/**
 * @param {string[]} urls
 * @param {Provider[]} providers
 * @returns {string[]}  provider names, unique
 */
function providersIn(urls, providers) {
  const names = urls.map((url) => providerForHost(hostOf(url), providers)?.name).filter((n) => n !== undefined);
  return [...new Set(names)];
}

/**
 * @param {string} url
 * @param {Provider[]} providers
 * @returns {boolean}
 */
function isCardFrame(url, providers) {
  const provider = providerForHost(hostOf(url), providers);
  return (provider?.cardFrames ?? []).some((re) => new RegExp(re, "i").test(url));
}

/**
 * A form that hands the customer to the provider to pay: it posts there and is not a login.
 * @param {import("../types.js").FormInfo} form
 * @param {Provider[]} providers
 * @returns {boolean}
 */
function isCheckoutForm(form, providers) {
  return form.method === "post" && !form.hasPassword && providerForHost(hostOf(form.action), providers) !== undefined;
}

/**
 * A link that starts a payment with the provider, not one to its information pages.
 * @param {string} url
 * @param {Provider[]} providers
 * @returns {boolean}
 */
function isCheckoutLink(url, providers) {
  const provider = providerForHost(hostOf(url), providers);
  return (provider?.checkoutLinks ?? []).some((re) => new RegExp(re, "i").test(url));
}

/**
 * @param {import("../types.js").PageData} page
 * @param {Provider[]} providers
 * @returns {import("../types.js").Finding[]}
 */
export function checkPayment(page, providers) {
  const scriptSrcs = page.scripts.map((s) => s.src ?? "").filter((s) => s !== "");
  const cardFrames = page.iframes.filter((url) => isCardFrame(url, providers));
  const iframeProviders = providersIn(cardFrames, providers);
  const paymentPaths = [
    ...page.links.filter((url) => isCheckoutLink(url, providers)),
    ...page.forms.filter((f) => isCheckoutForm(f, providers)).map((f) => f.action),
  ];
  const redirectProviders = providersIn(paymentPaths, providers);
  // A provider's other frames (buttons, wallets, fraud checks) show it is used, not where the card is typed.
  const scriptProviders = providersIn([...scriptSrcs, ...page.iframes], providers);
  const tokenizer = scriptSrcs.map((src) => tokenizerFor(src, providers)).find((p) => p !== undefined);

  const cardInputs = cardFields(page.inputs);
  const findings = [];
  if (cardInputs.length > 0) findings.push(cardFieldFinding(cardInputs, tokenizer));
  if (iframeProviders.length > 0) {
    findings.push(finding("card_hosted_iframe", "good", "payment", { providers: iframeProviders.join(", ") }, cardFrames.slice(0, 5)));
  }
  if (redirectProviders.length > 0) {
    findings.push(finding("payment_redirect", "good", "payment", { providers: redirectProviders.join(", ") }, paymentPaths.slice(0, 5)));
  }
  if (findings.length === 0 && scriptProviders.length > 0) {
    findings.push(finding("payment_scripts_only", "info", "payment", { providers: scriptProviders.join(", ") }));
  }
  if (findings.length === 0) findings.push(finding("no_card_form", "info", "payment"));
  return findings;
}

/**
 * @param {import("../types.js").InputField[]} cardFields
 * @param {Provider | undefined} tokenizer
 * @returns {import("../types.js").Finding}
 */
function cardFieldFinding(cardFields, tokenizer) {
  const evidence = cardFields.slice(0, 5).map(describeField);
  if (tokenizer) return finding("card_tokenized_on_page", "medium", "payment", { provider: tokenizer.name }, evidence);
  return finding("card_on_page", "high", "payment", {}, evidence);
}

/**
 * @param {import("../types.js").InputField} field
 * @returns {string}
 */
function describeField(field) {
  const attrs = /** @type {const} */ (["name", "id", "autocomplete"]).filter((a) => field[a]).map((a) => `${a}="${field[a]}"`);
  return `<${[field.tag, ...attrs].join(" ")}>`;
}
