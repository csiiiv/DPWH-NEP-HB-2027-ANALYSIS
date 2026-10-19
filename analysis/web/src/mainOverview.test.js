import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {comparisonPayloads} from '../buildComparisonData.mjs';
import {overviewSummary} from './overviewSummary.js';
import {flowGraph} from './overviewFlows.js';
import {buildDpwhFlow} from '../buildDpwhFlow.mjs';
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
test('Unchanged populations pair equal allocations and complete the paired partition', () => {
  const byKey = Object.fromEntries(data.workspaces.map(w => [w.key, w]));
  // Stable figures from the verified 17 October build.
  assert.equal(byKey.nia.unchanged.count,505); assert.equal(byKey.nia.unchanged.amount_php,7976655000);
  assert.equal(byKey.fmr.unchanged.count,605); assert.equal(byKey.fmr.unchanged.amount_php,13584095000);
  assert.equal(byKey.hfep.unchanged.count,281); assert.equal(byKey.hfep.unchanged.amount_php,3092749000);
  assert.equal(byKey.dpwh.unchanged.count,9670); assert.equal(byKey.dpwh.unchanged.amount_php,348425553000);
  // Pair-grain workspaces: unchanged + changed rows equal the paired rows.
  for (const key of ['dpwh','fmr','nia']) {
    const w = byKey[key];
    assert.equal(w.unchanged.comparison_rows + w.adjustments.increased_count + w.adjustments.reduced_count,
      w.paired_comparison_rows, `${key} paired partition`);
  }
  // Unchanged rows contribute zero to the funding bridge by construction.
  for (const w of data.workspaces)
    assert.ok(w.unchanged.amount_php >= 0 && Number.isSafeInteger(w.unchanged.amount_php));
  // Per-group base allocations tie to their signed deltas, and adding the
  // bases back reconstructs each ledger exactly.
  for (const w of data.workspaces) {
    const a = w.adjustments;
    assert.equal(a.increased_house_php - a.increased_nep_php, a.increased_php, `${w.key} increased bases`);
    assert.equal(a.reduced_nep_php - a.reduced_house_php, a.reduced_php, `${w.key} reduced bases`);
    assert.equal(w.insertions.amount_php + w.unchanged.amount_php + a.increased_house_php + a.reduced_house_php,
      w.sources.house.amount_php, `${w.key} House ledger reconstruction`);
    assert.equal(w.deletions.amount_php + w.unchanged.amount_php + a.increased_nep_php + a.reduced_nep_php,
      w.sources.nep.amount_php, `${w.key} NEP ledger reconstruction`);
  }
  // Links: FMR/NIA unchanged status filter, HFEP same-event records; DPWH
  // links into Compare's amount_same flag (counts verified to match the tile).
  assert.ok(byKey.fmr.links.unchanged.includes('status=unchanged'));
  assert.ok(byKey.nia.links.unchanged.includes('status=unchanged'));
  assert.ok(byKey.hfep.links.unchanged.includes('event=same'));
  assert.ok(byKey.dpwh.links.unchanged.includes('flag=amount_same'));
});
test('Flow graphs conserve both ledgers and expose linked populations', () => {
  for (const w of data.workspaces) {
    const {nodes, links, stubs} = flowGraph(w);
    const byKey = Object.fromEntries(nodes.map(n => [n.key, n]));
    const inflow = key => links.filter(l => l.target === key).reduce((t, l) => t + l.value, 0);
    const outflow = key => links.filter(l => l.source === key).reduce((t, l) => t + l.value, 0);
    // Stage ledgers rebuild exactly from their flows.
    assert.equal(outflow('nep'), w.sources.nep.amount_php, `${w.key} NEP out-flow`);
    assert.equal(inflow('house'), w.sources.house.amount_php, `${w.key} House in-flow`);
    // Middle groups conserve: in (ribbons + external stubs) = out.
    const stubIn = key => (stubs ?? []).filter(s => s.target === key).reduce((t, s) => t + s.value, 0);
    for (const key of ['deletions', 'insertions', 'additions', 'unchanged', 'reduced']) {
      const node = byKey[key];
      assert.equal(node ? outflow(key) : 0, key === 'deletions' ? 0 : node?.amount_php ?? 0, `${w.key} ${key} out-flow`);
      if (key === 'deletions') assert.equal(inflow(key), node?.amount_php ?? 0, `${w.key} deletions in-flow`);
      else if (node) assert.equal(inflow(key) + stubIn(key), node.amount_php, `${w.key} ${key} in-flow + stubs`);
    }
    // Zero-adjustment groups drop out instead of rendering zero-width nodes.
    if (w.adjustments.increased_php === 0) assert.ok(!byKey.additions, `${w.key} zero-increase nodes dropped`);
    if (w.insertions.amount_php === 0) assert.ok(!byKey.insertions, `${w.key} zero-insertion nodes dropped`);
    // Every kept node deep-links somewhere.
    for (const node of nodes) assert.ok(node.href && node.name && node.sub, `${w.key} node ${node.key} incomplete`);
  }
  // Tamper: a mutated adjustment breaks conservation loudly.
  const tampered = structuredClone(data.workspaces[0]);
  tampered.adjustments.increased_php += 1000;
  assert.throws(() => flowGraph(tampered), /House in-flow|increased pair/);
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
  // Reading columns: DPWH carries both readings; annexes verify their
  // retained 2nd-reading annex text is identical to the 3rd printing.
  assert.equal(byKey.dpwh.readings.second.count,16270);
  assert.equal(byKey.dpwh.readings.second.amount_php,586941661000);
  assert.equal(byKey.dpwh.links.house_second,'#house?reading=second');
  assert.equal(byKey.dpwh.readings.third.count,byKey.dpwh.sources.house.count);
  assert.equal(byKey.dpwh.readings.third.same_as_second,false);
  for (const key of ['fmr','hfep','nia']) {
    const w = byKey[key];
    assert.equal(w.readings.second,null,`${key} carries no separate 2nd extraction`);
    assert.equal(w.readings.third.count,w.sources.house.count);
    assert.equal(w.readings.third.amount_php,w.sources.house.amount_php);
    assert.equal(w.readings.third.same_as_second,true);
    assert.ok(w.readings.third.verified_identical_pages>0,`${key} reading verification missing`);
  }
  assert.equal(byKey.fmr.readings.third.verified_identical_pages,60);
  assert.equal(byKey.hfep.readings.third.verified_identical_pages,17);
  assert.equal(byKey.nia.readings.third.verified_identical_pages,46);
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
  assert.ok(csv.includes('"unchanged_records","unchanged_php"'));
  assert.ok(csv.includes('"6196","172149788000"'));
  assert.ok(csv.includes('"9670","348425553000"')); // DPWH unchanged count/allocation
  assert.ok(csv.includes('#nia/compare?view=projects&status=unchanged'));
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
  const tamperedUnchanged = structuredClone(data); tamperedUnchanged.workspaces[0].unchanged.comparison_rows--;
  assert.throws(() => validateOverview(tamperedUnchanged),/partition/);
  const brokenPartition = structuredClone(data);
  brokenPartition.workspaces[0].paired_comparison_rows =
    brokenPartition.workspaces[0].unchanged.comparison_rows + 1;
  assert.throws(() => validateOverview(brokenPartition),/partition/);
  assert.throws(() => validateOverview({...data,schema_version:99}),/Unsupported/);
});
test('DPWH three-stage flow strata rebuild every ledger and tie to the Overview figures', () => {
  const detail = dpwh.detail;
  const headlines = dpwh.overview.headlines;
  const flow = buildDpwhFlow(detail, headlines);
  assert.equal(flow.schema_version,1);
  assert.equal(flow.totals.rows,17613);
  // Strata partition the rows exactly.
  assert.equal(flow.strata.reduce((t,s) => t + s.rows,0),flow.totals.rows);
  const workspace = data.workspaces[0];
  // Stage ledgers tie to the published headline figures. Record counts
  // differ by grain: flow counts comparison rows; the Overview expands
  // grouped House members to source records (16,272 rows vs 16,275 records).
  assert.equal(flow.stages.nep.amount_php,workspace.sources.nep.amount_php);
  assert.equal(flow.stages.third.amount_php,workspace.sources.house.amount_php);
  assert.equal(flow.stages.second.amount_php,workspace.readings.second.amount_php);
  assert.equal(flow.stages.nep.rows,workspace.sources.nep.count);
  assert.ok(flow.stages.third.rows <= workspace.sources.house.count);
  // Known membership shape: all-three, house-only(both readings), NEP-only, HGAB3-only.
  const byKey = Object.fromEntries(flow.strata.map(s => [s.key,s]));
  assert.equal(byKey['true/true/true'].rows,10079);
  assert.equal(byKey['false/true/true'].rows,6188);
  assert.equal(byKey['true/false/false'].rows,1341);
  assert.equal(byKey['false/false/true'].rows,5);
  // The HGAB2→HGAB3 delta is the five-row ₱134M verified annex change.
  assert.equal(flow.stages.third.amount_php - flow.stages.second.amount_php,134000000);
  // Tamper: a dropped row breaks the external headline anchor loudly.
  const tampered = structuredClone(detail);
  tampered.projects.pop();
  assert.throws(() => buildDpwhFlow(tampered, headlines),/drifts|rebuild/);
});
