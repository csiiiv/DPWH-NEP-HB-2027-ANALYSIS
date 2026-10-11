import React from "react";
import "../../viewers/page_navigation.css";

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

export default function WorkbenchHeader({ route }) {
  return (
    <header className="shell">
      <nav className="page-tabs" aria-label="Workbench pages">
        {pages.map(([key, label, destination]) => (
          <a key={key} href={destination}
            aria-current={route === key ? "page" : undefined}>{label}</a>
        ))}
      </nav>
    </header>
  );
}
