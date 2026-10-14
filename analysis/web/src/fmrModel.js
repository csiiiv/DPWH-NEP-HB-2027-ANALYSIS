// Canonical percent-change helpers live in pctChange.js (R44). Import for
// local use in this module; re-export so existing `from './fmrModel.js'`
// imports keep working.
import {pctChange, signedPct} from './pctChange.js';
export {pctChange, signedPct};
export const fmrTabs = [
  ['home', 'Home', '#fmr/home'], ['highlights', 'Highlights', '#fmr/highlights'],
  ['compare', 'Compare stages', '#fmr/compare'], ['analysis', 'Analysis', '#fmr/analysis'],
  ['map', 'Map', '#fmr/map'], ['house', 'House GAB', '#fmr/house'], ['nep', 'DBM NEP', '#fmr/nep'],
];
// Verified 12 October 2026: the FMR annex (House Volume I-B, PDF pages
// 667–726) is text-identical between the 2nd and 3rd reading printings.
// The supplied House copy is the 2nd-reading file and represents both
// readings; every tab cites this same check.
export const readingNote = 'No FMR changes between the 2nd and 3rd House readings: the annex (Volume I-B, PDF pages 667–726) is text-identical in both printings, verified 12 October 2026. The supplied House copy is the 2nd-reading file and represents both readings.';
export const statusLabels = {paired: 'Candidate pair', house_only: 'House only', nep_only: 'NEP only'};
export const methodLabels = {title_and_coordinates: 'Title + exact coordinates', title: 'Title', coordinates: 'Exact coordinates'};
// Chips and selects share one label source so a filter always reads the same way.
export const comparisonFilterLabels = {...statusLabels, changed: 'Pairs with an amount change', increased: 'Paired · increased',
  decreased: 'Paired · decreased', unchanged: 'Paired · unchanged', ambiguous: 'Unmatched repeated titles'};
export const money = value => value == null ? '—' : `₱${value.toLocaleString('en-PH')}`;
export const compactMoney = value => value == null ? '—' : Math.abs(value) >= 1e9 ? `₱${(value / 1e9).toLocaleString('en-PH', {maximumFractionDigits: 4})}B` : Math.abs(value) >= 1e6 ? `₱${(value / 1e6).toLocaleString('en-PH', {maximumFractionDigits: 3})}M` : money(value);
export const signedMoney = value => value == null ? '—' : `${value > 0 ? '+' : ''}${money(value)}`;
export const formatKm = km => km == null ? '—' : `${km.toLocaleString('en-PH', {maximumFractionDigits: 3})} km`;
export function medianNumber(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null;
}
// Same comparator contract as SortableTable so route-backed cards and the
// table itself always agree on order: missing values sink, numbers compare
// numerically, everything else compares with numeric-aware localeCompare.
export function sortRows(rows, getValue, sort) {
  if (!sort?.key) return rows;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = getValue(a), y = getValue(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
    return String(x).localeCompare(String(y), 'en', {numeric: true, sensitivity: 'base'}) * factor;
  });
}
// Remaining normalized-layer review flags — short label + why it was raised
// (from other-analysis/FMR_COORDINATE_REVIEW_FLAGS.md).
export const REVIEW_FLAG_INFO = {
  endpoint_distance_over_100_km: {
    label: 'Endpoint distance > 100 km',
    why: 'Start/end straight-line separation exceeds 100 km. This is a source-value review heuristic, not road length or proof of an error. Printed values stay unchanged.',
  },
  source_numeric_repair_candidate: {
    label: 'Numeric repair candidate',
    why: 'A candidate interpretation changes punctuation within numeric digits (for example a missing decimal). Review before treating it as accepted; the original OCR text stays intact.',
  },
  outside_philippines_orientation_bounds: {
    label: 'Outside PH orientation bounds',
    why: 'A numeric pair is globally valid but outside the broad Philippines orientation envelope (about lat 4–22 / lon 116–127). Values stay numeric with this flag; digits are not guessed.',
  },
  invalid_coordinate_pair: {
    label: 'Invalid coordinate pair',
    why: 'Two values cannot establish a valid latitude/longitude pair. The normalized pair is null rather than invented.',
  },
  single_point_without_endpoint_roles: {
    label: 'Single point, no start/end role',
    why: 'The source supplies one coordinate without identifying it as start or end, so it is not claimed as a line segment.',
  },
  missing_or_ambiguous_segment_endpoint: {
    label: 'Missing/ambiguous endpoint',
    why: 'No complete pair of endpoints exists for this record, so a start–end segment cannot be formed from the source text alone.',
  },
};
export const flagLabel = flag => REVIEW_FLAG_INFO[flag]?.label || String(flag || '').replaceAll('_', ' ');
export const flagWhy = flag => REVIEW_FLAG_INFO[flag]?.why
  || 'Open coordinate review finding after normalization. Open provenance for source fragments and applied rules.';
