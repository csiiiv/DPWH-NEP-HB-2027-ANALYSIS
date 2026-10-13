// Hash routing for every workbench workspace.
//
// DPWH keeps its historical unprefixed routes (#nep, #compare, …) so every
// published link keeps resolving. Each annex workspace lives under its own
// prefix (#fmr/…, #nia/…, #hfep/…) and reuses the same route keys, so each
// app only ever sees its unprefixed key.
//
// Adding a workspace: append an entry to `workspaces` below. The prefix is
// the hash segment, `pages` is its tab list (reuse DPWH tab keys where an
// analogy exists so workspace switching keeps the reader on the analogous
// page), and `load` is the lazy app import used by Workbench.jsx. No other
// file needs a workspace branch.
export const routes = {
  home: { label: "Home" },
  analysis: { label: "Analysis" },
  highlights: { label: "Highlights" },
  compare: { label: "Compare stages" },
  house: { label: "House GAB", file: "hb_native_verification.html" },
  nep: { label: "DBM NEP", file: "nep_source_verification.html" },
  transparency: { label: "DPWH Transparency NEP", file: "dpwh_nep_api_verification.html" },
  resources: { label: "Resources" },
  about: { label: "About" },
  "house-nep": { label: "House / NEP detail", file: "source_comparison_2027.html" },
  "nep-detail": { label: "NEP detail", file: "nep_2027_tree.html" },
};
export const legacyRoutes = Object.fromEntries([
  ...Object.entries(routes).filter(([, r]) => r.file).map(([key, r]) => [r.file, key]),
  ["stage_trace_2027.html", "compare"],
  ["index.html", "home"],
]);

// Workspace registry: everything the shell needs to know about a workspace.
// DPWH is the unprefixed default; annex workspaces each own one hash prefix.
// `label` appears in the header's workspace selector, `pages` is the tab
// list, and `load` is the lazy app import (so annex bundles stay code-split).
export const workspaces = {
  dpwh: {
    label: "DPWH",
    prefix: "",
    pages: [
      ["home", "Home"],
      ["highlights", "Highlights"],
      ["compare", "Compare stages"],
      ["analysis", "Analysis"],
      ["house", "House GAB"],
      ["nep", "DBM NEP"],
      ["transparency", "DPWH Transparency NEP"],
      ["resources", "Resources"],
      ["about", "About"],
    ],
  },
  fmr: {
    label: "DA Farm-to-Market Roads",
    prefix: "fmr",
    pages: [
      ["home", "Home"],
      ["highlights", "Highlights"],
      ["compare", "Compare Stages"],
      ["analysis", "Analysis"],
      ["map", "Map"],
      ["house", "House GAB"],
      ["nep", "DBM NEP"],
    ],
  },
  hfep: {
    label: "DOH Health Facilities",
    prefix: "hfep",
    pages: [
      ["home", "Home"],
      ["highlights", "Highlights"],
      ["compare", "Compare Stages"],
      ["analysis", "Analysis"],
      ["house", "House GAB"],
      ["nep", "DBM NEP"],
    ],
  },
};
// Tab list exports kept for existing consumers (WorkbenchHeader, tests).
export const dpwhPages = workspaces.dpwh.pages;
export const fmrPages = workspaces.fmr.pages;
export const hfepPages = workspaces.hfep.pages;
export const workspaceLabels = Object.fromEntries(
  Object.entries(workspaces).map(([key, ws]) => [key, ws.label]),
);
const workspaceByPrefix = Object.fromEntries(
  Object.entries(workspaces).map(([key, ws]) => [ws.prefix, key]),
);
// The workspace a hash points at: an annex prefix segment (#fmr/…) selects
// that workspace; anything else is DPWH's historical unprefixed space.
export function readWorkspace(hash) {
  const path = (hash ?? (typeof location === "undefined" ? "" : location.hash))
    .replace(/^#\/?/, "")
    .split("?")[0];
  const first = path.split("/")[0];
  return workspaceByPrefix[first] ?? "dpwh";
}
export function readRoute(hash = location.hash) {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const segments = path.split("/").filter(Boolean);
  const workspace = workspaceByPrefix[segments[0]] ?? "dpwh";
  if (workspace !== "dpwh")
    return { workspace, key: segments.slice(1).join("/") || "home", params };
  return { workspace, key: path || "home", params };
}
// Links keep the active workspace unless a caller explicitly passes one, so
// any component can emit routeHref(key, params) and stay in its workspace.
export function routeHref(key, params = {}, workspace = readWorkspace()) {
  const query = new URLSearchParams(params).toString();
  const prefix = workspaces[workspace]?.prefix ? `${workspaces[workspace].prefix}/` : "";
  return `#${prefix}${key}${query ? "?" + query : ""}`;
}
// Workspace switch keeps the reader on the analogous tab when the target
// workspace has one (tab keys shared with DPWH map across; others fall back
// to Home). Query params stay behind — each workspace interprets its own
// filters.
export function workspaceHref(target, route = readRoute()) {
  const targetPages = workspaces[target]?.pages ?? [];
  const currentKey = route.key;
  const key = targetPages.some(([k]) => k === currentKey)
    ? currentKey
    : "home";
  return routeHref(key, {}, target);
}
