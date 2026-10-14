import React from "react";
import { repo, siteUrl } from "./data.js";
import { routeHref } from "./routes.js";
import WorkbenchHeader from "./WorkbenchHeader.jsx";
import { kindLabel, sourceGroups } from "./sourcesCatalog.js";

// The Sources workspace catalogs every shareable, normalized dataset in one
// place: what it contains, where it lives in the repository, and how it can
// be used. GitHub links open the canonical file; packaged artifacts download
// from the hosted site.
function itemHref(item) {
  if (item.kind === "external") return item.path;
  if (item.kind === "doc" || item.kind === "repo") return repo + item.path;
  return siteUrl(item.path);
}

function itemProps(item) {
  // Packaged PDFs open for viewing; dataset files download by filename.
  if (item.kind === "data" && item.path.split("#")[0].endsWith(".pdf"))
    return { target: "_blank", rel: "noreferrer" };
  if (item.kind === "data")
    return { download: item.path.split("/").pop() };
  return { target: "_blank", rel: "noreferrer" };
}

export default function Sources() {
  return (
    <>
      <a className="fmr-skip" href="#sources-content" onClick={e => {e.preventDefault(); document.getElementById('sources-content')?.focus();}}>Skip to content</a>
      <WorkbenchHeader workspace="sources" route="home"/>
      <main id="sources-content" tabIndex={-1} className="shell fmr-main">
      <section className="hero">
        <p className="eyebrow">FY2027 · all workspaces</p>
        <h1>Sources and datasets</h1>
        <p>
          The shareable, normalized data behind every workspace. Each entry
          links to its canonical file in the{" "}
          <a href={repo} target="_blank" rel="noreferrer">GitHub repository</a>{" "}
          (or downloads from this site when packaged), explains what it
          contains, and states its limits. Rebuild any artifact from the
          retained source PDFs with the repository scripts.
        </p>
        <p className="muted">
          Integer Philippine pesos · new appropriations only · candidate
          cross-document pairs are provisional · machine audits record every
          rebuild's checks
        </p>
      </section>
      <div className="resource-groups">
        {sourceGroups.map((group) => (
          <section key={group.id} className="resource-group" aria-labelledby={`sources-${group.id}`}>
            <div className="resource-group-head">
              <h2 id={`sources-${group.id}`}>{group.title}</h2>
              <p className="muted">{group.blurb}</p>
              {group.workspace && (
                <a href={"#" + group.workspace}>Open workspace →</a>
              )}
            </div>
            <ul className="resource-list">
              {group.items.map((item) => (
                <li key={item.path ?? item.label}>
                  {item.kind === "text" ? (
                    <span className="resource-note">{item.label}</span>
                  ) : (
                    <a href={itemHref(item)} {...itemProps(item)}>
                      {item.label}
                    </a>
                  )}
                  <span className="resource-kind">{kindLabel[item.kind] || item.kind}</span>
                  {item.purpose && <p className="resource-purpose">{item.purpose}</p>}
                  {item.coverage && <small>{item.coverage}</small>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      </main>
    </>
  );
}
