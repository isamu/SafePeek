// Public entry point of the `safepeek` npm package. Everything here is a pure function over
// collected page data (PageData) and runs the same in a browser, a worker or Node.
//
// Collecting PageData needs a real page: inject src/page/collector.js and run probeGlobals in the
// page's main world (see popup/scan.js, or test/e2e/collector.e2e.js for a Playwright example).

export { analyze } from "./analyze.js";
export { loadDatabases } from "./data.js";

export { detectTechnologies } from "./engine/technologies.js";
export { scanLibraries, parseRetireRepository, retireGlobalPaths } from "./engine/retire.js";
export { inferBackends, backendGlobalPaths } from "./engine/backend.js";
export { extractPaths, extractParams } from "./engine/page-traces.js";
export { extractWordPress } from "./engine/wordpress.js";
export { buildDomQueries, buildGlobalPaths } from "./engine/queries.js";
export { compareVersions } from "./engine/version.js";
export { sha1 } from "./engine/hash.js";

export { checkBackends } from "./checks/backend.js";
export { checkWordPress } from "./checks/wordpress.js";
export { checkEol, checkLibraries } from "./checks/eol.js";
export { checkHeaders, checkCookies, checkTransport } from "./checks/headers.js";
export { checkPage } from "./checks/page.js";
export { checkPayment } from "./checks/payment.js";

export { probeGlobals } from "./page/probe.js";
