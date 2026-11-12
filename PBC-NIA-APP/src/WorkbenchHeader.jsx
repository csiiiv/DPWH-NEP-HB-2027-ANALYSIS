import React from "react";
import { routeHref, workspaces } from "./routes.js";

// Standalone header shim: NiaApp renders <WorkbenchHeader route={key}
// workspace="nia"/>; in the main workbench this component also hosts the
// cross-workspace selector. Here there is exactly one workspace, so it
// renders just the NIA tab row — same markup classes, same styles.css rules.
export default function WorkbenchHeader({ route, workspace = "nia" }) {
  const tabs = workspaces[workspace]?.pages ?? [];
  return (
    <header className="shell">
      <nav className="page-tabs" aria-label="NIA browser pages">
        {tabs.map(([key, label]) => (
          <a
            key={key}
            href={routeHref(key, {}, workspace)}
            aria-current={route === key ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}
