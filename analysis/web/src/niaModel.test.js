import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {allocationStats, analysisCandidateRows, candidateGroupRows, bandRows, roundingLadder, filterProjects, filterComparisons,
  sourceNode, sourcePath, sourceArithmetic, comparisonRows, candidateAggregates} from './niaModel.js';

// Regenerate in memory so npm test also works in a fresh checkout.
const data = JSON.parse(execFileSync('python3', ['-c',
  "import json,sys; sys.path.insert(0,'analysis-nia'); import build_nia_workbench as b; print(json.dumps(b.build(write_output=False)))"],
  {cwd: fileURLToPath(new URL('../../../', import.meta.url)), maxBuffer: 8 * 1024 * 1024, encoding: 'utf8'}));
const rows = comparisonRows(data);
test('candidate aggregates partition funding and count changed pairs', () => {
  const stats = candidateAggregates(rows);
  assert.equal(stats.net_delta_php, data.comparison_summary.delta_php);
  assert.equal(stats.increased.count + stats.decreased.count, 4);
  assert.equal(stats.unchanged, 505);
  assert.equal(filterComparisons(rows, {status: 'changed'}).length, 4);
  assert.equal(filterComparisons(rows, {status: 'house_only'}).length, 319);
  assert.ok(filterComparisons(rows, {status: 'ambiguous'}).every(r => r.status !== 'paired'));
});
test('allocation bands and rounding buckets conserve every source row and peso', () => {
  for (const stage of Object.values(data.stages)) {
    const stats = allocationStats(stage.projects);
    for (const buckets of [bandRows(stage.projects), roundingLadder(stage.projects)]) {
      assert.equal(buckets.reduce((s, r) => s + r.projects, 0), stats.count);
      assert.equal(buckets.reduce((s, r) => s + r.total_php, 0), stats.total);
    }
    assert.equal(sourceArithmetic(stage, stage.root.id).difference, 0);
    for (const subprogram of stage.subprograms) assert.equal(sourceArithmetic(stage, subprogram.id).difference, 0);
  }
});
test('source breadcrumbs resolve subprogram IDs and actual root PDF evidence', () => {
  for (const stage of Object.values(data.stages)) {
    for (const project of [stage.projects[0], stage.projects.at(-1)]) {
      const path = sourcePath(stage, project.id);
      assert.equal(path[0].id, stage.root.id);
      assert.ok(sourceNode(stage, path.at(-2).id)?.is_subprogram);
      assert.equal(sourceNode(stage, path.at(-1).id).label, project.title);
    }
    assert.equal(sourceNode(stage, 'missing'), null);
  }
  assert.deepEqual(sourceNode(data.stages.house, data.stages.house.root.id).source, data.stages.house.root.source);
});
test('review dimensions overlap without dropping source records', () => {
  const fixture = [
    {id: 'a', title: '1,000 hectares', subprogram_key: 's', amount_php: 5000000, repeated_title: true, extraction_flags: ['bottom_band_row'], numeric_title_tokens: ['1,000']},
    {id: 'b', title: 'Canal', subprogram_key: 's', amount_php: 10000000},
  ];
  for (const status of ['flagged', 'repeated', 'numeric']) assert.equal(filterProjects(fixture, {status})[0].id, 'a');
  assert.equal(filterProjects(fixture, {minAmount: '5000000', maxAmount: '10000000'}).length, 1);
  assert.equal(filterProjects(fixture, {q: '1,000 hectares'}).length, 1);
  assert.equal(filterProjects(fixture, {subprogram: 'missing'}).length, 0);
});
test('analysis populations distinguish source-only candidates from paired adjustments', () => {
  const insertions = analysisCandidateRows(rows, {view: 'insertions'});
  const deletions = analysisCandidateRows(rows, {view: 'deletions'});
  const adjustments = analysisCandidateRows(rows, {view: 'adjustments'});
  assert.equal(insertions.length, 319);
  assert.equal(deletions.length, 282);
  assert.equal(adjustments.length, 4);
  assert.ok(insertions.every(r => r.house && !r.nep));
  assert.ok(deletions.every(r => r.nep && !r.house));
  assert.ok(adjustments.every(r => r.nep && r.house && r.delta_php !== 0));
  assert.equal(adjustments.reduce((s, r) => s + r.delta_php, 0), -830000000);
  assert.equal(analysisCandidateRows(rows, {view: 'adjustments', direction: 'increased'}).length, 0);
  assert.equal(analysisCandidateRows(rows, {view: 'adjustments', direction: 'decreased'}).length, 4);
  assert.equal(analysisCandidateRows(rows, {view: 'unknown'}).length, 0);
});
test('ambiguity groups partition source-only rows and filters retain analysis population', () => {
  for (const view of ['insertions', 'deletions']) {
    const all = analysisCandidateRows(rows, {view});
    const ambiguous = analysisCandidateRows(rows, {view, ranking: 'ambiguous'});
    const unambiguous = analysisCandidateRows(rows, {view, ranking: 'unambiguous'});
    assert.equal(ambiguous.length + unambiguous.length, all.length);
    assert.ok(ambiguous.length > 0 && ambiguous.every(r => r.ambiguous_title));
    const first = all[0];
    assert.deepEqual(analysisCandidateRows(rows, {view, q: (first.house || first.nep).id}), [first]);
    assert.equal(analysisCandidateRows(rows, {view, subprogram: 'missing'}).length, 0);
    // Compare's status parameter cannot turn a deletion view into insertions.
    assert.equal(analysisCandidateRows(rows, {view, status: 'paired'}).length, all.length);
  }
});
test('analysis group rankings conserve row counts and source amounts for both dimensions', () => {
  for (const view of ['insertions', 'deletions', 'adjustments']) {
    const population = analysisCandidateRows(rows, {view});
    for (const dim of ['subprogram', 'program']) {
      const groups = candidateGroupRows(population, view, dim, data.stages.house.subprograms);
      assert.equal(groups.reduce((s, g) => s + g.count, 0), population.length);
      for (const side of ['nep', 'house']) assert.equal(groups.reduce((s, g) => s + g[`${side}_php`], 0), population.reduce((s, r) => s + (r[`${side}_php`] || 0), 0));
      assert.equal(groups.reduce((s, g) => s + g.amount_php, 0), population.reduce((s, r) => s + (view === 'adjustments' ? r.delta_php : r[view === 'deletions' ? 'nep_php' : 'house_php']), 0));
    }
  }
});
