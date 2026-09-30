// The "Backend (inferred)" section: each guess with its confidence and weighted traces, plus a way
// to hand a guess to the maintainers without SafePeek sending anything itself.

import { el } from "./dom.js";
import { confidenceLabel, signalNote, strengthLabel, t } from "./i18n.js";
import { backendReportText } from "./report-text.js";

/** @type {Record<"eol" | "legacy" | "managed", "status_eol" | "status_legacy" | "status_managed">} */
const STATUS_LABEL = { eol: "status_eol", legacy: "status_legacy", managed: "status_managed" };

const ISSUE_FORM = "https://github.com/isamu/SafePeek/issues/new?template=backend-signature.yml";

/**
 * @param {import("../src/types.js").BackendSignal[]} signals
 * @returns {HTMLElement}
 */
export function renderSignals(signals) {
  const wrap = el("div", "signals");
  wrap.append(el("div", "evidence-label", t("strength")));
  const list = el("ul", "signal-list");
  for (const signal of signals) {
    const item = el("li", "signal");
    item.append(el("span", `strength w-${strengthKey(signal.weight)}`, strengthLabel(signal.weight)), el("span", "signal-note", signalNote(signal)));
    item.append(el("code", "signal-match", signal.match));
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

/**
 * @param {number} weight
 * @returns {"strong" | "medium" | "weak"}
 */
function strengthKey(weight) {
  if (weight >= 70) return "strong";
  if (weight >= 40) return "medium";
  return "weak";
}

/**
 * @param {import("../src/types.js").Backend} backend
 * @returns {HTMLElement}
 */
function renderBackend(backend) {
  const item = el("details", "backend");
  const summary = el("summary");
  summary.append(el("span", "backend-name", `${backend.name} (${backend.language})`));
  if (backend.status !== "info") summary.append(el("span", `pill status-${backend.status}`, t(STATUS_LABEL[backend.status])));
  summary.append(el("span", "backend-confidence", `${t("confidence")}: ${confidenceLabel(backend.confidence)} (${backend.confidence})`));
  item.append(summary, renderSignals(backend.signals));
  return item;
}

/**
 * @param {import("../src/analyze.js").Report} report
 * @param {(f: import("../src/types.js").Finding) => HTMLElement} renderFinding
 * @returns {HTMLElement}
 */
export function renderBackendSection(report, renderFinding) {
  const node = el("section", "section");
  node.append(el("h2", undefined, t("backend")), el("p", "note", t("backend_note")));
  const findings = report.findings.filter((f) => f.area === "backend");
  node.append(...findings.map(renderFinding));
  const flagged = new Set(findings.map((f) => String(f.params.name)));
  const others = report.backends.filter((b) => !flagged.has(b.name));
  if (findings.length === 0 && others.length === 0) node.append(el("p", "empty", t("none")));
  node.append(...others.map(renderBackend));
  node.append(renderActions(report));
  return node;
}

/**
 * @param {import("../src/analyze.js").Report} report
 * @returns {HTMLElement}
 */
function renderActions(report) {
  const actions = el("div", "backend-actions");
  const copy = el("button", "copy", t("copy_report"));
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(backendReportText(report, chrome.runtime.getManifest().version)).then(() => {
      copy.textContent = t("copied");
    });
  });
  const link = /** @type {HTMLAnchorElement} */ (el("a", "report-link", t("report_link")));
  link.href = ISSUE_FORM;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  actions.append(copy, link);
  return actions;
}
