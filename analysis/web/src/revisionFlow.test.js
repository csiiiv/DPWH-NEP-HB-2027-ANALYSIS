import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRevisionFlow, buildRevisionFlowFromRecords, REVISION_ORDER} from './revisionFlow.js';
import {layoutRevisionFlow} from './revisionFlowLayout.js';
import {inventoryFlow, inventoryRecords} from './revisionFlowExample.js';

const sum = list => list.reduce((s, item) => s + item.value, 0);
function checkFlow(model) {
  const {nodes, links, stubs} = model.graph;
  assert.equal(new Set(nodes.map(n => n.key)).size, nodes.length);
  for (const link of links) {
    assert.ok(nodes.some(n => n.key === link.source));
    assert.ok(nodes.some(n => n.key === link.target));
    assert.ok(link.value > 0);
  }
  for (const node of nodes) {
    const incoming = sum(links.filter(l => l.target === node.key)) + sum(stubs.filter(s => s.target === node.key));
    const outgoing = sum(links.filter(l => l.source === node.key));
    assert.equal(incoming, node.role === 'totalBefore' ? 0 : node.value, node.key);
    assert.equal(outgoing, ['totalAfter', 'deletion', 'reductions'].includes(node.role) ? 0 : node.value, node.key);
  }
  const layout = layoutRevisionFlow(model);
  assert.ok(Number.isFinite(layout.scale) && layout.scale > 0);
  const drawn = [...Object.values(layout.ledgers), ...layout.nodes, ...layout.stubs];
  for (const n of drawn) {
    assert.ok(Number.isFinite(n.y));
    assert.equal(n.height, n.value * layout.scale);
    assert.ok(n.y >= 0 && n.y + n.height <= layout.height + 1e-7);
  }
  assert.deepEqual(layout.ribbons.map(r => r.key).sort(), links.map(l => l.key).sort());
  for (const r of layout.ribbons) {
    assert.ok(!/NaN|Infinity|undefined/.test(r.d));
    const coords = r.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
    assert.ok(Math.abs(coords[15] - coords[1] - r.height) < 1e-7, 'source thickness');
    assert.ok(Math.abs(coords[9] - coords[7] - r.height) < 1e-7, 'target thickness');
  }
  for (const row of layout.rows) {
    assert.deepEqual(row.cells.map(c => c.key), REVISION_ORDER.filter(key => row.cells.some(c => c.key === key)));
    if (row.reductionSink) {
      assert.ok(row.reductionSink.y > row.right.y + row.right.height);
      assert.equal(row.reductionSink.value, -row.matrix.cells.find(c => c.key === 'reduced').delta);
    }
  }
  return layout;
}

test('non-budget inventory uses the complete five-stage grammar; regrouping preserves revisions', () => {
  const regions = inventoryFlow(), departments = inventoryFlow('department');
  assert.deepEqual(regions.totals, {before: 100, after: 102, count: 6, additions: 27, reductions: 25, delta: 2});
  assert.deepEqual(regions.totals, departments.totals);
  assert.deepEqual(regions.groups.map(g => g.id), ['North', 'South']);
  assert.deepEqual(departments.groups.map(g => g.id), ['Tools', 'Parts']);
  assert.equal(regions.groups[0].additions, 15);
  assert.equal(regions.groups[0].reductions, 25);
  for (const cell of regions.matrix.cells) {
    const regrouped = departments.matrix.cells.find(c => c.key === cell.key);
    for (const field of ['before', 'after', 'count', 'delta']) assert.equal(regrouped[field], cell[field]);
  }
  const layout = checkFlow(regions); checkFlow(departments);
  assert.equal(sum(layout.stubs), 27);
  assert.equal(sum(layout.sinks), 15, 'deletion terminates at C, separate from paired reductions');
  assert.equal(layout.stubs.length, 2);
  assert.deepEqual([...new Set(regions.graph.nodes.map(n => n.column))].sort(), [0, 1, 2, 3, 4]);
});

test('offsetting gross changes remain separate before grouping and can cancel exactly', () => {
  const model = buildRevisionFlowFromRecords(inventoryRecords.slice(0, 2), {group: () => ({id: 'one'})});
  assert.equal(model.totals.delta, 0);
  assert.equal(model.totals.additions, 15);
  assert.equal(model.totals.reductions, 15);
  const layout = checkFlow(model);
  assert.equal(sum(layout.stubs), sum(layout.sinks));
});

