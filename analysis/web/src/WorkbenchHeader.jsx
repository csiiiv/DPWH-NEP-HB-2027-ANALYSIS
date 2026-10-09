import React from "react";
import { repo } from "./data.js";
import "../../viewers/page_navigation.css";

const pages = [
  ["home", "Home", "#home"],
  ["compare", "Compare stages", "#compare"],
  ["analysis", "Analysis", "#analysis"],
  ["house", "House GAB", "#house"],
  ["nep", "DBM NEP", "#nep"],
  ["transparency", "DPWH Transparency NEP", "#transparency"],
  ["resources", "Resources", "#resources"],
];

export default function WorkbenchHeader({ route }) {
  return (
    <header className="shell">
      <nav className="page-tabs" aria-label="Workbench pages">
        {pages.map(([key, label, destination]) => (
          <a key={key} href={destination}
            aria-current={route === key ? "page" : undefined}>{label}</a>
        ))}
        <a className="docs-tab" href={repo + "README.md"}>Repository README</a>
        <a className="docs-tab" href={repo + "analysis/README.md"}>Workbench README</a>
      </nav>
      <nav className="page-tabs section-tabs" aria-label="Detail workspaces">
        <a href="#house-nep" aria-current={route === "house-nep" ? "page" : undefined}>House / NEP detail</a>
        <a href="#nep-detail" aria-current={route === "nep-detail" ? "page" : undefined}>NEP detail</a>
      </nav>
    </header>
  );
}
