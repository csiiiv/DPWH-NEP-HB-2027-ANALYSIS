import {buildRevisionMatrix} from './revisionFlow.js';

// One revision-matrix calculation, usable for a whole workspace or any
// scoped intermediary. Grouping changes the population, never the rules.
export const REVISIONS = [
  {key: 'insertion', label: 'Inserted', note: 'HGAB-only candidates', color: '#b0852b', cue: '+'},
  {key: 'unchanged', label: 'Unchanged', note: 'Retained pairs · same allocation', color: '#7f9fc0', cue: '='},
  {key: 'increased', label: 'Increased', note: 'Retained pairs · higher allocation', color: '#0b6b3a', cue: '↑'},
  {key: 'reduced', label: 'Decreased', note: 'Retained pairs · lower allocation', color: '#a12020', cue: '↓'},
  {key: 'deletion', label: 'Deleted', note: 'NEP-only candidates', color: '#6b5543', cue: '−'},
];
const ensure = (ok, message) => {if (!ok) throw new Error(`Revision matrix: ${message}`);};

export function revisionMatrix({scope, cells, expected = {}}) {
  const matrix = buildRevisionMatrix({scope,
    cells: cells.map(c => ({key: c.key, count: c.rows, before: c.nep, after: c.hgab})),
    expected: {before: expected.nep, after: expected.hgab, count: expected.rows}});
  const {before: nep, after: hgab, count: rows, ...changes} = matrix.totals;
  return {scope, cells: matrix.cells.map(c => ({...REVISIONS.find(r => r.key === c.key),
    id: c.id, scope, rows: c.count, nep: c.before, hgab: c.after, delta: c.delta})),
    totals: {nep, hgab, rows, ...changes}};
}

// Adapter for the existing Allocation flows tab. Source-record counts may
// differ from comparison-row counts; monetary analysis is identical.
export function workspaceRevisionMatrix(w) {
  const a = w.adjustments;
  ensure(a.increased_house_php - a.increased_nep_php === a.increased_php, `${w.key} increased pair does not reconcile`);
  ensure(a.reduced_nep_php - a.reduced_house_php === a.reduced_php, `${w.key} reduced pair does not reconcile`);
  return revisionMatrix({scope: w.key, cells: [
    {key: 'insertion', rows: w.insertions.count, nep: 0, hgab: w.insertions.amount_php},
    {key: 'unchanged', rows: w.unchanged.count, nep: w.unchanged.amount_php, hgab: w.unchanged.amount_php},
    {key: 'increased', rows: a.increased_count, nep: a.increased_nep_php, hgab: a.increased_house_php},
    {key: 'reduced', rows: a.reduced_count, nep: a.reduced_nep_php, hgab: a.reduced_house_php},
    {key: 'deletion', rows: w.deletions.count, nep: w.deletions.amount_php, hgab: 0},
  ], expected: {nep: w.sources.nep.amount_php, hgab: w.sources.house.amount_php}});
}
