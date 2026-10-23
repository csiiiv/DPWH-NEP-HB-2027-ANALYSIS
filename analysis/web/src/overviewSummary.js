// Build-time adapters over the same validated ledgers used by Analysis.
// No source amounts, identities or matching thresholds are changed here.
import {hydrateProjects} from './comparisonData.js';
import {regionCandidates} from './regionCandidates.js';
import {comparisonIndex, lineItemRecords, COMPONENT_COLUMNS, recordColumnAmount} from './hfepModel.js';
import {aiMonitoringInsertions} from './niaAnalysis.js';
import {comparisonRows as niaRows} from './niaModel.js';

function ensure(condition, message) {if (!condition) throw new Error(`Overview: ${message}`);}
const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
const count = source => source.records?.length ?? 1;
const population = (rows, side) => ({count: sum(rows, r => count(r[side])), comparison_rows: rows.length,
  amount_php: sum(rows, r => r[side].amount_php)});
const analysis = (workspace, view, extra = '') => `#${workspace === 'dpwh' ? '' : workspace + '/'}analysis?view=${view}${extra}`;

// Exported for build-time adapters that must partition the same rows the
// Overview publishes (e.g. buildCongressIndex.mjs). Reusing this function is
// what keeps a district roll-up from ever contradicting the published
// Overview: the bucket definitions, the segment-scope carve-out and the
// funding-bridge assertion below are then literally the same code.
export function partition(rows, house = 'house') {
  const inserted = rows.filter(r => r[house] && !r.nep);
  const deleted = rows.filter(r => r.nep && !r[house]);
  const paired = rows.filter(r => r[house] && r.nep);
  ensure(inserted.length + deleted.length + paired.length === rows.length, 'unclassified comparison row');
  const sources = {};
  for (const side of [house, 'nep']) {
    const members = rows.flatMap(r => r[side] ? r[side].records ?? [r[side]] : []);
    ensure(new Set(members.map(p => p.id)).size === members.length, `${side} source IDs reused`);
    ensure(members.every(p => Number.isSafeInteger(p.amount_php) && p.amount_php >= 0), `${side} invalid PHP`);
    const total = sum(rows, r => r[side]?.amount_php ?? 0);
    ensure(total === sum(members, p => p.amount_php), `${side} grouped money does not reconcile`);
    sources[side === house ? 'house' : 'nep'] = {count: members.length, amount_php: total};
  }
  // Segment-scope review: paired rows on the same road whose station spans
  // share no overlap. Their delta is a different-segment artifact, NOT a
  // same-project adjustment — excluded from unchanged/increased/reduced and
  // reported as its own bucket so the funding bridge still ties. Equal-amount
  // segment pairs are also excluded from unchanged: a silent mispair must
  // stay visible in the review bucket, not hide as "unchanged".
  const segmentScope = paired.filter(r => r.house_match === 'segment_scope_candidate' ||
    String(r.trace).includes('segment_scope_review'));
  const adjusted = paired.filter(r => !segmentScope.includes(r));
  const increased = adjusted.filter(r => r[house].amount_php > r.nep.amount_php);
  const reduced = adjusted.filter(r => r[house].amount_php < r.nep.amount_php);
  ensure(increased.length + reduced.length + segmentScope.length +
    adjusted.filter(r => r[house].amount_php === r.nep.amount_php).length === paired.length,
    'paired rows do not partition into unchanged, increased, reduced and segment-scope review');
  // Unchanged: matched pairs whose recorded allocations are equal on both
  // stages — same population basis as insertions/deletions, zero paired
  // movement by construction.
  const unchanged = adjusted.filter(r => r[house].amount_php === r.nep.amount_php);
  const unchangedPopulation = population(unchanged, house);
  ensure(sum(unchanged, r => r[house].amount_php) === sum(unchanged, r => r.nep.amount_php),
    'unchanged pairs carry different House and NEP totals');
  const increases = sum(increased, r => r[house].amount_php - r.nep.amount_php);
  const reductions = sum(reduced, r => r.nep.amount_php - r[house].amount_php);
  const scopeNet = sum(segmentScope, r => r[house].amount_php - r.nep.amount_php);
  // Per-group base allocations: what the changed pairs are worth on each
  // stage, so cards can show allocations next to the signed delta.
  const groupBases = rows => ({nep_php: sum(rows, r => r.nep.amount_php), house_php: sum(rows, r => r[house].amount_php)});
  const increasedBases = groupBases(increased), reducedBases = groupBases(reduced);
  const scopeBases = groupBases(segmentScope);
  ensure(increasedBases.house_php - increasedBases.nep_php === increases, 'increased-pair bases do not tie to the gross increase');
  ensure(reducedBases.nep_php - reducedBases.house_php === reductions, 'reduced-pair bases do not tie to the gross reduction');
  const result = {sources, insertions: population(inserted, house), deletions: population(deleted, 'nep'),
    unchanged: unchangedPopulation, paired_comparison_rows: paired.length,
    adjustments: {count: increased.length + reduced.length, count_unit: 'changed candidate pairs',
      increased_count: increased.length, reduced_count: reduced.length,
      increased_php: increases, reduced_php: reductions, net_php: increases - reductions,
      increased_nep_php: increasedBases.nep_php, increased_house_php: increasedBases.house_php,
      reduced_nep_php: reducedBases.nep_php, reduced_house_php: reducedBases.house_php},
    scope_review: {count: segmentScope.length, count_unit: 'same-road pairs with non-overlapping segments',
      house_php: scopeBases.house_php, nep_php: scopeBases.nep_php, net_php: scopeNet,
      note: 'Different segments of the same road attached for scope review; amount deltas are deliberately not booked as same-project adjustments.'},
    delta_php: sources.house.amount_php - sources.nep.amount_php};
  ensure(result.delta_php === result.insertions.amount_php - result.deletions.amount_php + result.adjustments.net_php + result.scope_review.net_php,
    'comparison funding bridge does not reconcile');
  return result;
}

