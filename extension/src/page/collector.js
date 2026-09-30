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
  const SKIPPED_INPUT_TYPES = ["hidden", "submit", "button", "checkbox", "radio", "image", "reset", "file"];

  /**
   * @param {string} url
   * @param {RequestInit} init
   * @returns {Promise<Response | null>}
   */
  async function fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
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
        const response = await fetchWithTimeout(s.src, { cache: "force-cache", credentials: "same-origin" });
        const body = response && response.ok ? await response.text().catch(() => "") : "";
        return { src: s.src, integrity: s.integrity, content: body.slice(0, MAX_SCRIPT), fetched: body !== "" };
      }),
    );
    return [...fetchedScripts, ...inline];
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

  /** @returns {import("../types.js").InputField[]} */
  function readInputs() {
    return [...document.querySelectorAll("input, select")]
      .filter((el) => !(el instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.includes(el.type)))
      .slice(0, MAX_INPUTS)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") ?? "",
        name: el.getAttribute("name") ?? "",
        id: el.id,
        autocomplete: el.getAttribute("autocomplete") ?? "",
        hints: ["placeholder", "aria-label", "data-encrypted-name"].map((a) => el.getAttribute(a) ?? "").join(" "),
      }));
  }

  /** @returns {import("../types.js").FormInfo[]} */
  function readForms() {
    return [...document.forms].slice(0, 50).map((form) => ({
      action: form.action,
      method: (form.getAttribute("method") ?? "get").toLowerCase(),
      hasPassword: form.querySelector("input[type=password]") !== null,
    }));
  }

  /** @returns {Record<string, string>} */
  function readCookies() {
    /** @type {Record<string, string>} */
    const cookies = {};
    for (const part of document.cookie.split(";")) {
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
        attributes[attr] = elements.map((el) => el.getAttribute(attr)).filter((v) => v !== null);
      }
      const texts = query.text ? elements.map((el) => (el.textContent ?? "").slice(0, 1000)) : [];
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
   * @param {string} selector
   * @param {string} attr
   * @returns {string[]}
   */
  function urls(selector, attr) {
    return [...document.querySelectorAll(selector)]
      .map((el) => (el instanceof HTMLElement ? /** @type {any} */ (el)[attr] : ""))
      .filter((u) => typeof u === "string" && u !== "")
      .slice(0, 200);
  }

  /**
   * @param {import("../types.js").DomQuery[]} domQueries
   * @param {string[]} paymentHosts
   * @returns {Promise<Omit<import("../types.js").PageData, "globals">>}
   */
  async function collect(domQueries, paymentHosts) {
    const [headers, scripts] = await Promise.all([readHeaders(), readScripts()]);
    return {
      url: location.href,
      protocol: location.protocol,
      origin: location.origin,
      headers,
      ...readMeta(),
      scripts,
      stylesheets: urls("link[rel~=stylesheet][href]", "href"),
      iframes: urls("iframe[src]", "src"),
      images: urls("img[src]", "src"),
      links: readPaymentLinks(paymentHosts),
      forms: readForms(),
      inputs: readInputs(),
      cookies: readCookies(),
      html: document.documentElement.outerHTML.slice(0, MAX_HTML),
      text: (document.body?.innerText ?? "").slice(0, MAX_TEXT),
      dom: readDom(domQueries),
    };
  }

  /** @type {any} */ (globalThis).SafePeekCollector = { collect };
})();
