import React from "react";
import "../../viewers/page_navigation.css";
import { fmrPages, routeHref, workspaceHref, workspaceLabels } from "./routes.js";

const pages = [
  ["home", "Home", "#home"],
  ["highlights", "Highlights", "#highlights"],
  ["compare", "Compare stages", "#compare"],
  ["analysis", "Analysis", "#analysis"],
  ["house", "House GAB", "#house"],
  ["nep", "DBM NEP", "#nep"],
  ["transparency", "DPWH Transparency NEP", "#transparency"],
  ["resources", "Resources", "#resources"],
  ["about", "About", "#about"],
];

// The header selects the workspace; the tab row shows that workspace's pages.
// FMR reuses the same six tab keys under an #fmr/ prefix, so switching
// workspaces keeps the reader on the analogous page.
export default function WorkbenchHeader({ route, workspace = "dpwh", items }) {
  const tabs = items ?? (workspace === "fmr"
    ? fmrPages.map(([key, label]) => [key, label, routeHref(key, {}, "fmr")])
    : pages);
  return (
    <header className="shell">
      <nav className="page-tabs workspace-tabs" aria-label="Workbench workspaces">
        {["dpwh", "fmr"].map((key) => (
          <a key={key} href={workspaceHref(key, { key: route })}
            aria-current={workspace === key ? "page" : undefined}
            className="workspace-tab">
            {key === "fmr" ? "DA Farm-to-Market Roads" : "DPWH"}
          </a>
        ))}
      </nav>
      <nav className="page-tabs" aria-label="Workbench pages">
        {tabs.map(([key, label, destination]) => (
          <a key={key} href={destination}
            aria-current={route === key ? "page" : undefined}>{label}</a>
        ))}
      </nav>
    </header>
  );
}
