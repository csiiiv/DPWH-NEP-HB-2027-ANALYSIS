import React from "react";
import { repo, siteUrl } from "./data.js";
import { routeHref } from "./routes.js";
import { kindLabel, resourceGroups } from "./resources.js";

function itemHref(item) {
  if (item.kind === "doc") return repo + item.path;
  if (item.kind === "external") return item.path;
  return siteUrl(item.path);
}

function itemProps(item) {
  if (item.kind === "data") {
    return { download: item.path.split("/").pop() };
  }
  if (item.kind === "pdf") {
    return { target: "_blank", rel: "noreferrer" };
  }
  return { target: "_blank", rel: "noreferrer" };
}

export default function Resources() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">DPWH · FY2027</p>
        <h1>Resources</h1>
        <p>
          Direct links to the latest workable datasets and the source PDFs they
          were built from. JSON downloads from the packaged site; Markdown
          audits open on GitHub; PDFs open in a new tab.
        </p>
        <p className="muted">
          Status mirrors the repository README · 9 October 2026 · integer
          Philippine pesos · new appropriations only
        </p>
        <a className="primary" href={repo + "README.md#latest-usable-datasets"}>
          Full dataset notes in README →
        </a>
      </section>
      <div className="resource-groups">
        {resourceGroups.map((group) => (
          <section key={group.id} className="resource-group" aria-labelledby={`resource-${group.id}`}>
            <div className="resource-group-head">
              <h2 id={`resource-${group.id}`}>{group.title}</h2>
              <p className="muted">{group.blurb}</p>
              {group.workspace && (
                <a href={routeHref(group.workspace)}>Open workspace →</a>
              )}
            </div>
            <ul className="resource-list">
              {group.items.map((item) => (
                <li key={item.path}>
                  <a href={itemHref(item)} {...itemProps(item)}>
                    {item.label}
                  </a>
                  <span className="resource-kind">{kindLabel[item.kind] || item.kind}</span>
                  {item.purpose && <p className="resource-purpose">{item.purpose}</p>}
                  {item.coverage && <small>{item.coverage}</small>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
