// Standalone routing shim for the dedicated NIA browser.
//
// The NIA views (NiaApp.jsx, NiaMap.jsx) are shared byte-identical with the
// main workbench, which routes every workspace under a hash prefix. This shim
// keeps the SAME contract but registers only the NIA workspace, so URLs are
// fully interoperable: a link like #nia/analysis?view=senate works in both
// apps, and bare hashes (#analysis) resolve to NIA here instead of DPWH.
export const workspaces = {
  nia: {
    label: "NIA Irrigation",
    prefix: "nia",
    pages: [
      ["home", "Home"],
      ["highlights", "Highlights"],
      ["compare", "Compare stages"],
      ["analysis", "Analysis"],
      ["map", "Map"],
      ["house", "House GAB"],
      ["nep", "DBM NEP"],
    ],
  },
};
export const niaPages = workspaces.nia.pages;
export const workspaceLabels = { nia: workspaces.nia.label };

export function readRoute(hash = location.hash) {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  // Older tab links serialized reset values as text; treat them as unset the
  // same way the main workbench does, preserving genuine search text.
  for (const key of ['pair','node','group','records','status','direction','ranking','sort','dir','district']) {
    if (['null','undefined'].includes(params.get(key))) params.delete(key);
  }
  const segments = path.split("/").filter(Boolean);
  const key = segments[0] === "nia"
    ? (segments.slice(1).join("/") || "home")
    : (segments.join("/") || "home");
  return { workspace: "nia", key, params };
}

export function routeHref(key, params = {}, workspace = "nia") {
  const entries = params instanceof URLSearchParams ? [...params] : Object.entries(params);
  const query = new URLSearchParams(
    entries.filter(([, value]) => value != null && value !== ""),
  ).toString();
  return `#nia/${key}${query ? "?" + query : ""}`;
}
