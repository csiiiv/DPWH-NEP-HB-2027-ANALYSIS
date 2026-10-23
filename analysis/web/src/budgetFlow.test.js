import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBudgetCategoryModel, buildBudgetFlowModel, collapseBudgetGroups, categoryRecordHref} from './budgetFlowModel.js';
import {layoutRevisionFlow} from './revisionFlowLayout.js';
import {buildDpwhFlow} from '../buildDpwhFlow.mjs';
import {matchesFlag} from './matchFilters.js';
import {comparisonState} from './findingRoutes.js';
import {selectRows, matchesProgram} from './model.js';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {dpwhSummary} from './overviewSummary.js';
import {flowGraph} from './overviewFlows.js';

// Build from retained inputs so CI does not require ignored browser JSON.
const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
const comparison = comparisonPayloads(read('stage_trace_2027.json'), read('house_reading_changes_2027.json'));


const example = () => ({schema_version: 1,
  categories: [
    {class: 'insertion', rows: 1, nep_php: 0, third_php: 50e9},
    {class: 'unchanged', rows: 1, nep_php: 30e9, third_php: 30e9},
    {class: 'increased', rows: 1, nep_php: 20e9, third_php: 35e9},
    {class: 'reduced', rows: 1, nep_php: 40e9, third_php: 15e9},
    {class: 'deletion', rows: 1, nep_php: 10e9, third_php: 0},
  ], stages: {nep: {amount_php: 100e9}, third: {amount_php: 130e9}}, totals: {rows: 5}});

test('worked example preserves offsetting gross changes and separate side amounts', () => {
  const {totals, categories} = buildBudgetCategoryModel(example());
  assert.equal(totals.additions, 65e9);
  assert.equal(totals.reductions, 35e9);
  assert.equal(totals.delta, 30e9);
  assert.deepEqual(categories.map(c => c.key), ['insertion', 'unchanged', 'increased', 'reduced', 'deletion', 'scope_review']);
  assert.equal(categories[2].nep, 20e9);
  assert.equal(categories[2].hgab, 35e9);
});

test('recursive flow uses explicit stubs and per-group sinks at a common scale', () => {
  const p = example();
  p.groupings = {category: {key: 'category', label: 'Category', groups: [
    {id: 'one', label: 'Group one', rows: 5, classes: p.categories},
  ]}};
  const model = buildBudgetFlowModel(p), layout = layoutRevisionFlow(model.flow, {alignment: 'top'});
  const group = layout.rows[0];
  assert.deepEqual(group.cells.map(c => c.key), ['deletion','insertion','increased','unchanged','reduced']);
  assert.equal(layout.ribbons.length, 11);
  assert.equal(layout.stubs.length, 2);
  assert.equal(layout.sinks.length, 1);
  assert.equal(layout.stubs.find(s => s.revision === 'insertion').value, 50e9);
  assert.equal(layout.stubs.find(s => s.revision === 'increased').value, 15e9);
  assert.equal(group.reductionSink.value, 25e9);
  assert.ok(group.reductionSink.y > group.right.y + group.right.height);
  assert.ok(!layout.ribbons.some(r => r.target === group.graph.keys.insertion || r.source === group.graph.keys.deletion || r.source === group.graph.keys.reductions));
  assert.equal(layout.ledgers.before.height, model.totals.nep * layout.scale);
  assert.equal(layout.ledgers.after.height, model.totals.hgab * layout.scale);
  assert.equal(group.left.height, group.before * layout.scale);
  assert.equal(group.right.height, group.after * layout.scale);
  for (const c of group.cells) {
    assert.equal(c.groupId, group.id);
    assert.equal(c.height, c.value * layout.scale);
    assert.ok(c.y >= c.slotY);
    assert.ok(c.y + c.height <= c.slotY + c.slotHeight + 1e-7);
  }
  for (const stub of layout.stubs) assert.equal(stub.height, stub.value * layout.scale);
  for (const node of layout.nodes) {
    const incoming = layout.ribbons.filter(r => r.target === node.key).reduce((s, r) => s + r.value, 0)
      + layout.stubs.filter(s => s.target === node.key).reduce((s, s2) => s + s2.value, 0);
    const outgoing = layout.ribbons.filter(r => r.source === node.key).reduce((s, r) => s + r.value, 0);
    assert.equal(incoming, node.value, node.key);
    assert.equal(outgoing, ['deletion','reductions'].includes(node.role) ? 0 : node.value, node.key);
  }
  for (const r of layout.ribbons) {
    assert.ok(!/NaN|Infinity|undefined/.test(r.d));
    const coords = r.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
    assert.ok(Math.abs(coords[15] - coords[1] - r.height) < 1e-7, r.key + ' source scale');
    assert.ok(Math.abs(coords[9] - coords[7] - r.height) < 1e-7, r.key + ' target scale');
  }
});

