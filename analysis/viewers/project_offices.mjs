// Filter actual source assignments; suggested matches do not establish an office.
export const NO_OFFICE = "__no_recorded_office__";

export function officeAssignments(row) {
  const sources = [["House 2nd", row.second], ["House 3rd", row.third],
    ["House", row.house], ["NEP", row.nep], ["Transparency", row.api]];
  const present = sources.filter(([, source]) => source);
  return (present.length ? present : [["NEP", row]]).map(([source, record]) => ({
    source,
    office: String(record.office ?? "").trim().replace(/\s+/g, " "),
    region: record.region ?? row.region ?? "",
  }));
}

export function matchesOffice(row, office, region = "") {
  if (!office) return true;
  const assignments = officeAssignments(row);
  if (office === NO_OFFICE) return assignments.every(a => !a.office);
  return assignments.some(a => a.office === office && (!region || a.region === region));
}

export function officeOptions(rows, region = "") {
  const offices = new Set();
  let missing = false;
  for (const row of rows) {
    const assignments = officeAssignments(row);
    for (const a of assignments) {
      if (a.office && (!region || a.region === region)) offices.add(a.office);
    }
    if (assignments.every(a => !a.office) && (!region || row.region === region || assignments.some(a => a.region === region))) missing = true;
  }
  const options = [...offices].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map(office => ({ value: office, label: office }));
  if (missing) options.push({ value: NO_OFFICE, label: "No recorded office" });
  return options;
}

export function officeLabels(row) {
  return officeAssignments(row).filter(a => a.office).map(a => `${a.source}: ${a.office}`);
}
