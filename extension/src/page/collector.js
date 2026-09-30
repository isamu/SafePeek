// Injected into the inspected tab (the extension's isolated world) when the popup opens, after collect-network.js and
// collect-dom.js, which it assembles. It only reads the page; see those files for what each part reads.
//
// Classic scripts, not modules: chrome.scripting.executeScript injects files, and the popup then
// calls globalThis.SafePeekCollector.collect(...) in the same isolated world.

(() => {
  const MAX_HTML = 500_000;
  const MAX_TEXT = 100_000;
  const { readHeaders, readScripts, resourceEntries, readRequests, readContactedHosts } = Reflect.get(globalThis, "SafePeekCollectorParts").network;
  const { documents, frameScripts, readMeta, urls, readPaymentLinks, readForms, readInputs, readCookies, readDom } = Reflect.get(
    globalThis,
    "SafePeekCollectorParts",
  ).dom;

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
