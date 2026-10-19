import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {buildDpwhFlow} from '../buildDpwhFlow.mjs';
import {buildFlowFromGrouping, DEFAULT_ACCESSORS} from './flowFromGrouping.js';
import {REVISION_ORDER, REVISION_TYPES} from './revisionFlow.js';

const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
const comparison = comparisonPayloads(read('stage_trace_2027.json'), read('house_reading_changes_2027.json'));
const payload = buildDpwhFlow(comparison.detail, comparison.overview.headlines);

// A second domain with none of DPWH's field names: library circulation at two
// snapshots, grouped by branch. before 6800 -> after 7010 over 19 records.
const library = () => ({stages: {open: {count: 6800}, close: {count: 7010}}, totals: {records: 19},
  groupings: {branch: {groups: [
    {code: 'c', title: 'Central Branch', items: [
      {kind: 'unchanged', n: 4, opening: 300, closing: 300},
      {kind: 'insertion', n: 3, opening: 0, closing: 500},
      {kind: 'increased', n: 1, opening: 100, closing: 150},
      {kind: 'reduced', n: 1, opening: 200, closing: 120}]},
    {code: 'r', title: 'Riverside Branch', items: [
      {kind: 'unchanged', n: 6, opening: 5900, closing: 5900},
      {kind: 'deletion', n: 2, opening: 200, closing: 0},
      {kind: 'reduced', n: 2, opening: 100, closing: 40}]}]}}});
const libraryOptions = {grouping: 'branch', id: 'library',
  labels: {before: 'Opening stock', after: 'Closing stock', intermediaryBefore: 'Branch · opening',
    intermediaryAfter: 'Branch · closing', matrix: 'Revision cells', additions: 'New acquisitions',
    reductions: 'Withdrawals', count: 'catalogue records'},
  groupsOf: p => p.groupings.branch.groups, cellsOf: g => g.items,
  groupKey: g => g.code, groupLabel: g => g.title,
  cellKey: c => c.kind, cellBefore: c => c.opening, cellAfter: c => c.closing, cellCount: c => c.n,
  expectedBefore: p => p.stages.open.count, expectedAfter: p => p.stages.close.count,
  expectedCount: p => p.totals.records};

test('the category contract rebuilds both ledgers through the default accessors', () => {
  const flow = buildFlowFromGrouping(payload, {id: 'dpwh'});
  assert.equal(flow.totals.before, payload.stages.nep.amount_php);
  assert.equal(flow.totals.after, payload.stages.third.amount_php);
  assert.equal(flow.totals.count, payload.totals.rows);
  assert.equal(flow.groups.length, 7);
  assert.deepEqual(flow.groups.map(g => g.id),
    [...flow.groups].sort((a, b) => b.before - a.before).map(g => g.id), 'ordered by before value');
  // The matrix normalizes every group to the complete vocabulary in its own
  // canonical order, filling absent types with zeros — so each group's cells
  // always describe all five revisions, never a sparse subset.
  const vocabulary = REVISION_TYPES.map(t => t.key);
  for (const g of flow.groups) {
    assert.deepEqual(g.cells.map(c => c.key), vocabulary, g.label);
    assert.ok(g.cells.every(c => Number.isSafeInteger(c.before) && Number.isSafeInteger(c.after)));
    assert.equal(g.before, g.cells.reduce((s, c) => s + c.before, 0), g.label);
    assert.equal(g.after, g.cells.reduce((s, c) => s + c.after, 0), g.label);
  }
});

test('column 2 stays group-major: contiguous blocks in the fixed class order', () => {
  const flow = buildFlowFromGrouping(payload, {id: 'dpwh'});
  const matrix = flow.graph.nodes.filter(n => n.column === 2).sort((a, b) => a.order - b.order);
  const seen = [];
  for (const node of matrix) {
    const last = seen.at(-1);
    if (!last || last.id !== node.groupId) {
      assert.ok(!seen.some(s => s.id === node.groupId), `${node.groupId} block is not contiguous`);
      seen.push({id: node.groupId, order: []});
    }
    seen.at(-1).order.push(node.revision);
  }
  assert.equal(seen.length, flow.groups.length);
  for (const block of seen)
    assert.deepEqual(block.order, block.order.slice().sort((a, b) => REVISION_ORDER.indexOf(a) - REVISION_ORDER.indexOf(b)),
      `${block.id} cells are not in revision order`);
  // Column 3 keeps each group's reductions sink directly below its own node.
  const right = flow.graph.nodes.filter(n => n.column === 3).sort((a, b) => a.order - b.order);
  for (let i = 0; i < right.length; i += 2) {
    assert.equal(right[i].role, 'after', right[i].groupId);
    if (right[i + 1]) {assert.equal(right[i + 1].role, 'reductions'); assert.equal(right[i + 1].groupId, right[i].groupId);}
  }
});

