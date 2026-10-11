import React from "react";
import { repo, siteUrl } from "./data.js";
import { routeHref } from "./routes.js";

const doc = (path, label, note) => ({ path, label, note });
const docs = [
  doc("README.md", "Repository README", "Project scope, local setup, dataset status, primary sources, and the full workspace table."),
  doc("analysis/README.md", "Analysis guide", "How the analysis/ directory is organized — web, builders, viewers, data, docs, tests, and the archive."),
  doc("analysis/web/README.md", "Frontend guide", "React + Vite app architecture, routing, PDF viewer, and browser checks."),
  doc("analysis/docs/data_user_guide.md", "Data user guide", "Field-by-field reference for the retained JSON datasets and how to join them safely."),
  doc("other-analysis/README.md", "DA · DOH · NIA orientation", "Where the FMR, HFEP, and irrigation line items sit inside HB 10858 Volume I-B, with page offsets and control checks."),
];
const stacks = [
  ["React 19 + Vite", "Routing, lazy workspaces, shared header, and hash-based deep links."],
  ["Python builders", "Extraction, rollup audits, and comparison datasets — the accounting authority."],
  ["Retained sources", "Committed PDFs, OCR trees, and API snapshots so every figure stays reproducible."],
];
const stages = [
  ["DPWH Transparency NEP", "Retained FY2027 API snapshot of the executive proposal's project listing.", "#transparency"],
  ["DBM NEP", "Canonical Volume II-B tree for the official FY2027 National Expenditure Program.", "#nep"],
  ["House GAB (HGAB2 / HGAB3)", "Native I-B controls and I-C named-project layers for HB 10858, both House readings.", "#house"],
];

export default function About() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">DPWH · FY2027</p>
        <h1>About this workbench</h1>
        <p>
          An open, source-grounded analysis of the FY2027 DPWH budget as it moves
          from the Transparency NEP listing through the DBM National Expenditure
          Program to the House General Appropriations Bill. It follows the
          printed records — every amount traces to a retained PDF page, a
          committed dataset, and a reproducible build.
        </p>
        <div className="hero-actions">
          <a className="primary" href="#home">Open the workbench →</a>
          <a className="secondary" href={repo}>View repository source →</a>
        </div>
      </section>
      <p className="notice about-disclaimer">
        <strong>Disclaimer.</strong> This is an independent, unofficial analysis
        of publicly released budget documents. It is not affiliated with, and
        has not been reviewed or endorsed by, the DPWH, DBM, or the House of
        Representatives. Figures are transcriptions and provisional comparisons
        of the cited printed records — candidate insertions, deletions, and
        amount changes are review leads, not certified findings. Unmatched rows
        alone do not establish insertions, removals, or policy changes, and
        nothing here should be read as an allegation of wrongdoing against any
        office or official. Verify every figure against the primary documents
        before quoting or republishing it.
      </p>

      <h2>What it covers</h2>
      <p className="muted">
        One budget, three printed stages, and the differences between them —
        compared at controls, programs, and named project records.
      </p>
      <div className="cards" role="region" aria-label="Budget stages covered">
        {stages.map(([title, body, href]) => (
          <article key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
            <a href={href}>Inspect the tree →</a>
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
        The READMEs and guides that were previously linked from the shared
        header now live here. All open rendered Markdown on GitHub.
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
          <a href={siteUrl("analysis/data/comparison_overview_2027.json")} download>Highlights dataset (comparison_overview_2027.json)</a>
          <span className="resource-kind">Data</span>
          <p className="resource-purpose">The snapshot powering the Highlights tables, including validated candidate changes and held ambiguous rows.</p>
        </li>
      </ul>

      <h2>Start reading</h2>
      <p className="muted">Suggested entry points, in the order a first-time reader needs them.</p>
      <ul className="home-directory" aria-label="Suggested entry points">
        <li><a href="#highlights"><strong>Highlights</strong><span>Ten investigative angles with dedicated evidence dialogs.</span></a></li>
        <li><a href={routeHref("analysis", { view: "overview", dim: "office" })}><strong>Analysis</strong><span>Office and program headlines, ranked insertions and deletions, adjustments.</span></a></li>
        <li><a href="#compare"><strong>Compare stages</strong><span>Sortable project-level candidates with exports.</span></a></li>
        <li><a href="#resources"><strong>Resources</strong><span>Direct downloads of the latest workable datasets and audits.</span></a></li>
      </ul>
    </>
  );
}
