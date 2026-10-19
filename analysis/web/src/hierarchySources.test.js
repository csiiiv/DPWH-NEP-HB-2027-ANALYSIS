import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {buildHierarchySourcesData} from './hierarchySourcesData.js';
import {buildAllocationGraph, buildAllocationTree, hierarchyLevels, hierarchyOptions, hierarchyOrders, hierarchyView} from './allocationHierarchy.js';
import {buildNepHierarchy, buildHgab3Hierarchy, allocationHierarchyGraph} from './nepHierarchy.js';
import {layoutAllocationHierarchy} from './hierarchyLayout.js';

const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
const dpwh = comparisonPayloads(read('stage_trace_2027.json'), read('house_reading_changes_2027.json')).detail;
const annexes = JSON.parse(execFileSync('python3', ['-c', `
import json,importlib.util
def build(name,path,**kwargs):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.build(**kwargs)
print(json.dumps({'fmr':build('fmr','other-analysis/build_fmr_workbench.py'),
 'hfep':build('hfep','other-analysis/build_hfep_workbench.py'),
 'nia':build('nia','analysis-nia/build_nia_workbench.py',write_output=False)}))
`], {cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}));
const inputs = {dpwh, ...annexes};
const catalog = buildHierarchySourcesData(inputs);
const totals = {dpwh: [572924074000, 587075661000], fmr: [16000000000, 19628100000],
  hfep: [14472519000, 10021659000], nia: [17598181000, 17999305000]};

function conserved(graph) {
  const incoming = new Map(), outgoing = new Map(), columns = Array(graph.lastColumn + 1).fill(0);
  assert.equal(new Set(graph.nodes.map(n => n.key)).size, graph.nodes.length);
  for (const link of graph.links) {
    incoming.set(link.target, (incoming.get(link.target) || 0) + link.value);
    outgoing.set(link.source, (outgoing.get(link.source) || 0) + link.value);
  }
  for (const node of graph.nodes) {
    columns[node.column] += node.value;
    if (node.column > 0) assert.equal(incoming.get(node.key), node.value);
    if (node.column < graph.lastColumn) assert.equal(outgoing.get(node.key), node.value);
  }
  assert.ok(columns.every(amount => amount === graph.total));
}

test('all eight source ledgers conserve allocations at every available display depth', () => {
  assert.deepEqual(catalog.sources.map(s => s.dataset.key), ['dpwh', 'fmr', 'hfep', 'nia']);
  for (const source of catalog.sources) for (const [i, stage] of ['nep', 'hgab3'].entries()) {
    const hierarchy = source.hierarchies[stage];
    assert.equal(hierarchy.amount_php, totals[source.dataset.key][i]);
    for (const level of hierarchyLevels(hierarchy)) {
      const graph = buildAllocationGraph(hierarchy, stage, {endAt: level.key});
      assert.equal(graph.total, hierarchy.amount_php);
      conserved(graph);
      const layout = layoutAllocationHierarchy(graph);
      for (const link of layout.links) assert.ok(!/NaN|Infinity|undefined/.test(link.d));
      assert.ok(layout.nodes[0].y1 - layout.nodes[0].y0 < 1100, 'large views retain a readable source bar');
      for (const column of layout.columns) {
        const members = layout.nodes.filter(n => n.column === column);
        for (let j = 1; j < members.length; j++) assert.ok(members[j].y0 >= members[j-1].y1);
      }
    }
  }
});

test('DPWH catalog preserves the original hierarchy and scoped totals on both sides', () => {
  const source = catalog.sources[0];
  for (const [stage, build] of [['nep', buildNepHierarchy], ['hgab3', buildHgab3Hierarchy]]) {
    const old = build(dpwh.projects), current = source.hierarchies[stage];
    for (const endAt of ['category', 'pap', 'region', 'deo']) {
      const expected = allocationHierarchyGraph(old, '', stage, {endAt});
      const actual = buildAllocationGraph(current, stage, {endAt});
      assert.deepEqual(actual.counts, expected.counts);
      assert.deepEqual(actual.nodes.map(n => [n.key,n.name,n.value]), expected.nodes.map(n => [n.key,n.name,n.value]));
    }
    const actual = buildAllocationGraph(current, stage, {endAt: 'deo', filters: {category: 'Asset Preservation Program', pap: 'Preventive Maintenance - Primary Roads', region: 'Region III'}});
    const expected = allocationHierarchyGraph(old, 'Asset Preservation Program', stage, {endAt: 'deo', pap: 'Preventive Maintenance - Primary Roads', region: 'Region III'});
    assert.equal(actual.total, expected.total);
    conserved(actual);
  }
});