function annex(data, key, label, scope, matching) {
  const index = Object.fromEntries(Object.entries(data.stages).map(([side, s]) => [side, new Map(s.projects.map(p => [p.id, p]))]));
  const rows = data.comparison.map(r => {
    const house = index.house.get(r.house_id), nep = index.nep.get(r.nep_id);
    ensure((r.status === 'paired' && house && nep) || (r.status === 'house_only' && house && !nep) ||
      (r.status === 'nep_only' && nep && !house), `${key} invalid comparison membership`);
    return {...r, house, nep};
  });
  const result = partition(rows);
  for (const side of ['house', 'nep']) {
    ensure(result.sources[side].count === data.stages[side].projects.length, `${key} ${side} missing source rows`);
    ensure(result.sources[side].amount_php === sum(data.stages[side].projects, p => p.amount_php), `${key} source ledger total`);
  }
  ensure(result.delta_php === data.comparison_summary.delta_php, `${key} printed comparison difference`);
  // The retained House annex is extracted from the 2nd-reading copy; the
  // extractor also diffed that copy against the 3rd-reading printing. Carry
  // that verified identity so the Overview can state HGAB3 coverage exactly.
  const audit = data.stages.house.audit_summary;
  const identical = audit.reading_comparison_identical_pages, total = audit.reading_comparison_total_pages;
  ensure(Number.isSafeInteger(identical) && identical === total && total > 0,
    `${key} House annex text differs between readings; separate 3rd-reading extraction required`);
  return {key, label, scope, basis: 'HGAB2 · 2nd reading ↔ DBM NEP · annex text identical in the 3rd reading',
    grain: 'One printed project allocation record', count_unit: 'project records', matching, ...result,
    readings: {second: null, third: {count: result.sources.house.count, amount_php: result.sources.house.amount_php,
      same_as_second: true, verified_identical_pages: total}},
    controls: {house_php: result.sources.house.amount_php, nep_php: result.sources.nep.amount_php, residual_php: 0},
    links: {home: `#${key}/home`, insertions: analysis(key, 'insertions'), deletions: analysis(key, 'deletions'),
      adjustments: analysis(key, 'adjustments'), increases: analysis(key, 'adjustments', '&direction=increased'),
      decreases: analysis(key, 'adjustments', '&direction=decreased'),
      unchanged: `#${key}/compare?view=projects&status=unchanged`,
      house: `#${key}/house`, nep: `#${key}/nep`,
      compare: `#${key}/compare`, highlights: `#${key}/highlights`}};
}

