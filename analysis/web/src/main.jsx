import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadData, repo, siteUrl } from "./data.js";
import "./styles.css";
const Comparison = lazy(() => import("./Comparison.jsx"));
function App() {
  const [route, setRoute] = useState(
    location.hash === "#compare" ? "compare" : "home",
  );
  useEffect(() => {
    const update = () =>
      setRoute(location.hash === "#compare" ? "compare" : "home");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
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
      <header className="shell">
        <nav aria-label="Workbench pages">
          <a href="#home" aria-current={route === "home" ? "page" : undefined}>
            Home
          </a>
          <a
            href="#compare"
            aria-current={route === "compare" ? "page" : undefined}
          >
            Compare stages
          </a>
          <a href={siteUrl("analysis/hb_native_verification.html")}>
            House native
          </a>
          <a href={siteUrl("analysis/nep_source_verification.html")}>
            Official NEP
          </a>
          <a href={siteUrl("analysis/dpwh_nep_api_verification.html")}>
            DPWH Transparency NEP
          </a>
          <a href={repo + "README.md"}>Repository README</a>
          <a href={repo + "analysis/README.md"}>Workbench README</a>
        </nav>
      </header>
      <main id="main" tabIndex="-1" className="shell">
        <p className="preview">
          React migration preview ·{" "}
          <a href={siteUrl("index.html")}>Current static workbench</a>
        </p>
        {route === "compare" ? (
          <Suspense
            fallback={<p role="status">Loading comparison interface…</p>}
          >
            <Comparison />
          </Suspense>
        ) : (
          <Home />
        )}
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
          DPWH Transparency NEP → Official NEP → House. Explore amounts, sort
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
            <h3>{s.title}</h3>
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
            <a href={siteUrl("analysis/" + s.page)}>Inspect hierarchy →</a>
            {s.review_summary.needs_source_check > 0 && (
              <a href={siteUrl("analysis/" + s.page + "#review")}>
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