test('annexes use only recorded dimensions and their own side-specific allocation grain', () => {
  const fmr = catalog.sources.find(s => s.dataset.key === 'fmr');
  assert.deepEqual(fmr.hierarchies.nep.levels.map(l => l.key), ['region', 'project']);
  assert.equal(fmr.hierarchies.nep.rows, annexes.fmr.stages.nep.projects.length);
  assert.equal(fmr.hierarchies.hgab3.rows, annexes.fmr.stages.house.projects.length);
  assert.ok(annexes.fmr.stages.nep.projects.some(p => p.segment_count > 1));
  const nia = catalog.sources.find(s => s.dataset.key === 'nia');
  assert.deepEqual(nia.hierarchies.nep.levels.map(l => l.key), ['program', 'subprogram', 'project']);
  const view = hierarchyView(nia.hierarchies.nep, new URLSearchParams('through=deo&category=fap&region=Region+III'));
  assert.equal(view.endAt, 'subprogram');
  assert.deepEqual(view.filters, {});
  const hfep = catalog.sources.find(s => s.dataset.key === 'hfep');
  assert.equal(hfep.hierarchies.nep.roots.length, 7);
  assert.equal(hfep.hierarchies.hgab3.roots.length, 8);
  assert.equal(annexes.hfep.stages.nep.annex_control.total - hfep.hierarchies.nep.amount_php, 140000);
  for (const stage of ['nep', 'hgab3']) {
    const graph = buildAllocationGraph(hfep.hierarchies[stage], stage, {endAt: 'component'});
    assert.ok(graph.nodes.filter(n => n.column === 6).every(n => ['Infrastructure','Medical equipment','Motor vehicle'].includes(n.name)));
    assert.ok(!graph.nodes.some(n => n.name === 'Total'));
  }
});

test('native filters produce exact branch allocations, reset stale values, and preserve repeated project titles', () => {
  for (const source of catalog.sources) for (const stage of ['nep', 'hgab3']) {
    const h = source.hierarchies[stage], root = h.roots.find(n => n.amount_php > 0);
    const level = h.levels[0];
    const view = hierarchyView(h, new URLSearchParams({[level.key]: root.id, through: h.levels.at(-1).key}));
    assert.equal(view.filters[level.key], root.id);
    assert.equal(buildAllocationGraph(h, stage, view).total, root.amount_php);
    assert.ok(hierarchyOptions(h, view.filters)[level.key].length > 0);
    assert.deepEqual(hierarchyView(h, new URLSearchParams({[level.key]: 'invalid'})).filters, {});
  }
  const levels = [{key: 'region'}, {key: 'project'}];
  const records = ['one','two'].map((id,i) => ({id, amount_php: i+1, path: [{id:'R',label:'Region'}, {id,label:'Repeated project'}]}));
  const h = {...buildAllocationTree(records, levels, 3), defaultEnd: 'region'};
  assert.equal(buildAllocationGraph(h, 'nep', {endAt:'project'}).counts[2], 2);
});

test('compact top-N view folds tail branches into conserving Others blocks', () => {
  const source = catalog.sources[0];
  for (const [i, [stage, hierarchy]] of [['nep', source.hierarchies.nep], ['hgab3', source.hierarchies.hgab3]].entries()) {
    for (const endAt of ['category', 'pap', 'region', 'deo']) {
      const view = hierarchyView(hierarchy, new URLSearchParams({through: endAt, top: '5'}));
      assert.equal(view.top, 5);
      const graph = buildAllocationGraph(hierarchy, stage, view);
      assert.equal(graph.total, totals.dpwh[i]);
      conserved(graph);
      // Every level keeps at most top+1 children per parent (top + one
      // Others block); only the Others block itself may hold more.
      const othersKeys = new Set(graph.nodes.filter(n => n.name.startsWith('Others (')).map(n => n.key));
      const byParent = new Map();
      for (const link of graph.links) {
        const key = link.source;
        byParent.set(key, (byParent.get(key) || 0) + 1);
      }
      for (const [key, count] of byParent)
        assert.ok(othersKeys.has(key) || count <= 6, `parent has ${count} children`);
      assert.ok(graph.nodes.some(n => n.name.startsWith('Others (')));
      // Full view at the same depth keeps the same ledger identity.
      const full = buildAllocationGraph(hierarchy, stage, hierarchyView(hierarchy, new URLSearchParams({through: endAt})));
      assert.equal(full.total, graph.total);
    }
  }
  // Without top, behavior matches the legacy graph exactly.
  const plain = buildAllocationGraph(source.hierarchies.nep, 'nep', {endAt: 'deo'});
  assert.equal(plain.nodes.filter(n => n.column === 1).length, 7);
});

