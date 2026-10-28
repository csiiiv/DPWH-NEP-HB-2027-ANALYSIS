// Filter actual source assignments; suggested matches do not establish an office.
export const NO_OFFICE = "__no_recorded_office__";

// Collapse OCR / punctuation variants of the same DEO or regional office so
// filters, overview rollups and option lists treat them as one assignment.
// Examples: "Las Pi ñ as…" → "Las Piñas…"; "Malabon-Navotas…" → "Malabon Navotas…";
// "Regional Office IVA" → "Regional Office IV-A".
export function canonicalOffice(office) {
  if (office == null || office === "") return office ?? "";
  let s = String(office).normalize("NFKC").trim().replace(/\s+/g, " ");
  // Spaced ñ inside a word (NEP OCR): "Pi ñ as" → "Piñas".
  let prev;
  do {
    prev = s;
    s = s.replace(/(\p{L})\s*ñ\s*(\p{L})/gu, (_, a, b) => `${a}ñ${b}`);
  } while (s !== prev);
  if (/District Engineering Office$/i.test(s)) {
    s = s.replace(/\s*-\s*/g, " ").replace(/\s+/g, " ");
  }
  s = s.replace(
    /^(Regional Office )([IVXLC]+)([AB])$/i,
    (_, prefix, numerals, letter) => `${prefix}${numerals.toUpperCase()}-${letter.toUpperCase()}`,
  );
  // Place-name OCR slips → House / gazetteer spelling (keep in sync with
  // analysis/builders/normalize_labels.py PLACE_NAME_SPELLINGS).
  // The office-name slips matter most: "Misamis Occidenatal … District
  // Engineering Office" would otherwise form its own bucket and split one
  // office in two across every office filter.
  s = s
    .replace(/Marindugue/gi, "Marinduque")
    .replace(/Siguijor/gi, "Siquijor")
    .replace(/Occidenatal/gi, "Occidental")
    .replace(/Batagas/gi, "Batangas")
    .replace(/Ilolilo/gi, "Iloilo");
  return s;
}

export function recordedOffice(record) {
  if (!record) return "";
  if (record.office_canonical) return record.office_canonical;
  return record.office ? canonicalOffice(record.office) : "";
}

// Shared with the district crosswalk join: spelling, abbreviation and dash
// variants must not look like a changed implementing office.
export function officeJoinKey(value) {
  let s = canonicalOffice(value || '');
  if (!s) return '';
  s = s.replace(/\bsub[\s-]*deo\b/gi, 'sub district engineering office');
  s = s.replace(/\bDEO\b/gi, 'district engineering office');
  s = s.replace(/[-\u2010-\u2015]/g, ' ');
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Different recorded offices on linked sources; never a claim of transfer.
 * Missing offices and suggested counterparts provide no assignment evidence.
 * Group members retain their own readings rather than just the group header.
 */
export function officeDiscrepancy(row) {
  const assignments = [];
  for (const [stage, source] of [['second', 'House 2nd'], ['third', 'House 3rd'],
    ['house', 'House'], ['nep', 'DBM NEP'], ['api', 'DPWH Transparency API']]) {
    const side = row[stage];
    if (!side) continue;
    const records = side.records?.length ? side.records : [side];
    for (const record of records) {
      const office = recordedOffice(record);
      const key = officeJoinKey(office);
      if (!key) continue;
      assignments.push({stage, source, id: record.id ?? null,
        office: record.office ?? office, office_canonical: office, key});
    }
  }
  return new Set(assignments.map(a => a.key)).size > 1 ? {assignments} : null;
}

export function officeAssignments(row) {
  const sources = [["House 2nd", row.second], ["House 3rd", row.third],
    ["House", row.house], ["NEP", row.nep], ["Transparency", row.api]];
  const present = sources.filter(([, source]) => source);
  return (present.length ? present : [["NEP", row]]).map(([source, record]) => ({
    source,
    office: recordedOffice(record),
    region: record.region ?? row.region ?? "",
  }));
}

export function matchesOffice(row, office, region = "") {
  if (!office) return true;
  const assignments = officeAssignments(row);
  if (office === NO_OFFICE) return assignments.every(a => !a.office);
  const wanted = canonicalOffice(office);
  return assignments.some(a => a.office === wanted && (!region || a.region === region));
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
