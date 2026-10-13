// Pure model layer for the HFEP workspace: every computation the views need,
// with no React, fetch, or DOM (mirrors fmrModel.js). Shared formatters and
// the SortableTable comparator contract are imported from fmrModel so both
// workbenches always agree on presentation arithmetic.
import {compactMoney, csvText, medianNumber, money, signedMoney, sortRows} from './fmrModel.js';

export const hfepTabs = [
  ['home', 'Home', '#hfep/home'], ['highlights', 'Highlights', '#hfep/highlights'],
  ['compare', 'Compare stages', '#hfep/compare'], ['analysis', 'Analysis', '#hfep/analysis'],
  ['house', 'House GAB', '#hfep/house'], ['nep', 'DBM NEP', '#hfep/nep'],
];
// The House annex was verified text-identical between the supplied 2nd-reading
// copy and the 3rd-reading printing across all 17 annex pages.
export const READING_IDENTICAL_PAGES = 17;
export const readingNote = 'No HFEP changes between the 2nd and 3rd House readings: the annex (Volume I-B, PDF pages 877–893) is text-identical in both printings, verified across all 17 annex pages. The supplied House copy is the 2nd-reading file and represents both readings.';
export const FUND_COLUMNS = ['infrastructure', 'medical_equipment', 'motor_vehicle', 'total'];
export const COMPONENT_COLUMNS = FUND_COLUMNS.slice(0, 3);
export const COLUMN_LABELS = {
  infrastructure: 'Infrastructure', medical_equipment: 'Medical equipment',
  motor_vehicle: 'Motor vehicle', total: 'Total',
};
// Blank printed cells stay null: a blank is a printing statement, not zero.
export const columnAmount = (amounts, column) => amounts?.[column] ?? null;
export const columnSum = (rows, column) => rows.reduce((sum, row) => sum + (columnAmount(row.amounts_php, column) || 0), 0);

// Provenance vocabulary (from analysis-hfep/NEP_HFEP_EXTRACTION.md). Unknown
// ids fall back to the raw string so a rebuilt payload never renders blank.
export const FLAG_INFO = {
  ocr_suspect_label: {
    label: 'OCR-suspect label',
    why: 'The printed facility label contains a likely OCR artifact (for example "Staion" for "Station"). The label is transcribed as printed; the flag records the suspicion.',
  },
  verified_odd_amount: {
    label: 'Verified odd amount',
    why: 'The amount is not a round multiple and was manually verified against the rendered source cell before acceptance. The value stands as printed.',
  },
  printed_discrepancy: {
    label: 'Printed discrepancy',
    why: 'A printed control differs from the sum of its children in a way that is documented rather than corrected. Printed values are never altered.',
  },
  page_break_continuation: {
    label: 'Page-break continuation',
    why: 'The logical row continues across a printed page break; the pieces belong to one source row.',
  },
};
export const LINEAGE_INFO = {
  derived_from_row_identity_total_minus_components: {
    label: 'Derived: total − components',
    why: 'A component cell was blank or a dash-like mark while the row total and other components are printed; the value is derived from the row identity and is not an independent printed figure.',
  },
  single_digit_dash_fragment_read_as_dash: {
    label: 'Dash fragment read as dash',
    why: 'A single stray character fragment in a cell was read as the printed dash mark (an explicitly empty cell), keeping the component unavailable rather than invented.',
  },
  leading_punctuation_stripped: {
    label: 'Leading punctuation stripped',
    why: 'Stray leading punctuation before the digits was stripped when reading the amount; the raw text is retained.',
  },
  unparseable: {
    label: 'Unparseable cell',
    why: 'The cell content could not be read as an amount. The component stays unavailable rather than guessed.',
  },
};
export const NORMALIZATION_INFO = {
  label_whitespace_collapse: {
    label: 'Label whitespace collapsed',
    why: 'Repeated whitespace inside the printed label was collapsed for display; the raw label is retained.',
  },
  label_ocr_repair: {
    label: 'OCR label repaired',
    why: 'The PP-StructureV3 OCR reading of the facility name was garbled; the display label was repaired from the PDF native text layer while the raw OCR reading is retained.',
  },
};
export const flagLabel = flag => FLAG_INFO[flag]?.label || String(flag || '').replaceAll('_', ' ');
export const lineageLabel = rule => LINEAGE_INFO[rule]?.label || String(rule || '').replaceAll('_', ' ');
export const normalizationLabel = rule => NORMALIZATION_INFO[rule]?.label || String(rule || '').replaceAll('_', ' ');