test('aggregated cells and matched records produce the same graph and geometry', () => {
  const model = inventoryFlow();
  const rebuilt = buildRevisionFlow({id: model.id, labels: model.labels,
    groups: model.groups.map(g => ({id: g.id, label: g.label, cells: g.cells})), expected: model.totals});
  assert.deepEqual(rebuilt, model);
  assert.deepEqual(layoutRevisionFlow(rebuilt), layoutRevisionFlow(model));
  assert.deepEqual(buildRevisionFlow({groups: [...rebuilt.groups].reverse()}).groups.map(g => g.id), ['North', 'South']);
});

test('empty, insertion-only, deletion-only and zero-value populations stay finite without phantom money', () => {
  for (const records of [[], [{id: 'new', before: null, after: 10}], [{id: 'old', before: 10, after: null}],
    [{id: 'zero', before: 0, after: 0}], [{id: 'new-zero', before: null, after: 0}], [{id: 'old-zero', before: 0, after: null}],
    [{id: 'rise', before: 0, after: 10}], [{id: 'fall', before: 10, after: 0}]]) {
    const model = buildRevisionFlowFromRecords(records, {group: () => ({id: 'only'})});
    const layout = checkFlow(model);
    if (!model.totals.before && !model.totals.after) {
      assert.equal(model.graph.nodes.length, 0);
      assert.equal(layout.ribbons.length, 0);
      assert.equal(layout.stubs.length, 0);
    }
    assert.equal(model.totals.count, records.length);
  }
});

test('keys are collision safe and custom grouping order and labels are honored', () => {
  const model = buildRevisionFlowFromRecords(['flow', 'x::nep', 'x', '["x","before"]'].map((id, i) => ({id, before: i, after: i + 1})), {
    id: 'flow', group: r => ({id: r.id}), order: (a, b) => a.id.localeCompare(b.id),
    labels: {before: 'Draft', after: 'Final', reductions: 'Removed'}, revisions: {increased: {label: 'Expanded'}},
  });
  checkFlow(model);
  assert.deepEqual(model.groups.map(g => g.id), [...model.groups.map(g => g.id)].sort());
  assert.equal(model.groups[0].cells.find(c => c.key === 'increased').label, 'Expanded');
  assert.equal(model.labels.before, 'Draft');
});

test('rejects ambiguous membership, unsafe values, duplicate records and aggregate drift', () => {
  const grouped = groups => buildRevisionFlow({groups});
  const g = {id: 'one', cells: [{key: 'unchanged', before: 1, after: 1, count: 1}]};
  for (const cells of [
    [{key: 'typo', before: 1, after: 1, count: 1}], [...g.cells, ...g.cells],
    [{key: 'unchanged', before: 1, after: 2, count: 1}],
    [{key: 'increased', before: 2, after: 1, count: 1}],
    [{key: 'reduced', before: 1, after: 2, count: 1}],
    [{key: 'insertion', before: 1, after: 2, count: 1}],
    [{key: 'deletion', before: 2, after: 1, count: 1}],
    [{key: 'unchanged', before: 1, after: 1, count: 0}],
    [{key: 'unchanged', before: 0.1, after: 0.1, count: 1}],
    [{key: 'unchanged', before: -1, after: -1, count: 1}],
  ]) assert.throws(() => grouped([{...g, cells}]), /Revision flow:/);
  assert.throws(() => grouped([g, g]), /duplicate/);
  assert.throws(() => buildRevisionFlow({groups: [g], expected: {after: 2}}), /do(?:es)? not rebuild/);
  assert.throws(() => grouped([{...g, expected: {count: 2}}]), /do(?:es)? not rebuild/);
  assert.throws(() => grouped([1, 2].map(i => ({id: `${i}`, cells: [{key: 'unchanged', before: Number.MAX_SAFE_INTEGER, after: Number.MAX_SAFE_INTEGER, count: 1}]}))), /safe integer/);
  for (const records of [
    [{id: 'one', before: null, after: null}], [{id: 'one', before: NaN, after: 1}],
    [{id: 'one', before: Infinity, after: 1}], [{id: 'one', before: '1', after: 1}],
    [{before: 1, after: 1}], [{id: 'one', before: 1}, {id: 'one', after: 1}],
  ]) assert.throws(() => buildRevisionFlowFromRecords(records, {group: () => ({id: 'one'})}), /Revision flow:/);
  assert.throws(() => buildRevisionFlowFromRecords([{id: 'a', before: 1}], {group: () => null}), /group identity/);
  assert.throws(() => buildRevisionFlowFromRecords([{id: 'a', before: 1}, {id: 'b', before: 1}], {group: r => ({id: 'one', label: r.id})}), /conflicting labels/);
  assert.throws(() => layoutRevisionFlow(inventoryFlow(), {valueHeight: 0}), /positive/);
});


