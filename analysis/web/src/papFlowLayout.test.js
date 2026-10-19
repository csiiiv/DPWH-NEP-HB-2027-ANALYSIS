import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutPapFlow} from './papFlowLayout.js';
import {layoutRevisionFlow} from './revisionFlowLayout.js';
import {buildFlowFromGrouping} from './flowFromGrouping.js';
import {inventoryFlow} from './revisionFlowExample.js';

const sum = list => list.reduce((s, item) => s + item.value, 0);

test('pap engine places level outer segments and level ribbons per group', () => {
  const model = inventoryFlow();
  const layout = layoutPapFlow(model);
  assert.equal(layout.alignment, 'midpoint');
  const segments = layout.nodes.filter(n => n.role === 'outerLedger');
  assert.equal(segments.length, model.groups.reduce((s, g) => s + Number(g.before > 0) + Number(g.after > 0), 0));
  for (const segment of segments) {
    assert.equal(segment.height, segment.value * layout.scale, segment.key);
    const ribbon = layout.ribbons.find(r => r.groupId === segment.groupId && (segment.side === 'before'
      ? r.source === layout.ledgers.before.key : r.target === layout.ledgers.after.key));
    assert.ok(ribbon, segment.key);
    // The segment shares the y of its group's B/D node and the ribbon's outer
    // end is level with it: every outer ribbon runs flat.
    const row = layout.rows.find(r => r.id === segment.groupId);
    assert.equal(segment.y, segment.side === 'before' ? row.left.y : row.right.y);
    assert.equal(segment.side === 'before' ? ribbon.sourceY : ribbon.targetY, segment.y);
    assert.equal(segment.side === 'before' ? ribbon.targetY : ribbon.sourceY, segment.y);
  }
  // Segments never overlap on a side: rows stack without shared extent.
  for (const side of ['before', 'after']) {
    const sideSegs = segments.filter(s => s.side === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < sideSegs.length; i++) assert.ok(sideSegs[i].y >= sideSegs[i - 1].y + sideSegs[i - 1].height, 'no overlap');
  }
  assert.equal(sum(layout.stubs), model.totals.additions);
  // Deletions terminate at C; only paired reductions reach the sinks.
  assert.equal(sum(layout.sinks), model.totals.reductions + model.matrix.cells.find(c => c.key === 'deletion').delta);
});

test('pap engine preserves the shared engine’s values, scale and grammar', () => {
  const model = inventoryFlow();
  const pap = layoutPapFlow(model), shared = layoutRevisionFlow(model, {alignment: 'center'});
  assert.equal(pap.scale, shared.scale);
  assert.equal(pap.height, shared.height);
  for (const list of ['ribbons', 'stubs', 'sinks']) {
    assert.deepEqual(pap[list].map(n => [n.key, n.value, n.height]), shared[list].map(n => [n.key, n.value, n.height]));
  }
  // The only structural difference: pap adds outerLedger segments.
  const sharedKeys = new Set(shared.nodes.map(n => n.key));
  assert.ok(pap.nodes.filter(n => !sharedKeys.has(n.key)).every(n => n.role === 'outerLedger'));
  assert.throws(() => layoutPapFlow(model, {valueHeight: 0}), /positive/);
});

test('pap engine accepts a non-budget domain unchanged', () => {
  // The library-circulation contract from the flowFromGrouping tests: proves
  // the experiment engine stays domain-neutral like the shared engine.
  const model = buildFlowFromGrouping({stages: {open: {count: 6800}, close: {count: 7010}}, totals: {records: 19},
    groupings: {branch: {groups: [
      {code: 'c', title: 'Central Branch', items: [
        {kind: 'unchanged', n: 4, opening: 300, closing: 300},
        {kind: 'insertion', n: 3, opening: 0, closing: 500},
        {kind: 'increased', n: 1, opening: 100, closing: 150},
        {kind: 'reduced', n: 1, opening: 200, closing: 120}]},
      {code: 'r', title: 'Riverside Branch', items: [
        {kind: 'unchanged', n: 6, opening: 5900, closing: 5900},
        {kind: 'deletion', n: 2, opening: 200, closing: 0},
        {kind: 'reduced', n: 2, opening: 100, closing: 40}]}]}}},
    {grouping: 'branch', id: 'library',
      labels: {before: 'Opening stock', after: 'Closing stock', intermediaryBefore: 'Branch · opening',
        intermediaryAfter: 'Branch · closing', matrix: 'Revision cells', additions: 'New acquisitions',
        reductions: 'Withdrawals', count: 'catalogue records'},
      groupsOf: p => p.groupings.branch.groups, cellsOf: g => g.items,
      groupKey: g => g.code, groupLabel: g => g.title,
      cellKey: c => c.kind, cellBefore: c => c.opening, cellAfter: c => c.closing, cellCount: c => c.n,
      expectedBefore: p => p.stages.open.count, expectedAfter: p => p.stages.close.count,
      expectedCount: p => p.totals.records});
  const layout = layoutPapFlow(model);
  assert.equal(layout.rows.length, 2);
  assert.equal(layout.nodes.filter(n => n.role === 'outerLedger').length, 4);
  assert.ok(layout.ribbons.every(r => !/NaN|Infinity/.test(r.d)));
});