// The only accepted printed-vs-facility differences: the documented NEP
// Metro Manila ₱140,000 medical-equipment overhang chain.
export function defectIndex(stage) {
  const defects = new Map();
  for (const check of stage.printed_defects || [])
    defects.set(`${check.node_id}|${check.column}`, check);
  return defects;
}

// One index per stage: every hierarchy node by id, its kind, parent, ordered
// children, and the recursive facility rollup. Built once per stage; the views
// treat it as immutable.
export function buildStageIndex(stage) {
  const byId = new Map();
  const register = (node, kind, parent, children) =>
    byId.set(node.id, {id: node.id, kind, label: node.label, parent: parent ?? null,
      children: children ?? [], amounts_php: node.amounts_php, source: node.source});
  register(stage.root, 'root', null, stage.categories.map(c => c.id));  for (const category of stage.categories)
    register(category, 'category', stage.root.id, category.child_ids);
  for (const sub of stage.subcategories)
    register(sub, 'subcategory', sub.parent_id, sub.child_ids);
  for (const region of stage.regions)
    register(region, 'region', region.parent_id, region.child_ids);
  for (const province of stage.provinces)
    register(province, 'province', province.parent_id, province.facility_ids);
  for (const facility of stage.facilities)
    register({...facility, label: facility.title}, 'facility', facility.parent_id, []);
  // The grand-total row is an echo control under the root: nobody's child, so
  // it adds nothing to any rollup, but its own arithmetic compares against the
  // category sums — exactly like the root.
  byId.set(stage.grand_total.id, {id: stage.grand_total.id, kind: 'grand_total',
    label: stage.grand_total.label, parent: stage.root.id, children: stage.categories.map(c => c.id),
    amounts_php: stage.grand_total.amounts_php, source: stage.grand_total.source});
  if (byId.size !== 1 + stage.categories.length + stage.subcategories.length +
      stage.regions.length + stage.provinces.length + stage.facilities.length + 1)
    throw new Error('hfep: hierarchy index is not an exact partition');

  // Recursive facility rollup per node: each facility counted once, leaves up.
  // Two passes: facility rows per subtree (arrays), then column sums.
  const rowsUnder = new Map();
  const facilitiesUnder = id => {
    if (rowsUnder.has(id)) return rowsUnder.get(id);
    const node = byId.get(id);
    const rows = node.kind === 'facility'
      ? [stageFacility(stage, id)]
      : node.children.flatMap(childId => facilitiesUnder(childId));
    rowsUnder.set(id, rows);
    return rows;
  };
  const rollup = new Map();
  for (const id of byId.keys()) {
    const rows = facilitiesUnder(id);
    rollup.set(id, {count: rows.length,
      amounts_php: Object.fromEntries(FUND_COLUMNS.map(column =>
        [column, rows.reduce((sum, row) => sum + (columnAmount(row.amounts_php, column) || 0), 0)]))});
  }
  return {stage, byId, rollup, defects: defectIndex(stage)};
}
const stageFacility = (stage, id) => stage.facilities.find(f => f.id === id);
export const nodeOf = (index, id) => index.byId.get(id) ?? null;
export const facilityOf = (index, id) => index.byId.get(id)?.kind === 'facility' ? stageFacility(index.stage, id) : null;