test('invalid units, duplicate categories, direction, membership and ledger drift fail visibly', () => {
  for (const mutate of [
    p => {p.categories[0].nep_php = 1;},
    p => {p.categories[4].third_php = 1;},
    p => {p.categories[1].third_php++;},
    p => {p.categories[2].third_php = 0;},
    p => {p.categories[3].third_php = 50e9;},
    p => {p.categories[0].third_php = 1.5;},
    p => {p.categories.push(p.categories[0]);},
    p => {p.stages.nep.amount_php++;},
    p => {p.stages.third.amount_php++;},
    p => {p.totals.rows++;},
  ]) {const p = example(); mutate(p); assert.throws(() => buildBudgetCategoryModel(p), /Budget flow:/);}
});

test('all real-data category links open exactly their comparison-row populations', () => {
  const payload = comparison.detail;
  const model = buildBudgetFlowModel(buildDpwhFlow(payload));
  for (const c of model.categories) {
    const state = comparisonState(new URLSearchParams(categoryRecordHref(c.key).split('?')[1]));
    assert.equal(state.tab, 'projects');
    const rows = payload.projects.filter(r => matchesFlag(r, state.flag));
    assert.equal(rows.length, c.rows, c.key);
    assert.equal(rows.reduce((s, r) => s + (r.nep?.amount_php || 0), 0), c.nep, c.key);
    assert.equal(rows.reduce((s, r) => s + (r.third?.amount_php || 0), 0), c.hgab, c.key);
  }
});

test('every real category has its own revision cells and exact supporting row population', () => {
  const payload = comparison.detail;
  const model = buildBudgetFlowModel(buildDpwhFlow(payload));
  assert.ok(model.groups.length > 1);
  const ids = new Set();
  for (const g of model.groups) {
    assert.equal(g.cells.length, 6);
    assert.equal(g.cells.reduce((s, c) => s + c.nep, 0), g.nep);
    assert.equal(g.cells.reduce((s, c) => s + c.hgab, 0), g.hgab);
    for (const c of g.cells) {
      assert.ok(!ids.has(c.id)); ids.add(c.id);
      const state = comparisonState(new URLSearchParams(categoryRecordHref(c.key, g.id).split('?')[1]));
      const rows = selectRows(payload.projects, state);
      assert.equal(rows.length, c.rows, `${g.label} ${c.key}`);
      assert.equal(rows.reduce((s, r) => s + (r.nep?.amount_php || 0), 0), c.nep);
      assert.equal(rows.reduce((s, r) => s + (r.third?.amount_php || 0), 0), c.hgab);
    }
  }
  const layout = layoutRevisionFlow(model.flow);
  assert.ok(layout.rows.every(g => g.y + g.height < layout.height));
  const fap = model.groups.find(g => g.id === 'fap');
  assert.equal(fap.rows, 29);
  assert.equal(fap.nep, 117749011000);
  assert.equal(fap.hgab, 44749011000);
  assert.ok(layout.height < 2200, 'scoped matrices, stubs and sinks stay within the pilot canvas');
  assert.ok(layout.rows.every(g => g.cells.every(c => c.width === 18 && c.value > 0)), 'only non-zero proportional C nodes render');
  for (let i=1;i<layout.rows.length;i++) assert.ok(layout.rows[i-1].before >= layout.rows[i].before);
  const rank = ['deletion','insertion','increased','unchanged','reduced','scope_review'];
  for (const g of layout.rows) {
    const expected = g.graph;
    assert.deepEqual(g.cells.map(c => c.key), rank.filter(key => g.cells.some(c => c.key === key)));
    assert.equal(g.cells.length, expected.nodes.filter(n => n.column === 1).length);
    assert.equal(layout.stubs.filter(s => s.groupId === g.id).length, expected.stubs.length);
    assert.equal(g.reductionSink.value, -g.matrix.cells.find(c => c.key === 'reduced').delta);
    assert.ok(!layout.ribbons.some(r => r.source === g.reductionSink.key));
  }
  // Stubs carry booked additions plus unbooked scope-review surplus; both
  // must be accounted, but only booked additions appear in totals.additions.
  assert.equal(layout.stubs.filter(s => s.revision !== 'scope_review')
    .reduce((s, stub) => s + stub.value, 0), model.totals.additions);
  assert.ok(layout.stubs.filter(s => s.revision === 'scope_review').length > 0,
    'scope-review surplus stubs must exist for the withheld deltas');
  // Reduction sinks plus scope-review deficit sinks (unbooked scope loss):
  // 87,039,358,000 booked reductions + 17,640,000 unbooked scope deficit.
  assert.equal(layout.sinks.reduce((s, sink) => s + sink.value, 0), 87056998000);
  assert.ok(!layout.rows.find(g => g.id === 'fap').cells.some(c => ['increased','deletion'].includes(c.key)));

  const allGroupRows = model.groups.flatMap(g => selectRows(payload.projects, comparisonState(new URLSearchParams(categoryRecordHref(null,g.id).split('?')[1]))));
  assert.equal(allGroupRows.length, payload.projects.length);
  assert.equal(new Set(allGroupRows.map(r => r.id)).size, payload.projects.length, 'FAP/program groups must partition the source rows');
  for (const g of model.groups.filter(g => g.id !== 'fap')) {
    const state = comparisonState(new URLSearchParams(categoryRecordHref(null,g.id).split('?')[1]));
    assert.ok(selectRows(payload.projects,state).every(r => !matchesProgram(r,'fap')));
  }
});

