import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markupOnly } from "../extension/src/engine/markup.js";

describe("markup without text", () => {
  it("keeps tags with their attributes and comments, and drops text", () => {
    assert.equal(
      markupOnly('<p class="x">Teeda の <code>xmlns:te="http://www.seasar.org/"</code></p><!-- c -->'),
      '<p class="x">\n<code>\n</code>\n</p>\n<!-- c -->',
    );
  });

  it("reads a > inside a quoted attribute value as part of the tag", () => {
    assert.equal(markupOnly(`<a title="a > b" data-x='1>2'>t</a>`), `<a title="a > b" data-x='1>2'>\n</a>`);
  });

  it("does not read the content of scripts, styles, titles, text areas or noscript as markup", () => {
    for (const name of ["script", "style", "title", "textarea", "noscript", "SCRIPT"]) {
      assert.equal(markupOnly(`<${name}><meta name="_csrf_header"></${name}><p>`), `<${name}>\n</${name}>\n<p>`, name);
    }
  });

  it("treats < that does not start a tag as text", () => {
    assert.equal(markupOnly("1 < 2 and a<=b and <3 <!DOCTYPE html>"), "<!DOCTYPE html>");
    assert.equal(markupOnly("a </3 b <p>"), "<p>", "</ followed by a non-letter is text");
  });

  it("does not take an apostrophe inside an unquoted value for the start of a quote", () => {
    assert.equal(markupOnly("<img alt=it's><p>x</p>"), "<img alt=it's>\n<p>\n</p>");
  });

  it("keeps a tag or comment cut off at the end, as truncated HTML can be", () => {
    assert.equal(markupOnly('<p>text <a href="/x'), '<p>\n<a href="/x');
    assert.equal(markupOnly("<p><!-- open"), "<p>\n<!-- open");
  });

  it("is empty for text alone", () => {
    assert.equal(markupOnly("just text, no tags"), "");
  });
});
