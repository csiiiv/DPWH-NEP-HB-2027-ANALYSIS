// URLs work under the GitHub project prefix and the packaged local preview.
export const siteUrl = (path) =>
  import.meta.env.DEV && path === "index.html"
    ? "http://127.0.0.1:8000/"
    : new URL(`../${path}`, window.location.href.split("#")[0]).href;
export async function loadData(name, signal) {
  const response = await fetch(siteUrl(`analysis/${name}`), { signal });
  if (!response.ok)
    throw new Error(`Could not load ${name} (${response.status}).`);
  return response.json();
}
export const repo =
  "https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/";
export function sourceReference(kind, page, title = "Source evidence") {
  if (!Number.isInteger(page) || page < 1) return null;
  const path =
    kind === "house"
      ? "HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf"
      : kind === "nep"
        ? "pdfs/NEP-2027-VOLUME-2B_OCR.pdf"
        : null;
  if (!path) return null;
  return {
    url: siteUrl(path),
    page,
    title,
    document: kind === "house" ? "House Volume I-C" : "NEP Volume II-B",
  };
}
