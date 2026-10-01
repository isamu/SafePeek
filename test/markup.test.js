import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Tokenizer, TokenizerMode } from "parse5";
import { markupTokens, readMarkup } from "../extension/src/engine/markup.js";

// Generous, for a loaded machine: the reader takes milliseconds here, and a search per comment took seconds.
const LINEAR_BUDGET_MS = 3000;

describe("markup without text", () => {
  it("keeps start tags with their attributes, and comments, and drops text", () => {
    const markup = readMarkup('<p class="x">Teeda の <code>xmlns:te="http://www.seasar.org/"</code></p><!-- c -->');
    assert.deepEqual(markup, { tags: '<p class="x">\n<code>', comments: "<!-- c -->" });
  });

  it("reads a > inside a quoted attribute value as part of the tag", () => {
    assert.equal(readMarkup(`<a title="a > b" data-x='1>2'>t</a>`).tags, `<a title="a > b" data-x='1>2'>`);
  });

  it("opens a quoted value only after =, so a stray quote does not swallow the text after the tag", () => {
    const markup = readMarkup('<div "x>xmlns:te="http://www.seasar.org/teeda/extension"');
    assert.equal(markup.tags, '<div "x>');
    assert.equal(readMarkup("<img alt=it's><p>x</p>").tags, "<img alt=it's>\n<p>");
    assert.equal(readMarkup('<a x""> y">').tags, '<a x"">', "a quote right after a name is part of the name");
  });

  it("does not read the content of scripts, styles, titles, text areas, noscript or plaintext as markup", () => {
    for (const name of ["script", "style", "title", "textarea", "noscript", "SCRIPT"]) {
      assert.equal(readMarkup(`<${name}><meta name="_csrf_header"></${name}><p>`).tags, `<${name}>\n<p>`, name);
    }
    assert.equal(readMarkup('<plaintext><meta name="_csrf_header"></plaintext><p>').tags, "<plaintext>");
  });

  it("keeps tags and comments apart, so a tag written inside a comment is not a tag", () => {
    const markup = readMarkup('<!-- <meta name="_csrf_header"> --><![CDATA[<meta name="_csrf_header">]]><p>');
    assert.equal(markup.tags, "<p>");
    assert.equal(markup.comments.split("\n").length, 2);
  });

  it("reads a CDATA section inside SVG or MathML as text, and one outside as a bogus comment", () => {
    assert.deepEqual(readMarkup('<svg><![CDATA[x> <meta name="_csrf_header"> <!-- c -->]]></svg><p>'), { tags: "<svg>\n<p>", comments: "" });
    assert.equal(readMarkup("<math><mi><![CDATA[<b>]]></mi></math>").tags, "<math>\n<mi>");
    assert.equal(readMarkup("<svg/><![CDATA[x]]><p>").comments, "<![CDATA[x]]>", "a self-closed svg contains nothing");
    assert.equal(readMarkup("<svg></svg><![CDATA[x]]>").comments, "<![CDATA[x]]>");
  });

  it("reads a page full of comments in linear time", () => {
    const page = "<!-- c --><p>x</p>\n".repeat(25_000);
    const started = performance.now();
    assert.equal(readMarkup(page).comments.split("\n").length, 25_000);
    assert.ok(performance.now() - started < LINEAR_BUDGET_MS, `${Math.round(performance.now() - started)} ms`);
  });

  it("treats < that does not start a tag as text", () => {
    assert.equal(readMarkup("1 < 2 and a<=b and <3 </3 <!DOCTYPE html>").tags, "");
    assert.deepEqual(
      markupTokens("1 < 2 <!DOCTYPE html>").map((t) => t.kind),
      ["doctype"],
    );
  });

  it("keeps a tag cut off at the end, as truncated HTML can be, and marks it as one a browser would drop", () => {
    assert.equal(readMarkup('<p>text <a href="/x').tags, '<p>\n<a href="/x');
    assert.deepEqual(
      markupTokens('<a href="/x').map((t) => t.emitted),
      [false],
    );
  });
});

