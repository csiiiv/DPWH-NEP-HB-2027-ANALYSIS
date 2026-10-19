import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNepHierarchy, buildHgab3Hierarchy, nepHierarchyGraph, allocationHierarchyGraph, hierarchyFilterOptions, HIERARCHY_STAGES} from './nepHierarchy.js';
import {computeFlowLayout} from './columnFlow.js';
import {layoutAllocationHierarchy, wrapHierarchyLabel} from './hierarchyLayout.js';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {buildDpwhFlow} from '../buildDpwhFlow.mjs';

test('NEP hierarchy excludes House-only money and scopes PAP labels to categories', () => {
  const hierarchy = buildNepHierarchy([
    {program: 'A', pap: 'Same name', nep: {amount_php: 100}, third: {amount_php: 900}},
    {program: 'A', pap: 'Same name', nep: {amount_php: 50}},
    {program: 'B', pap: 'Same name', nep: {amount_php: 25}},
    {program: 'A', pap: 'House only', third: {amount_php: 700}},
    {program: 'A', pap: 'Foreign-assisted projects', zone: 'fap', nep: {amount_php: 20}},
    {program: 'House label', pap: 'House PAP', nep: {program: 'NEP label', pap: 'NEP PAP', amount_php: 5}},
  ]);
  assert.equal(hierarchy.amount_php, 200);
  assert.equal(hierarchy.rows, 5);
  assert.deepEqual(hierarchy.categories.map(g => g.id), ['A', 'B', 'fap', 'NEP label']);
  assert.deepEqual(hierarchy.categories[0].paps.map(({regions, ...p}) => p), [{label: 'Same name', rows: 2, amount_php: 150}]);
  const graph = nepHierarchyGraph(hierarchy);
  assert.equal(graph.papCount, 4);
  assert.equal(new Set(graph.nodes.map(n => n.key)).size, graph.nodes.length);
  const focused = nepHierarchyGraph(hierarchy, 'B');
  assert.equal(focused.total, 25);
  assert.equal(focused.papCount, 1);
  assert.deepEqual(nepHierarchyGraph(buildNepHierarchy([])).nodes, []);
  assert.throws(() => buildNepHierarchy([{nep: {amount_php: -1}}]), /invalid allocation/);
});

test('HGAB3 hierarchy uses third-reading amounts and includes House-only allocations', () => {
  const hierarchy = buildHgab3Hierarchy([
    {program: 'A', pap: 'Same name', nep: {amount_php: 100}, second: {amount_php: 700}, third: {amount_php: 90}},
    {program: 'A', pap: 'Same name', nep: {amount_php: 25}, third: {amount_php: 40}},
    {program: 'B', pap: 'Same name', third: {amount_php: 20}},
    {program: 'A', pap: 'NEP only', nep: {amount_php: 300}},
    {program: 'A', pap: 'Second only', second: {amount_php: 500}},
    {program: 'A', pap: 'Foreign-assisted projects', zone: 'fap', third: {amount_php: 5}},
    {program: 'Old category', pap: 'Old PAP', third: {program: 'C', pap: 'Third PAP', amount_php: 2}},
  ]);
  assert.equal(hierarchy.amount_php, 157);
  assert.equal(hierarchy.rows, 5);
  assert.deepEqual(hierarchy.categories.map(g => g.id), ['A', 'B', 'fap', 'C']);
  assert.deepEqual(hierarchy.categories[0].paps.map(({regions, ...p}) => p), [{label: 'Same name', rows: 2, amount_php: 130}]);
  assert.equal(hierarchy.categories[3].paps[0].label, 'Third PAP');
  const graph = allocationHierarchyGraph(hierarchy, '', 'hgab3');
  assert.equal(graph.nodes[0].name, 'HGAB3');
  assert.equal(graph.total, 157);
  assert.equal(graph.papCount, 4);
  assert.equal(allocationHierarchyGraph(hierarchy, 'fap', 'hgab3').total, 5);
  assert.throws(() => buildHgab3Hierarchy([{third: {amount_php: -1}}]), /HGAB3 hierarchy: invalid/);
});

function assertConserved(graph) {
  const incoming = new Map(), outgoing = new Map();
  const keys = new Set(graph.nodes.map(n => n.key));
  assert.equal(keys.size, graph.nodes.length);
  for (const link of graph.links) {
    assert.ok(keys.has(link.source) && keys.has(link.target));
    incoming.set(link.target, (incoming.get(link.target) || 0) + link.value);
    outgoing.set(link.source, (outgoing.get(link.source) || 0) + link.value);
  }
  for (const node of graph.nodes) {
    if (node.column > 0) assert.equal(incoming.get(node.key), node.value);
    if (node.column < graph.lastColumn) assert.equal(outgoing.get(node.key), node.value);
  }
  for (let column = 0; column <= graph.lastColumn; column++)
    assert.equal(graph.nodes.filter(n => n.column === column).reduce((sum, n) => sum + n.value, 0), graph.total);
}