export function hadCoordinateInterpretation(project) {
  if (!project) return false;
  return Boolean((project.original_review_flags || []).length || (project.normalization_rules || []).length);
}
export function projectMatchesCoordinateStatus(project, coordinate) {
  if (!coordinate || !project) return !coordinate;
  if (coordinate === 'multi') return project.segment_count > 1;
  if (coordinate === 'interpreted') return hadCoordinateInterpretation(project);
  return project.status === coordinate;
}
export function projectTextBasis(project) {
  return project?.coordinate_text_basis || 'original_ocr';
}
export function projectMatchesProvenance(project, {extraction = '', rule = '', review_flag = '', category = '', text_basis = ''} = {}) {
  if (!project) return false;
  const openFlag = review_flag || category;
  return (!extraction || (project.original_review_flags || []).includes(extraction))
    && (!rule || (project.normalization_rules || []).includes(rule))
    && (!openFlag || (project.review_flags || []).includes(openFlag))
    && (!text_basis || projectTextBasis(project) === text_basis);
}
// Build select options from whichever project population is in view.
export function provenanceOptionLists(projects) {
  const tally = (values) => {
    const counts = new Map();
    for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, count]) => [id, `${flagLabel(id)} · ${count}`]);
  };
  const list = Array.isArray(projects) ? projects.filter(Boolean) : [];
  return {
    extraction: tally(list.flatMap(p => p.original_review_flags || [])),
    rules: tally(list.flatMap(p => p.normalization_rules || [])),
    review: tally(list.flatMap(p => p.review_flags || [])),
    text_basis: tally(list.map(projectTextBasis)),
  };
}
export function comparisonSideProjects(row, side = '') {
  if (side === 'nep') return row.nep ? [row.nep] : [];
  if (side === 'house') return row.house ? [row.house] : [];
  if (side === 'both') return row.nep && row.house ? [row.nep, row.house] : [];
  return [row.nep, row.house].filter(Boolean);
}
function comparisonMatchesSide(row, side, predicate) {
  const projects = comparisonSideProjects(row, side);
  if (!projects.length) return false;
  return side === 'both' ? projects.every(predicate) : projects.some(predicate);
}
export function filterProjects(projects, {q = '', region = '', status = '', category = '', extraction = '', rule = '', review_flag = '', text_basis = '', amount = '', minAmount = '', maxAmount = ''} = {}) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return projects.filter(p => projectMatchesProvenance(p, {extraction, rule, review_flag, category, text_basis}) &&
    (amount === '' || p.amount_php === Number(amount)) && (minAmount === '' || p.amount_php >= Number(minAmount)) &&
    (maxAmount === '' || p.amount_php < Number(maxAmount)) && (!region || p.region_key === region) &&
    (!status || projectMatchesCoordinateStatus(p, status)) &&
    terms.every(t => `${p.title} ${p.region} ${p.id} ${(p.review_flags || []).join(' ')} ${(p.original_review_flags || []).join(' ')} ${(p.normalization_rules || []).join(' ')}`.toLocaleLowerCase().includes(t)));
}
export function comparisonRows(data) {
  const indexes = Object.fromEntries(Object.entries(data.stages).map(([s, d]) => [s, new Map(d.projects.map(p => [p.id, p]))]));
  return data.comparison.map(row => {
    const nep = indexes.nep.get(row.nep_id), house = indexes.house.get(row.house_id);
    return {...row, nep, house, title: house?.title || nep?.title, nep_php: nep?.amount_php ?? null, house_php: house?.amount_php ?? null};
  });
}
export function filterComparisons(rows, {
  q = '', region = '', status = '', direction = '', method = '',
  coordinate = '', extraction = '', rule = '', review_flag = '', text_basis = '', coord_side = '',
} = {}) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const provenance = {extraction, rule, review_flag, text_basis};
  const hasSideFilter = Boolean(coordinate || extraction || rule || review_flag || text_basis || coord_side);
  return rows.filter(r => (!method || r.method === method) &&
    (!direction || (r.status === 'paired' && (direction === 'increased' ? r.delta_php > 0 : direction === 'decreased' ? r.delta_php < 0 : r.delta_php === 0))) &&
    (!region || r.region_key === region) && (!status ||
    (status === 'changed' ? r.status === 'paired' && r.delta_php !== 0
      : status === 'increased' ? r.status === 'paired' && r.delta_php > 0
      : status === 'decreased' ? r.status === 'paired' && r.delta_php < 0
      : status === 'unchanged' ? r.status === 'paired' && r.delta_php === 0
      : status === 'ambiguous' ? r.ambiguous_title : r.status === status)) &&
    (!hasSideFilter || comparisonMatchesSide(r, coord_side, p =>
      (!coordinate || projectMatchesCoordinateStatus(p, coordinate))
      && projectMatchesProvenance(p, provenance))) &&
    terms.every(t => `${r.nep?.title || ''} ${r.house?.title || ''} ${r.nep_id || ''} ${r.house_id || ''} ${(r.nep?.original_review_flags || []).join(' ')} ${(r.house?.original_review_flags || []).join(' ')} ${(r.nep?.normalization_rules || []).join(' ')} ${(r.house?.normalization_rules || []).join(' ')} ${(r.nep?.review_flags || []).join(' ')} ${(r.house?.review_flags || []).join(' ')}`.toLocaleLowerCase().includes(t)));
}
// Reconciles a filtered comparison ledger: counts, per-direction amount moves,
// and the money identity paired Δ + house-only − nep-only = net Δ.
export function candidateAggregates(rows) {
  const counts = {paired: 0, house_only: 0, nep_only: 0};
  const increased = {count: 0, amount: 0}, decreased = {count: 0, amount: 0};
  let unchanged = 0, paired_delta = 0, house_only_php = 0, nep_only_php = 0;
  for (const r of rows) {
    if (!counts[r.status]) counts[r.status] = 0;
    counts[r.status]++;
    if (r.status === 'paired') {
      paired_delta += r.delta_php;
      if (r.delta_php > 0) {increased.count++; increased.amount += r.delta_php;}
      else if (r.delta_php < 0) {decreased.count++; decreased.amount += -r.delta_php;}
      else unchanged++;
    } else if (r.status === 'house_only') house_only_php += r.house_php || 0;
    else nep_only_php += r.nep_php || 0;
  }
  return {counts, increased, decreased, unchanged, paired_delta_php: paired_delta, house_only_php, nep_only_php,
    net_delta_php: paired_delta + house_only_php - nep_only_php};
}
export function allocationStats(projects) {
  const amounts = projects.map(p => p.amount_php).sort((a,b) => a-b), n = amounts.length;
  const total = amounts.reduce((a,b) => a+b,0);
  return {count: n, total, mean: n ? total/n : null, median: n ? (amounts[Math.floor((n-1)/2)]+amounts[Math.floor(n/2)])/2 : null,
    min: n ? amounts[0] : null, max: n ? amounts[n-1] : null,
    review: projects.filter(p => p.status === 'needs_review').length, multi: projects.filter(p => p.segment_count > 1).length};
}
export function overviewRegionRows(regions) {
  return regions.map(r => ({...r, id: r.id || r.key, delta_projects: r.house_count - r.nep_count,
    pct_records: pctChange(r.house_count, r.nep_count), pct_alloc: pctChange(r.house_php, r.nep_php)}));
}
// Straight-line endpoint distance is the only length the source coordinates
// support: segments contribute their endpoint distance, never road chainage.
export function projectLengthKm(project) {
  let km = 0, measurable = false;
  for (const segment of project.segments || []) {
    const d = segment.straight_line_distance_km;
    if (d != null) {km += d; measurable = true;}
  }
  return measurable ? km : null;
}
export function chainageRows(projects, {minKm = 0.05} = {}) {
  return projects.map(p => {
    const length_km = projectLengthKm(p);
    return {id: p.id, title: p.title, region: p.region, region_key: p.region_key, amount_php: p.amount_php,
      length_km, point_only: length_km == null || length_km === 0,
      per_km_php: length_km > 0 ? p.amount_php / length_km : null,
      segment_count: p.segment_count, point_count: p.point_count, status: p.status,
      review_flags: p.review_flags, source: p.source,
      included: length_km != null && length_km > 0 && length_km >= minKm};
  });
}
export const PER_KM_BANDS = [[0, 5e6, '< ₱5M / km'], [5e6, 1e7, '₱5–10M / km'], [1e7, 2e7, '₱10–20M / km'],
  [2e7, 5e7, '₱20–50M / km'], [5e7, 1e8, '₱50–100M / km'], [1e8, Infinity, '≥ ₱100M / km']];