test('a second domain reuses the same builder with its own vocabulary and fields', () => {
  const flow = buildFlowFromGrouping(library(), libraryOptions);
  assert.equal(flow.totals.before, 6800);
  assert.equal(flow.totals.after, 7010);
  assert.equal(flow.totals.count, 19);
  assert.equal(flow.totals.additions, 550);
  assert.equal(flow.totals.reductions, 340);
  assert.deepEqual(flow.groups.map(g => g.label), ['Riverside Branch', 'Central Branch']);
  assert.equal(flow.labels.before, 'Opening stock');
  assert.equal(flow.labels.reductions, 'Withdrawals');
  assert.deepEqual(flow.graph.nodes.filter(n => n.role === 'reductions').map(n => n.name),
    ['Withdrawals', 'Withdrawals']);
  // No budget vocabulary leaks into a non-budget figure.
  const text = JSON.stringify(flow);
  assert.ok(!/NEP|HGAB|House|comparison rows/.test(text), 'budget vocabulary leaked');
});

test('recordHref decorates nodes without disturbing conserved geometry', () => {
  const bare = buildFlowFromGrouping(payload, {id: 'dpwh'});
  const linked = buildFlowFromGrouping(payload, {id: 'dpwh',
    recordHref: (revision, group) => `#compare?flag=${revision ?? 'all'}&program=${group ?? 'all'}`});
  assert.equal(bare.graph.nodes.length, linked.graph.nodes.length);
  assert.deepEqual(bare.graph.links.map(l => [l.source, l.target, l.value]),
    linked.graph.links.map(l => [l.source, l.target, l.value]));
  assert.ok(linked.graph.nodes.every(n => typeof n.href === 'string' && n.href.startsWith('#compare')));
  // A reductions sink is the gross side of that group's reduced population.
  assert.ok(linked.graph.nodes.filter(n => n.role === 'reductions')
    .every(n => n.href.includes('flag=reduced')), 'reductions sink links to its reduced population');
  assert.ok(linked.graph.nodes.filter(n => n.revision === 'increased')
    .every(n => n.href.includes('flag=increased')));
  // Ledger nodes carry no group identity, so they link to the whole grouping.
  assert.ok(linked.graph.nodes.filter(n => n.role === 'totalBefore' || n.role === 'totalAfter')
    .every(n => n.href.includes('program=all')));
});

test('contract violations fail visibly instead of rendering phantom money', () => {
  // A grouping the payload does not carry.
  assert.throws(() => buildFlowFromGrouping(payload, {grouping: 'region', id: 'x'}), /unavailable/);
  const missing = library(); delete missing.groupings.branch;
  assert.throws(() => buildFlowFromGrouping(missing, libraryOptions), /cannot read the 'branch' grouping/);
  // Default (DPWH) accessors against a foreign schema must name what they read.
  assert.throws(() => buildFlowFromGrouping(library(), {grouping: 'branch', id: 'x'}),
    /cannot read a 'branch' group identity/);
  // A field that is simply absent yields undefined, which the integer
  // validator rejects — still visible, still no phantom money.
  const absentField = {...libraryOptions, cellBefore: c => c.nonexistent};
  assert.throws(() => buildFlowFromGrouping(library(), absentField), /Revision flow: invalid/);
  // An accessor that actually throws is attributed to the accessor that broke,
  // so a foreign schema reports which contract field to fix.
  const throwingField = {...libraryOptions, cellBefore: c => c.nested.opening};
  assert.throws(() => buildFlowFromGrouping(library(), throwingField), /cannot read a before value/);
  const drifted = library(); drifted.groupings.branch.groups[0].items[0].opening += 1;
  assert.throws(() => buildFlowFromGrouping(drifted, libraryOptions), /Revision flow:/);
  const noCells = library(); noCells.groupings.branch.groups[0].items = [];
  assert.throws(() => buildFlowFromGrouping(noCells, libraryOptions), /has no revision cells/);
});

test('default accessors expose the documented DPWH contract', () => {
  const a = DEFAULT_ACCESSORS('category');
  assert.equal(typeof a.groupsOf(payload), 'object');
  assert.equal(a.groupKey(payload.groupings.category.groups[0]), payload.groupings.category.groups[0].id);
  assert.equal(a.expectedBefore(payload), payload.stages.nep.amount_php);
  assert.equal(a.cellCount(payload.groupings.category.groups[0].classes[0]),
    payload.groupings.category.groups[0].classes[0].rows);
});
