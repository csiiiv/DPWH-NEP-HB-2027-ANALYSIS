export const routes = {
  home: { label: "Home" },
  compare: { label: "Compare stages" },
  house: { label: "House GAB", file: "hb_native_verification.html" },
  nep: { label: "DBM NEP", file: "nep_source_verification.html" },
  transparency: { label: "DPWH Transparency NEP", file: "dpwh_nep_api_verification.html" },
  resources: { label: "Resources" },
  "house-nep": { label: "House / NEP detail", file: "source_comparison_2027.html" },
  "nep-detail": { label: "NEP detail", file: "nep_2027_tree.html" },
};
export const legacyRoutes = Object.fromEntries([
  ...Object.entries(routes).filter(([, r]) => r.file).map(([key, r]) => [r.file, key]),
  ["stage_trace_2027.html", "compare"],
  ["index.html", "home"],
]);
export function readRoute(hash = location.hash) {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  return { key: path || "home", params };
}
export function routeHref(key, params = {}) {
  const query = new URLSearchParams(params).toString();
  return `#${key}${query ? "?" + query : ""}`;
}
