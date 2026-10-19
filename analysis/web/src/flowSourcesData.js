// Build-time adapters only. The browser loads their small grouped summaries,
// never the full source workbenches just to change a dropdown.
import {buildRevisionFlowFromRecords} from './revisionFlow.js';
import {comparisonRows as fmrRows} from './fmrModel.js';
import {comparisonRows as niaRows} from './niaModel.js';
import {comparisonIndex, lineItemRecords} from './hfepModel.js';
import {matchesProgram} from './model.js';
import {recordedOffice} from '../../viewers/project_offices.mjs';

const sum = (rows, value) => rows.reduce((s, r) => s + value(r), 0);
const unknown = '(Not recorded)';
const group = value => ({id: value || '__not_recorded__', label: value || unknown});
const choice = (key, label, plural, pick, basis) => ({key, label, plural, pick, basis});
const commonBasis = 'One stable group per comparison row; changing grouping never rematches records or implies transfers.';
const classes = cells => cells.map(c => ({class: c.key, rows: c.count, nep_php: c.before, third_php: c.after}));
const caveat = 'Matching remains provisional. HGAB-only and NEP-only rows are insertion/deletion candidates, not confirmed edits. Changes do not establish transfers between projects.';

function dpwhOffice(row) {
  const source = row.nep || row.third;
  const direct = recordedOffice(source);
  if (direct) return direct;
  const offices = [...new Set((source?.records || []).map(recordedOffice).filter(Boolean))];
  return offices.length === 1 ? offices[0] : offices.length > 1 ? '(Multiple implementing offices)' : null;
}

export function normalizedFlowSources({dpwh, fmr, hfep, nia}) {
  const annex = data => ({before: sum(data.stages.nep.projects, p => p.amount_php), after: sum(data.stages.house.projects, p => p.amount_php)});
  const dpwhRecords = dpwh.projects.filter(r => r.nep || r.third).map(r => ({id: r.id,
    before: r.nep?.amount_php ?? null, after: r.third?.amount_php ?? null, source: r}));
  const annexRecords = (data, rows) => rows(data).map(r => ({id: r.id,
    before: r.nep?.amount_php ?? null, after: r.house?.amount_php ?? null, source: r}));
  const hfepRecords = lineItemRecords(comparisonIndex(hfep)).map(r => ({id: r.id,
    // On a paired facility a blank component is a zero base in an adjustment,
    // matching Overview. Only unmatched facilities create insertion/deletion.
    before: r.nep_value ?? (r.pair_id ? 0 : null), after: r.house_value ?? (r.pair_id ? 0 : null), source: r}));
  return [
    {key: 'dpwh', label: 'DPWH', defaultGrouping: 'category', records: dpwhRecords,
      expected: {before: sum(dpwh.projects, r => r.nep?.amount_php ?? 0), after: sum(dpwh.projects, r => r.third?.amount_php ?? 0)},
      scope: 'DPWH operations allocations, including local and foreign-assisted projects.', count_unit: 'comparison rows',
      house_note: 'House 3rd reading', comparison_href: '#compare?view=projects', caveat,
      matching: 'Retained comparison pairs; source category separates FAPs from local programs. No matching is changed when regrouping.',
      groupings: [
        choice('category', 'Category', 'categories', r => matchesProgram(r.source, 'fap') ? {id: 'fap', label: 'Foreign-assisted projects (FAPs)'} : group(r.source.program), 'FAPs separated by source zone; other records use retained program labels.'),
        choice('pap', 'PAP', 'PAPs', r => group(r.source.pap), 'Retained comparison-row PAP label, without inferring cross-PAP transfers.'),
        choice('region', 'Region', 'regions', r => group(r.source.region), 'Retained comparison-row region; no geographic inference from titles.'),
        choice('deo', 'DEO / implementing office', 'offices', r => group(dpwhOffice(r.source)), 'Recorded NEP implementing office, or House office for insertions. Grouped allocations with several offices remain in a separate multiple-office bucket.'),
      ]},
    {key: 'fmr', label: 'DA Farm-to-Market Roads', defaultGrouping: 'region', records: annexRecords(fmr, fmrRows), expected: annex(fmr),
      scope: 'Locally funded farm-to-market road annex; project allocations counted once across coordinate segments.', count_unit: 'comparison rows',
      house_note: 'House annex · 2nd-reading extraction, text verified identical in 3rd reading', comparison_href: '#fmr/compare?view=projects', caveat,
      matching: fmr.matching_note,
      groupings: [choice('region', 'Region', 'regions', r => ({id: r.source.region_key || '__not_recorded__', label: fmr.regions.find(g => (g.key || g.id) === r.source.region_key)?.label || r.source.region_key || unknown}), 'Recorded comparison region. Coordinate segments never duplicate a project allocation.')]},
    {key: 'hfep', label: 'DOH Health Facilities', defaultGrouping: 'category', records: hfepRecords,
      expected: {before: hfep.stages.nep.facility_ledger.total, after: hfep.stages.house.facility_ledger.total},
      scope: 'HFEP component allocations: infrastructure, medical equipment and motor vehicles. Facility totals are controls and are not counted again.',
      count_unit: 'funding-column records', house_note: 'House annex · 2nd-reading extraction, text verified identical in 3rd reading',
      comparison_href: '#hfep/analysis?view=adjustments', caveat,
      matching: 'Retained facility pairs at funding-column grain. Paired component additions/drops stay adjustments with a zero base. Changes here are House minus NEP; HFEP Analysis displays NEP minus House.',
      groupings: [choice('category', 'Facility category', 'facility categories', r => group(r.source.category), 'Existing funding-record category scope; paired records use the House facility scope.'),
        choice('subcategory', 'Facility subcategory', 'facility subcategories', r => group(r.source.subcategory), 'Existing funding-record subcategory; missing labels remain in Not recorded.'),
        choice('region', 'Region', 'regions', r => group(r.source.region), 'Existing funding-record region scope; paired records use the House facility scope.'),
        choice('province', 'Province', 'provinces', r => group(r.source.province), 'Retained province heading; values are not inferred or corrected from facility titles.'),
        choice('column', 'Funding component', 'funding components', r => ({id: r.source.column, label: r.source.column_label}), 'Each printed component is counted once; total columns are excluded.') ]},
    {key: 'nia', label: 'NIA Irrigation', defaultGrouping: 'subprogram', records: annexRecords(nia, niaRows), expected: annex(nia),
      scope: 'Six detailed irrigation sub-programs; agency-only CARP and broader agency appropriations are excluded.', count_unit: 'comparison rows',
      house_note: 'House annex · 2nd-reading extraction, text verified identical in 3rd reading', comparison_href: '#nia/compare?view=projects', caveat,
      matching: nia.matching_note,
      groupings: [choice('subprogram', 'Sub-program', 'sub-programs', r => group(r.source.subprogram_key), 'Recorded comparison sub-program; repeated titles remain unmatched.'),
        choice('program', 'Program group', 'program groups', r => group((r.source.nep || r.source.house)?.program_group), 'Recorded NEP program group, or House program group for insertions.') ]},
  ];
}

