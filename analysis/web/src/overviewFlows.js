import {workspaceRevisionMatrix} from './revisionMatrix.js';

import {revisionMatrixGraph} from './revisionFlow.js';
export {FLOW_COLORS} from './revisionFlow.js';

// Column-flow graph for one Overview workspace: the NEP ledger splits into
// revision categories and recombines into the House ledger. Derived
// entirely from the validated summary payload — no new schema — and
// conservation is re-asserted here so a malformed figure can never render,
// the same defense overviewSummary applies at build time.
//
// Topology (pipeline, no ribbon crossings):
//   col 0  NEP      the single DBM NEP ledger
//   col 1  revisions  Deletions · Insertions · Increased · Unchanged · Reduced
//   col 2  HGAB       HGAB ledger · House Reductions
//
// Gross additions and insertions are new House money: they exist in no
// left-hand ledger, so they enter their col-1 node's left edge as short
// external stubs instead of fake ribbons from the NEP ledger.
//
// Invariants (all per workspace):
//   NEP out   = deletions + unchanged + reduced@NEP + additions@NEP = NEP ledger
//   HGAB in   = insertions + unchanged + additions@House + reduced@House = House ledger
//   Additions in (NEP base + gross stub) = out (additions@House)
//   Reduced   in (NEP base) = out (House base + gross reductions)
function ensure(condition, message) {if (!condition) throw new Error(`Overview flow: ${message}`);}

export function flowGraph(w) {
  const a = w.adjustments;
  const matrix = workspaceRevisionMatrix(w);
  const cells = Object.fromEntries(matrix.cells.map(c => [c.key,c]));
  const nodes = [
    {key: 'nep', name: 'DBM NEP', sub: 'NEP ledger', kind: 'stage', col: 0, order: 0,
      amount_php: w.sources.nep.amount_php, count: w.sources.nep.count, href: w.links.nep},
    {key: 'deletions', name: 'Deletions', sub: 'NEP Only Records', kind: 'deletion', col: 1, order: 0,
      amount_php: cells.deletion.nep, count: w.deletions.count, href: w.links.deletions},
    {key: 'insertions', name: 'Insertions', sub: 'House Only Records', kind: 'insertion', col: 1, order: 1,
      amount_php: cells.insertion.hgab, count: w.insertions.count, href: w.links.insertions},
    {key: 'additions', name: 'Increased', sub: 'paired titles, increased at House', kind: 'up', col: 1, order: 2,
      amount_php: cells.increased.hgab, count: a.increased_count, href: w.links.increases},
    {key: 'unchanged', name: 'Unchanged', sub: 'Same titles, no adjustments', kind: 'unchanged', col: 1, order: 3,
      amount_php: cells.unchanged.nep, count: w.unchanged.count, href: w.links.unchanged},
    {key: 'reduced', name: 'Reduced', sub: 'paired titles, decreased at House', kind: 'adjust', col: 1, order: 4,
      amount_php: cells.reduced.nep, count: a.reduced_count, href: w.links.decreases, labelSide: 'left'},
    ...(cells.scope_review && cells.scope_review.nep > 0 ? [{key: 'scope_review', name: 'Scope review',
      sub: 'same road, non-overlapping segments', kind: 'scope_review', col: 1, order: 5,
      amount_php: cells.scope_review.nep, count: w.scope_review.count,
      href: '#compare?view=projects&flag=segment_scope', labelSide: 'left'}] : []),
    {key: 'house', name: 'HGAB', sub: 'House GAB ledger', kind: 'stage', col: 2, order: 0,
      amount_php: w.sources.house.amount_php, count: w.sources.house.count, href: w.links.house},
    {key: 'reductions', name: 'House Reductions', sub: 'gross reductions on paired titles', kind: 'down', col: 2, order: 1,
      amount_php: a.reduced_php, count: a.reduced_count, href: w.links.decreases},
  ];
  // The three-stage reference and the five-stage builder share this topology.
  const core = revisionMatrixGraph({scope: matrix.scope, totals: {before: matrix.totals.nep, after: matrix.totals.hgab},
    cells: matrix.cells.map(c => ({...c, before: c.nep, after: c.hgab, count: c.rows}))});
  const aliases = {before: 'nep', after: 'house', deletion: 'deletions', insertion: 'insertions', increased: 'additions',
    unchanged: 'unchanged', reduced: 'reduced', scope_review: 'scope_review', reductions: 'reductions'};
  const keys = Object.fromEntries(Object.entries(core.keys).map(([role, key]) => [key, aliases[role]]));
  const links = core.links.map(l => ({source: keys[l.source], target: keys[l.target], value: l.value, kind: l.kind}));
  const stubs = core.stubs.map(s => ({target: keys[s.target], value: s.value, kind: s.kind,
    ...(s.revision === 'increased' ? {lift: 'auto'} : {})}));
  const kept = core.nodes.map(n => nodes.find(old => old.key === aliases[n.role]));
  for (const node of kept)
    ensure(Number.isSafeInteger(node.amount_php) && node.amount_php > 0 && node.href && node.name && node.sub,
      `${w.key} flow node ${node.key} incomplete`);
  return {nodes: kept, links, stubs, matrix};
}
