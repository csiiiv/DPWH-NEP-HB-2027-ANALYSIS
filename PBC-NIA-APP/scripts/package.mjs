#!/usr/bin/env node
// Package the dedicated NIA browser into a self-contained dist: the Vite
// bundle plus every retained evidence file the app references (datasets,
// source PDFs, the Senate workbook, evidence crops, methodology docs).
// The result runs from any static host or file:// preview.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.resolve(appRoot, "..");

const dist = path.join(appRoot, "dist");
if (!fs.existsSync(path.join(dist, "index.html")))
  throw new Error("Run npm run build first");

// Evidence directories copied verbatim (whitelisted roots the dev middleware
// serves; the app resolves them with origin-rooted paths, which works in the
// packaged layout too because index.html sits at the dist root).
for (const dir of ["analysis-nia/data", "HB_BUDGET", "dbm-other-nep-line-data", "NIA_DATA", "disclaimer"]) {
  const source = path.join(repo, dir);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(dist, dir), { recursive: true });
}
// Top-level methodology documents linked in the footer / source tree.
for (const file of [
  "analysis-nia/README.md",
  "analysis-nia/NEP_NIA_METHODOLOGY_AND_LESSONS.md",
  "analysis-nia/NIA_WORKBENCH.md",
]) {
  const source = path.join(repo, file);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(dist, file));
}
fs.writeFileSync(path.join(dist, ".nojekyll"), "");
console.log(`Packaged NIA browser with evidence in ${dist}`);
