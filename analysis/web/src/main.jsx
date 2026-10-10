import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadData } from "./data.js";
import { amount } from "./model.js";
import "./styles.css";
import WorkbenchHeader from "./WorkbenchHeader.jsx";
import { routes, readRoute, routeHref, legacyRoutes } from "./routes.js";
// PDF.js aborts its initial full response after discovering range support and
// again on teardown; Chromium surfaces those as "signal is aborted without
// reason" TypeErrors. They are expected cancellations, not failures.
window.addEventListener("unhandledrejection", (event) => {
  const message = String(event.reason?.message ?? event.reason ?? "");
  if (/abort|cancel|Worker was terminated/i.test(message) || event.reason?.name === "AbortError")
    event.preventDefault();
});
// Same class of expected cancellations can also surface as page errors.
window.addEventListener("error", (event) => {
  const message = String(event.message ?? event.error?.message ?? "");
  if (/abort|cancel|Worker was terminated/i.test(message)) {
    event.preventDefault();
    return true;
  }
});
const SourceWorkspace = lazy(() => import("./SourceWorkspace.jsx"));
const Analysis = lazy(()=>import("./Analysis.jsx"));
const Comparison = lazy(() => import("./Comparison.jsx"));
const Resources = lazy(() => import("./Resources.jsx"));
function App() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    document.title = `${routes[route.key]?.label ?? "Page not found"} · DPWH FY2027`;
  }, [route.key]);
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main").focus();
        }}
      >
        Skip to content
      </a>
      <WorkbenchHeader route={route.key} />
      <main id="main" tabIndex="-1" className="shell">
        <Suspense fallback={<p role="status">Loading workspace…</p>}>
          {route.key === "analysis" ? <Analysis route={route} /> : route.key === "compare" ? <Comparison route={route} /> : route.key === "home" ? <Home /> : route.key === "resources" ? <Resources /> : routes[route.key] ?
            <SourceWorkspace key={route.key} route={route} /> :
            <section><h1>Page not found</h1><p>This workbench route is unavailable.</p><a href="#home">Return home</a></section>}
        </Suspense>
      </main>
    </>
  );
}
const php = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);

const workspaces = [
  {href: "#compare", title: "Compare stages", body: "PAP totals, project comparison rows, House-reading filters, NEP-only splits, fuzzy suggestions, analytics, and CSV/JSON exports."},
  {href: "#analysis", title: "Analysis", body: "Office/program headlines, ranked insertions and deletions, adjustments, and descriptive statistics with group drill-downs into Compare."},
  {href: "#analysis?view=insertions", title: "Insertions", body: "House-only allocation records ranked by amount — no suggestion, unresolved NEP suggestions, and HGAB3-only."},
  {href: "#analysis?view=deletions", title: "Deletions", body: "NEP-only line items ranked by amount — no House suggestion vs possible replacements named by unmatched House rows."},
  {href: "#analysis?view=adjustments", title: "Adjustments", body: "2nd→3rd reading ledger and House vs NEP amount differences by region, office, program, or PAP."},
  {href: "#house", title: "House GAB", body: "Native I-B hierarchy with PS/MOOE/CO controls; switch to I-C project trees and both readings."},
  {href: "#nep", title: "DBM NEP", body: "Canonical NEP tree, expenditure classes, source review queue, and II-B PDF preview."},
  {href: "#transparency", title: "DPWH Transparency NEP", body: "Retained Transparency listing hierarchy and snapshot checks."},
  {href: "#resources", title: "Resources", body: "Direct links to retained JSON datasets, audits, and method docs."},
  {href: "#house-nep", title: "House / NEP detail", body: "Printed controls, local/FAP program totals, extraction gaps, and allocation candidates."},
  {href: "#nep-detail", title: "NEP detail", body: "Detailed expense/program tree with native-text evidence."},
];

