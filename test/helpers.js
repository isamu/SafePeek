// Test helpers: page data builders and the real bundled databases.

import { readFileSync } from "node:fs";
import { parseRetireRepository } from "../extension/src/engine/retire.js";

const data = (/** @type {string} */ name) => readFileSync(new URL(`../extension/data/${name}`, import.meta.url), "utf8");

/** @returns {import("../extension/src/analyze.js").Databases} */
export function loadDb() {
  return {
    technologies: JSON.parse(data("technologies.json")),
    categories: JSON.parse(data("categories.json")),
    retire: parseRetireRepository(data("retire.json")),
    eol: JSON.parse(data("eol.json")),
    providers: JSON.parse(data("payment-providers.json")).providers,
    backends: JSON.parse(data("backend-signatures.json")).backends,
    wordpress: JSON.parse(data("wordpress.json")),
  };
}

/**
 * @param {Partial<import("../extension/src/types.js").PageData>} [overrides]
 * @returns {import("../extension/src/types.js").PageData}
 */
export function makePage(overrides = {}) {
  return {
    url: "https://shop.example/",
    protocol: "https:",
    origin: "https://shop.example",
    headers: {
      "strict-transport-security": "max-age=31536000",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
    metaCsp: [],
    meta: {},
    scripts: [],
    stylesheets: [],
    iframes: [],
    links: [],
    images: [],
    forms: [],
    inputs: [],
    cookies: {},
    html: "<html><body></body></html>",
    text: "",
    dom: {},
    globals: {},
    requests: [],
    contactedHosts: [],
    ...overrides,
  };
}

/**
 * @param {string} src
 * @param {string} [content]
 * @returns {import("../extension/src/types.js").ScriptInfo}
 */
export function script(src, content = "") {
  return { src, integrity: "", content, fetched: content !== "" };
}

/**
 * @param {string} name
 * @param {Partial<import("../extension/src/types.js").InputField>} [overrides]
 * @returns {import("../extension/src/types.js").InputField}
 */
export function inputField(name, overrides = {}) {
  return { tag: "input", type: "text", name, id: name, autocomplete: "", hints: "", form: -1, inPasswordForm: false, ...overrides };
}

export const noHash = async () => "";
