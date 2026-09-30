// Part of the page collector (see collector.js): what it reads over the network. The one network activity is
// re-requesting what the page already loaded, the document (for its response headers) and its scripts (for library
// versions), from the browser cache where possible; and reading the browser's own record of what the page loaded.
//
// Classic script, injected before collector.js into the same isolated world.

(() => {
  const MAX_SCRIPT = 2_000_000;
  const MAX_SCRIPTS = 40;
  const FETCH_TIMEOUT_MS = 5000;
  const MAX_REQUESTS = 300;
  const REQUEST_INITIATORS = ["fetch", "xmlhttprequest", "beacon"];
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

  const parts = Reflect.get(globalThis, "SafePeekCollectorParts") ?? {};
  parts.network = { readHeaders, readScripts, resourceEntries, readRequests, readContactedHosts };
  Reflect.set(globalThis, "SafePeekCollectorParts", parts);
})();