export const AMOUNT_BANDS = [[0, 5e6, '< ₱5M'], [5e6, 1e7, '₱5–10M'], [1e7, 2e7, '₱10–20M'], [2e7, 5e7, '₱20–50M'], [5e7, Infinity, '≥ ₱50M']];
export function bandRows(rows, valueKey, bands) {
  return bands.map(([min, max, label], i) => {
    const inRows = rows.filter(r => {const v = r[valueKey]; return v != null && v >= min && v < max;});
    return {id: `band-${i}`, label, projects: inRows.length, total_php: inRows.reduce((s, r) => s + (r.amount_php || 0), 0),
      total_km: inRows.reduce((s, r) => s + (r.length_km || 0), 0)};
  });
}
const ROUNDING_STEPS = [[1e7, '₱10,000,000'], [5e6, '₱5,000,000'], [1e6, '₱1,000,000'], [5e5, '₱500,000'], [1e5, '₱100,000']];
// Classifies each amount to its coarsest matching granularity, so the shares sum to 1.
export function roundingLadder(projects) {
  const rows = ROUNDING_STEPS.map(([step, label]) => ({id: `step-${step}`, label, step, projects: 0, total_php: 0}));
  const other = {id: 'step-other', label: 'Other (not a ₱100,000 multiple)', step: null, projects: 0, total_php: 0};
  for (const p of projects) {
    const slot = rows.find(r => p.amount_php % r.step === 0) || other;
    slot.projects++; slot.total_php += p.amount_php;
  }
  const total = projects.length || 1;
  return [...rows, other].map(r => ({...r, share: r.projects / total}));
}
export function repeatedAmounts(projects, minRepeat = 5) {
  const map = new Map();
  for (const p of projects) {
    const entry = map.get(p.amount_php) || {amount_php: p.amount_php, projects: 0, total_php: 0, examples: []};
    entry.projects++; entry.total_php += p.amount_php;
    if (entry.examples.length < 3) entry.examples.push(p.title);
    map.set(p.amount_php, entry);
  }
  return [...map.values()].filter(e => e.projects >= minRepeat).sort((a, b) => b.total_php - a.total_php || b.projects - a.projects);
}
export function regionAllocationRows(projects, regions) {
  const byKey = new Map(regions.map(r => [r.key, r]));
  const groups = new Map();
  for (const p of projects) {
    const entry = groups.get(p.region_key) || {id: p.region_key, key: p.region_key, label: byKey.get(p.region_key)?.label || p.region, amounts: [], review: 0, multi: 0};
    entry.amounts.push(p.amount_php);
    if (p.status === 'needs_review') entry.review++;
    if (p.segment_count > 1) entry.multi++;
    groups.set(p.region_key, entry);
  }
  const stat = amounts => {const {review, multi, ...rest} = allocationStats(amounts.map(a => ({amount_php: a}))); return rest;};
  return [...groups.values()].map(({amounts, ...rest}) => ({...rest, ...stat(amounts)}))
    .sort((a, b) => b.total - a.total);
}
export function csvText(headers, rows) {
  // Protect spreadsheet users from formulas in extracted titles or text fields.
  const cell = value => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

// Paths are reconstructed from the retained three-level hierarchy; project
// records intentionally carry labels rather than duplicate tree nodes.
export function sourcePath(stage, id) {
  if (id === stage.root.id) return [{id, label: stage.root.label}];
  const project = stage.projects.find(p => p.id === id);
  const region = stage.regions.find(r => r.id === id || r.project_ids.includes(id));
  if (!region) return [];
  return [{id: stage.root.id, label: stage.root.label}, {id: region.id, label: region.label},
    ...(project ? [{id: project.id, label: project.title}] : [])];
}
export function sourceNode(stage, id) {
  if (id === stage.root.id) return stage.root;
  const project = stage.projects.find(p => p.id === id), region = stage.regions.find(r => r.id === id);
  const record = project || region;
  return record ? {id, label: project?.title || region.label, printed_amount_php: record.amount_php,
    source: record.source, path_labels: sourcePath(stage, id).map(p => p.label)} : null;
}
export function sourceArithmetic(stage, id) {
  const node = sourceNode(stage, id);
  if (!node) return null;
  const region = stage.regions.find(r => r.id === id);
  const leaves = id === stage.root.id ? stage.projects : region ? stage.projects.filter(p => region.project_ids.includes(p.id)) : [stage.projects.find(p => p.id === id)];
  const childAmounts = id === stage.root.id ? stage.regions.map(r => r.amount_php) : region ? leaves.map(p => p.amount_php) : [];
  const leafSum = leaves.reduce((sum, p) => sum + p.amount_php, 0);
  const childSum = childAmounts.length ? childAmounts.reduce((a, b) => a + b, 0) : null;
  return {printed: node.printed_amount_php, child_sum: childSum, leaf_sum: leafSum, leaf_count: leaves.length,
    difference: childSum == null ? null : node.printed_amount_php - childSum};
}
export function coordinateCategories(projects) {
  const counts = new Map();
  for (const p of projects) for (const flag of new Set(p.review_flags)) counts.set(flag, (counts.get(flag) || 0) + 1);
  return [...counts].map(([id, count]) => ({id, label: id.replaceAll('_', ' '), count})).sort((a, b) => b.count - a.count);
}
function exportProjectProvenance(project, amount) {
  if (!project) return null;
  return {
    id: project.id, title: project.title, region: project.region, amount_php: amount,
    source: project.source, coordinate_status: project.status,
    original_review_flags: project.original_review_flags || [],
    normalization_rules: project.normalization_rules || [],
    review_flags: project.review_flags || [],
    coordinate_text_basis: projectTextBasis(project),
    coordinates_raw: project.coordinates_raw || '',
  };
}
export function comparisonExportRows(rows) {
  return rows.map(r => ({candidate_id:r.id, status:r.status, method:r.method, region:r.region_key,
    ambiguous_title:r.ambiguous_title, delta_php:r.delta_php, percent_change:pctChange(r.house_php,r.nep_php),
    nep: exportProjectProvenance(r.nep, r.nep_php),
    house: exportProjectProvenance(r.house, r.house_php)}));
}
