// Part of the page collector (see collector.js): what it reads from the document and its same-origin frames. It
// makes no request.
//
// Classic script, injected before collector.js into the same isolated world.

(() => {
  const MAX_SCRIPTS = 40;
  const MAX_INPUTS = 200;
  const MAX_FORMS = 50;
  const MAX_FRAMES = 10;
  const SKIPPED_INPUT_TYPES = ["hidden", "submit", "button", "checkbox", "radio", "image", "reset", "file"];

  /**
   * External script URLs of the same-origin frames, so a tokenization script loaded inside a framed checkout is
   * seen. Only the URL: their bodies are not fetched and inline code is not read.
   * @param {Document[]} docs
   * @returns {import("../types.js").ScriptInfo[]}
   */
  function frameScripts(docs) {
    return docs
      .slice(1)
      .flatMap((doc) => [...doc.querySelectorAll("script[src]")])
      .map((el) => ({ src: absolute(el.getAttribute("src") ?? "", el.baseURI), integrity: el.getAttribute("integrity") ?? "", content: "", fetched: false }))
      .filter((script) => script.src !== "")
      .slice(0, MAX_SCRIPTS);
  }

  /** @returns {{ meta: Record<string, string[]>, metaCsp: string[] }} */
  function readMeta() {
    /** @type {Record<string, string[]>} */
    const meta = {};
    const metaCsp = [];
    for (const el of document.querySelectorAll("meta")) {
      const key = (el.getAttribute("name") || el.getAttribute("property") || "").toLowerCase();
      const content = el.getAttribute("content") ?? "";
      if (key) {
        meta[key] = meta[key] ?? [];
        meta[key].push(content);
      }
      if ((el.getAttribute("http-equiv") ?? "").toLowerCase() === "content-security-policy") metaCsp.push(content);
    }
    return { meta, metaCsp };
  }

  /**
   * The page and its same-origin frames, nested ones included, up to MAX_FRAMES. A frame on another origin (a
   * payment provider's) cannot be read and is judged by its URL instead; a same-origin frame is part of the site's
   * own page.
   * @returns {Document[]}
   */
  function documents() {
    const docs = [document];
    for (let i = 0; i < docs.length && docs.length <= MAX_FRAMES; i++) {
      for (const frame of docs[i].querySelectorAll("iframe, frame")) {
        const doc = readableDocument(frame);
        if (doc && docs.length <= MAX_FRAMES) docs.push(doc);
      }
    }
    return docs;
  }

  /**
   * @param {Element} frame
   * @returns {Document | null}  its document when the frame is on the same origin
   */
  function readableDocument(frame) {
    if (!isFrame(frame)) return null;
    try {
      const doc = frame.contentDocument;
      return doc?.documentElement ? doc : null;
    } catch {
      return null; // another origin
    }
  }

  /**
   * @param {Element} el
   * @returns {el is HTMLIFrameElement | HTMLFrameElement}
   */
  function isFrame(el) {
    return el.tagName === "IFRAME" || el.tagName === "FRAME";
  }

  /**
   * By tag name, so it also holds for elements of a frame, whose constructors differ from this window's.
   * @param {Element} el
   * @returns {el is HTMLInputElement | HTMLSelectElement}
   */
  function isField(el) {
    return el.tagName === "INPUT" || el.tagName === "SELECT";
  }

  /**
   * By form ownership, so a password field attached with form="…" from outside the <form> counts too.
   * @param {HTMLFormElement} form
   * @returns {boolean}
   */
  function hasPasswordField(form) {
    return formElements(form).some((el) => isField(el) && el.tagName === "INPUT" && el.type === "password");
  }

  // A form's named fields shadow its own properties and methods (<input name="action">, name="getAttribute"), so an
  // element that may be a form is read through the prototypes, never through its own properties.
  const ELEMENTS_GETTER = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "elements")?.get;
  const TEXT_GETTER = Object.getOwnPropertyDescriptor(Node.prototype, "textContent")?.get;

  /**
   * @param {HTMLFormElement} form
   * @returns {Element[]}
   */
  const formElements = (form) => [...(ELEMENTS_GETTER ? Reflect.apply(ELEMENTS_GETTER, form, []) : [])];

  /**
   * @param {Element} el
   * @param {string} name
   * @returns {string | null}
   */
  const attributeOf = (el, name) => Reflect.apply(Element.prototype.getAttribute, el, [name]);

  /**
   * @param {Element} el
   * @returns {string}
   */
  const textOf = (el) => (TEXT_GETTER ? Reflect.apply(TEXT_GETTER, el, []) : "") ?? "";

  /**
   * @param {Document[]} docs
   * @returns {import("../types.js").InputField[]}
   */
  function readInputs(docs) {
    const forms = docs.flatMap((doc) => [...doc.forms]);
    return docs
      .flatMap((doc) => [...doc.querySelectorAll("input, select")])
      .filter((el) => isField(el) && !(el.tagName === "INPUT" && SKIPPED_INPUT_TYPES.includes(el.type)))
      .slice(0, MAX_INPUTS)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: (el.getAttribute("type") ?? "").toLowerCase(),
        name: el.getAttribute("name") ?? "",
        id: el.id,
        autocomplete: el.getAttribute("autocomplete") ?? "",
        hints: ["placeholder", "aria-label", "data-encrypted-name"].map((a) => el.getAttribute(a) ?? "").join(" "),
        ...formOf(el, forms),
      }));
  }

  /**
   * @param {Element} el
   * @param {HTMLFormElement[]} forms  every form of the page and its same-origin frames, not only the ones collected
   * @returns {{ form: number, inPasswordForm: boolean }}
   */
  function formOf(el, forms) {
    const owner = isField(el) ? el.form : null;
    return owner ? { form: forms.indexOf(owner), inPasswordForm: hasPasswordField(owner) } : { form: -1, inPasswordForm: false };
  }

  /**
   * @param {Document[]} docs
   * @returns {import("../types.js").FormInfo[]}
   */
  function readForms(docs) {
    return docs
      .flatMap((doc) => [...doc.forms].map((form) => ({ doc, form })))
      .slice(0, MAX_FORMS)
      .map(({ doc, form }) => ({
        action: absolute(attributeOf(form, "action") ?? "", doc.baseURI) || doc.URL,
        method: (attributeOf(form, "method") ?? "get").toLowerCase(),
        hasPassword: hasPasswordField(form),
      }));
  }

  /** @returns {string} */
  function readCookieString() {
    try {
      return document.cookie;
    } catch {
      return ""; // a document served with a CSP sandbox (without allow-same-origin) refuses cookie access
    }
  }

  /** @returns {Record<string, string>} */
  function readCookies() {
    /** @type {Record<string, string>} */
    const cookies = {};
    for (const part of readCookieString().split(";")) {
      const eq = part.indexOf("=");
      const name = part.slice(0, eq).trim();
      if (name) cookies[name] = part.slice(eq + 1).trim();
    }
    return cookies;
  }

  /**
   * @param {import("../types.js").DomQuery[]} queries
   * @returns {Record<string, import("../types.js").DomResult>}
   */
  function readDom(queries) {
    /** @type {Record<string, import("../types.js").DomResult>} */
    const results = {};
    for (const query of queries) {
      let elements;
      try {
        elements = [...document.querySelectorAll(query.selector)].slice(0, 10);
      } catch {
        continue;
      }
      if (elements.length === 0) continue;
      /** @type {Record<string, string[]>} */
      const attributes = {};
      for (const attr of query.attributes) {
        attributes[attr] = elements.map((el) => attributeOf(el, attr)).filter((v) => v !== null);
      }
      const texts = query.text ? elements.map((el) => textOf(el).slice(0, 1000)) : [];
      results[query.selector] = { count: elements.length, attributes, texts };
    }
    return results;
  }

  /**
   * @param {string[]} paymentHosts
   * @returns {string[]}
   */
  function readPaymentLinks(paymentHosts) {
    const matches = (/** @type {string} */ host) => paymentHosts.some((h) => host === h || host.endsWith("." + h));
    const hrefs = [...document.querySelectorAll("a[href]")].map((a) => (a instanceof HTMLAnchorElement ? a.href : ""));
    return [...new Set(hrefs.filter((href) => href.startsWith("http") && matches(new URL(href).hostname)))].slice(0, 20);
  }

  /**
   * @param {Document[]} docs
   * @param {string} selector
   * @param {string} attr
   * @returns {string[]}
   */
  function urls(docs, selector, attr) {
    return docs
      .flatMap((doc) => [...doc.querySelectorAll(selector)])
      .map((el) => absolute(el.getAttribute(attr) ?? "", el.baseURI))
      .filter((u) => u !== "")
      .slice(0, 200);
  }

  /**
   * @param {string} raw
   * @param {string} base
   * @returns {string}
   */
  function absolute(raw, base) {
    try {
      return raw.trim() === "" ? "" : new URL(raw, base).href;
    } catch {
      return "";
    }
  }

  const parts = Reflect.get(globalThis, "SafePeekCollectorParts") ?? {};
  parts.dom = { documents, frameScripts, readMeta, urls, readPaymentLinks, readForms, readInputs, readCookies, readDom };
  Reflect.set(globalThis, "SafePeekCollectorParts", parts);
})();
