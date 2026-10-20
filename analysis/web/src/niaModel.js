// NIA workspace model: shaping, filtering and aggregates over the two
// irrigation annex extractions. Mirrors the FMR model's comparator and
// money-format contracts so shared components behave identically.
import {compactMoney, money, pctChange, signedMoney, signedPct, sortRows, csvText} from './fmrModel.js';

export const niaTabs = [
  ['home', 'Home', '#nia/home'], ['highlights', 'Highlights', '#nia/highlights'],
  ['compare', 'Compare stages', '#nia/compare'], ['analysis', 'Analysis', '#nia/analysis'],
  ['house', 'House GAB', '#nia/house'], ['nep', 'DBM NEP', '#nia/nep'],
];
export const statusLabels = {paired: 'Candidate pair', house_only: 'House only', nep_only: 'NEP only'};
export const comparisonFilterLabels = {...statusLabels, changed: 'Pairs with an amount change',
  increased: 'Paired · increased', decreased: 'Paired · decreased', unchanged: 'Paired · unchanged',
  ambiguous: 'Unmatched repeated titles'};
export const stageLabels = {house: 'House GAB', nep: 'DBM NEP'};
// Matching-method labels: the two labeled classifications share one ledger.
// strict uses raw source titles; ai_corrected additionally normalizes
// AI-monitoring keys (verified NEP OCR readings, Monitoring/Monitoring System
// equivalence). Stored titles are never rewritten.
export const matchingMethodLabels = {
  strict: 'Strict titles',
  ai_corrected: 'Corrected AI titles',
};
export const matchingMethods = ['strict', 'ai_corrected'];
export function normalizeMatchingMethod(value) {
  return matchingMethods.includes(value) ? value : 'ai_corrected';
}
// Deterministic near-miss marks on unmatched rows: equal-amount review
// pointers computed by the workbench builder. They never create pairs.
export const variantMarkLabels = {
  repeated_title: 'Repeated-title block',
  location_variant: 'Location-suffix counterpart',
  exact_variant: 'Same corrected key',
  spelling_variant: 'Spelling-variant counterpart',
  no_counterpart: 'No near-miss counterpart',
};
// Derive the comparison rows for one matching method from the shared ledger.
// Corrected rows pass through; strict rows split each corrected-only pair
// into its two strict source-only observations, so both classifications
// partition every source row exactly once.
export function rowsForMethod(rows, method = 'ai_corrected') {
  if (normalizeMatchingMethod(method) === 'ai_corrected') return rows;
  const out = [];
  for (const row of rows) {
    if (row.status === 'paired' && row.strict_status === 'split_pair') {
      // Strict halves of a corrected-only pair are unresolved candidates:
      // their plausible counterpart is the corrected-method twin.
      out.push({...row, status: 'house_only', delta_php: null, method: null,
        nep_id: null, nep: undefined, nep_php: null,
        variant_mark: null, variant_mark_kind: null, strict_unresolved: true});
      out.push({...row, status: 'nep_only', delta_php: null, method: null,
        house_id: null, house: undefined, house_php: null,
        variant_mark: null, variant_mark_kind: null, strict_unresolved: true});
    } else {
      out.push({...row, status: row.strict_status || row.status});
    }
  }
  return out;
}
export const flagLabels = {
  bottom_band_row: 'Bottom-band row', trailing_period_amount: 'Trailing-period amount',
  label_quirk: 'Label quirk', label_repaired: 'Label repaired',
  prior_version_double_count: 'Prior-version double count', amount_adjudicated: 'Amount adjudicated by render',
};
export {money, compactMoney, signedMoney, signedPct, pctChange, sortRows, csvText};
export function medianNumber(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null;
}
// Repeated titles inside one stage: identity-review candidates, never merged.
export function repeatedTitleGroups(projects) {
  const groups = new Map();
  for (const p of projects) {
    const key = `${p.subprogram_key}\u0000${p.title}`;
    const entry = groups.get(key) || {id: key, subprogram_key: p.subprogram_key, title: p.title, ids: []};
    entry.ids.push(p.id);
    groups.set(key, entry);
  }
  return [...groups.values()].filter(g => g.ids.length > 1);
}
export function allocationStats(projects) {
  const amounts = projects.map(p => p.amount_php).sort((a, b) => a - b), n = amounts.length;
  const total = amounts.reduce((a, b) => a + b, 0);
  return {count: n, total, mean: n ? total / n : null, median: n ? medianNumber(amounts) : null,
    min: n ? amounts[0] : null, max: n ? amounts[n - 1] : null};
}
export const AMOUNT_BANDS = [[0, 5e6, '< ₱5M'], [5e6, 1e7, '₱5–10M'], [1e7, 2e7, '₱10–20M'], [2e7, 5e7, '₱20–50M'], [5e7, 1e8, '₱50–100M'], [1e8, Infinity, '≥ ₱100M']];
export function bandRows(projects) {
  return AMOUNT_BANDS.map(([min, max, label], i) => {
    const inRows = projects.filter(p => p.amount_php >= min && p.amount_php < max);
    return {id: `band-${i}`, label, projects: inRows.length, total_php: inRows.reduce((s, p) => s + p.amount_php, 0)};
  });
}
const ROUNDING_STEPS = [[1e7, '₱10,000,000'], [5e6, '₱5,000,000'], [1e6, '₱1,000,000'], [5e5, '₱500,000'], [1e5, '₱100,000']];
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
// Project filters for the source tabs. NIA has no coordinate column; the
// review dimensions are extraction provenance (NEP flags), repeated titles,
// and numeric tokens inside titles that never enter the amount column.
export const REVIEW_CATEGORIES = [
  ['flagged', 'Extraction-flagged rows'],
  ['repeated', 'Repeated titles'],
  ['numeric', 'Numeric tokens in titles'],
];
export function projectReviewCategory(p) {
  if ((p.extraction_flags || []).length) return 'flagged';
  if (p.repeated_title) return 'repeated';
  if ((p.numeric_title_tokens || []).length) return 'numeric';
  return null;
}
export function filterProjects(projects, {q = '', subprogram = '', status = '', minAmount = '', maxAmount = ''} = {}) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return projects.filter(p =>
    (!subprogram || p.subprogram_key === subprogram) &&
    (!status || (status === 'flagged' ? (p.extraction_flags || []).length > 0
      : status === 'repeated' ? Boolean(p.repeated_title)
      : status === 'numeric' ? (p.numeric_title_tokens || []).length > 0
      : false)) &&
    (minAmount === '' || p.amount_php >= Number(minAmount)) &&
    (maxAmount === '' || p.amount_php < Number(maxAmount)) &&
    terms.every(t => `${p.title} ${p.subprogram_label} ${p.program_group} ${p.id} ${(p.extraction_flags || []).join(' ')}`.toLocaleLowerCase().includes(t)));
}
export function comparisonRows(data) {
  const indexes = Object.fromEntries(Object.entries(data.stages).map(([s, d]) => [s, new Map(d.projects.map(p => [p.id, p]))]));
  return data.comparison.map(row => {
    const nep = indexes.nep.get(row.nep_id), house = indexes.house.get(row.house_id);
    return {...row, nep, house, title: house?.title || nep?.title, nep_php: nep?.amount_php ?? null, house_php: house?.amount_php ?? null};
  });
}
export function filterComparisons(rows, {q = '', subprogram = '', program = '', ranking = 'all', status = ''} = {}) {
  const terms = q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(r => (!subprogram || r.subprogram_key === subprogram) &&
    (!program || [r.nep, r.house].some(p => p?.program_group === program)) &&
    (ranking === 'ambiguous' ? r.ambiguous_title : ranking === 'unambiguous' ? !r.ambiguous_title : true) && (!status ||
      (status === 'changed' ? r.status === 'paired' && r.delta_php !== 0
        : status === 'increased' ? r.status === 'paired' && r.delta_php > 0
        : status === 'decreased' ? r.status === 'paired' && r.delta_php < 0
        : status === 'unchanged' ? r.status === 'paired' && r.delta_php === 0
        : status === 'ambiguous' ? r.ambiguous_title : r.status === status)) &&
    terms.every(t => `${r.nep?.title || ''} ${r.house?.title || ''} ${r.nep_id || ''} ${r.house_id || ''}`.toLocaleLowerCase().includes(t)));
}
export function candidateAggregates(rows) {
  const counts = {paired: 0, house_only: 0, nep_only: 0};
  const increased = {count: 0, amount: 0}, decreased = {count: 0, amount: 0};
  let unchanged = 0, paired_delta = 0, house_only_php = 0, nep_only_php = 0;
  for (const r of rows) {
    counts[r.status] = (counts[r.status] || 0) + 1;
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
// Analysis populations share the comparison ledger: unmatched source rows
// are candidates, and adjustments require two attached source records.
// DPWH-style candidate resolution: rows carrying a deterministic near-miss
// mark (spelling/location/repeated/exact variant) have a plausible
// counterpart and stay unresolved; only no_counterpart rows are validated.
export const unresolvedMarkKinds = ['repeated_title', 'location_variant', 'exact_variant', 'spelling_variant'];
export function candidateResolution(row) {
  // Under the strict projection, split halves of corrected-only pairs are
  // unresolved too: their plausible counterpart is the corrected twin.
  return unresolvedMarkKinds.includes(row.variant_mark_kind) || row.strict_unresolved ? 'unresolved' : 'no_counterpart';
}
export function analysisCandidateRows(rows, {view, q = '', subprogram = '', ranking = 'all', direction = 'all'} = {}) {
  const scoped = filterComparisons(rows, {q, subprogram});
  if (view === 'adjustments') return scoped.filter(r => r.status === 'paired' && r.delta_php !== 0 &&
    (direction === 'increased' ? r.delta_php > 0 : direction === 'decreased' ? r.delta_php < 0 : true));
  const status = {insertions: 'house_only', deletions: 'nep_only'}[view];
  if (!status) return [];
  return scoped.filter(r => r.status === status && (ranking === 'ambiguous' ? r.ambiguous_title
    : ranking === 'unambiguous' ? !r.ambiguous_title
    : ranking === 'unresolved' ? candidateResolution(r) === 'unresolved'
    : ranking === 'validated' ? candidateResolution(r) === 'no_counterpart' : true));
}
export function candidateGroupRows(rows, view, dim = 'subprogram', subprograms = []) {
  const labels = new Map(subprograms.map(s => [s.key, s.label]));
  const groups = new Map();
  for (const r of rows) {
    const key = dim === 'program' ? (r.house || r.nep).program_group : r.subprogram_key;
    const group = groups.get(key) || {id: key, label: dim === 'program' ? key : labels.get(key) || key,
      count: 0, amount_php: 0, nep_php: 0, house_php: 0, increased_php: 0, decreased_php: 0};
    group.count++;
    group.nep_php += r.nep_php || 0;
    group.house_php += r.house_php || 0;
    group.amount_php += view === 'adjustments' ? r.delta_php : view === 'deletions' ? r.nep_php : r.house_php;
    if (view === 'adjustments') {
      group.increased_php += Math.max(0, r.delta_php);
      group.decreased_php += Math.min(0, r.delta_php);
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => Math.abs(b.amount_php) - Math.abs(a.amount_php));
}
// Overview counts and sums source records in the comparison ledger once per
// side. Each side uses its own printed group; matching never relocates money.
// The same source filters govern the selected-source distribution and these
// presentation rollups. Controls are not re-summed as records.
export function overviewComparisonRows(rows, params = {}, subprograms = [], dim = 'subprogram') {
  const labels = new Map(subprograms.map(s => [s.key, s.label]));
  const groups = new Map();
  for (const side of ['nep', 'house']) {
    const projects = filterProjects(rows.map(r => r[side]).filter(Boolean), params);
    for (const project of projects) {
      const id = dim === 'overall' ? 'overall' : dim === 'program' ? project.program_group : project.subprogram_key;
      const group = groups.get(id) || {id, label: dim === 'overall' ? 'All filtered records' : dim === 'program' ? id : labels.get(id) || id,
        nep_count: 0, house_count: 0, nep_php: 0, house_php: 0};
      group[`${side}_count`]++;
      group[`${side}_php`] += project.amount_php;
      groups.set(id, group);
    }
  }
  return [...groups.values()].map(g => ({...g, delta_records: g.house_count - g.nep_count,
    pct_records: pctChange(g.house_count, g.nep_count), delta_php: g.house_php - g.nep_php,
    pct_alloc: pctChange(g.house_php, g.nep_php)}));
}
export function overviewGroupRows(rows, params, dim, groupId) {
  const ids = Object.fromEntries(['nep', 'house'].map(side => [side, new Set(
    filterProjects(rows.map(r => r[side]).filter(Boolean), params).filter(p =>
      dim === 'overall' || (dim === 'program' ? p.program_group : p.subprogram_key) === groupId).map(p => p.id))]));
  return rows.map(row => {
    const nep = ids.nep.has(row.nep?.id) ? row.nep : undefined;
    const house = ids.house.has(row.house?.id) ? row.house : undefined;
    return {...row, nep, house, title: house?.title || nep?.title, nep_id: nep?.id ?? null, house_id: house?.id ?? null,
      nep_php: nep?.amount_php ?? null, house_php: house?.amount_php ?? null,
      delta_php: nep && house ? house.amount_php - nep.amount_php : null};
  }).filter(r => r.nep || r.house);
}
// Sub-program rollups for whichever project population is in view.
export function subprogramAllocationRows(projects, subprograms) {
  const byKey = new Map(subprograms.map(s => [s.key, s]));
  const groups = new Map();
  for (const p of projects) {
    const entry = groups.get(p.subprogram_key) || {id: p.subprogram_key, key: p.subprogram_key,
      label: byKey.get(p.subprogram_key)?.label || p.subprogram_label, program_group: p.program_group, amounts: []};
    entry.amounts.push(p.amount_php);
    groups.set(p.subprogram_key, entry);
  }
  return [...groups.values()].map(({amounts, ...rest}) => ({...rest, ...allocationStats(amounts.map(amount_php => ({amount_php})))}))
    .sort((a, b) => b.total - a.total);
}
// Source-tree helpers over the packaged stage shapes.
export function stageSubprograms(stage) {
  return stage.subprograms;
}
export function sourcePath(stage, id) {
  if (id === stage.root.id) return [{id, label: stage.root.label}];
  const subprogram = stage.subprograms.find(s => s.id === id || s.key === id);
  const project = stage.projects.find(p => p.id === id);
  const nodes = [{id: stage.root.id, label: stage.root.label}];
  if (subprogram?.group_heading) nodes.push({id: `heading:${subprogram.group_heading}`, label: subprogram.group_heading});
  if (subprogram) return [...nodes, {id: subprogram.id, label: subprogram.label}];
  if (project) {
    const parent = stage.subprograms.find(s => s.key === project.subprogram_key);
    if (parent?.group_heading) nodes.push({id: `heading:${parent.group_heading}`, label: parent.group_heading});
    return [...nodes, {id: parent.id, label: parent.label}, {id: project.id, label: project.title}];
  }
  return nodes;
}
export function sourceNode(stage, id) {
  if (id === stage.root.id)
    return {id, label: stage.root.label, amount_php: stage.root.amount_php ?? stage.projects.reduce((s, p) => s + p.amount_php, 0), source: stage.root.source || stage.subprograms[0].source, is_root: true};
  const subprogram = stage.subprograms.find(s => s.id === id || s.key === id);
  const project = stage.projects.find(p => p.id === id);
  const record = subprogram || project;
  if (!record) return null;
  return {id, label: subprogram ? subprogram.label : project.title,
    amount_php: record.amount_php, source: record.source,
    path_labels: sourcePath(stage, id).map(n => n.label), is_subprogram: Boolean(subprogram)};
}
export function sourceArithmetic(stage, id) {
  const node = sourceNode(stage, id);
  if (!node) return null;
  if (node.is_root) {
    const children = stage.subprograms;
    const leafSum = stage.projects.reduce((s, p) => s + p.amount_php, 0);
    const childSum = children.reduce((s, c) => s + c.amount_php, 0);
    return {printed: node.amount_php, child_sum: childSum, leaf_sum: leafSum, leaf_count: stage.projects.length,
      difference: node.amount_php - childSum};
  }
  if (node.is_subprogram) {
    const key = stage.subprograms.find(s => s.id === id || s.key === id)?.key;
    const scoped = stage.projects.filter(p => p.subprogram_key === key);
    const leafSum = scoped.reduce((s, p) => s + p.amount_php, 0);
    return {printed: node.amount_php, child_sum: null, leaf_sum: leafSum, leaf_count: scoped.length,
      difference: node.amount_php - leafSum};
  }
  return {printed: node.amount_php, child_sum: null, leaf_sum: null, leaf_count: null, difference: null};
}
export function provenanceOptionLists(projects) {
  const tally = values => {
    const counts = new Map();
    for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, count]) => [id, `${flagLabels[id] || id} · ${count}`]);
  };
  const list = Array.isArray(projects) ? projects.filter(Boolean) : [];
  return {flags: tally(list.flatMap(p => p.extraction_flags || []))};
}
