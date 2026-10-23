import React, { useEffect } from "react";
import { repo, siteUrl } from "./data.js";
import { routeHref } from "./routes.js";
import WorkbenchHeader from "./WorkbenchHeader.jsx";
import { DisclaimerSummary } from "./DisclaimerNotice.jsx";
import "./Fmr.css";
import "./MainOverview.css";

// Top-level About workspace: one place describing the whole multi-workbench
// suite, the repository behind it, and the reading rules that keep every
// figure source-grounded. Formerly a DPWH sub-tab.
const docs = [
  {path: "README.md", label: "Repository README", note: "Project scope, local setup, dataset status, primary sources, and the full workspace table."},
  {path: "analysis/README.md", label: "Analysis guide", note: "How the analysis/ directory is organized — web, builders, viewers, data, docs, tests, and the archive."},
  {path: "analysis/web/README.md", label: "Frontend guide", note: "React + Vite app architecture, routing, PDF viewer, and browser checks."},
  {path: "analysis/docs/data_user_guide.md", label: "Data user guide", note: "Field-by-field reference for the retained JSON datasets and how to join them safely."},
  {path: "analysis/docs/shareable_datasets_by_page.md", label: "Shareable datasets by page", note: "Every shareable dataset mapped to the workspace page that renders it."},
  {path: "analysis/docs/analysis_tabs_framework.md", label: "Analysis methods and counting units", note: "The rules governing Analysis-tab populations, record grains and evidence."},
  {path: "other-analysis/README.md", label: "DA · DOH · NIA orientation", note: "Where the FMR, HFEP, and irrigation line items sit inside HB 10858 Volume I-B, with page offsets and control checks."},
  {path: "DEO2LEG/README.md", label: "DEO ↔ legislative district mapping", note: "Many-to-many crosswalk linking DPWH District Engineering Offices to House districts — 264 relationships, official-roster verification, scraped member profiles with portraits, isolated allocation evidence."},
];
const stacks = [
  ["Python builders own the numbers", "Extraction, rollup audits, and comparison datasets are built deterministically from committed PDFs; machine audits record every rebuild's checks."],
  ["React 19 + Vite own the reading", "One SPA, hash-routed workspaces, lazy datasets, deep links that preserve filters, and an in-app PDF viewer beside every cited page."],
  ["Retained sources", "Committed PDFs, OCR trees, and API snapshots so every figure stays reproducible; no live API is queried at runtime."],
  ["Layered verification", "Unit tests over the pure models, Playwright page checks at two widths, and packaged-site checks before publication."],
];
const stages = [
  ["Overview", "The landing page: insertion, deletion and adjustment summaries for all four funding workspaces, cross-workspace coverage and candidate-change tables.", "#overview"],
  ["DPWH", "Public works operations across Transparency NEP, DBM NEP Volume II-B, and House GAB (both readings) with native I-B/I-C trees.", "#home"],
  ["DA Farm-to-Market Roads", "FMR annexes from both documents, normalized coordinates, PSGC geocoding, and a national segment map.", "#fmr"],
  ["DOH Health Facilities", "HFEP capital outlays — infrastructure, medical equipment, motor vehicles — with per-cell provenance.", "#hfep"],
  ["NIA Irrigation", "Six irrigation sub-programs with sub-program controls, candidate pairing, and the AI-monitoring lens.", "#nia"],
  ["Geolocation", "Cross-dataset inventory of coordinate text printed inside budget records; counts are per source artifact.", "#geo"],
  ["Sources", "The catalog of every shareable dataset, its canonical repository path, purpose, and documented limits.", "#sources"],
];

export default function AboutApp() {
  useEffect(() => {document.title = 'About · FY2027 Budget Workbenches';}, []);
  return (
    <>
      <a className="fmr-skip" href="#about-content" onClick={e => {e.preventDefault(); document.getElementById('about-content')?.focus();}}>Skip to content</a>
      <WorkbenchHeader workspace="about" route="home"/>
      <main id="about-content" tabIndex={-1} className="shell fmr-main">
      <section className="hero">
        <p className="eyebrow">FY2027 · all workspaces</p>
        <h1>About this workbench</h1>
        <p>
          An open, source-grounded reading of the FY2027 Philippine budget as it
          moves from the executive's National Expenditure Program to the House
          General Appropriations Bill. It follows the printed records — every
          amount traces to a retained PDF page, a committed dataset, and a
          reproducible build. Four funding workspaces (DPWH, farm-to-market
          roads, health facilities, irrigation) share one shell, one Overview
          landing page, one dataset catalog, and one PDF evidence viewer.
        </p>
        <div className="hero-actions">
          <a className="primary" href="#overview">Open the Overview →</a>
          <a className="secondary" href={repo}>View repository source →</a>
        </div>
      </section>
      <DisclaimerSummary />

      <h2>The workspaces</h2>
      <p className="muted">
        One budget, several printed annexes, and the differences between them —
        each kept in its own workspace because sources and matching rules
        differ.
      </p>
      <div className="cards" role="region" aria-label="Workbench workspaces covered">
        {stages.map(([title, body, href]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
            <a href={href}>Open workspace →</a>
          </article>
        ))}
      </div>

      <h2>How it is built</h2>
      <p className="muted">
        Python owns the numbers; the browser owns the reading experience. Both
        run from committed inputs only — no live API at runtime.
      </p>
      <div className="cards" role="region" aria-label="Build stack">
        {stacks.map(([title, body]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>

      <h2>Documentation</h2>
      <p className="muted">
        Guides open as rendered Markdown on GitHub; each workspace's build
        notes sit beside its data.
      </p>
      <ul className="resource-list about-docs" aria-label="Project documentation">
        {docs.map((item) => (
          <li key={item.path}>
            <a href={repo + item.path} target="_blank" rel="noreferrer">{item.label}</a>
            <span className="resource-kind">GitHub</span>
            <p className="resource-purpose">{item.note}</p>
          </li>
        ))}
        <li>
          <a href="#sources">Datasets and source documents →</a>
          <span className="resource-kind">Workspace</span>
          <p className="resource-purpose">The Sources workspace catalogs every shareable dataset with its canonical path, purpose, and limits.</p>
        </li>
        <li>
          <a href={siteUrl("analysis/main_overview_2027.json")} download>Overview summary (main_overview_2027.json)</a>
          <span className="resource-kind">Data</span>
          <p className="resource-purpose">The validated payload behind the landing-page summaries, regenerated on every build.</p>
        </li>
      </ul>

      <h2>Start reading</h2>
      <p className="muted">Suggested entry points, in the order a first-time reader needs them.</p>
      <ul className="home-directory" aria-label="Suggested entry points">
        <li><a href="#overview"><strong>Overview</strong><span>Insertions, deletions and adjustments across all four funding workspaces.</span></a></li>
        <li><a href="#highlights"><strong>DPWH Highlights</strong><span>Ten investigative angles with dedicated evidence dialogs.</span></a></li>
        <li><a href={routeHref("analysis", { view: "overview", dim: "office" })}><strong>DPWH Analysis</strong><span>Office and program headlines, ranked insertions and deletions, adjustments.</span></a></li>
        <li><a href="#sources"><strong>Sources</strong><span>Every shareable dataset with its canonical repository path and limits.</span></a></li>
      </ul>
      </main>
    </>
  );
}
