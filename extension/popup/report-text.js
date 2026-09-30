// The text "Copy the inference" puts on the clipboard, meant to be pasted into a public GitHub issue.
// Only names and paths go in: no query strings, no path parameters such as ";jsessionid=", and no
// excerpts of the page's HTML or scripts, which can hold tokens or personal data.

/** Trace types whose match is a name, path or header, never free page text. */
const COPYABLE_TYPES = new Set(["link", "param", "cookie", "global", "host", "header", "script"]);

/**
 * @param {string} url
 * @returns {string}  the URL without query string, fragment or ";name=value" path parameters
 */
export function publicUrl(url) {
  return url.split(/[?#]/)[0].replace(/;[^/]*/g, "");
}

/**
 * @param {import("../src/types.js").BackendSignal} signal
 * @returns {string}
 */
function signalLine(signal) {
  const match = COPYABLE_TYPES.has(signal.type) ? `\`${publicUrl(signal.match).replace(/`/g, "'")}\`` : "(page excerpt not copied)";
  return `  - [${signal.weight}] ${signal.note}: ${match}`;
}

/**
 * @param {import("../src/analyze.js").Report} report
 * @param {string} extensionVersion
 * @returns {string}  Markdown for the backend-inference issue form
 */
export function backendReportText(report, extensionVersion) {
  const lines = [`Page: ${publicUrl(report.url)}`, ""];
  for (const b of report.backends) {
    lines.push(`- ${b.name} (${b.language}), status ${b.status}, confidence ${b.confidence}`, ...b.signals.map(signalLine));
  }
  if (report.backends.length === 0) lines.push("- (no backend inferred)");
  const versions = report.technologies.filter((tech) => tech.version).map((tech) => `${tech.name} ${tech.version}`);
  if (versions.length > 0) lines.push("", `Versions seen: ${versions.join(", ")}`);
  lines.push("", `SafePeek ${extensionVersion}`);
  return lines.join("\n");
}
