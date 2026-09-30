// The text "Copy the inference" puts on the clipboard, meant to be pasted into a public GitHub issue.
// It lists what is allowed and drops everything else: the page's origin (never its path), for each
// trace only an identifier name (form field, cookie, JS global, the site's hostname), and plain
// version numbers of the technologies seen. URL paths, header values and page or script excerpts can
// carry session ids, tokens or personal data, so they are never copied; each trace's note still says
// what kind of trace fired.

/** A version number and nothing else; page-controlled strings that are not one are left out. */
const PLAIN_VERSION = /^v?\d+(?:[._-]\d+)*(?:[a-z]\d*)?$/i;

/** Trace types whose match is an identifier name rather than a value. */
const COPYABLE_TYPES = new Set(["param", "cookie", "global", "host"]);

/**
 * @param {string} url
 * @returns {string}  scheme and host only
 */
export function publicUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "(unknown page)";
  }
}

/**
 * @param {import("../src/types.js").BackendSignal} signal
 * @returns {string}
 */
function signalLine(signal) {
  const match = COPYABLE_TYPES.has(signal.type) ? `\`${signal.match.replace(/`/g, "'")}\`` : "(value not copied)";
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
  const versions = report.technologies.filter((tech) => PLAIN_VERSION.test(tech.version)).map((tech) => `${tech.name} ${tech.version}`);
  if (versions.length > 0) lines.push("", `Versions seen: ${versions.join(", ")}`);
  lines.push("", `SafePeek ${extensionVersion}`);
  return lines.join("\n");
}