test('top alignment anchors stage starts while centered alignment preserves all values and scale', () => {
  const model = inventoryFlow();
  const top = layoutRevisionFlow(model), centered = layoutRevisionFlow(model, {alignment: 'center'}),
    midpoint = layoutRevisionFlow(model, {alignment: 'midpoint'});
  assert.equal(top.alignment, 'top');
  assert.equal(top.alignment, 'top');
  assert.equal(top.ledgers.before.y, top.flowTop);
  assert.equal(top.ledgers.after.y, top.flowTop);
  for (const row of top.rows) {
    assert.equal(row.left.y, row.right.y);
    assert.equal(row.cells[0].y, row.left.y);
    for (const cell of row.cells) assert.equal(cell.y, cell.slotY);
  }
  assert.ok(centered.ledgers.before.y > top.ledgers.before.y);
  assert.equal(top.scale, centered.scale);
  assert.equal(top.height, centered.height);
  for (const list of ['ribbons', 'nodes', 'stubs', 'sinks']) {
    assert.deepEqual(top[list].filter(n => n.role !== 'outerLedger').map(n => [n.key, n.value, n.height]),
      centered[list].filter(n => n.role !== 'outerLedger').map(n => [n.key, n.value, n.height]));
  }
  assert.equal(midpoint.alignment, 'midpoint');
  const segments = midpoint.nodes.filter(n => n.role === 'outerLedger');
  assert.equal(segments.length, model.groups.reduce((sum, group) => sum + Number(group.before > 0) + Number(group.after > 0), 0));
  for (const segment of segments) {
    assert.equal(segment.height, segment.value * midpoint.scale);
    const ribbon = midpoint.ribbons.find(r => r.groupId === segment.groupId && (segment.side === 'before'
      ? r.source === midpoint.ledgers.before.key : r.target === midpoint.ledgers.after.key));
    assert.ok(ribbon, segment.key);
    assert.equal(segment.side === 'before' ? ribbon.sourceY : ribbon.targetY, segment.y);
  }
  assert.throws(() => layoutRevisionFlow(model, {alignment: 'bottom'}), /alignment/);
});

test('top groups plus Others preserve each revision and gross change, without reranking Others', async () => {
  const {collapseRevisionFlow} = await import('./revisionFlow.js');
  const model = buildRevisionFlowFromRecords([
    {id: 'a', group: 'A', before: 100, after: 100},
    {id: 'b', group: 'B', before: 90, after: 90},
    {id: 'c', group: 'C', before: 80, after: 95},
    {id: 'd', group: 'D', before: 70, after: 55},
    {id: 'e', group: 'E', before: 60, after: 60},
    {id: 'f', group: 'E', before: null, after: 10},
    {id: 'g', group: 'D', before: 10, after: null},
  ], {id: 'example', group: r => ({id: r.group})});
  const original = structuredClone(model);
  const compact = collapseRevisionFlow(model, {top: 2});
  assert.deepEqual(compact.groups.map(g => g.id), ['A', 'B', 'others']);
  const others = compact.groups.at(-1);
  assert.ok(others.before > compact.groups[0].before, 'Others stays last even when its combined value is largest');
  assert.deepEqual(others.members.map(g => g.id), ['C', 'D', 'E']);
  assert.equal(others.additions, 25);
  assert.equal(others.reductions, 25);
  assert.equal(others.delta, 0, 'zero net change cannot hide offsetting edits');
  assert.deepEqual(compact.totals, model.totals);
  assert.deepEqual(compact.matrix.cells, model.matrix.cells);
  assert.deepEqual(model, original, 'the complete model is untouched');
  const layout = checkFlow(compact);
  assert.ok(layout.height < layoutRevisionFlow(model).height);
  assert.equal(layout.scale, layoutRevisionFlow(model).scale);
  assert.equal(collapseRevisionFlow(model, {top: 5}), model, 'do not invent an empty Others group');
  assert.equal(collapseRevisionFlow(model, {top: 0}).groups.length, 1);
  assert.throws(() => collapseRevisionFlow(model, {top: -1}), /top/);
  assert.throws(() => collapseRevisionFlow(model, {top: 1.5}), /top/);
  assert.throws(() => collapseRevisionFlow(model, {othersId: 'A'}), /conflicts/);
});