export function dpwhSummary(overview, detail) {
  const rows = regionCandidates(hydrateProjects(detail));
  // Same relaxed-region candidates and House-only definition as Analysis.
  ensure(rows.every(r => !r.third || r.nep || !r.api), 'House/API-only scope needs a separate adapter');
  const result = partition(rows, 'third');
  const headlines = overview.headlines;
  for (const [side, key] of [['house', 'third'], ['nep', 'nep']]) {
    ensure(result.sources[side].amount_php === headlines.sources[key].amount_php, 'DPWH headline amount');
    ensure(result.sources[side].count === headlines.sources[key].records, 'DPWH headline record count');
  }
  // The landing-page coverage table also shows the 2nd House reading; carry
  // its published headline total so the page never loads the detail payload.
  const second = headlines.sources.second;
  ensure(Number.isSafeInteger(second.amount_php) && second.records > 0, 'DPWH 2nd-reading headline unavailable');
  ensure(result.insertions.amount_php === headlines.rankings.third.no_suggestion.amount_php +
    headlines.rankings.third.unresolved.amount_php, 'DPWH insertion membership differs from Analysis');
  ensure(result.deletions.amount_php === headlines.deletions.no_suggestion.amount_php +
    headlines.deletions.suggested.amount_php, 'DPWH deletion membership differs from Analysis');
  ensure(result.adjustments.increased_php === headlines.revisionSets.cross_summary.increased.amount_php &&
    result.adjustments.reduced_php === headlines.revisionSets.cross_summary.reduced.amount_php, 'DPWH adjustment membership differs from Analysis');
  return {key: 'dpwh', label: 'DPWH', scope: 'Operations allocation ledger, including local and foreign-assisted projects; agency controls are broader.',
    basis: 'HGAB3 · 3rd reading ↔ DBM NEP · region-difference candidates included',
    grain: 'Source allocation records; grouped members counted individually', count_unit: 'allocation records',
    matching: 'Retained NEP/Transparency anchors and provisional title/scope matches; fuzzy suggestions stay unmatched.', ...result,
    readings: {second: {count: second.records, amount_php: second.amount_php},
      third: {count: result.sources.house.count, amount_php: result.sources.house.amount_php, same_as_second: false}},
    controls: {house_php: overview.readingSummary.third.new_appropriations,
      nep_php: overview.summary.stages.official_nep.new_appropriations_php,
      residual_php: null, note: 'Agency new appropriations include allocations outside the operations comparison ledger.'},
    links: {home: '#home', insertions: '#compare?view=projects&region_match=ignore&flag=house_only',
      deletions: '#compare?view=projects&region_match=ignore&flag=nep_only_all', adjustments: analysis('dpwh', 'adjustments'),
      increases: '#compare?view=projects&region_match=ignore&flag=amount_increase', decreases: '#compare?view=projects&region_match=ignore&flag=amount_decrease',
      unchanged: '#compare?view=projects&region_match=ignore&flag=amount_same',
      house: '#house?reading=third', house_second: '#house?reading=second', nep: '#nep', compare: '#compare', highlights: '#highlights'}};
}