// Path root › category › subcategory › region › province › facility.
export function nodePath(index, id) {
  const path = [];
  for (let cursor = index.byId.get(id); cursor; cursor = index.byId.get(cursor.parent))
    path.unshift({id: cursor.id, label: cursor.label, kind: cursor.kind});
  return path;
}
// Ancestor labels for a facility, indexed by level.
export function facilityScope(index, facility) {
  const path = nodePath(index, facility.id);
  const byKind = kind => path.find(node => node.kind === kind)?.label ?? null;
  return {category: byKind('category'), subcategory: byKind('subcategory'),
    region: byKind('region'), province: byKind('province')};
}

// Printed control arithmetic per funding column. The immediate-child sum uses
// direct children (root: categories, excluding the grand-total echo row); the
// facility sum uses every facility under the node. A nonzero difference is
// either the documented ₱140,000 defect chain or a genuine review finding —
// the builder already proved only the documented one exists.
export function controlArithmetic(index, id) {
  const node = index.byId.get(id);
  if (!node) return null;
  if (node.kind === 'facility') return null;
  const leaves = index.rollup.get(id);
  const childIds = node.children;
  const childSum = Object.fromEntries(FUND_COLUMNS.map(column =>
    [column, childIds.reduce((sum, child) => sum + (columnAmount(index.byId.get(child)?.amounts_php, column) || 0), 0)]));
  const columns = FUND_COLUMNS.map(column => {
    const printed = columnAmount(node.amounts_php, column) || 0;
    const difference = printed - (leaves.amounts_php[column] || 0);
    // The grand-total echo row inherits the root's defect classification: it
    // prints the same annex-control figures the defect chain propagates to.
    const defect = index.defects.get(`${id}|${column}`) ??
      (node.kind === 'grand_total' ? index.defects.get(`${index.stage.root.id}|${column}`) : undefined);
    return {column, printed, child_sum: childSum[column], facility_sum: leaves.amounts_php[column],
      difference, facilities: leaves.count,
      status: difference === 0 ? 'balanced' : defect ? 'documented' : 'review',
      defect: defect?.documented_defect ?? null};
  });
  return {id, kind: node.kind, columns, facilities: leaves.count};
}

