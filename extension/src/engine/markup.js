// The page's markup without its text: start tags (with their attributes) and comments, found as the HTML Standard's
// tokenizer finds them. A trace a running app leaves in its markup (an XML namespace, a meta tag, a comment, a URL in
// an attribute) is looked for here, so the same words in a page's text (an article showing the code) are never taken
// for one. https://html.spec.whatwg.org/multipage/parsing.html#tokenization
// Foreign content (SVG, MathML) is read as HTML content: its <style> and <title> are skipped as text, which can only
// miss a trace, never invent one.

/**
 * @typedef {object} MarkupToken
 * @property {"startTag" | "endTag" | "comment" | "doctype"} kind
 * @property {number} start
 * @property {number} end
 * @property {boolean} emitted  false where a browser drops the token: "</>", or a tag cut off at the end of the input
 */

const RAW_TEXT_ELEMENTS = new Set(["style", "xmp", "iframe", "noembed", "noframes", "noscript", "title", "textarea"]);
const WHITESPACE = /^[\t\n\f\r ]$/;
const ALPHA = /^[A-Za-z]$/;
const TAG_NAME = /^<\/?([A-Za-z][^\t\n\f\r />]*)/;
const DOCTYPE = "DOCTYPE";

/**
 * @param {string} html
 * @returns {{ tags: string, comments: string }}  the start tags and the comments, one per line
 */
export function readMarkup(html) {
  const tokens = markupTokens(html);
  const text = (/** @type {MarkupToken["kind"]} */ kind) =>
    tokens
      .filter((t) => t.kind === kind)
      .map((t) => html.slice(t.start, t.end))
      .join("\n");
  return { tags: text("startTag"), comments: text("comment") };
}

/**
 * @param {string} html
 * @returns {MarkupToken[]}
 */
export function markupTokens(html) {
  /** @type {MarkupToken[]} */
  const tokens = [];
  let at = html.indexOf("<");
  while (at >= 0) {
    const token = tokenAt(html, at);
    if (token) tokens.push(token);
    at = html.indexOf("<", token ? contentEnd(html, token) : at + 1);
  }
  return tokens;
}

/**
 * @param {string} html
 * @param {number} open  the index of a "<"
 * @returns {MarkupToken | null}  null when the "<" is text
 */
function tokenAt(html, open) {
  const next = html[open + 1] ?? "";
  if (next === "!") return declaration(html, open);
  if (next === "?") return bogusComment(html, open);
  if (next === "/") return endTagOpen(html, open);
  return ALPHA.test(next) ? tag(html, open, "startTag") : null;
}

/**
 * @param {string} html
 * @param {number} open
 * @returns {MarkupToken | null}
 */
function endTagOpen(html, open) {
  const next = html[open + 2];
  if (next === undefined) return null;
  if (next === ">") return { kind: "endTag", start: open, end: open + "</>".length, emitted: false };
  return ALPHA.test(next) ? tag(html, open, "endTag") : bogusComment(html, open);
}

/**
 * @param {string} html
 * @param {number} open
 * @returns {MarkupToken}
 */
function declaration(html, open) {
  if (html.startsWith("<!--", open)) return comment(html, open);
  const isDoctype = html.slice(open + 2, open + 2 + DOCTYPE.length).toUpperCase() === DOCTYPE;
  // CDATA in HTML content, and anything else after "<!", is a bogus comment.
  return { ...bogusComment(html, open), kind: isDoctype ? "doctype" : "comment" };
}

/**
 * @param {string} html
 * @param {number} open
 * @returns {MarkupToken}  a comment that ends at the next ">"
 */
function bogusComment(html, open) {
  const close = html.indexOf(">", open + 2);
  return { kind: "comment", start: open, end: close < 0 ? html.length : close + 1, emitted: true };
}

/**
 * "<!-->" and "<!--->" are whole comments; otherwise one ends at "-->" or "--!>".
 * @param {string} html
 * @param {number} open
 * @returns {MarkupToken}
 */
function comment(html, open) {
  const body = open + "<!--".length;
  const abrupt = [">", "->"].filter((s) => html.startsWith(s, body)).map((s) => body + s.length);
  const closing = ["-->", "--!>"].map((s) => [html.indexOf(s, body), s.length]).filter(([at]) => (at ?? -1) >= 0);
  const end = Math.min(...abrupt, ...closing.map(([at = 0, length = 0]) => at + length), html.length);
  return { kind: "comment", start: open, end, emitted: true };
}

/**
 * @param {string} html
 * @param {number} open
 * @param {"startTag" | "endTag"} kind
 * @returns {MarkupToken}
 */
function tag(html, open, kind) {
  /** @type {TagState} */
  let state = "tagName";
  // The first letter of the name is already read.
  for (let i = open + (kind === "endTag" ? "</a".length : "<a".length); i < html.length; i++) {
    state = nextState(state, html[i] ?? "");
    if (state === "end") return { kind, start: open, end: i + 1, emitted: true };
  }
  return { kind, start: open, end: html.length, emitted: false };
}

