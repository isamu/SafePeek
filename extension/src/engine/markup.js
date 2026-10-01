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
const COMMENT_END = "--!?>";
const CDATA_START = "<![CDATA[";
const CDATA_END = "]]>";
const FOREIGN_ROOTS = new Set(["svg", "math"]);

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
  let foreignDepth = 0;
  let at = html.indexOf("<");
  while (at >= 0) {
    const token = foreignDepth > 0 && html.startsWith(CDATA_START, at) ? null : tokenAt(html, at);
    if (token) tokens.push(token);
    foreignDepth = token ? nextForeignDepth(html, token, foreignDepth) : foreignDepth;
    at = html.indexOf("<", nextMarkup(html, at, token));
  }
  return tokens;
}

/**
 * @param {string} html
 * @param {number} at
 * @param {MarkupToken | null} token  null for text, or for a CDATA section, which is text inside SVG and MathML
 * @returns {number}  where to look for the next "<"
 */
function nextMarkup(html, at, token) {
  if (token) return contentEnd(html, token);
  if (!html.startsWith(CDATA_START, at)) return at + 1;
  const close = html.indexOf(CDATA_END, at + CDATA_START.length);
  return close < 0 ? html.length : close + CDATA_END.length;
}

/**
 * How deep inside SVG or MathML the next token is, where a CDATA section is text rather than a bogus comment. The
 * HTML islands inside them (foreignObject, annotation-xml) are not followed: CDATA there is read as text too, which
 * can only hide markup, never invent it.
 * @param {string} html
 * @param {MarkupToken} token
 * @param {number} depth
 * @returns {number}
 */
function nextForeignDepth(html, token, depth) {
  const text = html.slice(token.start, token.end);
  const name = TAG_NAME.exec(text)?.[1]?.toLowerCase() ?? "";
  if (!FOREIGN_ROOTS.has(name) || !token.emitted) return depth;
  if (token.kind === "endTag") return Math.max(0, depth - 1);
  return token.kind === "startTag" && !text.endsWith("/>") ? depth + 1 : depth;
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
  const abrupt = [">", "->"].find((s) => html.startsWith(s, body));
  if (abrupt) return { kind: "comment", start: open, end: body + abrupt.length, emitted: true };
  // One search for either ending: searching for each separately rescans the rest of the page for every comment.
  const close = new RegExp(COMMENT_END, "g");
  close.lastIndex = body;
  const match = close.exec(html);
  return { kind: "comment", start: open, end: match ? match.index + match[0].length : html.length, emitted: true };
}

/**
 * @param {string} html
 * @param {number} open
 * @param {"startTag" | "endTag"} kind
 * @returns {MarkupToken}
 */
function tag(html, open, kind) {
  // The first letter of the name is already read.
  const { end } = scanTag(html, open + (kind === "endTag" ? "</a".length : "<a".length));
  return end < 0 ? { kind, start: open, end: html.length, emitted: false } : { kind, start: open, end, emitted: true };
}

/**
 * The attributes of one start tag, as the tokenizer reads them: names lower-cased, a repeated name dropped.
 * Character references in values are left as written.
 * @param {string} startTag  the text of a start tag, from "<"
 * @returns {{ name: string, value: string }[]}
 */
export function tagAttributes(startTag) {
  const seen = new Set();
  return scanTag(startTag, "<a".length)
    .attributes.map((a) => ({ name: lowerAscii(startTag.slice(a.nameStart, a.nameEnd)), value: startTag.slice(a.valueStart, a.valueEnd) }))
    .filter((a) => !seen.has(a.name) && seen.add(a.name));
}

/**
 * @typedef {object} AttributeSpan
 * @property {number} nameStart
 * @property {number} nameEnd
 * @property {number} valueStart
 * @property {number} valueEnd
 */