test('offsetting revisions remain distinct within one group even at zero net change', () => {
  const p = example(); p.categories[0].third_php = 20e9; p.stages.third.amount_php = 100e9;
  p.groupings = {category: {key: 'category', label: 'Category', groups: [{id: 'one', label: 'One', rows: 5, classes: p.categories}]}};
  const model = buildBudgetFlowModel(p), group = model.groups[0];
  assert.equal(group.delta, 0);
  assert.equal(group.additions, 35e9);
  assert.equal(group.reductions, 35e9);
  assert.ok(group.cells.find(c => c.key === 'increased').hgab > 0);
  assert.ok(group.cells.find(c => c.key === 'reduced').nep > 0);
  const duplicate = structuredClone(p); duplicate.groupings.category.groups.push(duplicate.groupings.category.groups[0]);
  assert.throws(() => buildBudgetFlowModel(duplicate), /duplicate/);
  const missing = structuredClone(p); missing.groupings.category.groups = [];
  assert.throws(() => buildBudgetFlowModel(missing), /does not rebuild/);
});

test('five-stage analysis repeats the existing Allocation flows matrix per intermediary', () => {
  const overviewMatrix = flowGraph(dpwhSummary(comparison.overview, comparison.detail)).matrix;
  const model = buildBudgetFlowModel(buildDpwhFlow(comparison.detail));
  assert.equal(model.matrix.children.length, model.groups.length);
  for (const cell of overviewMatrix.cells) {
    const repeated = model.matrix.cells.find(c => c.key === cell.key);
    // Overview expands grouped source members; comparison counts stay in
    // their own grain, but every peso and gross revision agrees.
    assert.equal(repeated.nep, cell.nep);
    assert.equal(repeated.hgab, cell.hgab);
    assert.equal(repeated.delta, cell.delta);
    assert.equal(model.matrix.children.reduce((s, m) => s + m.cells.find(c => c.key === cell.key).nep, 0), cell.nep);
    assert.equal(model.matrix.children.reduce((s, m) => s + m.cells.find(c => c.key === cell.key).hgab, 0), cell.hgab);
  }
  for (const group of model.groups) {
    assert.equal(group.matrix.scope, group.id);
    assert.equal(group.matrix.totals.nep, group.nep);
    assert.equal(group.matrix.totals.hgab, group.hgab);
  }
});


test('top-three budget variation preserves all amounts, counts, scoped evidence and common scale', () => {
  const source = comparison.detail;
  const complete = buildBudgetFlowModel(buildDpwhFlow(source));
  const model = collapseBudgetGroups(complete), layout = layoutRevisionFlow(model.flow);
  assert.deepEqual(model.groups.map(g => g.id), ['Convergence and Special Support Program', 'fap', 'Network Development Program', 'others']);
  assert.deepEqual(model.totals, complete.totals);
  assert.deepEqual(model.categories, complete.categories);
  const others = model.groups.at(-1);
  assert.equal(others.nep, 205686491000);
  assert.equal(others.hgab, 218442484000);
  assert.equal(others.rows, 4553);
  assert.equal(others.members.length, 4);
  assert.equal(layout.rows.reduce((s, g) => s + g.cells.length, 0), 21);
  assert.equal(layout.ribbons.length, 48);
  assert.equal(layout.stubs.length, 9);
  assert.equal(layout.sinks.length, 5);
  assert.equal(layout.scale, layoutRevisionFlow(complete.flow).scale);
  assert.ok(layout.height < 1600);
  assert.ok(layout.height < layoutRevisionFlow(complete.flow).height * .75);
  const members = others.members.flatMap(g => selectRows(source.projects, comparisonState(new URLSearchParams(categoryRecordHref(null, g.id).split('?')[1]))));
  assert.equal(members.length, others.rows);
  assert.equal(new Set(members.map(r => r.id)).size, others.rows);
  for (const cell of others.cells) {
    const rows = others.members.flatMap(g => selectRows(source.projects, comparisonState(new URLSearchParams(categoryRecordHref(cell.key, g.id).split('?')[1]))));
    assert.equal(rows.length, cell.rows);
    assert.equal(rows.reduce((s, r) => s + (r.nep?.amount_php || 0), 0), cell.nep);
    assert.equal(rows.reduce((s, r) => s + (r.third?.amount_php || 0), 0), cell.hgab);
  }
  for (const cell of complete.categories) for (const field of ['rows', 'nep', 'hgab', 'delta']) {
    assert.equal(model.groups.reduce((s, g) => s + g.cells.find(c => c.key === cell.key)[field], 0), cell[field]);
  }
});