test('regional and office branches use ledger assignments and split grouped records exactly once', () => {
  const rows = [
    {program: 'A', pap: 'P', region: 'Top-level region', api: {office: 'Wrong API DEO'},
      nep: {amount_php: 100, region: 'NEP region', office: 'Central Office'},
      third: {amount_php: 60, region: 'House region', records: [
        {amount_php: 40, office: 'First District Engineering Office'},
        {amount_php: 20, region: 'Second region', office: 'Second District Engineering Office'},
      ]}},
    {program: 'B', pap: 'P', region: 'House region', third: {amount_php: 10}},
    {program: 'A', pap: 'Q', region: 'House region', third: {amount_php: 5, office: 'Regional Office IVA'}},
  ];
  const nep = buildNepHierarchy(rows), house = buildHgab3Hierarchy(rows);
  assert.equal(nep.categories[0].paps[0].regions[0].label, 'NEP region');
  assert.equal(nep.categories[0].paps[0].regions[0].offices[0].label, 'Central Office');
  const graph = allocationHierarchyGraph(house, '', 'hgab3', {endAt: 'deo'});
  assert.deepEqual(graph.counts, [1, 2, 3, 4, 4]);
  assertConserved(graph);
  assert.ok(graph.nodes.some(n => n.name === '(No recorded office)'));
  assert.ok(graph.nodes.some(n => n.name === 'Regional Office IV-A'));
  assert.ok(!graph.nodes.some(n => n.name === 'Wrong API DEO'));
  const scoped = allocationHierarchyGraph(house, 'A', 'hgab3', {endAt: 'deo', pap: 'P', region: 'House region'});
  assert.equal(scoped.total, 40);
  assert.deepEqual(scoped.counts, [1, 1, 1, 1, 1]);
  assertConserved(scoped);
  assert.deepEqual(hierarchyFilterOptions(house, 'A', 'Q'), {paps: ['P', 'Q'], regions: ['House region']});
  const invalid = [{third: {amount_php: 100, records: [{amount_php: 40}, {amount_php: 20}]}}];
  assert.throws(() => buildHgab3Hierarchy(invalid), /grouped source records/);
});

test('filtered categories and PAPs reorder by their displayed allocations', () => {
  const rows = [['A', 'P', 'R1', 10], ['A', 'P', 'R2', 100], ['A', 'Q', 'R1', 30],
    ['A', 'Q', 'R2', 1], ['B', 'P', 'R1', 20], ['B', 'Q', 'R2', 500]]
    .map(([program, pap, region, amount_php]) => ({program, pap, region, nep: {amount_php}}));
  const hierarchy = buildNepHierarchy(rows);
  const graph = allocationHierarchyGraph(hierarchy, '', 'nep', {endAt: 'region', region: 'R1'});
  assert.equal(hierarchy.categories[0].id, 'B');
  assert.deepEqual(graph.nodes.filter(n => n.column === 1).map(n => n.name), ['A', 'B']);
  assert.deepEqual(graph.nodes.filter(n => n.column === 2).map(n => n.name), ['Q', 'P', 'P']);
  assertConserved(graph);
});

test('retained DPWH NEP and HGAB3 hierarchies conserve their published ledgers at every branch', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
  const comparison = comparisonPayloads(read('stage_trace_2027.json'), read('house_reading_changes_2027.json'));
  const flow = buildDpwhFlow(comparison.detail, comparison.overview.headlines);
  for (const [stage, side, papCount, fapTotal] of [
    ['nep', 'nep', 46, 117749011000], ['hgab3', 'third', 45, 44749011000],
  ]) {
    const hierarchy = flow[`${stage}_hierarchy`];
    assert.equal(hierarchy.amount_php, flow.stages[side].amount_php);
    assert.equal(hierarchy.rows, flow.stages[side].rows);
    assert.equal(hierarchy.categories.length, 7);
    const graph = allocationHierarchyGraph(hierarchy, '', stage);
    assert.equal(graph.papCount, papCount);
    const layout = computeFlowLayout({...graph, width: 1100, height: graph.papCount * 58 + 90, padding: 38, marginSide: 24, minNodeHeight: 0, minLinkHeight: 0, stackAlign: 'top'});
    assert.equal(layout.nodes[0].y0, 46);
    for (const node of graph.nodes) {
      const sum = links => links.reduce((total, link) => total + link.value, 0);
      if (node.column !== 0) assert.equal(sum(graph.links.filter(l => l.target === node.key)), node.value);
      if (node.column !== 2) assert.equal(sum(graph.links.filter(l => l.source === node.key)), node.value);
    }
    for (const link of layout.links) {
      assert.ok(!/NaN|Infinity|undefined/.test(link.d));
      assert.ok(link.y0b > link.y0a && link.y1b > link.y1a);
      assert.ok(Math.abs((link.y0b - link.y0a) - link.value * layout.nodes[0].scale) < 1e-7);
      assert.ok(Math.abs((link.y1b - link.y1a) - link.value * layout.nodes[0].scale) < 1e-7);
    }
    assert.equal(hierarchy.categories.find(g => g.id === 'fap').amount_php, fapTotal);
    for (const {key} of HIERARCHY_STAGES) {
      const full = allocationHierarchyGraph(hierarchy, '', stage, {endAt: key});
      assertConserved(full);
      assert.equal(full.total, flow.stages[side].amount_php);
      const placed = layoutAllocationHierarchy(full);
      assert.ok(placed.nodes[0].y1 - placed.nodes[0].y0 < 1100, 'source bar stays readable at deep levels');
      for (const n of placed.nodes.filter(n => n.column > 0)) {
        const lines = wrapHierarchyLabel(n.name, n.column === 1 ? 38 : 51);
        assert.ok(placed.labelSlots.get(n.key).y + lines.length * 15 + 17 < placed.height);
      }
      for (const link of placed.links) {
        assert.ok(!/NaN|Infinity|undefined/.test(link.d));
        assert.ok(Math.abs(link.y0b - link.y0a - link.value * placed.nodes[0].scale) < 1e-7);
        assert.ok(Math.abs(link.y1b - link.y1a - link.value * placed.nodes[0].scale) < 1e-7);
      }
    }
    const deepest = allocationHierarchyGraph(hierarchy, '', stage, {endAt: 'deo'});
    assert.deepEqual(deepest.counts, stage === 'nep' ? [1, 7, 46, 527, 1866] : [1, 7, 45, 559, 2029]);
  }
});