// Unique region/province labels with facility-aggregated stats. Region
// controls in the source are printed per subcategory; this analytical view
// aggregates facilities by label and states that grain.
export function scopeRows(index, level) {
  const groups = new Map();
  for (const facility of index.stage.facilities) {
    const scope = facilityScope(index, facility);
    const key = scope[level];
    if (!key) continue;
    const entry = groups.get(key) || {id: key, key, label: key, facilities: [], provinces: new Set()};
    entry.facilities.push(facility);
    if (scope.province) entry.provinces.add(scope.province);
    groups.set(key, entry);
  }
  return [...groups.values()].map(({facilities, provinces, ...rest}) => ({
    ...rest, province_count: provinces.size, ...facilityStats(facilities),
  })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function facilityStats(facilities) {
  const totals = facilities.map(f => columnAmount(f.amounts_php, 'total') || 0);
  const columns = Object.fromEntries(FUND_COLUMNS.map(column =>
    [column, facilities.reduce((sum, f) => sum + (columnAmount(f.amounts_php, column) || 0), 0)]));
  return {count: facilities.length, ...columns,
    median: medianNumber(totals), mean: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    min: totals.length ? Math.min(...totals) : null, max: totals.length ? Math.max(...totals) : null,
    flagged: facilities.filter(f => (f.flags || []).length > 0).length,
    interpreted: facilities.filter(isInterpreted).length};
}
export const isFlagged = facility => (facility.flags || []).length > 0;
// Interpretation events on amounts/labels: normalization rules or amount
// lineage beyond the routine row-identity derivation.
export function isInterpreted(facility) {
  if ((facility.normalizations || []).length > 0) return true;
  return (facility.amount_lineage || []).some(step => step.rule !== 'derived_from_row_identity_total_minus_components');
}
export const facilityStatus = facility => isFlagged(facility) ? 'flagged' : isInterpreted(facility) ? 'interpreted' : 'clean';
export const statusLabels = {flagged: 'Flagged', interpreted: 'Interpreted', clean: 'Clean'};

export function filterFacilities(facilities, {
  q = '', category = '', subcategory = '', region = '', status = '', flag = '', lineage = '', minAmount = '', maxAmount = '',
} = {}) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return facilities.filter(f => {
    const total = columnAmount(f.amounts_php, 'total');
    if (minAmount !== '' && (total == null || total < Number(minAmount))) return false;
    if (maxAmount !== '' && (total == null || total >= Number(maxAmount))) return false;
    if (status && facilityStatus(f) !== status) return false;
    if (flag && !(f.flags || []).some(x => (typeof x === 'string' ? x : x.flag) === flag)) return false;
    if (lineage && !(f.amount_lineage || []).some(step => step.rule === lineage) &&
      !(f.normalizations || []).some(n => (typeof n === 'string' ? n : n.type) === lineage)) return false;
    if (category || subcategory || region) {
      // path: root › category [› subcategory] › region › province › facility.
      // Index from the tail so NEP rows without a subcategory still resolve.
      const labels = f.path_labels;
      const pathRegion = labels.length >= 5 ? labels[labels.length - 3] : null;
      const pathCategory = labels[1] ?? null;
      const pathSubcategory = labels.length >= 6 ? labels[2] : null;
      if (category && pathCategory !== category) return false;
      if (subcategory && pathSubcategory !== subcategory) return false;
      if (region && pathRegion !== region) return false;
    }
    if (terms.length) {
      const haystack = `${f.title} ${f.id} ${f.path_labels.join(' ')} ${(f.flags || []).map(x => typeof x === 'string' ? x : `${x.flag} ${x.id ?? ''} ${x.note ?? ''}`).join(' ')} ${(f.amount_lineage || []).map(s => s.rule).join(' ')}`.toLocaleLowerCase();
      if (!terms.every(t => haystack.includes(t))) return false;
    }
    return true;
  });
}
// Select options from the population in view, with counts (FMR pattern).
export function provenanceOptions(facilities) {
  const tally = values => {
    const counts = new Map();
    for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => [id, count]);
  };
  return {
    flags: tally(facilities.flatMap(f => (f.flags || []).map(x => typeof x === 'string' ? x : x.flag))),
    rules: tally([...facilities.flatMap(f => (f.amount_lineage || []).map(s => s.rule)),
      ...facilities.flatMap(f => (f.normalizations || []).map(n => typeof n === 'string' ? n : n.type))]),
  };
}
export function reviewCategories(facilities) {
  const counts = new Map();
  for (const f of facilities) {
    for (const flag of new Set((f.flags || []).map(x => typeof x === 'string' ? x : x.flag)))
      counts.set(`flag:${flag}`, (counts.get(`flag:${flag}`) || 0) + 1);
    for (const rule of new Set([...(f.amount_lineage || []).map(s => s.rule).filter(r => r !== 'derived_from_row_identity_total_minus_components'),
      ...(f.normalizations || []).map(n => typeof n === 'string' ? n : n.type)]))
      counts.set(`rule:${rule}`, (counts.get(`rule:${rule}`) || 0) + 1);
  }
  return [...counts].map(([id, count]) => ({id, count,
    label: id.startsWith('flag:') ? flagLabel(id.slice(5)) : lineageLabel(id.slice(5))}))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export function matchesReviewCategory(facility, category) {
  if (!category) return (facility.flags || []).length > 0 || isInterpreted(facility);
  const [kind, id] = category.split(':');
  if (kind === 'flag') return (facility.flags || []).some(x => (typeof x === 'string' ? x : x.flag) === id);
  return (facility.amount_lineage || []).some(s => s.rule === id) ||
    (facility.normalizations || []).some(n => (typeof n === 'string' ? n : n.type) === id);
}

export const HFEP_BANDS = [[0, 1e6, '< ₱1M'], [1e6, 5e6, '₱1–5M'], [5e6, 1e7, '₱5–10M'],
  [1e7, 2.5e7, '₱10–25M'], [2.5e7, 5e7, '₱25–50M'], [5e7, 1e8, '₱50–100M'], [1e8, Infinity, '≥ ₱100M']];
export function bandRows(facilities) {
  return HFEP_BANDS.map(([min, max, label], i) => {
    const rows = facilities.filter(f => {const v = columnAmount(f.amounts_php, 'total'); return v != null && v >= min && v < max;});
    return {id: `band-${i}`, label, min, max, facilities: rows.length,
      total_php: rows.reduce((s, f) => s + (columnAmount(f.amounts_php, 'total') || 0), 0)};
  });
}
const ROUNDING_STEPS = [[1e7, '₱10,000,000'], [5e6, '₱5,000,000'], [1e6, '₱1,000,000'], [5e5, '₱500,000'], [1e5, '₱100,000']];
export function roundingLadder(facilities) {
  const rows = ROUNDING_STEPS.map(([step, label]) => ({id: `step-${step}`, label, step, facilities: 0, total_php: 0}));
  const other = {id: 'step-other', label: 'Other (not a ₱100,000 multiple)', step: null, facilities: 0, total_php: 0};
  for (const f of facilities) {
    const amount = columnAmount(f.amounts_php, 'total') || 0;
    const slot = rows.find(r => amount % r.step === 0) || other;
    slot.facilities++; slot.total_php += amount;
  }
  const total = facilities.length || 1;
  return [...rows, other].map(r => ({...r, share: r.facilities / total}));
}
export function repeatedAmounts(facilities, minRepeat = 5) {
  const map = new Map();
  for (const f of facilities) {
    const amount = columnAmount(f.amounts_php, 'total');
    if (amount == null) continue;
    const entry = map.get(amount) || {amount_php: amount, facilities: 0, total_php: 0, examples: []};
    entry.facilities++; entry.total_php += amount;
    if (entry.examples.length < 3) entry.examples.push(f.title);
    map.set(amount, entry);
  }
  return [...map.values()].filter(e => e.facilities >= minRepeat)
    .sort((a, b) => b.total_php - a.total_php || b.facilities - a.facilities);
}

// CSV export of filtered facilities, with the spreadsheet-formula guard.
export const FACILITY_CSV_HEADERS = ['id', 'stage', 'title', 'category', 'subcategory', 'region', 'province',
  'infrastructure_php', 'medical_equipment_php', 'motor_vehicle_php', 'total_php',
  'raw_infrastructure', 'raw_medical_equipment', 'raw_motor_vehicle', 'raw_total',
  'flags', 'normalizations', 'lineage_rules', 'source_pdf', 'pdf_page', 'printed_page', 'row_id'];
export function facilityCsvRows(facilities, index) {
  return facilities.map(f => {
    const scope = facilityScope(index, f);
    const raw = f.amounts_raw || {};
    return [f.id, f.stage, f.title, scope.category, scope.subcategory, scope.region, scope.province,
      columnAmount(f.amounts_php, 'infrastructure'), columnAmount(f.amounts_php, 'medical_equipment'),
      columnAmount(f.amounts_php, 'motor_vehicle'), columnAmount(f.amounts_php, 'total'),
      raw.infrastructure ?? '', raw.medical_equipment ?? '', raw.motor_vehicle ?? '', raw.total ?? '',
      (f.flags || []).map(x => typeof x === 'string' ? x : [x.flag, x.id].filter(Boolean).join(':')).join(';'),
      (f.normalizations || []).map(n => typeof n === 'string' ? n : n.type).join(';'),
      (f.amount_lineage || []).map(s => `${s.column}:${s.rule}`).join(';'),
      f.source.source_pdf, f.source.pdf_page, f.source.printed_page, f.source.row_id];
  });
}
export function facilityCsv(facilities, index) {
  return csvText(FACILITY_CSV_HEADERS, facilityCsvRows(facilities, index));
}

export {compactMoney, csvText, medianNumber, money, signedMoney, sortRows};

// ── Cross-document comparison (reviewable suggestions, never merges) ──
// The builder matches House↔NEP rows by normalized-title similarity within
// (region, province) blocks. Pairs are suggestions: the UI shows both rows,
// the score, and per-column deltas, and links both source pages.
//
// A "line-item record" is one (facility row, funding column) cell that is
// actually printed. The revision assessment runs at that grain: a component
// cell revised means both annexes print it with different amounts; a cell the
// NEP prints but the House leaves blank is an added record; a House-printed
// cell with no NEP counterpart is a dropped record. Blank stays blank — never
// zero — so a pair whose totals differ only because money moved between
// columns (House infra ↔ NEP med equip) is two grain events, not a revision.

export function comparisonIndex(data) {
  const stageHouse = data.stages.house, stageNep = data.stages.nep;
  const houseById = new Map(stageHouse.facilities.map(f => [f.id, f]));
  const nepById = new Map(stageNep.facilities.map(f => [f.id, f]));
  const houseIndex = buildStageIndex(stageHouse), nepIndex = buildStageIndex(stageNep);
  const rows = (data.comparison?.pairs || []).map(pair => {
    const house = houseById.get(pair.house_id), nep = nepById.get(pair.nep_id);
    const columns = Object.fromEntries(FUND_COLUMNS.map(column => {
      const hv = columnAmount(house?.amounts_php, column) ?? null;
      const nv = columnAmount(nep?.amounts_php, column) ?? null;
      // Component-grain events: revised (both printed, differing), added
      // (NEP-only), dropped (House-only). difference stays null when either
      // side is blank — there is no comparable printed record to subtract.
      const event = hv == null && nv == null ? 'none'
        : hv == null ? 'added' : nv == null ? 'dropped' : hv === nv ? 'same' : 'revised';
      return [column, {house: hv, nep: nv, difference: event === 'revised' || event === 'same' ? nv - hv : null, event}];
    }));
    return {id: `${pair.house_id}~${pair.nep_id}`, similarity: pair.similarity,
      house, nep, columns,
      house_scope: house ? facilityScope(houseIndex, house) : null,
      nep_scope: nep ? facilityScope(nepIndex, nep) : null,
      // "Changed" at the record grain: at least one printed component cell
      // was revised. Total-only movement (money reshuffled between columns)
      // does not make a pair changed — it surfaces in the added/dropped
      // records instead.
      changed: COMPONENT_COLUMNS.some(c => columns[c].event === 'revised')};
  });
  // Unmatched rows keep their full record: an insertion/deletion candidate is
  // a review suggestion reflecting grain differences, never a confirmed add.
  const paired_house = new Set(rows.map(r => r.house.id));
  const paired_nep = new Set(rows.map(r => r.nep.id));
  const withScope = (facility, index) => ({...facility, scope: facilityScope(index, facility)});
  const house_only_rows = stageHouse.facilities.filter(f => !paired_house.has(f.id)).map(f => withScope(f, houseIndex));
  const nep_only_rows = stageNep.facilities.filter(f => !paired_nep.has(f.id)).map(f => withScope(f, nepIndex));
  return {
    note: data.comparison?.pairs_note || '',
    column_totals: data.comparison?.column_totals || {},
    counts: data.comparison?.counts || {pairs: 0, house_only: 0, nep_only: 0},
    rows, houseIndex, nepIndex,
    // Unmatched rows on each side: a cross-document "record" is a line-item
    // pair, or a single unmatched row kept whole (never zero-filled).
    house_only_rows,
    nep_only_rows,
    get changed() {return this.rows.filter(r => r.changed);},
  };
}

export function filterComparisons(rows, {q = '', changed = '', region = '', minSimilarity = '', maxSimilarity = ''} = {}) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(r => {
    if (changed === 'changed' && !r.changed) return false;
    if (changed === 'same' && r.changed) return false;
    if (minSimilarity !== '' && r.similarity < Number(minSimilarity)) return false;
    if (maxSimilarity !== '' && r.similarity > Number(maxSimilarity)) return false;
    if (region && r.house_scope?.region !== region && r.nep_scope?.region !== region) return false;
    if (terms.length) {
      const haystack = `${r.house?.title ?? ''} ${r.nep?.title ?? ''} ${(r.house_scope && Object.values(r.house_scope).join(' ')) ?? ''}`.toLocaleLowerCase();
      if (!terms.every(t => haystack.includes(t))) return false;
    }
    return true;
  });
}

