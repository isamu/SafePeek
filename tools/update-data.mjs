#!/usr/bin/env node
// Maintainer tool: refreshes the signature data bundled in extension/data/.
// It is NOT part of the extension. The extension only ever reads the JSON this script writes,
// and those JSON files are committed so that anyone can diff what changed between releases.
//
// Usage:
//   node tools/update-data.mjs                      # clones both sources into a temp dir
//   node tools/update-data.mjs --webappanalyzer DIR --retire DIR   # uses existing checkouts

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = new URL("../extension/data/", import.meta.url);

const SOURCES = {
  webappanalyzer: "https://github.com/enthec/webappanalyzer.git",
  retire: "https://github.com/RetireJS/retire.js.git",
};

// Only the fields the extension's matcher understands. Descriptions, icons and pricing are dropped
// to keep the bundle small; `website` stays so the popup can link to the technology.
const KEPT_FIELDS = [
  "cats",
  "website",
  "headers",
  "meta",
  "scriptSrc",
  "scripts",
  "js",
  "cookies",
  "html",
  "dom",
  "text",
  "url",
  "implies",
  "requires",
  "requiresCategory",
  "excludes",
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return args;
}

function checkout(name, dir) {
  if (dir) return dir;
  const target = join(mkdtempSync(join(tmpdir(), "safepeek-")), name);
  execFileSync("git", ["clone", "--quiet", "--depth", "1", SOURCES[name], target], { stdio: "inherit" });
  return target;
}

function commitOf(dir) {
  const out = execFileSync("git", ["-C", dir, "log", "-1", "--format=%H %cI"], { encoding: "utf8" }).trim();
  const [commit, date] = out.split(" ");
  return { commit, date };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(name, data) {
  writeFileSync(new URL(name, OUT), JSON.stringify(data) + "\n");
}

function buildTechnologies(dir) {
  const techDir = join(dir, "src", "technologies");
  const all = {};
  for (const file of readdirSync(techDir).filter((f) => f.endsWith(".json"))) {
    Object.assign(all, readJson(join(techDir, file)));
  }
  const trimmed = {};
  for (const [name, tech] of Object.entries(all)) {
    const kept = {};
    for (const field of KEPT_FIELDS) {
      if (tech[field] !== undefined) kept[field] = tech[field];
    }
    trimmed[name] = kept;
  }
  const categories = {};
  for (const [id, cat] of Object.entries(readJson(join(dir, "src", "categories.json")))) {
    categories[id] = { name: cat.name, priority: cat.priority };
  }
  return { technologies: trimmed, categories };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const wapDir = checkout("webappanalyzer", args.webappanalyzer);
  const retireDir = checkout("retire", args.retire);

  const { technologies, categories } = buildTechnologies(wapDir);
  writeJson("technologies.json", technologies);
  writeJson("categories.json", categories);
  writeJson("retire.json", readJson(join(retireDir, "repository", "jsrepository.json")));

  const sources = {
    webappanalyzer: { url: SOURCES.webappanalyzer, license: "GPL-3.0", ...commitOf(wapDir) },
    retire: { url: SOURCES.retire, license: "Apache-2.0", ...commitOf(retireDir) },
  };
  writeFileSync(new URL("sources.json", OUT), JSON.stringify(sources, null, 2) + "\n");
  console.log(`technologies: ${Object.keys(technologies).length}, categories: ${Object.keys(categories).length}`);
}

main();
