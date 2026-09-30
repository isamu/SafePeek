// Injected into the inspected tab (the extension's isolated world) when the popup opens.
// It only reads the page. The one network activity is re-requesting what the page already loaded:
// the document itself (to read its response headers) and its scripts (to read library versions),
// both served from the browser cache where possible. Nothing is sent anywhere else.
//
// Classic script, not a module: chrome.scripting.executeScript injects files, and the popup then
// calls globalThis.SafePeekCollector.collect(...) in the same isolated world.

(() => {
  const MAX_HTML = 500_000;
  const MAX_TEXT = 100_000;
  const MAX_SCRIPT = 2_000_000;
  const MAX_SCRIPTS = 40;
  const FETCH_TIMEOUT_MS = 5000;
  const MAX_INPUTS = 200;
  const MAX_FORMS = 50;
  const MAX_FRAMES = 10;
  const MAX_REQUESTS = 300;
  const REQUEST_INITIATORS = ["fetch", "xmlhttprequest", "beacon"];
  const SKIPPED_INPUT_TYPES = ["hidden", "submit", "button", "checkbox", "radio", "image", "reset", "file"];
  const OWN_FETCHES_KEY = "SafePeekOwnFetches";
  const ROUTE_WORD = /^[A-Za-z_][A-Za-z_.-]{0,39}$/;
  const API_VERSION = /^v\d{1,2}$/;
  const FILE_EXTENSION = /\.[A-Za-z]{1,6}$/;

  // The isolated world outlives one injection, so a later scan still knows what an earlier one re-requested.
  const ownFetches = ownFetchSet();

  /** @returns {Set<string>} */
  function ownFetchSet() {
    const previous = Reflect.get(globalThis, OWN_FETCHES_KEY);
    const set = previous instanceof Set ? previous : new Set();
    Reflect.set(globalThis, OWN_FETCHES_KEY, set);
    return set;
  }

  /**
   * @param {string} raw
   * @returns {string}  the URL as resource timing names it (absolute, no fragment), or "" if it does not parse
   */
  function timingName(raw) {
    const url = parseUrl(raw);
    if (!url) return "";
    url.hash = "";
    return url.href;
  }

  /**
   * @param {string} raw  absolute, or relative to the page
   * @returns {URL | null}
   */
  function parseUrl(raw) {
    try {
      return new URL(raw, location.href);
    } catch {
      return null;
    }
  }

  /**
   * @param {string} url
   * @param {RequestInit} init
   * @returns {Promise<Response | null>}
   */
  async function fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    ownFetches.add(timingName(url));
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Downloads at most MAX_SCRIPT bytes of a script, all within FETCH_TIMEOUT_MS, so neither a huge nor a
   * never-ending response is read whole.
   * @param {string} url
   * @returns {Promise<{ text: string, complete: boolean }>}
   */
  async function fetchScriptText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    ownFetches.add(timingName(url));
    try {
      const response = await fetch(url, { cache: "force-cache", credentials: "same-origin", signal: controller.signal });
      if (!response.ok || !response.body) return { text: "", complete: false };
      return await readCapped(response.body.getReader());
    } catch {
      return { text: "", complete: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param {ReadableStreamDefaultReader<Uint8Array>} reader
   * @returns {Promise<{ text: string, complete: boolean }>}
   */
  async function readCapped(reader) {
    const decoder = new TextDecoder();
    const parts = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { text: parts.join("") + decoder.decode(), complete: true };
      parts.push(decoder.decode(value, { stream: true }));
      bytes += value.byteLength;
      if (bytes > MAX_SCRIPT) {
        await reader.cancel();
        return { text: parts.join("").slice(0, MAX_SCRIPT), complete: false };
      }
    }
  }

  /** @returns {Promise<Record<string, string> | null>} */
  async function readHeaders() {
    let response = await fetchWithTimeout(location.href, { method: "HEAD", credentials: "include", cache: "no-store" });
    if (!response || !response.ok) response = await fetchWithTimeout(location.href, { credentials: "include", cache: "no-store" });
    if (!response) return null;
    /** @type {Record<string, string>} */
    const headers = {};
    response.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    return headers;
  }

  /** @returns {Promise<import("../types.js").ScriptInfo[]>} */
  async function readScripts() {
    const elements = [...document.querySelectorAll("script")];
    const external = elements.filter((s) => s.src).slice(0, MAX_SCRIPTS);
    const inline = elements
      .filter((s) => !s.src && s.textContent)
      .map((s) => ({ src: null, integrity: "", content: (s.textContent ?? "").slice(0, MAX_SCRIPT), fetched: false }));
    const fetchedScripts = await Promise.all(
      external.map(async (s) => {
        const { text, complete } = await fetchScriptText(s.src);
        return { src: s.src, integrity: s.integrity, content: text, fetched: complete };
      }),
    );
    return [...fetchedScripts, ...inline];
  }

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

  /**
   * What the page has loaded so far, from the browser's own resource-timing record: no new request is made. SafePeek's
   * own re-requests from earlier scans of this document are left out.
   * @returns {PerformanceResourceTiming[]}
   */
  function resourceEntries() {
    return performance
      .getEntriesByType("resource")
      .filter((e) => e instanceof PerformanceResourceTiming)
      .filter((e) => !(e.initiatorType === "fetch" && ownFetches.has(timingName(e.name))));
  }

  /**
   * The URLs the page itself has fetched (fetch, XHR, beacons). Only scheme, host and path are kept, since query
   * strings, fragments and path parameters often hold tokens; path segments not shaped like route names are masked too.
   * @param {PerformanceResourceTiming[]} entries
   * @returns {string[]}
   */
  function readRequests(entries) {
    const urls = entries
      .filter((e) => REQUEST_INITIATORS.includes(e.initiatorType))
      .map((e) => redactedUrl(e.name))
      .filter((u) => u !== "");
    return [...new Set(urls)].slice(0, MAX_REQUESTS);
  }

  /**
   * Every host the page has contacted: scripts, styles, images, frames, fonts, fetches, beacons.
   * @param {PerformanceResourceTiming[]} entries
   * @returns {string[]}
   */
  function readContactedHosts(entries) {
    const hosts = entries.map((e) => parseUrl(e.name)?.hostname ?? "").filter((h) => h !== "");
    return [...new Set(hosts)].slice(0, MAX_REQUESTS);
  }

  /**
   * @param {string} raw
   * @returns {string}  scheme, host and path only, with path parameters dropped and non-route segments masked
   */
  function redactedUrl(raw) {
    const url = parseUrl(raw);
    return url?.protocol === "https:" || url?.protocol === "http:" ? `${url.origin}${maskTokens(url.pathname)}` : "";
  }

  /**
   * Keeps route-name and API-version segments; ids, UUIDs and tokens become {token}, keeping `.php` / `.do` visible.
   * @param {string} pathname
   * @returns {string}
   */
  function maskTokens(pathname) {
    return pathname
      .split("/")
      .map((withParams) => {
        const segment = withParams.split(";")[0];
        const extension = FILE_EXTENSION.exec(segment)?.[0] ?? "";
        const base = segment.slice(0, segment.length - extension.length);
        return base === "" || ROUTE_WORD.test(base) || API_VERSION.test(base) ? segment : `{token}${extension}`;
      })
      .join("/");
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

  /**
   * @param {import("../types.js").DomQuery[]} domQueries
   * @param {string[]} paymentHosts
   * @returns {Promise<Omit<import("../types.js").PageData, "globals">>}
   */
  async function collect(domQueries, paymentHosts) {
    const docs = documents();
    const entries = resourceEntries();
    const [headers, scripts] = await Promise.all([readHeaders(), readScripts()]);
    return {
      url: location.href,
      protocol: location.protocol,
      origin: location.origin,
      headers,
      ...readMeta(),
      scripts: [...scripts, ...frameScripts(docs)],
      stylesheets: urls(docs, "link[rel~=stylesheet][href]", "href"),
      iframes: urls(docs, "iframe[src]", "src"),
      images: urls(docs, "img[src]", "src"),
      links: readPaymentLinks(paymentHosts),
      forms: readForms(docs),
      inputs: readInputs(docs),
      cookies: readCookies(),
      html: document.documentElement.outerHTML.slice(0, MAX_HTML),
      text: (document.body?.innerText ?? "").slice(0, MAX_TEXT),
      dom: readDom(domQueries),
      requests: readRequests(entries),
      contactedHosts: readContactedHosts(entries),
      scriptHosts: readContactedHosts(entries.filter((e) => e.initiatorType === "script")),
    };
  }

  /** @type {any} */ (globalThis).SafePeekCollector = { collect };
})();
