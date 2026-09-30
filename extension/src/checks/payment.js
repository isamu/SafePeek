// How this page handles card numbers.

import { cardFields } from "./cardfield.js";
import { finding } from "./finding.js";
import { hostOf } from "./page.js";

/**
 * @typedef {object} Provider
 * @property {string} name
 * @property {string[]} hosts
 * @property {string[]} [tokenScripts]
 * @property {string[]} [cardFrames]  iframe URL patterns that hold card entry; when absent, any frame on its hosts does
 */

/**
 * @param {string} host
 * @param {Provider[]} providers
 * @returns {Provider | undefined}
 */
function providerForHost(host, providers) {
  return providers.find((p) => p.hosts.some((h) => host === h || host.endsWith("." + h)));
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
  if (!provider) return false;
  return !provider.cardFrames || provider.cardFrames.some((re) => new RegExp(re, "i").test(url));
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
  const redirectProviders = providersIn([...page.links, ...page.forms.map((f) => f.action)], providers);
  const scriptProviders = providersIn(scriptSrcs, providers);
  const tokenizer = providers.find((p) => (p.tokenScripts ?? []).some((re) => scriptSrcs.some((src) => new RegExp(re, "i").test(src))));

  const cardInputs = cardFields(page.inputs, page.forms);
  const findings = [];
  if (cardInputs.length > 0) findings.push(cardFieldFinding(cardInputs, tokenizer));
  if (iframeProviders.length > 0) {
    findings.push(finding("card_hosted_iframe", "good", "payment", { providers: iframeProviders.join(", ") }, cardFrames.slice(0, 5)));
  }
  if (redirectProviders.length > 0) findings.push(finding("payment_redirect", "good", "payment", { providers: redirectProviders.join(", ") }));
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