export function hfepSummary(data) {
  const comparison = comparisonIndex(data), records = lineItemRecords(comparison);
  const sources = {};
  for (const side of ['house', 'nep']) {
    const facilities = data.stages[side].facilities;
    const components = facilities.flatMap(f => COMPONENT_COLUMNS.map(c => recordColumnAmount(f, c))).filter(v => v != null);
    ensure(components.every(v => Number.isSafeInteger(v) && v >= 0), 'HFEP invalid component PHP');
    sources[side] = {count: components.length, facility_count: facilities.length, amount_php: sum(components, v => v)};
    ensure(sources[side].amount_php === data.stages[side].facility_ledger.total, 'HFEP source components do not reconcile');
    const represented = records.filter(r => r[`${side}_value`] != null);
    ensure(represented.length === components.length && sum(represented, r => r[`${side}_value`]) === sources[side].amount_php,
      `HFEP ${side} record partition`);
  }
  const unmatched = side => {
    const rows = records.filter(r => r.event === 'unmatched' && r.side === side);
    return {count: rows.length, amount_php: sum(rows, r => r[`${side}_value`])};
  };
  const changes = records.filter(r => ['revised', 'added', 'dropped'].includes(r.event));
  // HFEP's existing event names/differences run NEP−House. Normalize the
  // landing page to House−NEP without renaming or altering retained events.
  const delta = r => r.event === 'revised' ? -r.difference : r.event === 'added' ? -r.nep_value : r.house_value;
  const increased = changes.filter(r => delta(r) > 0), reduced = changes.filter(r => delta(r) < 0);
  // Per-group base allocations at record grain: revised records carry both
  // values; added records exist only in NEP (House base 0), dropped only in
  // House (NEP base 0). Bases tie to the deltas by construction.
  const groupBases = rows => ({nep_php: sum(rows, r => r.nep_value ?? 0), house_php: sum(rows, r => r.house_value ?? 0)});
  const increasedBases = groupBases(increased), reducedBases = groupBases(reduced);
  ensure(increasedBases.house_php - increasedBases.nep_php === sum(increased, delta), 'HFEP increased bases do not tie');
  ensure(reducedBases.nep_php - reducedBases.house_php === -sum(reduced, delta), 'HFEP reduced bases do not tie');
  const adjustments = {count: changes.length, count_unit: 'changed funding-column records',
    increased_count: increased.length, reduced_count: reduced.length,
    increased_php: sum(increased, delta), reduced_php: -sum(reduced, delta),
    net_php: sum(changes, delta),
    increased_nep_php: increasedBases.nep_php, increased_house_php: increasedBases.house_php,
    reduced_nep_php: reducedBases.nep_php, reduced_house_php: reducedBases.house_php,
    events: Object.fromEntries(['revised', 'added', 'dropped'].map(e => [e, changes.filter(r => r.event === e).length]))};
  const insertions = unmatched('house'), deletions = unmatched('nep');
  // Unchanged at HFEP's record grain: funding-column records printed
  // identically in both annexes ('same' event). House value equals NEP value
  // by definition, so one allocation figure describes the population.
  const sameRecords = records.filter(r => r.event === 'same');
  const unchanged = {count: sameRecords.length, amount_php: sum(sameRecords, r => r.house_value)};
  ensure(unchanged.amount_php === sum(sameRecords, r => r.nep_value),
    'HFEP unchanged records carry different House and NEP totals');
  // Record-grain counterpart of the paired partition: every funding-column
  // record printed on a paired facility is unchanged or changed — enforced
  // here so validateOverview's row-grain check stays workspace-agnostic.
  const pairedRecords = records.filter(r => ['revised', 'added', 'dropped', 'same'].includes(r.event));
  ensure(pairedRecords.length === unchanged.count + changes.length, 'HFEP paired-record partition');
  const ledgerDelta = sources.house.amount_php - sources.nep.amount_php;
  ensure(ledgerDelta === insertions.amount_php - deletions.amount_php + adjustments.net_php, 'HFEP funding bridge');
  const controls = {house_php: data.stages.house.annex_control.total, nep_php: data.stages.nep.annex_control.total};
  controls.residual_php = (controls.house_php - controls.nep_php) - ledgerDelta;
  ensure(controls.residual_php === -140000 || controls.residual_php === 0, 'HFEP undocumented printed-control residual');
  // Same retained-copy reading verification as the annex workbenches.
  const audit = data.stages.house.audit_summary;
  const identical = audit.reading_comparison_identical_pages, total = audit.reading_comparison_total_pages;
  ensure(Number.isSafeInteger(identical) && identical === total && total > 0,
    'HFEP House annex text differs between readings; separate 3rd-reading extraction required');
  return {key: 'hfep', label: 'DOH Health Facilities', scope: 'HFEP capital outlays: infrastructure, medical equipment and motor vehicles. Both schedules include national and LGU facilities.',
    basis: 'HGAB2 · Volume I-B ↔ DBM NEP Volume II-A · annex text identical in the 3rd reading', grain: 'One funding-column allocation record; facility totals are controls',
    count_unit: 'funding-column records', matching: 'Provisional title-similarity pairs within recorded region and province; derived zero cells excluded from record counts.',
    sources, insertions, deletions, unchanged, adjustments, delta_php: ledgerDelta, controls,
    readings: {second: null, third: {count: sources.house.count, amount_php: sources.house.amount_php,
      same_as_second: true, verified_identical_pages: total}},
    direction_note: 'Here changes are House minus NEP; HFEP Analysis displays NEP minus House. Paired column additions/drops remain in adjustments.',
    links: {home: '#hfep/home', insertions: analysis('hfep', 'insertions'), deletions: analysis('hfep', 'deletions'),
      adjustments: analysis('hfep', 'adjustments'), increases: analysis('hfep', 'adjustments', '&event=revised'),
      decreases: analysis('hfep', 'adjustments', '&event=revised'),
      unchanged: analysis('hfep', 'adjustments', '&event=same'),
      house: '#hfep/house', nep: '#hfep/nep', compare: '#hfep/compare', highlights: '#hfep/highlights'}};
}