export function buildFlowSourcesData(inputs, provenance = {}) {
  const sources = normalizedFlowSources(inputs).map(({records, expected, groupings, ...dataset}) => {
    // Annexes are sourced from the retained 2nd-reading extraction only after
    // checking their explicit evidence that the 3rd-reading text is identical.
    if (dataset.key !== 'dpwh') {
      const audit = inputs[dataset.key].stages.house.audit_summary;
      if (!(audit.reading_comparison_total_pages > 0 && audit.reading_comparison_identical_pages === audit.reading_comparison_total_pages)) throw new Error(`${dataset.key}: House reading identity is not verified`);
    }
    const grouped = groupings.map(({pick, ...description}) => {
      const flow = buildRevisionFlowFromRecords(records, {id: dataset.key, group: pick, expected: {...expected, count: records.length}});
      return {...description, basis: `${description.basis} ${commonBasis}`, flow};
    });
    const root = grouped[0].flow;
    for (const g of grouped) for (const c of root.matrix.cells) {
      const other = g.flow.matrix.cells.find(x => x.key === c.key);
      if (['before', 'after', 'count', 'delta'].some(k => c[k] !== other[k])) throw new Error(`${dataset.key}/${g.key}: regrouping changed revision totals`);
    }
    return {schema_version: 1, fiscal_year: 2027, dataset, grain: dataset.count_unit,
      stages: {nep: {amount_php: expected.before}, third: {amount_php: expected.after}},
      categories: classes(root.matrix.cells), totals: {rows: records.length},
      groupings: Object.fromEntries(grouped.map(({flow, ...g}) => [g.key, {...g, groups: flow.groups.map(m => ({id: m.id, label: m.label, rows: m.count, classes: classes(m.cells)}))}])),
      provenance: {...provenance[dataset.key], versions: 'DBM NEP → HGAB', unit: 'PHP'}};
  });
  return {schema_version: 1, fiscal_year: 2027, sources};
}
