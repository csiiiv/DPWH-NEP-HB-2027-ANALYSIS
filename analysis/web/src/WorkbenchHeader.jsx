import React from "react";
import "../../viewers/page_navigation.css";
import { routeHref, workspaceHref, workspaces } from "./routes.js";

// The header selects the workspace; the tab row shows that workspace's pages.
// Workspaces register in routes.js; the selector and tab row render whatever
// the registry contains, so a new annex workspace appears automatically.
export default function WorkbenchHeader({ route, workspace = "dpwh", items }) {
  // Hidden workspaces (experiments) stay reachable by direct URL but never
  // appear in the workspace nav.
  const registered = Object.keys(workspaces).filter((key) => !workspaces[key].hidden);
  const tabs = items ?? (workspace !== 'overview' && workspace in workspaces
    ? workspaces[workspace].pages.map(([key, label]) => [key, label, routeHref(key, {}, workspace)])
    : []);
  return (
    <header className="shell">
      <nav className="page-tabs workspace-tabs" aria-label="Workbench workspaces">
        {registered.map((key) => (
          <a key={key} href={workspaceHref(key, { key: route })}
            aria-current={workspace === key ? "page" : undefined}
            className="workspace-tab">
            {workspaces[key].label}
          </a>
        ))}
      </nav>
      {tabs.length > 0 && <nav className="page-tabs" aria-label="Workbench pages">
        {tabs.map(([key, label, destination]) => (
          <a key={key} href={destination}
            aria-current={route === key ? "page" : undefined}>{label}</a>
        ))}
      </nav>}
    </header>
  );
}
