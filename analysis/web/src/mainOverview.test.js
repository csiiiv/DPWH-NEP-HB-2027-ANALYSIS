import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {overviewSummary} from './overviewSummary.js';
import {overviewCsv, validateOverview} from './mainOverviewModel.js';

const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
const dpwh = comparisonPayloads(read('stage_trace_2027.json'), read('house_reading_changes_2027.json'));
// Rebuild annex inputs in memory so fresh-checkout tests do not depend on
// ignored browser payloads or previously generated Overview figures.
const annexes = JSON.parse(execFileSync('python3', ['-c', `
import json,importlib.util
def build(name,path,**kwargs):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.build(**kwargs)
print(json.dumps({
 'fmr':build('fmr','other-analysis/build_fmr_workbench.py'),
 'hfep':build('hfep','other-analysis/build_hfep_workbench.py'),
 'nia':build('nia','analysis-nia/build_nia_workbench.py',write_output=False)}))
`], {cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}));
const inputs = {...annexes, dpwhOverview: dpwh.overview, dpwhDetail: dpwh.detail};
const builtAt = '2026-10-14T00:00:00Z';
const data = overviewSummary(inputs, builtAt);

test('Overview conserves each source ledger and separates all candidate/paired movement', () => {
  assert.equal(validateOverview(data), data);
  assert.deepEqual(data.workspaces.map(w => w.key), ['dpwh','fmr','hfep','nia']);
  for (const w of data.workspaces) {
    assert.equal(w.delta_php, w.sources.house.amount_php - w.sources.nep.amount_php);
    assert.equal(w.adjustments.net_php, w.adjustments.increased_php - w.adjustments.reduced_php);
    assert.equal(w.delta_php, w.insertions.amount_php - w.deletions.amount_php + w.adjustments.net_php);
    for (const key of ['insertions','deletions','adjustments']) assert.ok(w.links[key].includes('?'));
  }
  const nia = data.workspaces.find(w => w.key === 'nia');
  assert.equal(nia.insertions.count,319); assert.equal(nia.deletions.count,282);
  assert.equal(nia.adjustments.net_php,-830000000); assert.equal(nia.delta_php,401124000);
  const fmr = data.workspaces.find(w => w.key === 'fmr');
  assert.equal(fmr.insertions.count,355); assert.equal(fmr.deletions.count,95);
  assert.equal(fmr.adjustments.increased_php,15000000); assert.equal(fmr.adjustments.reduced_php,60000000);
});
test('DPWH expands grouped members and includes foreign-assisted paired reductions outside Transparency', () => {
  const w = data.workspaces[0];
  assert.equal(w.insertions.count,6196); assert.equal(w.insertions.comparison_rows,6193);
  assert.equal(w.sources.house.count,16275); assert.equal(w.adjustments.count,409);
  assert.equal(w.adjustments.reduced_count,206); assert.equal(w.adjustments.reduced_php,87348816000);
  assert.equal(w.controls.house_php,654102015000);
  assert.notEqual(w.sources.house.amount_php,w.controls.house_php);
  assert.ok(w.links.deletions.includes('flag=nep_only_all'));
});
test('Coverage and change tables carry every workspace with its own grain and per-population links', () => {
  const byKey = Object.fromEntries(data.workspaces.map(w => [w.key, w]));
  // DPWH 2nd-reading headline rides along for the coverage table.
  assert.equal(byKey.dpwh.readings.second.count,16270);
  assert.equal(byKey.dpwh.readings.second.amount_php,586941661000);
  assert.equal(byKey.dpwh.links.house_second,'#house?reading=second');
  // Every workspace exposes the cell links the Overview tables render.
  for (const w of data.workspaces) for (const key of ['insertions','deletions','increases','decreases'])
    assert.ok(w.links[key].startsWith('#'), `${w.key} ${key} link`);
  assert.ok(byKey.fmr.links.increases.includes('direction=increased'));
  assert.ok(byKey.hfep.links.increases.includes('event=revised'));
  assert.ok(byKey.nia.links.decreases.includes('direction=decreased'));
  assert.ok(byKey.dpwh.links.increases.includes('flag=amount_increase'));
});
test('HFEP uses printed component records and reverses its local direction without changing source amounts', () => {
  const w = data.workspaces.find(w => w.key === 'hfep');
  assert.equal(w.sources.house.count,564); assert.equal(w.sources.nep.count,545);
  assert.equal(w.insertions.count,184); assert.equal(w.deletions.count,163);
  assert.equal(w.adjustments.count,118);
  assert.deepEqual(w.adjustments.events,{revised:82,added:19,dropped:17});
  assert.equal(w.adjustments.net_php,-180122000);
  assert.equal(w.controls.residual_php,-140000);
  assert.equal(w.controls.house_php - w.controls.nep_php,w.delta_php+w.controls.residual_php);
  assert.ok(annexes.hfep.stages.nep.facilities.some(f => f.amounts_php.motor_vehicle === 0));
});
test('Summary exports retain exact PHP, basis and supporting links; topic findings remain subsets', () => {
  const csv = overviewCsv(data);
  assert.equal(csv.trimEnd().split('\r\n').length,5);
  assert.ok(csv.includes('printed_vs_ledger_delta_residual_php'));
  assert.ok(csv.includes('"6196","172149788000"'));
  assert.ok(csv.includes('-140000'));
  const ai = data.features.find(f => f.key === 'nia');
  assert.equal(ai.count,123); assert.equal(ai.amount_php,2626950000);
  assert.ok(ai.amount_php < data.workspaces.find(w => w.key === 'nia').insertions.amount_php);
});
test('Adapters reject reused source rows, missing records and arithmetic drift rather than publishing plausible totals', () => {
  const duplicate = structuredClone(inputs);
  duplicate.nia.comparison.push({...duplicate.nia.comparison[0],id:'duplicate'});
  assert.throws(() => overviewSummary(duplicate,builtAt),/source IDs reused/);
  const missing = structuredClone(inputs); missing.fmr.comparison.pop();
  assert.throws(() => overviewSummary(missing,builtAt),/missing source rows/);
  const drift = structuredClone(data); drift.workspaces[0].adjustments.net_php++;
  assert.throws(() => validateOverview(drift),/do not reconcile/);
  assert.throws(() => validateOverview({...data,schema_version:99}),/Unsupported/);
});
