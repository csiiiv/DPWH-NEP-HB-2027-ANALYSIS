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
        (!q || JSON.stringify(r).toLowerCase().includes(q)) &&
        (!program || r.program === program) &&
        (!region || r.region === region) &&
        (!trace || r.trace === trace),
    )
    .sort((a, b) => {
      const key = (r) =>
        column === "title"
          ? (r.title ?? r.label)
          : metric(
              values(r, tab)[Number(column)],
              values(r, tab)[Number(column) - 1],
              mode,
            );
      return compare(key(a), key(b), direction);
    });
}