export function overviewSummary({dpwhOverview, dpwhDetail, fmr, nia, hfep}, builtAt) {
  const workspaces = [dpwhSummary(dpwhOverview, dpwhDetail),
    annex(fmr, 'fmr', 'DA Farm-to-Market Roads', 'Locally funded FMR annex; project allocations counted once across all coordinate segments.', 'Provisional title and coordinate matches.'),
    hfepSummary(hfep), annex(nia, 'nia', 'NIA Irrigation', 'Six detailed irrigation sub-programs; agency-only CARP and broader agency appropriations excluded.', 'Unique canonical title within sub-program; repeated titles remain unmatched.')];
  const ai = aiMonitoringInsertions(niaRows(nia));
  const features = [
    {key: 'dpwh', title: 'House readings shift operations allocations', amount_php: dpwhOverview.readingSummary.allocation_delta_php,
      detail: 'HGAB2 to HGAB3 operations movement; total new appropriations are unchanged. Separate from the NEP-to-House comparison.', href: '#compare?view=projects&change=reading_changed'},
    {key: 'fmr', title: 'FMR annex funding rises', amount_php: fmr.comparison_summary.delta_php,
      detail: 'House minus NEP across the retained FMR schedules.', href: '#fmr/compare'},
    {key: 'hfep', title: 'Medical equipment carries most of the HFEP control gap', amount_php: hfep.comparison.column_totals.medical_equipment.difference_php,
      detail: 'NEP medical-equipment control above House; source controls remain separate from facility-ledger sums.', href: '#hfep/compare'},
    {key: 'nia', title: 'AI monitoring insertion candidates', count: ai.length, amount_php: sum(ai, r => r.house_php),
      detail: 'House-only subset of NIA; whole irrigation-project allocations, with monitoring costs not itemized.', href: '#nia/analysis?view=ai_monitoring&records=ai_insertions'}];
  return {schema_version: 1, fiscal_year: 2027, built_at: builtAt, direction: 'House minus NEP', workspaces, features};
}
