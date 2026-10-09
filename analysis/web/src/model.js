import { matchesSearch } from "./search.js";
import { matchesOffice } from "../../viewers/project_offices.mjs";
export { officeOptions, officeLabels, NO_OFFICE } from "../../viewers/project_offices.mjs";

export function amount(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value),
    [scale, suffix] =
      magnitude >= 1e9
        ? [1e9, "B"]
        : magnitude >= 1e6
          ? [1e6, "M"]
          : [1e3, "K"];
  return `${value < 0 ? "−" : ""}₱${(magnitude / scale).toFixed(3)}${suffix}`;
}
export function metric(current, prior, mode) {
  if (current == null || !Number.isFinite(current)) return null;
  if (mode === "total") return current;
  if (prior == null || !Number.isFinite(prior)) return null;
  if (mode === "delta") return current - prior;
  return prior === 0 ? null : ((current - prior) / Math.abs(prior)) * 100;
}
export function compare(a, b, direction = 1) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return (
    direction *
    (typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true }))
  );
}
export function values(row, tab) {
  if (tab === "readings") return [row.second?.amount_php ?? null, row.third?.amount_php ?? null];
  return tab === "paps"
    ? [row.api_php, row.nep_php, row.house_control_php ?? row.house_extract_php]
    : [
        row.api?.amount_php ?? null,
        row.nep?.amount_php ?? null,
        row.house?.amount_php ?? null,
      ];
}
export function selectRows(
  rows,
  {
    query = "",
    program = "",
    region = "",
    office = "",
    trace = "",
    column = "title",
    mode = "total",
    direction = 1,
    tab = "projects",
  },
) {
  const q = query.trim().toLowerCase();
  return rows
    .filter(
      (r) =>
        (!q || matchesSearch(JSON.stringify(r), q)) &&
        (!program || r.program === program) &&
        (!region || r.region === region) &&
        matchesOffice(r, office, region) &&
        (!trace || (trace === "reading_changed" && tab === "readings"
          ? r.delta_php !== 0 || ["second_only", "third_only"].includes(r.trace)
          : r.trace === trace)),
    )
    .sort((a, b) => {
      const key = (r) => {
        if (column === "reading_delta") return r.delta_php;
        if (column === "title") return r.title ?? r.label;
        if (["region", "pdf_page", "trace"].includes(column))
          return r[column] ?? null;
        if (tab === "gaps") return r.amount_php ?? null;
        return metric(
          values(r, tab)[Number(column)],
          values(r, tab)[Number(column) - 1],
          mode,
        );
      };
      return compare(key(a), key(b), direction);
    });
}
