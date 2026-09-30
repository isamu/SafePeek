// Popup entry point.

import { analyze } from "../src/analyze.js";
import { sha1 } from "../src/engine/hash.js";
import { language, t } from "./i18n.js";
import { renderMessage, renderReport } from "./render.js";
import { collectFromTab, loadDatabases } from "./scan.js";

async function main() {
  const root = document.getElementById("app");
  if (!root) return;
  document.documentElement.lang = language();
  renderMessage(root, t("scanning"));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) {
    renderMessage(root, t("unsupported"));
    return;
  }
  const host = document.getElementById("host");
  if (host) host.textContent = new URL(tab.url ?? "").host;
  try {
    const db = await loadDatabases();
    const page = await collectFromTab(tab.id, db);
    const report = await analyze(page, db, { today: new Date(), sha1 });
    renderReport(root, report, db);
  } catch (error) {
    renderMessage(root, t("failed") + (error instanceof Error ? error.message : String(error)));
  }
}

void main();