function Home() {
  const [data, setData] = useState(null),
    [headlines, setHeadlines] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadData("source_verification_overview.json", controller.signal),
      loadData("comparison_overview_2027.json", controller.signal),
    ])
      .then(([sources, overview]) => {
        setData(sources);
        setHeadlines(overview.headlines);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const insert = headlines?.rankings?.third;
  const deletions = headlines?.deletions;
  const candidates = insert && deletions ? [
    {href: "#analysis?view=insertions&ranking=no_suggestion", title: "Insertions · no suggestion", rows: insert.no_suggestion.comparison_rows, amount_php: insert.no_suggestion.amount_php, note: "House-only rows with no NEP/Transparency anchor and no fuzzy suggestion"},
    {href: "#analysis?view=insertions&ranking=unresolved", title: "Insertions · unresolved", rows: insert.unresolved.comparison_rows, amount_php: insert.unresolved.amount_php, note: "House-only rows with fuzzy or ambiguous NEP suggestions"},
    {href: "#analysis?view=deletions&ranking=no_suggestion", title: "Deletions · no suggestion", rows: deletions.no_suggestion.comparison_rows, amount_php: deletions.no_suggestion.amount_php, note: "NEP-only items that no unmatched House row names as a counterpart"},
    {href: "#analysis?view=deletions&ranking=suggested", title: "Deletions · possible replacements", rows: deletions.suggested.comparison_rows, amount_php: deletions.suggested.amount_php, note: "NEP-only items suggested as counterparts by unmatched House rows"},
    {href: "#compare?view=projects&change=third_only", title: "HGAB3 only", rows: insert.third_only.comparison_rows, amount_php: insert.third_only.amount_php, note: "Records present only in the third House reading"},
  ] : null;
  return (
    <>
      <section className="hero">
        <p className="eyebrow">DPWH · FY2027</p>
        <h1>Budget stage workbench</h1>
        <p>
          Compare Transparency NEP → DBM NEP → House GAB (HGAB2/HGAB3), rank
          insertion and deletion candidates, inspect source trees, and preview
          the PDF beside each recorded reference.
        </p>
        <div className="hero-actions">
          <a className="primary" href="#compare">Open sortable comparison →</a>
          <a className="secondary" href="#analysis">Open analysis →</a>
        </div>
        <p className="muted">
          Matches remain provisional. Source review and coverage checks are
          still open. Unmatched rows alone do not establish insertions, removals,
          or policy changes.
        </p>
      </section>
      <h2>Review candidates</h2>
      <p className="muted">Build-time headlines from the retained comparison. Open a group for ranked lists and dimension rollups, or jump into Compare with the matching filter.</p>
      {error && <p role="alert">{error}</p>}
      {!candidates && !error && <p role="status">Loading candidate headlines…</p>}
      {candidates && <div className="cards candidate-cards" role="region" aria-label="Review candidate groups">
        {candidates.map((c) => (
          <article key={c.href}>
            <h3>{c.title}</h3>
            <strong>{c.rows.toLocaleString()} rows</strong>
            <p>{amount(c.amount_php)} · {c.note}</p>
            <a href={c.href}>Open in Analysis / Compare →</a>
          </article>
        ))}
      </div>}
      <h2>Explore the workbench</h2>
      <ul className="home-directory" aria-label="Workbench workspaces">
        {workspaces.map((w) => (
          <li key={w.href}>
            <a href={w.href}><strong>{w.title}</strong><span>{w.body}</span></a>
          </li>
        ))}
      </ul>
      <h2>Verify a source</h2>
      {!data && !error && <p role="status">Loading source status…</p>}
      <div className="cards">
        {data?.sources.map((s) => (
          <article key={s.key}>
            <h3>{s.key === "hb" ? "House GAB" : s.key === "nep" ? "DBM NEP" : s.title}</h3>
            <strong>{php(s.audit.total / s.scale)}</strong>
            <p>
              {s.audit.internal_checks.toLocaleString()} rollup checks ·{" "}
              {s.audit.failures.length} arithmetic failures
            </p>
            {s.project_detail_summary && (
              <p className="native-project-summary">
                Native I-C · {s.project_detail_summary.named_project_leaves.toLocaleString()} named-project leaves
                {" + "}{s.project_detail_summary.fap_projects} FAP totals ·{" "}
                {php(s.project_detail_summary.additive_leaf_total_php)} MOOE + CO (excludes PS)
              </p>
            )}
            <a href={routeHref(legacyRoutes[s.page])}>Inspect hierarchy →</a>
            {s.project_detail_summary && <a href="#house-nep">Inspect native I-C allocation candidates →</a>}
            {s.review_summary.needs_source_check > 0 && (
              <a href={routeHref(legacyRoutes[s.page], { view: "review" })}>
                Review {s.review_summary.needs_source_check.toLocaleString()}{" "}
                source checks →
              </a>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
