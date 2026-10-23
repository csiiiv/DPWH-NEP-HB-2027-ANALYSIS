// One site, several workbenches. A tiny shell above the apps decides which
// workspace a hash points at, keeps the shared header in sync (including the
// workspace selector), and lazy-loads each workspace's code/data only when
// its routes open. Workspaces register in routes.js; this shell never grows
// a per-annex branch.
import React, { lazy, Suspense, useEffect, useState } from "react";
import { readWorkspace } from "./routes.js";
import DisclaimerFooter from "./DisclaimerNotice.jsx";

const FmrApp = lazy(() => import("./FmrApp.jsx"));
const DpwhApp = lazy(() => import("./DpwhApp.jsx"));
const MainOverview = lazy(() => import("./MainOverview.jsx"));
const Sources = lazy(() => import("./Sources.jsx"));
const AboutApp = lazy(() => import("./AboutApp.jsx"));
const ExperimentsApp = lazy(() => import("./ExperimentsApp.jsx"));
const HfepApp = lazy(() => import("./HfepApp.jsx"));
const NiaApp = lazy(() => import("./NiaApp.jsx"));
const GeoApp = lazy(() => import("./GeoApp.jsx"));
const CongressApp = lazy(() => import("./CongressApp.jsx"));
const DisclaimerApp = lazy(() => import("./DisclaimerApp.jsx"));

// Lazy loaders per registered workspace key. DPWH is statically imported as
// the default workspace; each annex app is code-split behind its prefix.
const lazyApps = { overview: MainOverview, sources: Sources, about: AboutApp, disclaimer: DisclaimerApp, experiments: ExperimentsApp, fmr: FmrApp, hfep: HfepApp, nia: NiaApp, geo: GeoApp, congress: CongressApp };

export default function Workbench() {
  const [workspace, setWorkspace] = useState(() => readWorkspace());
  useEffect(() => {
    const update = () => setWorkspace(readWorkspace());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const App = lazyApps[workspace] ?? DpwhApp;
  return (
    <div className="workbench-shell">
      <div className="workbench-content">
        <Suspense fallback={<p role="status">Loading workspace…</p>}>
          <App />
        </Suspense>
      </div>
      <DisclaimerFooter />
    </div>
  );
}