export const COMPARISON_CSV_HEADERS = ['similarity', 'house_id', 'house_title', 'house_region', 'house_province',
  'nep_id', 'nep_title', 'nep_region', 'nep_province',
  'house_infrastructure_php', 'nep_infrastructure_php', 'delta_infrastructure_php',
  'house_medical_equipment_php', 'nep_medical_equipment_php', 'delta_medical_equipment_php',
  'house_motor_vehicle_php', 'nep_motor_vehicle_php', 'delta_motor_vehicle_php',
  'house_total_php', 'nep_total_php', 'delta_total_php'];
export function comparisonCsvRows(rows) {
  return rows.map(r => [r.similarity, r.house.id, r.house.title, r.house_scope.region, r.house_scope.province,
    r.nep.id, r.nep.title, r.nep_scope.region, r.nep_scope.province,
    ...FUND_COLUMNS.flatMap(c => [r.columns[c].house ?? '', r.columns[c].nep ?? '', r.columns[c].difference ?? ''])]);
}
export function comparisonCsv(rows) {
  return csvText(COMPARISON_CSV_HEADERS, comparisonCsvRows(rows));
}

// ── Line-item records: the (facility row, funding column) grain ──
// Every printed component cell on a matched pair becomes one record with its
// cross-document event; unmatched facility rows contribute their printed
// component cells as unmatched records on their own side. The total column is
// deliberately excluded: it is a row control, not a line item, and assessing
// totals would re-create the grand-total illusion this grain exists to avoid.

