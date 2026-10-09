// URLs work under the GitHub project prefix and the packaged local preview.
export const siteUrl = (path) =>
  import.meta.env?.DEV && path === "index.html"
    ? new URL("/legacy/index.html", window.location.href).href
    : new URL(`../${path}`, window.location.href.split("#")[0]).href;
export async function loadData(name, signal) {
  const response = await fetch(siteUrl(`analysis/${name}`), { signal });
  if (!response.ok)
    throw new Error(`Could not load ${name} (${response.status}).`);
  return response.json();
}
export const repo =
  "https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/";
const documents = {
  "house-tree": { path: "HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf", label: "House 2nd reading · Volume I-B", pageLabel: "House 2nd · I-B" },
  "house-projects": { path: "HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf", label: "House 2nd reading · Volume I-C", pageLabel: "House 2nd · I-C" },
  "house-third-controls": { path: "HB_BUDGET_3rd_reading/2-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-B.pdf", label: "House 3rd reading · Volume I-B", pageLabel: "House 3rd · I-B" },
  "house-third": { path: "HB_BUDGET_3rd_reading/3-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-C%20.pdf", label: "House 3rd reading · Volume I-C", pageLabel: "House 3rd · I-C" },
  nep: { path: "pdfs/NEP-2027-VOLUME-2B_OCR.pdf", label: "DBM NEP · Volume II-B (retained OCR)", pageLabel: "NEP · II-B (retained OCR)" },
};
export function sourceDocument(key) {
  const document = documents[key];
  if (!document) return null;
  return { url: siteUrl(document.path), document: document.label, pageLabel: document.pageLabel };
}
function documentReference(key, page, title) {
  if (!Number.isInteger(page) || page < 1) return null;
  const document = sourceDocument(key);
  if (!document) return null;
  return {
    ...document,
    page,
    title,
  };
}
export function sourceReference(kind, page, title = "Source evidence") {
  return documentReference(["house", "house-second"].includes(kind) ? "house-projects" : kind, page, title);
}
export function treeSourceReference(route, node) {
  return documentReference(node.source?.document_key || (route === "house" ? "house-tree" : route === "nep" ? "nep" : null),
    node.source?.pdf_page, node.label);
}
export function retainedAssetUrl(value) {
  if (/^(?:https?:|blob:|data:)/.test(value)) return value;
  const [path, fragment] = value.split("#"), filename = path.split("/").pop();
  if (path.endsWith(".md")) return repo + "analysis/" + (path.includes("docs/") ? "docs/" : "") + filename + (fragment ? "#" + fragment : "");
  if (path.includes("source_review_evidence/")) return siteUrl("analysis/source_review_evidence/" + path.split("source_review_evidence/")[1]);
  return siteUrl("analysis/" + filename);
}
