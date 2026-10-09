import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadData } from "./data.js";
import "./styles.css";
import WorkbenchHeader from "./WorkbenchHeader.jsx";
import { routes, readRoute, routeHref, legacyRoutes } from "./routes.js";
const SourceWorkspace = lazy(() => import("./SourceWorkspace.jsx"));
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
          {route.key === "compare" ? <Comparison route={route} /> : route.key === "home" ? <Home /> : route.key === "resources" ? <Resources /> : routes[route.key] ?
            <SourceWorkspace key={route.key} route={route} /> :
            <section><h1>Page not found</h1><p>This workbench route is unavailable.</p><a href="#home">Return home</a></section>}
        </Suspense>
      </main>
    </>
  );
}
function Home() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    loadData("source_verification_overview.json", controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">DPWH · FY2027</p>
        <h1>Compare budget stages</h1>
        <p>
          DPWH Transparency NEP → DBM NEP → House GAB. Explore amounts, sort
          deltas, and preview the source PDF beside each recorded reference.
        </p>
        <a className="primary" href="#compare">
          Open sortable comparison →
        </a>
        <p className="muted">
          Matches remain provisional. Source review and coverage checks are
          still open.
        </p>
      </section>
      <h2>Verify a source</h2>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading source status…</p>}
      <div className="cards">
        {data?.sources.map((s) => (
          <article key={s.key}>
            <h3>{s.key === "hb" ? "House GAB" : s.key === "nep" ? "DBM NEP" : s.title}</h3>
            <strong>
              {new Intl.NumberFormat("en-PH", {
                style: "currency",
                currency: "PHP",
                maximumFractionDigits: 0,
              }).format(s.audit.total / s.scale)}
            </strong>
            <p>
              {s.audit.internal_checks.toLocaleString()} rollup checks ·{" "}
              {s.audit.failures.length} arithmetic failures
            </p>
            {s.project_detail_summary && (
              <p className="native-project-summary">
                Native I-C · {s.project_detail_summary.named_project_leaves.toLocaleString()} named-project leaves
                {" + "}{s.project_detail_summary.fap_projects} FAP totals ·{" "}
                {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(s.project_detail_summary.additive_leaf_total_php)} MOOE + CO (excludes PS)
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