export function lineItemRecords(comparison) {
  const records = [];
  const push = (facility, column, side, event, counterpart, pairRow) => records.push({
    id: `${facility.id}|${column}`, facility_id: facility.id, title: facility.title, column,
    column_label: COLUMN_LABELS[column], side, event,
    house_value: side === 'house' || event === 'dropped' ? columnAmount(facility.amounts_php, column) : null,
    nep_value: side === 'nep' || event === 'added' ? columnAmount(facility.amounts_php, column) : null,
    difference: event === 'revised' || event === 'same' ? pairRow.columns[column].difference : null,
    similarity: pairRow?.similarity ?? null,
    region: pairRow ? pairRow.house_scope?.region : facility.scope?.region,
    province: pairRow ? pairRow.house_scope?.province : facility.scope?.province,
    house_source: side === 'house' || event === 'dropped' ? facility.source : counterpart?.source ?? null,
    nep_source: side === 'nep' || event === 'added' ? facility.source : counterpart?.source ?? null,
    pair_id: pairRow?.id ?? null,
  });
  for (const row of comparison.rows)
    for (const column of COMPONENT_COLUMNS) {
      const event = row.columns[column].event;
      // Push every paired record (including unchanged) so that the total
      // record count equals printed-cells on both sides, and the 'same'
      // population describes the baseline review scope.
      if (event === 'none') continue;
      // For revised: emit once on the House side carrying the delta.
      if (event === 'revised') push(row.house, column, 'house', event, row.nep, row);
      else if (event === 'same') push(row.house, column, 'house', event, row.nep, row);
      else if (event === 'added') push(row.nep, column, 'nep', event, row.house, row);
      else if (event === 'dropped') push(row.house, column, 'house', event, row.nep, row);
    }
  // Unmatched facility rows: printed component cells stay whole records on
  // their side. The event stays 'unmatched' — never inferred as added or
  // dropped, because no counterpart pairing exists to compare against.
  for (const facility of comparison.house_only_rows)
    for (const column of COMPONENT_COLUMNS)
      if (columnAmount(facility.amounts_php, column) != null)
        push(facility, column, 'house', 'unmatched', null, null);
  for (const facility of comparison.nep_only_rows)
    for (const column of COMPONENT_COLUMNS)
      if (columnAmount(facility.amounts_php, column) != null)
        push(facility, column, 'nep', 'unmatched', null, null);
  return records;
}

