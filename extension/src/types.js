// Shared JSDoc types. This file contains no runtime code.

/**
 * @typedef {object} DomResult
 * @property {number} count
 * @property {Record<string, string[]>} attributes  attribute name -> values of the first matched elements
 * @property {string[]} texts  textContent of the first matched elements
 */

/**
 * @typedef {object} DomQuery
 * @property {string} selector
 * @property {string[]} attributes
 * @property {boolean} text
 */

/**
 * @typedef {object} ScriptInfo
 * @property {string | null} src  absolute URL, or null for an inline script
 * @property {string} integrity
 * @property {string} content  inline body, or the fetched body (may be truncated or empty)
 * @property {boolean} fetched  the whole external body was read, so its hash identifies the file
 */

/**
 * @typedef {object} InputField  attributes of a visible form field; its value is never read
 * @property {string} tag
 * @property {string} type
 * @property {string} name
 * @property {string} id
 * @property {string} autocomplete
 * @property {string} hints  placeholder, aria-label and data-encrypted-name, joined
 */

/**
 * @typedef {object} FormInfo
 * @property {string} action  absolute URL
 * @property {string} method
 * @property {boolean} hasPassword
 */

/**
 * @typedef {object} PageData
 * @property {string} url
 * @property {string} protocol
 * @property {string} origin
 * @property {Record<string, string> | null} headers  lower-cased names; null when they could not be read
 * @property {string[]} metaCsp
 * @property {Record<string, string[]>} meta  lower-cased name/property -> contents
 * @property {ScriptInfo[]} scripts
 * @property {string[]} stylesheets
 * @property {string[]} iframes
 * @property {string[]} links  hrefs of anchors that point to a known payment host
 * @property {string[]} images
 * @property {FormInfo[]} forms
 * @property {InputField[]} inputs
 * @property {Record<string, string>} cookies  cookies readable from JavaScript
 * @property {string} html
 * @property {string} text
 * @property {Record<string, DomResult>} dom
 * @property {Record<string, unknown>} globals  JavaScript property path -> value seen in the page
 */

/**
 * @typedef {"high" | "medium" | "low" | "info" | "good"} Severity
 */

/**
 * @typedef {object} Finding
 * @property {string} id  message key, see popup/i18n.js
 * @property {Severity} severity
 * @property {string} area  transport | headers | server | payment | backend | cms | libraries | eol | page
 * @property {Record<string, string | number>} params
 * @property {string[]} evidence
 * @property {BackendSignal[]} [signals]  weighted evidence, for inferred backends
 */

/**
 * @typedef {object} BackendSignal
 * @property {string} note
 * @property {string} noteJa
 * @property {number} weight  how strongly this trace points at the backend (1-100)
 * @property {string} match  what was found in the page
 */

/**
 * @typedef {object} Backend
 * @property {string} name
 * @property {string} language
 * @property {"eol" | "legacy" | "managed" | "info"} status
 * @property {string} eol  end-of-life date, or ""
 * @property {string} source  link that documents the status, or ""
 * @property {number} confidence  sum of signal weights, capped at 100
 * @property {BackendSignal[]} signals
 */

/**
 * @typedef {object} Technology
 * @property {string} name
 * @property {string} version
 * @property {number} confidence
 * @property {number[]} categories
 * @property {string} website
 * @property {string[]} evidence
 * @property {string} [impliedBy]  when set, no trace of this technology was seen; another one implies it
 */

/**
 * @typedef {object} Vulnerability
 * @property {string} severity
 * @property {string} summary
 * @property {string[]} cves
 * @property {string[]} info
 */

/**
 * @typedef {object} Library
 * @property {string} component
 * @property {string} version
 * @property {Vulnerability[]} vulnerabilities
 * @property {string[]} evidence
 */

export {};