/**
 * @param {string} html
 * @param {number} from  just after the first letter of the tag's name
 * @returns {{ end: number, attributes: AttributeSpan[] }}  end is just after the tag, or -1 when the input ends first
 */
function scanTag(html, from) {
  /** @type {AttributeSpan[]} */
  const attributes = [];
  /** @type {TagState} */
  let state = "tagName";
  for (let i = from; i < html.length; i++) {
    const step = TAG_STATES[state](html[i] ?? "");
    record(attributes, step.add, i);
    if (step.state === "end") return { end: i + 1, attributes };
    state = step.state;
  }
  return { end: -1, attributes };
}

/**
 * @param {AttributeSpan[]} attributes
 * @param {Step["add"]} add
 * @param {number} at
 */
function record(attributes, add, at) {
  if (add === "newName") attributes.push({ nameStart: at, nameEnd: at + 1, valueStart: 0, valueEnd: 0 });
  const current = attributes.at(-1);
  if (!current || add === undefined || add === "newName") return;
  if (add === "name") current.nameEnd = at + 1;
  if (add === "value" && current.valueEnd === 0) current.valueStart = at;
  if (add === "value") current.valueEnd = at + 1;
}

/**
 * @param {string} text
 * @returns {string}
 */
function lowerAscii(text) {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** @typedef {"tagName" | "beforeName" | "name" | "afterName" | "beforeValue" | "doubleQuoted" | "singleQuoted" | "unquoted" | "selfClosing"} TagState */
/** @typedef {{ state: TagState | "end", add?: "newName" | "name" | "value" }} Step */

/** @type {Record<TagState, (char: string) => Step>} */
const TAG_STATES = {
  tagName: (c) => boundary(c) ?? { state: WHITESPACE.test(c) ? "beforeName" : "tagName" },
  // A quote or "=" here starts an attribute name; only "=" after a name leads to a value.
  beforeName: (c) => boundary(c) ?? (WHITESPACE.test(c) ? { state: "beforeName" } : { state: "name", add: "newName" }),
  name: (c) => boundary(c) ?? afterNameChar(c, "name"),
  afterName: (c) => boundary(c) ?? afterNameChar(c, "newName"),
  beforeValue: (c) => valueStart(c),
  // The spec's "after attribute value (quoted)" state reads every character as "before attribute name" does.
  doubleQuoted: (c) => (c === '"' ? { state: "beforeName" } : { state: "doubleQuoted", add: "value" }),
  singleQuoted: (c) => (c === "'" ? { state: "beforeName" } : { state: "singleQuoted", add: "value" }),
  unquoted: (c) => unquotedChar(c),
  selfClosing: (c) => (c === ">" ? { state: "end" } : TAG_STATES.beforeName(c)),
};

/**
 * @param {string} char
 * @returns {Step | undefined}
 */
function boundary(char) {
  if (char === ">") return { state: "end" };
  return char === "/" ? { state: "selfClosing" } : undefined;
}

/**
 * In an attribute name, or after one: "=" leads to a value, whitespace ends the name, anything else is a name.
 * @param {string} char
 * @param {"name" | "newName"} other  whether another character continues this name or starts the next
 * @returns {Step}
 */
function afterNameChar(char, other) {
  if (char === "=") return { state: "beforeValue" };
  return WHITESPACE.test(char) ? { state: "afterName" } : { state: "name", add: other };
}

/**
 * @param {string} char
 * @returns {Step}
 */
function valueStart(char) {
  if (char === '"') return { state: "doubleQuoted" };
  if (char === "'") return { state: "singleQuoted" };
  if (char === ">") return { state: "end" };
  return WHITESPACE.test(char) ? { state: "beforeValue" } : { state: "unquoted", add: "value" };
}

/**
 * @param {string} char
 * @returns {Step}
 */
function unquotedChar(char) {
  if (char === ">") return { state: "end" };
  return WHITESPACE.test(char) ? { state: "beforeName" } : { state: "unquoted", add: "value" };
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
