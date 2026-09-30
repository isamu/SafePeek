// Renders a report into the popup. Every string that came from the inspected page is inserted as
// text (never as HTML), so a hostile page cannot inject markup into the extension.

import { describe, t } from "./i18n.js";
import { el } from "./dom.js";
import { renderBackendSection, renderSignals } from "./render-backend.js";
import { findingReportUrl, technologiesReportUrl } from "./false-report.js";

/**
 * A link that opens a pre-filled issue form on GitHub. GitHub receives the pre-filled values when the user opens it;
 * they become a public issue only if the user submits the form.
 * @param {string} text
 * @param {string} href
 * @returns {HTMLElement}
 */
function reportLink(text, href) {
  const link = document.createElement("a");
  link.className = "report-false";
  link.textContent = text;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

/**
 * @param {string} pageUrl
 * @param {import("./false-report.js").ReportContext} context
 * @returns {(f: import("../src/types.js").Finding) => HTMLElement}
 */
function findingRenderer(pageUrl, context) {
  return (f) => {
    const item = renderFinding(f);
    item.append(reportLink(t("report_false"), findingReportUrl(f, pageUrl, context)));
    return item;
  };
}

/**
 * @param {import("../src/types.js").Finding} f
 * @returns {HTMLElement}
 */
function renderFinding(f) {
  const { title, detail } = describe(f);
  const item = el("details", `finding sev-${f.severity}`);
  const summary = el("summary");
  summary.append(el("span", `pill sev-${f.severity}`, t(f.severity)), el("span", "finding-title", title));
  item.append(summary, el("p", "detail", detail));
  if (f.signals && f.signals.length > 0) item.append(renderSignals(f.signals));
  if (f.evidence.length > 0) {
    const list = el("ul", "evidence");
    for (const line of f.evidence) list.append(el("li", undefined, line));
    item.append(el("div", "evidence-label", t("evidence")), list);
  }
  return item;
}

/**
 * @param {string} title
 * @param {HTMLElement[]} children
 * @returns {HTMLElement}
 */
function section(title, children) {
  const node = el("section", "section");
  node.append(el("h2", undefined, title));
  if (children.length === 0) node.append(el("p", "empty", t("none")));
  node.append(...children);
  return node;
}

/**
 * @param {import("../src/analyze.js").Report} report
 * @returns {HTMLElement}
 */
function renderSummary(report) {
  const node = el("section", `summary level-${report.level}`);
  node.append(el("div", "level", t(`level_${report.level}`)));
  const counts = el("div", "counts");
  for (const severity of /** @type {const} */ (["high", "medium", "low"])) {
    counts.append(el("span", `pill sev-${severity}`, `${t(severity)} ${report.counts[severity]}`));
  }
  node.append(counts, el("p", "note", t("level_note")));
  return node;
}

/**
 * @param {import("../src/analyze.js").Report} report
 * @param {Record<string, { name: string }>} categories
 * @returns {HTMLElement[]}
 */
function renderTechnologies(report, categories) {
  const eolNames = new Set(report.findings.filter((f) => f.area === "eol").map((f) => String(f.params.name)));
  /** @type {Map<string, HTMLElement>} */
  const groups = new Map();
  for (const tech of report.technologies) {
    const category = categories[tech.categories[0]]?.name ?? "Other";
    let list = groups.get(category);
    if (!list) {
      list = el("ul", "tech-list");
      groups.set(category, list);
    }
    const item = el("li", eolNames.has(tech.name) ? "tech eol" : "tech");
    item.title = tech.evidence.join("\n");
    item.append(el("span", "tech-name", tech.name));
    if (tech.version) item.append(el("span", "tech-version", tech.version));
    if (tech.impliedBy) {
      item.classList.add("implied");
      item.append(el("span", "tech-implied", t("implied_by").replace("{name}", tech.impliedBy)));
    }
    list.append(item);
  }
  return [...groups.entries()].map(([category, list]) => {
    const group = el("div", "tech-group");
    group.append(el("h3", undefined, category), list);
    return group;
  });
}

/**
 * @param {HTMLElement} root
 * @param {import("../src/analyze.js").Report} report
 * @param {{ categories: Record<string, { name: string }>, sources: Record<string, any>, eol: any }} db
 */
export function renderReport(root, report, db) {
  const context = { extensionVersion: chrome.runtime.getManifest().version, dataVersions: dataVersions(db) };
  const render = findingRenderer(report.url, context);
  const payment = report.findings.filter((f) => f.area === "payment");
  const destinations = report.findings.filter((f) => f.area === "destinations");
  const others = report.findings.filter((f) => !["payment", "backend", "destinations"].includes(f.area));
  const technologies = section(t("technologies"), renderTechnologies(report, db.categories));
  if (report.technologies.length > 0) technologies.append(reportLink(t("report_false_tech"), technologiesReportUrl(report.technologies, report.url, context)));
  root.replaceChildren(
    renderSummary(report),
    section(t("payment"), payment.map(render)),
    renderBackendSection(report, render),
    section(t("findings"), others.map(render)),
    section(t("destinations"), destinations.map(render)),
    technologies,
    renderFooter(db),
  );
}

/**
 * @param {{ sources: Record<string, any>, eol: any }} db
 * @returns {string}  the dates of the bundled data, e.g. "webappanalyzer 2026-09-16 / retire 2026-09-29 / EOL 2026-09-30"
 */
function dataVersions(db) {
  const dates = Object.entries(db.sources).map(([name, s]) => `${name} ${String(s.date).slice(0, 10)}`);
  return [...dates, `EOL ${db.eol.reviewed}`].join(" / ");
}

/**
 * @param {{ sources: Record<string, any>, eol: any }} db
 * @returns {HTMLElement}
 */
function renderFooter(db) {
  const footer = el("footer", "footer");
  footer.append(el("p", undefined, t("footer")), el("p", "data", `${t("data")}: ${dataVersions(db)}`));
  return footer;
}

/**
 * @param {HTMLElement} root
 * @param {string} message
 */
export function renderMessage(root, message) {
  root.replaceChildren(el("p", "message", message));
}