test('compact top-N folds every depth, resets on dataset change, and exposes Others through all columns', () => {
  const h = catalog.sources[0].hierarchies.nep;
  const graph = buildAllocationGraph(h, 'nep', {endAt: 'deo', top: 5});
  conserved(graph);
  assert.equal(graph.total, totals.dpwh[0]);
  // Others chains through region to office columns.
  const othersRoot = graph.nodes.find(n => n.column === 1 && n.name.startsWith('Others'));
  assert.ok(othersRoot, 'folded category level carries an Others block');
  // Every level shrinks against the full view; the ledger total is unchanged.
  const full = buildAllocationGraph(h, 'nep', {endAt: 'deo'});
  assert.deepEqual(full.counts[0], 1);
  assert.ok(graph.counts[4] < full.counts[4], `office count ${graph.counts[4]} should be compact`);
  // Focus filters override the fold: a focused tail branch stays visible.
  const focused = hierarchyView(h, new URLSearchParams({through: 'region', top: '5', category: 'Local Program'}));
  const focusedGraph = buildAllocationGraph(h, 'nep', focused);
  conserved(focusedGraph);
  assert.ok(focusedGraph.nodes.some(n => n.name === 'Local Program'));
});

test('drill-down orders regroup the ledger without changing its total', () => {
  const h = catalog.sources[0].hierarchies.nep;
  const orders = hierarchyOrders(h);
  // Every suffix of the native chain, then every single level, deduplicated.
  assert.deepEqual(orders.map(o => o.join(',')), ['category,pap,region,deo', 'pap,region,deo',
    'region,deo', 'deo', 'category', 'pap', 'region']);
  for (const keys of orders) {
    const view = hierarchyView(h, new URLSearchParams({order: keys.join(','), through: keys.at(-1)}));
    assert.deepEqual(view.order, keys.length === 4 ? null : keys);
    const graph = buildAllocationGraph(view.hierarchy, 'nep', view);
    assert.equal(graph.total, totals.dpwh[0]);
    conserved(graph);
    // Single-level regrouping merges each office across all parent paths:
    // the leaf column holds exactly the distinct office ids.
    if (keys.at(-1) === 'deo' && keys.length === 1) {
      const ids = new Set();
      const collect = (node, depth) => { if (depth === 3) ids.add(node.id);
        else for (const child of node.children) collect(child, depth + 1); };
      for (const root of h.roots) collect(root, 0);
      assert.equal(graph.counts[1], ids.size);
    }
  }
  // Native and invalid orders are rejected, leaving the hierarchy untouched.
  assert.equal(hierarchyView(h, new URLSearchParams('order=category,pap,region,deo')).order, null);
  assert.equal(hierarchyView(h, new URLSearchParams('order=pap,pap')).order, null);
  assert.equal(hierarchyView(h, new URLSearchParams('order=bogus')).order, null);
  assert.equal(hierarchyView(h, new URLSearchParams('order=')).order, null);
  // Region-first view: 18 regions at column 1 conserving the full ledger.
  const regionView = hierarchyView(h, new URLSearchParams('order=region&through=region'));
  const byRegion = buildAllocationGraph(regionView.hierarchy, 'nep', regionView);
  assert.equal(byRegion.nodes.filter(n => n.column === 1).length, 18);
  conserved(byRegion);
  // Regrouping composes with the compact fold.
  const compactView = hierarchyView(h, new URLSearchParams('order=region,pap&through=pap&top=5'));
  const compact = buildAllocationGraph(compactView.hierarchy, 'nep', compactView);
  conserved(compact);
  assert.ok(compact.counts[1] <= 19, `regions + Others bounded: ${compact.counts[1]}`);
});

test('invalid source totals and unverified House reading identity fail before publication', () => {
  const audit = {reading_comparison_total_pages: 2, reading_comparison_identical_pages: 1};
  const broken = {...inputs, fmr: {...annexes.fmr, stages: {...annexes.fmr.stages,
    house: {...annexes.fmr.stages.house, audit_summary: audit}}}};
  assert.throws(() => buildHierarchySourcesData(broken), /identity/);
  const record = {id:'one',amount_php:1,path:[{id:'A',label:'A'}]}, levels=[{key:'category'}];
  assert.throws(() => buildAllocationTree([record,record],levels,2), /repeated source/);
  assert.throws(() => buildAllocationTree([record],levels,2), /published total/);
  assert.throws(() => buildAllocationTree([{...record,amount_php:-1}],levels,-1), /invalid allocation/);
});
