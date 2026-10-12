// One site, two workbenches. A tiny shell above both apps decides which
// workspace a hash points at, keeps the shared header in sync (including the
// workspace selector), and lazy-loads FMR code/data only when its routes open.
import React, { lazy, Suspense, useEffect, useState } from "react";
import DpwhApp from "./DpwhApp.jsx";
import { readRoute, readWorkspace } from "./routes.js";

const FmrApp = lazy(() => import("./FmrApp.jsx"));

export default function Workbench() {
  const [workspace, setWorkspace] = useState(() => readWorkspace());
  useEffect(() => {
    const update = () => setWorkspace(readWorkspace());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <Suspense fallback={<p role="status">Loading workspace…</p>}>
      {workspace === "fmr" ? <FmrApp /> : <DpwhApp />}
    </Suspense>
  );
}