/** @typedef {"tagName" | "beforeAttrName" | "attrName" | "beforeValue" | "doubleQuoted" | "singleQuoted" | "unquoted" | "selfClosing" | "end"} TagState */

/** @type {Record<Exclude<TagState, "end">, (char: string) => TagState>} */
const TAG_STATES = {
  tagName: (c) => endOrSlash(c) ?? (WHITESPACE.test(c) ? "beforeAttrName" : "tagName"),
  // A quote or "=" here starts an attribute name; only "=" after a name leads to a value.
  beforeAttrName: (c) => endOrSlash(c) ?? (WHITESPACE.test(c) ? "beforeAttrName" : "attrName"),
  // The spec's "after attribute name" state reads every character as this one does.
  attrName: (c) => endOrSlash(c) ?? afterName(c),
  beforeValue: (c) => valueStart(c),
  doubleQuoted: (c) => (c === '"' ? "beforeAttrName" : "doubleQuoted"),
  singleQuoted: (c) => (c === "'" ? "beforeAttrName" : "singleQuoted"),
  unquoted: (c) => (c === ">" ? "end" : unquotedNext(c)),
  selfClosing: (c) => (c === ">" ? "end" : TAG_STATES.beforeAttrName(c)),
};

/**
 * @param {TagState} state
 * @param {string} char
 * @returns {TagState}
 */
function nextState(state, char) {
  return state === "end" ? "end" : TAG_STATES[state](char);
}

/**
 * @param {string} char
 * @returns {TagState | undefined}
 */
function endOrSlash(char) {
  if (char === ">") return "end";
  return char === "/" ? "selfClosing" : undefined;
}

/**
 * @param {string} char
 * @returns {TagState}
 */
function afterName(char) {
  return char === "=" ? "beforeValue" : "attrName";
}

/**
 * @param {string} char
 * @returns {TagState}
 */
function valueStart(char) {
  if (char === '"') return "doubleQuoted";
  if (char === "'") return "singleQuoted";
  if (char === ">") return "end";
  return WHITESPACE.test(char) ? "beforeValue" : "unquoted";
}

/**
 * @param {string} char
 * @returns {TagState}
 */
function unquotedNext(char) {
  return WHITESPACE.test(char) ? "beforeAttrName" : "unquoted";
}

/**
 * Where markup starts again after a token: after the start tag of an element whose content is text (a script, a
 * style, a title …), at its end tag, so that content is never read as markup.
 * @param {string} html
 * @param {MarkupToken} token
 * @returns {number}
 */
function contentEnd(html, token) {
  if (token.kind !== "startTag") return token.end;
  const name = TAG_NAME.exec(html.slice(token.start, token.end))?.[1]?.toLowerCase() ?? "";
  if (name === "plaintext") return html.length;
  if (name === "script") return scriptEnd(html, token.end);
  return RAW_TEXT_ELEMENTS.has(name) ? endTagAt(html, name, token.end) : token.end;
}

/**
 * @param {string} html
 * @param {string} name  one of the fixed element names above
 * @param {number} from
 * @returns {number}  the index of the element's end tag, or the end of the input
 */
function endTagAt(html, name, from) {
  const endTag = new RegExp(`</${name}[\\t\\n\\f\\r />]`, "gi");
  endTag.lastIndex = from;
  return endTag.exec(html)?.index ?? html.length;
}

// Script data, its escaped form (after "<!--") and its double-escaped form (after "<script" inside that).
const SCRIPT_MARKERS = "<!--|-->|</script[\\t\\n\\f\\r />]|<script[\\t\\n\\f\\r />]";
/** @type {Record<string, Record<string, string>>} */
const SCRIPT_STATES = {
  data: { "<!--": "escaped", "</script": "end" },
  escaped: { "-->": "data", "</script": "end", "<script": "double" },
  double: { "-->": "data", "</script": "escaped" },
};

/**
 * @param {string} html
 * @param {number} from  just after the <script> start tag
 * @returns {number}  the index of the </script> that ends it, or the end of the input
 */
function scriptEnd(html, from) {
  const markers = new RegExp(SCRIPT_MARKERS, "gi");
  markers.lastIndex = from;
  let state = "data";
  for (let match = markers.exec(html); match; match = markers.exec(html)) {
    const marker = /script/i.test(match[0]) ? match[0].slice(0, -1).toLowerCase() : match[0];
    state = SCRIPT_STATES[state]?.[marker] ?? state;
    if (state === "end") return match.index;
    // Markers can overlap ("<!-->" both opens and closes), so the search goes on from the next character.
    markers.lastIndex = match.index + 1;
  }
  return html.length;
}
