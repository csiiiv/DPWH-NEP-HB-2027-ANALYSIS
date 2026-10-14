import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {allocationStats, analysisCandidateRows, candidateGroupRows, bandRows, roundingLadder, filterProjects, filterComparisons,
  sourceNode, sourcePath, sourceArithmetic, comparisonRows, candidateAggregates, overviewComparisonRows, overviewGroupRows} from './niaModel.js';
import {aiMonitoringBasis, aiMonitoringInsertions, aiMonitoringProjects, concentration, concentrationRows, fundingGroups, fundingSummary} from './niaAnalysis.js';

// Regenerate in memory so npm test also works in a fresh checkout.
const data = JSON.parse(execFileSync('python3', ['-c',
  "import json,sys; sys.path.insert(0,'analysis-nia'); import build_nia_workbench as b; print(json.dumps(b.build(write_output=False)))"],
  {cwd: fileURLToPath(new URL('../../../', import.meta.url)), maxBuffer: 8 * 1024 * 1024, encoding: 'utf8'}));
const rows = comparisonRows(data);
test('AI monitoring classification includes satellite wording and source-specific OCR variants without including generic monitoring', () => {
  const source = {source_pdf: 'dbm-other-nep-line-data/NIA.pdf'};
  const fixture = [
    {id: 'ai', title: 'SPIP with AI Monitoring System'},
    {id: 'satellite', title: 'Solar pump with AI Satellite-Assisted Monitoring'},
    {id: 'expanded', title: 'Artificial Intelligence Monitoring System'},
    {id: 'al', title: 'SPIP with Al Monitoring System', source},
    {id: 'at', title: 'SPIP with AT Monitoring', source},
    {id: 'generic', title: 'Remote Monitoring System and Electrical System'},
    {id: 'other-context', title: 'AI pump repair and remote monitoring'},
    {id: 'substring', title: 'SAI Monitoring System'},
    {id: 'house-al', title: 'AL Monitoring', source: {source_pdf: 'HB_BUDGET/2 - HB 10858 VOL IB.pdf'}},
  ].map(Object.freeze);
  assert.deepEqual(aiMonitoringProjects(fixture).map(p => p.id), ['ai', 'satellite', 'expanded', 'al', 'at']);
  assert.deepEqual(aiMonitoringProjects(fixture, {aiBasis: 'ocr_variant'}).map(p => p.id), ['al', 'at']);
  assert.equal(aiMonitoringBasis({}), null);
  assert.equal(aiMonitoringProjects(fixture, {aiBasis: 'explicit'}).length, 3);
  assert.equal(fixture[3].title, 'SPIP with Al Monitoring System');
});
test('AI monitoring totals count each whole project once and preserve original records and pairings', () => {
  const originalPairs = JSON.stringify(data.comparison);
  for (const [side, count, total, explicitCount, variantCount] of [
    ['house', 299, 6341950000, 299, 0], ['nep', 327, 7015950000, 268, 59],
  ]) {
    const source = data.stages[side].projects, related = aiMonitoringProjects(source);
    const explicit = aiMonitoringProjects(source, {aiBasis: 'explicit'}), variants = aiMonitoringProjects(source, {aiBasis: 'ocr_variant'});
    assert.equal(related.length, count);
    assert.equal(allocationStats(related).total, total);
    assert.equal(explicit.length, explicitCount);
    assert.equal(variants.length, variantCount);
    assert.equal(allocationStats(explicit).total + allocationStats(variants).total, total);
    assert.equal(new Set(related.map(p => p.id)).size, count);
    assert.ok(related.every(p => source.includes(p) && p.subprogram_key === 'Establishment of Pump Irrigation'));
    assert.equal(aiMonitoringProjects(filterProjects(source, {subprogram: 'Other Irrigation System'})).length, 0);
    assert.deepEqual(aiMonitoringProjects(filterProjects(source, {q: related[0].id})), [related[0]]);
  }
  assert.equal(JSON.stringify(data.comparison), originalPairs);
  assert.equal(allocationStats(aiMonitoringProjects(data.stages.nep.projects, {aiBasis: 'ocr_variant'})).total, 1365950000);
  const satellite = aiMonitoringProjects(data.stages.house.projects).filter(p => /Satellite[- ]Assisted/i.test(p.title));
  assert.equal(satellite.length, 10);
  assert.equal(allocationStats(satellite).total, 170000000);
});
test('AI monitoring insertions partition House allocations and respect House source filters independently of stage selection', () => {
  const insertions = aiMonitoringInsertions(rows);
  assert.equal(insertions.length, 123);
  assert.equal(new Set(insertions.map(r => r.house.id)).size, 123);
  assert.equal(allocationStats(insertions.map(r => r.house)).total, 2626950000);
  assert.equal(insertions.filter(r => r.ambiguous_title).length, 4);
  assert.ok(insertions.every(r => r.status === 'house_only' && r.house && !r.nep));
  const paired = rows.filter(r => r.status === 'paired' && aiMonitoringBasis(r.house));
  assert.equal(paired.length + insertions.length, 299);
  assert.equal(allocationStats(paired.map(r => r.house)).total + allocationStats(insertions.map(r => r.house)).total, 6341950000);
  for (const stage of ['nep', 'house']) assert.deepEqual(aiMonitoringInsertions(rows, {stage}), insertions);
  assert.deepEqual(aiMonitoringInsertions(rows, {aiBasis: 'explicit'}), insertions);
  for (const params of [{aiBasis: 'ocr_variant'}, {subprogram: 'Other Irrigation System'}, {q: 'missing-source-title'}, {status: 'flagged'}])
    assert.deepEqual(aiMonitoringInsertions(rows, params), []);
  const first = insertions[0];
  assert.deepEqual(aiMonitoringInsertions(rows, {q: first.house.id}), [first]);
  assert.equal(aiMonitoringInsertions(rows, {minAmount: '20000000'}).reduce((sum, r) => sum + r.house_php, 0),
    insertions.filter(r => r.house_php >= 20000000).reduce((sum, r) => sum + r.house_php, 0));
  assert.ok(aiMonitoringInsertions(rows, {status: 'repeated'}).every(r => r.house.repeated_title));
});
test('funding reconciliation and coverage retain every filtered source allocation once', () => {
  for (const params of [{}, {subprogram: 'Pump Irrigation System'}, {status: 'changed'}, {status: 'house_only'}, {q: 'missing-source-title'}]) {
    const filtered = filterComparisons(rows, params), summary = fundingSummary(filtered);
    const groups = fundingGroups(filtered, data.subprogram_controls);
    assert.equal(summary.net_delta_php, summary.sources.house.total - summary.sources.nep.total);
    assert.equal(groups.reduce((sum, g) => sum + g.delta_php, 0), summary.net_delta_php);
    for (const side of ['nep', 'house']) {
      const source = summary.sources[side], projects = filtered.flatMap(r => r[side] ? [r[side]] : []);
      assert.equal(new Set(projects.map(p => p.id)).size, source.count);
      assert.equal(source.total, allocationStats(projects).total);
      assert.equal(groups.reduce((sum, g) => sum + g[`${side}_php`], 0), source.total);
      assert.equal(source.allocation_share, source.total ? source.paired_amount_php / source.total : null);
    }
  }
  const summary = fundingSummary(rows);
  assert.equal(summary.net_delta_php, 401124000);
  assert.equal(summary.sources.nep.paired_amount_php, 9376655000);
  assert.equal(summary.sources.house.paired_amount_php, 8546655000);
  const changed = fundingSummary(filterComparisons(rows, {status: 'changed'}));
  assert.equal(changed.net_delta_php, -830000000);
  assert.equal(changed.sources.nep.allocation_share, 1);
});
test('concentration ranks source records within filtered sub-programs and handles small or empty populations', () => {
  const fixture = [
    {id: 'b', subprogram_key: 's', amount_php: 10},
    {id: 'a', subprogram_key: 's', amount_php: 10},
    {id: 'c', subprogram_key: 't', amount_php: 100},
  ];
  const grouped = concentrationRows(fixture, [{key: 's', label: 'S'}, {key: 't', label: 'T'}]);
  assert.equal(grouped.reduce((sum, g) => sum + g.total, 0), 120);
  assert.deepEqual(grouped.find(g => g.id === 's').top.map(p => p.id), ['a', 'b']);
  assert.ok(grouped.every(g => g.top_share === 1));
  assert.equal(concentration([]).top_share, null);
  assert.deepEqual(concentrationRows([], [{key: 's'}]), []);
  for (const stage of Object.values(data.stages)) {
    const filtered = filterProjects(stage.projects, {subprogram: stage.subprograms[0].key});
    const stats = concentration(filtered);
    const expected = [...filtered].map(p => p.amount_php).sort((a, b) => b - a).slice(0, 10);
    assert.deepEqual(stats.top.map(p => p.amount_php), expected);
    assert.equal(stats.top_amount_php, expected.reduce((sum, amount) => sum + amount, 0));
    assert.equal(stats.top_share, stats.top_amount_php / allocationStats(filtered).total);
  }
});
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
test('Overview bands and their record drills conserve filtered source counts and pesos on each side', () => {
  for (const params of [{}, {q:'pump'}, {subprogram:'Other Irrigation System'}]) {
    for (const dim of ['subprogram','program','overall']) {
      const groups=overviewComparisonRows(rows,params,data.stages.house.subprograms,dim);
      for (const side of ['nep','house']) {
        const projects=filterProjects(data.stages[side].projects,params);
        assert.equal(groups.reduce((sum,g)=>sum+g[`${side}_count`],0),projects.length);
        assert.equal(groups.reduce((sum,g)=>sum+g[`${side}_php`],0),allocationStats(projects).total);
        for (const group of groups) {
          const drill=overviewGroupRows(rows,params,dim,group.id);
          assert.equal(drill.filter(r=>r[side]).length,group[`${side}_count`]);
          assert.equal(drill.reduce((sum,r)=>sum+(r[`${side}_php`] || 0),0),group[`${side}_php`]);
        }
      }
    }
  }
  const fixture=[{status:'paired',nep:{id:'n',title:'old',amount_php:100,subprogram_key:'old',program_group:'A'},
    house:{id:'h',title:'new',amount_php:200,subprogram_key:'new',program_group:'B'},nep_php:100,house_php:200}];
  const groups=overviewComparisonRows(fixture);
  assert.equal(groups.find(g=>g.id==='old').house_count,0);
  assert.equal(groups.find(g=>g.id==='new').pct_records,null);
  assert.equal(overviewGroupRows(fixture,{},'subprogram','old')[0].house_php,null);
  assert.equal(overviewGroupRows(fixture,{},'subprogram','old')[0].title,'old');
  assert.equal(overviewGroupRows(fixture,{},'subprogram','old')[0].house_id,null);
  assert.equal(overviewGroupRows(fixture,{},'subprogram','new')[0].nep_php,null);
});
test('adjustment aggregates retain opposing changes and Compare preserves program and ambiguity scope', () => {
  const population=analysisCandidateRows(rows,{view:'adjustments'});
  const groups=candidateGroupRows(population,'adjustments','program');
  const totals=candidateAggregates(population);
  assert.equal(groups.reduce((s,g)=>s+g.increased_php,0),totals.increased.amount);
  assert.equal(groups.reduce((s,g)=>s+g.decreased_php,0),-totals.decreased.amount);
  for (const g of groups) assert.equal(g.increased_php+g.decreased_php,g.amount_php);
  const candidates=analysisCandidateRows(rows,{view:'insertions',ranking:'ambiguous'});
  for (const program of new Set(candidates.map(r=>r.house.program_group))) {
    assert.deepEqual(filterComparisons(rows,{status:'house_only',ranking:'ambiguous',program}),candidates.filter(r=>r.house.program_group===program));
  }
});
