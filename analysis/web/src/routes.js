// Hash routing for both workbench workspaces.
//
// DPWH keeps its historical unprefixed routes (#nep, #compare, …) so every
// published link keeps resolving. The FMR workspace lives under an #fmr/
// prefix (#fmr/nep, #fmr/compare?view=projects, …) and reuses the same route
// keys, so each app only ever sees its unprefixed key.
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
export const workspaceLabels = { dpwh: "DPWH", fmr: "DA Farm-to-Market Roads" };
// Tab set of the FMR workspace. Keys deliberately match DPWH tab names so
// switching workspaces can keep the reader on the analogous page.
export const fmrPages = [
  ["home", "Home"],
  ["highlights", "Highlights"],
  ["compare", "Compare Stages"],
  ["analysis", "Analysis"],
  ["map", "Map"],
  ["house", "House GAB"],
  ["nep", "DBM NEP"],
];
// The workspace a hash points at: "fmr" for #fmr/…, otherwise DPWH.
export function readWorkspace(hash) {
  const path = (hash ?? (typeof location === "undefined" ? "" : location.hash))
    .replace(/^#\/?/, "")
    .split("?")[0];
  return path.split("/")[0] === "fmr" ? "fmr" : "dpwh";
}
export function readRoute(hash = location.hash) {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "fmr")
    return { workspace: "fmr", key: segments.slice(1).join("/") || "home", params };
  return { workspace: "dpwh", key: path || "home", params };
}
// Links keep the active workspace unless a caller explicitly passes one, so
// any component can emit routeHref(key, params) and stay in its workspace.
export function routeHref(key, params = {}, workspace = readWorkspace()) {
  const query = new URLSearchParams(params).toString();
  const prefix = workspace === "fmr" ? "fmr/" : "";
  return `#${prefix}${key}${query ? "?" + query : ""}`;
}
// Workspace switch keeps the reader on the analogous tab when the target
// workspace has one (all six FMR tabs exist in DPWH; Transparency/Resources/
// About fall back to Home). Query params stay behind — each workspace
// interprets its own filters.
export function workspaceHref(target, route = readRoute()) {
  const key = target === "fmr"
    ? (fmrPages.some(([k]) => k === route.key) ? route.key : "home")
    : (routes[route.key] ? route.key : "home");
  return routeHref(key, {}, target);
}