export const RECORD_EVENT_LABELS = {
  revised: 'Revised record', added: 'Added record (NEP prints, House blank)',
  dropped: 'Dropped record (House prints, NEP blank)', same: 'Unchanged record', unmatched: 'Unmatched row record',
};

export function filterRecords(records, {q = '', event = '', column = '', region = ''} = {}) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return records.filter(r => {
    if (event && r.event !== event) return false;
    if (column && r.column !== column) return false;
    if (region && r.region !== region) return false;
    if (terms.length) {
      const haystack = `${r.title} ${r.column_label} ${r.region ?? ''} ${r.province ?? ''}`.toLocaleLowerCase();
      if (!terms.every(t => haystack.includes(t))) return false;
    }
    return true;
  });
}

// Record-grain aggregates: counts and pesos per event, per funding column,
// with the conservation bridge the total-grain number must reconcile to.
export function recordAggregates(records) {
  const byEvent = Object.fromEntries(['revised', 'added', 'dropped', 'same', 'unmatched']
    .map(event => [event, {count: 0, net: 0}]));
  const byColumn = Object.fromEntries(COMPONENT_COLUMNS.map(column => [column,
    {revised: 0, added: 0, dropped: 0, revised_net: 0, added_sum: 0, dropped_sum: 0}]));
  for (const r of records) {
    byEvent[r.event].count++;
    if (r.event === 'revised') {byEvent.revised.net += r.difference; byColumn[r.column].revised++; byColumn[r.column].revised_net += r.difference;}
    else if (r.event === 'added') {byEvent.added.net += r.nep_value; byColumn[r.column].added++; byColumn[r.column].added_sum += r.nep_value;}
    else if (r.event === 'dropped') {byEvent.dropped.net -= r.house_value; byColumn[r.column].dropped++; byColumn[r.column].dropped_sum += r.house_value;}
  }
  // Bridge on matched pairs: revised net + added − dropped reconciles the
  // per-pair total-column movement (the number the old grain showed alone).
  const bridge = {revised_net: byEvent.revised.net, added: byEvent.added.net, dropped: -byEvent.dropped.net};
  bridge.total_net = bridge.revised_net + bridge.added - Math.abs(byEvent.dropped.net);
  return {byEvent, byColumn, bridge};
}

export const RECORD_CSV_HEADERS = ['event', 'column', 'facility_id', 'title', 'region', 'province',
  'similarity', 'house_value_php', 'nep_value_php', 'difference_php',
  'house_source_pdf', 'house_pdf_page', 'nep_source_pdf', 'nep_pdf_page'];
export function recordsCsv(records) {
  return csvText(RECORD_CSV_HEADERS, records.map(r => [r.event, r.column, r.facility_id, r.title, r.region, r.province,
    r.similarity ?? '', r.house_value ?? '', r.nep_value ?? '', r.difference ?? '',
    r.house_source?.source_pdf ?? '', r.house_source?.pdf_page ?? '',
    r.nep_source?.source_pdf ?? '', r.nep_source?.pdf_page ?? '']));
}