// Elements whose content the tree builder switches the tokenizer to text for, outside foreign content.
const TEXT_MODES = new Map([
  ["script", TokenizerMode.SCRIPT_DATA],
  ["plaintext", TokenizerMode.PLAINTEXT],
  ["title", TokenizerMode.RCDATA],
  ["textarea", TokenizerMode.RCDATA],
  ...["style", "xmp", "iframe", "noembed", "noframes", "noscript"].map((name) => /** @type {const} */ ([name, TokenizerMode.RAWTEXT])),
]);

/**
 * The tokens parse5 emits, as the same kind, start and end, driven the way its tree builder drives it in HTML content.
 * @param {string} html
 * @returns {string[]}
 */
function parse5Tokens(html) {
  /** @type {string[]} */
  const tokens = [];
  // parse5 counts the end of the input as a character, so a token it cuts off ends one past the input.
  /** @param {string} kind @param {{ location?: { startOffset: number, endOffset: number } | null }} token */
  const push = (kind, token) => tokens.push(`${kind} ${token.location?.startOffset}-${Math.min(token.location?.endOffset ?? -1, html.length)}`);
  const ignore = () => {};
  // The tree builder knows when it is inside SVG or MathML; this follows the reader's model of it (svg and math
  // elements only), so the comparison checks the tokenizer and not that model.
  let foreignDepth = 0;
  /** @type {Tokenizer} */
  const tokenizer = new Tokenizer(
    { sourceCodeLocationInfo: true },
    {
      onStartTag: (token) => {
        push("startTag", token);
        tokenizer.state = TEXT_MODES.get(token.tagName) ?? tokenizer.state;
        foreignDepth += FOREIGN_ROOTS.includes(token.tagName) && !token.selfClosing ? 1 : 0;
        tokenizer.inForeignNode = foreignDepth > 0;
      },
      onEndTag: (token) => {
        push("endTag", token);
        foreignDepth = Math.max(0, foreignDepth - (FOREIGN_ROOTS.includes(token.tagName) ? 1 : 0));
        tokenizer.inForeignNode = foreignDepth > 0;
      },
      onComment: (token) => push("comment", token),
      onDoctype: (token) => push("doctype", token),
      onEof: ignore,
      onCharacter: ignore,
      onNullCharacter: ignore,
      onWhitespaceCharacter: ignore,
    },
  );
  tokenizer.write(html, true);
  return tokens;
}

const FOREIGN_ROOTS = ["svg", "math"];

// Pieces that reach every tokenizer state the reader models, and the text elements' edges.
const PIECES = [
  "<",
  ">",
  "/",
  "</",
  "!",
  "?",
  "=",
  '"',
  "'",
  "-",
  " ",
  "\n",
  "\t",
  "a",
  "x",
  "div",
  "p",
  "<!--",
  "-->",
  "--!>",
  "<!",
  "<?",
  "<!DOCTYPE html>",
  "<!doctype",
  "<![CDATA[",
  "]]>",
  "<script",
  "</script",
  "<SCRIPT>",
  "<script>",
  "</script>",
  "<style>",
  "</style>",
  "<title>",
  "</title",
  "<textarea>",
  "<noscript>",
  "</noscript>",
  "<plaintext>",
  "<xmp>",
  "</xmp>",
  "<a ",
  "href=",
  'x""',
  'xmlns:te="http://www.seasar.org/"',
  "<meta name=_csrf_header>",
  "</>",
  "<!-->",
  "<!--->",
  "</ x>",
  "<svg>",
  "</svg>",
  "<svg/>",
  "<math>",
  "</math>",
];
const CASES = 4000;
const MAX_PIECES = 30;

/**
 * @param {number} seed
 * @returns {() => number}  a seeded generator of numbers in [0, 1) (mulberry32)
 */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

describe("markup tokens agree with parse5", () => {
  it("emits the same tokens at the same places over generated HTML", () => {
    const seed = Number(process.env.MARKUP_SEED ?? Date.now() % 2 ** 31);
    const next = random(seed);
    for (let n = 0; n < CASES; n++) {
      const html = Array.from({ length: 1 + Math.floor(next() * MAX_PIECES) }, () => PIECES[Math.floor(next() * PIECES.length)]).join("");
      const ours = markupTokens(html)
        .filter((t) => t.emitted)
        .map((t) => `${t.kind} ${t.start}-${t.end}`);
      assert.deepEqual(ours, parse5Tokens(html), `MARKUP_SEED=${seed} case ${n}: ${JSON.stringify(html)}`);
    }
  });
});
