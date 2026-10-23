import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {buildFlowSourcesData, normalizedFlowSources} from './flowSourcesData.js';
import {buildBudgetFlowModel, collapseBudgetGroups, budgetFlowRecordLink} from './budgetFlowModel.js';
import {buildDpwhFlow} from '../buildDpwhFlow.mjs';
import {overviewSummary} from './overviewSummary.js';
import {workspaceRevisionMatrix} from './revisionMatrix.js';
import {layoutRevisionFlow, wrapFlowLabel} from './revisionFlowLayout.js';
import {comparisonRows as fmrRows, filterComparisons as filterFmr} from './fmrModel.js';
import {comparisonRows as niaRows, filterComparisons as filterNia} from './niaModel.js';

const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
const dpwh = comparisonPayloads(read('stage_trace_2027.json'), read('house_reading_changes_2027.json'));
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
const inputs = {...annexes, dpwh: dpwh.detail};
const catalog = buildFlowSourcesData(inputs);
const overview = overviewSummary({...annexes, dpwhOverview: dpwh.overview, dpwhDetail: dpwh.detail}, '2026-10-19');

test('all four datasets and twelve recorded groupings rebuild both ledgers and gross revision populations', () => {
  assert.deepEqual(catalog.sources.map(s => s.dataset.key), ['dpwh', 'fmr', 'hfep', 'nia']);
  assert.equal(catalog.sources.reduce((n, s) => n + Object.keys(s.groupings).length, 0), 12);
  for (const source of catalog.sources) {
    const expected = workspaceRevisionMatrix(overview.workspaces.find(w => w.key === source.dataset.key));
    for (const grouping of Object.keys(source.groupings)) {
      const model = buildBudgetFlowModel(source, grouping);
      assert.equal(model.dataset.key, source.dataset.key);
      assert.equal(model.matrix.scope, source.dataset.key);
      assert.equal(model.totals.nep, expected.totals.nep);
      assert.equal(model.totals.hgab, expected.totals.hgab);
      assert.equal(model.totals.additions, expected.totals.additions);
      assert.equal(model.totals.reductions, expected.totals.reductions);
      for (const cell of model.categories) {
        const original = expected.cells.find(c => c.key === cell.key);
        assert.equal(cell.nep, original.nep, `${source.dataset.key}/${grouping}/${cell.key} before`);
        assert.equal(cell.hgab, original.hgab, `${source.dataset.key}/${grouping}/${cell.key} after`);
      }
      const compact = collapseBudgetGroups(model);
      assert.deepEqual(compact.totals, model.totals);
      const layout = layoutRevisionFlow(compact.flow);
      assert.ok(layout.rows.length <= 4);
      assert.ok(layout.nodes.every(n => n.height === n.value * layout.scale));
      for (const row of layout.rows) {
        assert.ok(row.left.y >= row.y + 12 + wrapFlowLabel(row.label).length * 14 - 1e-7, 'wrapped headings reserve their own space');
      }
    }
  }
});

test('DPWH category adapter preserves the existing FAP partition and all category figures', () => {
  const old = buildBudgetFlowModel(buildDpwhFlow(dpwh.detail));
  const current = buildBudgetFlowModel(catalog.sources[0]);
  assert.deepEqual(current.totals, old.totals);
  assert.deepEqual(current.groups.map(g => ({id:g.id,nep:g.nep,hgab:g.hgab,rows:g.rows})), old.groups.map(g => ({id:g.id,nep:g.nep,hgab:g.hgab,rows:g.rows})));
  assert.equal(catalog.sources[0].groupings.pap.groups.length, 46);
  assert.equal(catalog.sources[0].groupings.region.groups.length, 18);
  assert.ok(catalog.sources[0].groupings.deo.groups.length > 200);
});

test('HFEP keeps matched component blanks as adjustments and uses funding-column grain', () => {
  const definition = normalizedFlowSources(inputs).find(s => s.key === 'hfep');
  const pairedHouseOnly = definition.records.filter(r => r.source.pair_id && r.source.nep_value == null && r.source.house_value != null);
  assert.ok(pairedHouseOnly.length > 0);
  assert.ok(pairedHouseOnly.every(r => r.before === 0));
  const pairedNepOnly = definition.records.filter(r => r.source.pair_id && r.source.house_value == null && r.source.nep_value != null);
  assert.ok(pairedNepOnly.length > 0);
  assert.ok(pairedNepOnly.every(r => r.after === 0));
  const source = catalog.sources.find(s => s.dataset.key === 'hfep');
  assert.equal(source.totals.rows, 746);
  assert.equal(source.dataset.count_unit, 'funding-column records');
  assert.equal(source.stages.nep.amount_php, 14472519000);
  assert.equal(source.stages.third.amount_php, 10021659000);
});

test('FMR and NIA supported scoped links identify exactly their promised rows and amounts', () => {
  for (const [key, grouping, rows, filter] of [['fmr','region',fmrRows(annexes.fmr),filterFmr], ['nia','subprogram',niaRows(annexes.nia),filterNia]]) {
    const model = buildBudgetFlowModel(catalog.sources.find(s => s.dataset.key === key), grouping);
    for (const group of model.groups) for (const cell of group.cells) {
      // Zero-count cells never render, so they promise no population. (FMR
      // and NIA have no segment-scope machinery: their scope_review cell is
      // always the normalized empty one.)
      if (!cell.rows) continue;
      const link = budgetFlowRecordLink(model, cell.key, group.id);
      assert.ok(link.scoped);
      const params = Object.fromEntries(new URLSearchParams(link.href.split('?')[1]));
      const selected = filter(rows, params);
      assert.equal(selected.length, cell.rows, `${key}/${group.id}/${cell.key}`);
      assert.equal(selected.reduce((s,r) => s + (r.nep?.amount_php || 0),0),cell.nep);
      assert.equal(selected.reduce((s,r) => s + (r.house?.amount_php || 0),0),cell.hgab);
    }
  }
  for (const [source, grouping] of [['dpwh','deo'], ['dpwh','pap'], ['hfep','category'], ['nia','program']]) {
    const model = buildBudgetFlowModel(catalog.sources.find(s => s.dataset.key === source), grouping);
    const link = budgetFlowRecordLink(model,'increased',model.groups[0].id);
    assert.equal(link.scoped, false);
    assert.ok(link.href.startsWith('#'));
  }
});

test('House annex datasets require verified reading identity before being offered', () => {
  const broken = {...inputs, fmr: {...annexes.fmr, stages: {...annexes.fmr.stages,
    house: {...annexes.fmr.stages.house, audit_summary: {reading_comparison_total_pages: 2, reading_comparison_identical_pages: 1}}}}};
  assert.throws(() => buildFlowSourcesData(broken), /identity/);
});
