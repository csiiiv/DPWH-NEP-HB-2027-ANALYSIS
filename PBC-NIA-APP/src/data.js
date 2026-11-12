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
// The published Pages origin, derived from the repo identity above so a rename
// updates both. Exported citations are rooted here rather than at whatever
// origin served the app: a download outlives the session and gets opened from
// another machine, an email or a shared drive, where a dev-server link
// (http://127.0.0.1:5173/…) is dead on arrival. The in-app PDF viewer keeps
// using siteUrl(), so local files and range requests still work under `npm run dev`.
const pagesOrigin = (() => {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\//.exec(repo);
  return match ? `https://${match[1]}.github.io/${match[2]}` : null;
})();
const documents = {
  "house-tree": { path: "HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf", label: "House 2nd reading · Volume I-B", pageLabel: "House 2nd · I-B" },
  "house-projects": { path: "HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf", label: "House 2nd reading · Volume I-C", pageLabel: "House 2nd · I-C" },
  "house-third-controls": { path: "HB_BUDGET_3rd_reading/2-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-B.pdf", label: "House 3rd reading · Volume I-B", pageLabel: "House 3rd · I-B" },
  "house-third": { path: "HB_BUDGET_3rd_reading/3-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-C%20.pdf", label: "House 3rd reading · Volume I-C", pageLabel: "House 3rd · I-C" },
  nep: { path: "pdfs/NEP-2027-VOLUME-2B_OCR.pdf", label: "DBM NEP · Volume II-B (retained OCR)", pageLabel: "NEP · II-B (retained OCR)" },
  "fmr-house": { path: "HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf", label: "House FMR annex · supplied Volume I-B", pageLabel: "House FMR annex" },
  "fmr-nep": { path: "dbm-other-nep-line-data/FMR.pdf", label: "DBM NEP · FMR schedule", pageLabel: "NEP FMR schedule" },
};
export function sourcePdfPath(key) {
  return documents[key] ? decodeURIComponent(documents[key].path) : null;
}
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
/**
 * A portable, page-anchored link to a source PDF, rooted at the published site
 * rather than the origin currently serving the app.
 *
 * Use this for anything a reader takes away — CSV/JSON exports, cited links in
 * a report — because the file outlives the session. Returns null when the page
 * is not a positive integer or the kind is not a known document, matching
 * sourceReference()'s contract, so callers can fall back to a bare page number
 * instead of emitting a broken link.
 */
export function publishedSourceLink(kind, page) {
  const key = ["house", "house-second"].includes(kind) ? "house-projects" : kind;
  const document = documents[key];
  if (!document || !pagesOrigin) return null;
  if (!Number.isInteger(page) || page < 1) return null;
  return `${pagesOrigin}/${document.path}#page=${page}`;
}
// Resolve source anchors centrally, including links emitted by retained views.
// GitHub blob pages are HTML; PDF.js needs the raw document with CORS support.
export function pdfSourceFromUrl(value, title = "Source evidence") {
  let url;
  try { url = new URL(value, window.location.href); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !/\.pdf$/i.test(url.pathname)) return null;
  const requested = Number(new URLSearchParams(url.hash.slice(1)).get('page'));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  url.hash = '';
  const known = Object.keys(documents).map(sourceDocument).find(document => document.url === url.href);
  if (url.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/blob\//.test(url.pathname)) {
    url.hostname = 'raw.githubusercontent.com';
    url.pathname = url.pathname.replace('/blob/', '/');
  }
  return {url: url.href, page, title, document: known?.document ?? decodeURIComponent(url.pathname.split('/').pop())};
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
