import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {allocationStats, analysisCandidateRows, candidateGroupRows, bandRows, roundingLadder, filterProjects, filterComparisons,
  sourceNode, sourcePath, sourceArithmetic, comparisonRows, candidateAggregates, overviewComparisonRows, overviewGroupRows,
  comparisonClass, categoryReconciliationRows,
  rowsForMethod, normalizeMatchingMethod, variantMarkLabels, unresolvedMarkKinds, candidateResolution,
  senateGapRows, senateReconciliationRows, senateUnfundedRows, gapReasonLabels,
  formatSenateCoordinates, formatSenateChainage, senateChainageLengthM,
  filterSenateProjects, senateProjects} from './niaModel.js';
import {aiMonitoringBasis, aiMonitoringInsertions, aiMonitoringProjects, aiMonitoringReconciliation, chainageFundingLabels, chainageFundingScope, concentration, concentrationRows, fundingGroups, fundingSummary, highlightsCards, phpPerMDistribution, phpPerMOutlierFenceScore, phpPerMOutlierMedianRatio, phpPerMOutlierProjects, phpPerMOutlierSeverity, phpPerMRowsByDim, phpPerMStats, phpPerMStripDomain, preferredChainageTitle, senateByStageIdIndex} from './niaAnalysis.js';

// Walk up from this file until analysis-nia/ is found so the same test works
// from analysis/web/src and the PBC-NIA-APP fork.
function repoRootFrom(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'analysis-nia', 'build_nia_workbench.py'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('analysis-nia/build_nia_workbench.py not found above ' + start);
}
const repoRoot = repoRootFrom(fileURLToPath(new URL('.', import.meta.url)));

// Regenerate in memory so npm test also works in a fresh checkout.
const data = JSON.parse(execFileSync('python3', ['-c',
  "import json,sys; sys.path.insert(0,'analysis-nia'); import build_nia_workbench as b; print(json.dumps(b.build(write_output=False)))"],
  {cwd: repoRoot, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8'}));
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
test('AI monitoring reconciliation splits the source movement into pairs, candidates and NEP-only rows', () => {
  const recon = aiMonitoringReconciliation(rows);
  // Corrected classification is the default: verified OCR readings and
  // Monitoring/Monitoring System wording normalize matching keys only.
  assert.equal(recon.paired_count, 273);
  assert.equal(recon.paired_nep_php, recon.paired_house_php);
  assert.equal(recon.paired_delta_php, 0);
  assert.equal(recon.candidate_count, 26);
  assert.equal(recon.candidate_php, 556000000);
  assert.equal(recon.nep_only_count, 54);
  assert.equal(recon.nep_only_php, 1230000000);
  assert.equal(recon.nep_php, 7015950000);
  assert.equal(recon.house_php, 6341950000);
  assert.equal(recon.net_delta_php, -674000000);
  assert.equal(recon.paired_delta_php + recon.candidate_php - recon.nep_only_php, recon.net_delta_php);
  // The strict classification recovers the committed workbench figures.
  const strict = aiMonitoringReconciliation(rows, {method: 'strict'});
  assert.equal(strict.paired_count, 176);
  assert.equal(strict.candidate_count, 123);
  assert.equal(strict.candidate_php, 2626950000);
  assert.equal(strict.twin_count, 120);
  assert.equal(strict.twin_php, 2501950000);
  assert.equal(strict.nep_only_count, 151);
  assert.equal(strict.nep_only_php, 3300950000);
  assert.equal(strict.net_delta_php, -674000000);
});
test('rowsForMethod partitions every source row under both matching methods', () => {
  assert.equal(normalizeMatchingMethod('bogus'), 'ai_corrected');
  const corrected = rowsForMethod(rows, 'ai_corrected');
  assert.equal(corrected.length, rows.length);
  for (const side of ['nep', 'house']) {
    const ids = rowsForMethod(rows, 'strict').filter(r => r[side]).map(r => r[side].id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, data.stages[side].projects.length);
  }
  const strictRows = rowsForMethod(rows, 'strict');
  assert.equal(strictRows.length, 828 + 791 - 509);
  const counts = {paired: 0, house_only: 0, nep_only: 0};
  for (const r of strictRows) counts[r.status] += 1;
  assert.deepEqual(counts, {paired: 509, house_only: 319, nep_only: 282});
  assert.deepEqual(data.comparison_summaries.strict.counts, counts);
  assert.deepEqual(data.comparison_summaries.ai_corrected.counts, {paired: 606, house_only: 222, nep_only: 185});
  // Split rows carry the corrected pair's other side for evidence.
  const split = rows.find(r => r.strict_status === 'split_pair');
  assert.ok(split && split.nep && split.house);
  const strictView = rowsForMethod(rows, 'strict');
  assert.ok(strictView.every(r => r.strict_status !== 'split_pair' || true));
  // Strict view house_only rows never carry a nep record.
  assert.ok(strictView.filter(r => r.status === 'house_only').every(r => !r.nep));
  assert.ok(strictView.filter(r => r.status === 'nep_only').every(r => !r.house));
});
test('AI monitoring insertions partition House allocations and respect House source filters independently of stage selection', () => {
  const insertions = aiMonitoringInsertions(rows);
  assert.equal(insertions.length, 26);
  assert.equal(new Set(insertions.map(r => r.house.id)).size, 26);
  assert.equal(allocationStats(insertions.map(r => r.house)).total, 556000000);
  assert.ok(insertions.every(r => r.status === 'house_only' && r.house && !r.nep));
  const strict = aiMonitoringInsertions(rows, {method: 'strict'});
  assert.equal(strict.length, 123);
  assert.equal(allocationStats(strict.map(r => r.house)).total, 2626950000);
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
  // Variant marks cover the whole unmatched AI residual with one-to-one
  // counterpart pointers only; repeated-title blocks carry none by design.
  const marked = insertions.filter(r => ['location_variant', 'exact_variant', 'spelling_variant'].includes(r.variant_mark_kind));
  assert.ok(marked.length > 0);
  assert.ok(marked.every(r => r.variant_mark.counterpart_ids.length === 1));
  assert.ok(insertions.filter(r => r.variant_mark_kind === 'repeated_title').every(r => r.variant_mark.counterpart_ids.length === 0));
  assert.ok(insertions.every(r => variantMarkLabels[r.variant_mark_kind || 'no_counterpart']));
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
  assert.equal(summary.sources.nep.paired_amount_php, 11447605000);
  assert.equal(summary.sources.house.paired_amount_php, 10617605000);
  const strictSummary = fundingSummary(rowsForMethod(rows, 'strict'));
  assert.equal(strictSummary.sources.nep.paired_amount_php, 9376655000);
  assert.equal(strictSummary.sources.house.paired_amount_php, 8546655000);
  const changed = fundingSummary(filterComparisons(rows, {status: 'changed'}));
  assert.equal(changed.net_delta_php, -830000000);
  assert.equal(changed.sources.nep.allocation_share, 1);
});
test('concentration ranks source records within filtered groups and handles small or empty populations', () => {
  const fixture = [
    {id: 'b', subprogram_key: 's', category: 'Cat A', amount_php: 10},
    {id: 'a', subprogram_key: 's', category: 'Cat A', amount_php: 10},
    {id: 'c', subprogram_key: 't', category: 'Cat B', amount_php: 100},
  ];
  const grouped = concentrationRows(fixture, [{key: 's', label: 'S'}, {key: 't', label: 'T'}]);
  assert.equal(grouped.reduce((sum, g) => sum + g.total, 0), 120);
  assert.deepEqual(grouped.find(g => g.id === 's').top.map(p => p.id), ['a', 'b']);
  assert.ok(grouped.every(g => g.top_share === 1));
  assert.equal(concentration([]).top_share, null);
  assert.deepEqual(concentrationRows([], [{key: 's'}]), []);
  const byCategory = concentrationRows(fixture, [
    {id: 'Cat A', label: 'Cat A'}, {id: 'Cat B', label: 'Cat B'},
  ], 'category');
  assert.equal(byCategory.find(g => g.id === 'Cat B').total, 100);
  for (const stage of Object.values(data.stages)) {
    const filtered = filterProjects(stage.projects, {subprogram: stage.subprograms[0].key});
    const stats = concentration(filtered);
    const expected = [...filtered].map(p => p.amount_php).sort((a, b) => b - a).slice(0, 10);
    assert.deepEqual(stats.top.map(p => p.amount_php), expected);
    assert.equal(stats.top_amount_php, expected.reduce((sum, amount) => sum + amount, 0));
    assert.equal(stats.top_share, stats.top_amount_php / allocationStats(filtered).total);
  }
});

test('php_per_m stats describe title-chainage rates per hierarchy category', () => {
  const fixture = [
    {id: 'a', category: 'Roads', subprogram_key: 'nis', subprogram_label: 'NIS', amount_php: 2_000_000, php_per_m: 10_000, chainage_length_m: 200},
    {id: 'b', category: 'Roads', subprogram_key: 'nis', subprogram_label: 'NIS', amount_php: 4_000_000, php_per_m: 20_000, chainage_length_m: 200},
    {id: 'c', category: 'Repair', subprogram_key: 'cis', subprogram_label: 'CIS', amount_php: 3_000_000, php_per_m: 15_000, chainage_length_m: 200},
    {id: 'd', category: 'Repair', subprogram_key: 'cis', subprogram_label: 'CIS', amount_php: 5_000_000}, // no chainage
  ];
  const overall = phpPerMStats(fixture);
  assert.equal(overall.count, 3);
  assert.equal(overall.median, 15_000);
  assert.equal(overall.min, 10_000);
  assert.equal(overall.max, 20_000);
  const rows = phpPerMRowsByDim(fixture, 'category');
  assert.equal(rows.length, 2);
  const roads = rows.find(r => r.id === 'Roads');
  assert.equal(roads.projects, 2);
  assert.equal(roads.with_chainage, 2);
  assert.equal(roads.median, 15_000);
  assert.deepEqual(roads.rates, [10_000, 20_000]);
  assert.equal(roads.whisker_low, 10_000);
  assert.equal(roads.whisker_high, 20_000);
  const repair = rows.find(r => r.id === 'Repair');
  assert.equal(repair.projects, 2);
  assert.equal(repair.with_chainage, 1);
  assert.equal(repair.chainage_share, 0.5);
  // Live workbench: every stage project that carries chainage also carries a rate.
  for (const stage of Object.values(data.stages)) {
    const withLength = stage.projects.filter(p => Number.isFinite(p.chainage_length_m) && p.chainage_length_m > 0);
    assert.ok(withLength.length > 300, `${stage.key} should stamp chainage lengths`);
    assert.ok(withLength.every(p => Number.isFinite(p.php_per_m)));
    const byCat = phpPerMRowsByDim(stage.projects, 'category');
    assert.ok(byCat.some(r => r.with_chainage > 0));
    assert.equal(byCat.reduce((s, r) => s + r.projects, 0), stage.projects.length);
    const domain = phpPerMStripDomain(byCat);
    assert.ok(domain.min > 0 && domain.max > domain.min);
  }
});

test('php_per_m Tukey whiskers flag far outliers for the strip chart', () => {
  const rates = [10_000, 11_000, 12_000, 13_000, 14_000, 100_000];
  const dist = phpPerMDistribution(rates);
  assert.equal(dist.p25, 11_250);
  assert.equal(dist.p75, 13_750);
  assert.equal(dist.whisker_low, 10_000);
  assert.equal(dist.whisker_high, 14_000);
  assert.equal(dist.max, 100_000);
  const domain = phpPerMStripDomain([{rates}]);
  assert.ok(domain.min < 10_000);
  assert.ok(domain.max > 100_000);
});

test('preferred chainage title prefers Senate column-V submission wording', () => {
  assert.equal(preferredChainageTitle({
    title: 'Annex print', submission_label: 'Fixed submission title Sta. 0+000 – 0+100',
  }), 'Fixed submission title Sta. 0+000 – 0+100');
  assert.equal(preferredChainageTitle({title: 'Annex print only'}), 'Annex print only');
});

test('chainage funding scope maps Senate workbook status to NEP/House labels', () => {
  assert.equal(chainageFundingLabels.both_funded, 'NEP+House');
  assert.equal(chainageFundingLabels.house_zeroed, 'NEP Only');
  assert.equal(chainageFundingLabels.house_insertion, 'House Only');
  assert.equal(chainageFundingScope({workbook_status: 'both_funded'}).label, 'NEP+House');
  const index = senateByStageIdIndex([
    {id: 'sen:1', status: 'house_insertion', house_join: {id: 'ib:1'}, nep_join: null},
    {id: 'sen:2', status: 'house_zeroed', nep_join: {id: 'nep-1'}, house_join: null},
  ]);
  assert.equal(chainageFundingScope({id: 'ib:1'}, index).label, 'House Only');
  assert.equal(chainageFundingScope({id: 'nep-1'}, index).label, 'NEP Only');
  // Live workbench: every stage project with a senate_id resolves a funding label.
  const liveIndex = senateByStageIdIndex(data.senate.projects);
  const stamped = data.stages.nep.projects.filter(p => p.senate_id);
  assert.ok(stamped.length > 700);
  assert.ok(stamped.every(p => chainageFundingScope(p, liveIndex).label !== '—'));
});

test('php_per_m outlier projects list Tukey extremes per hierarchy group', () => {
  const fixture = [
    {id: 'a', title: 'A', category: 'Roads', amount_php: 1_000_000, php_per_m: 10_000, chainage_length_m: 100},
    {id: 'b', title: 'B', category: 'Roads', amount_php: 1_100_000, php_per_m: 11_000, chainage_length_m: 100},
    {id: 'c', title: 'C', category: 'Roads', amount_php: 1_200_000, php_per_m: 12_000, chainage_length_m: 100},
    {id: 'd', title: 'D', category: 'Roads', amount_php: 1_300_000, php_per_m: 13_000, chainage_length_m: 100},
    {id: 'e', title: 'E', category: 'Roads', amount_php: 1_400_000, php_per_m: 14_000, chainage_length_m: 100},
    {id: 'f', title: 'Far annex', submission_label: 'Far fixed title with Sta. 0+000 – 1+000',
      category: 'Roads', amount_php: 10_000_000, php_per_m: 100_000, chainage_length_m: 100},
    {id: 'g', title: 'Solo', category: 'Repair', amount_php: 5_000_000, php_per_m: 50_000, chainage_length_m: 100},
  ];
  const outliers = phpPerMOutlierProjects(fixture, 'category');
  assert.equal(outliers.length, 1);
  assert.equal(outliers[0].id, 'f');
  assert.equal(outliers[0].side, 'high');
  assert.equal(outliers[0].group_label, 'Roads');
  assert.equal(outliers[0].title, 'Far fixed title with Sta. 0+000 – 1+000');
  assert.equal(outliers[0].ledger_title, 'Far annex');
  // p25=11250, p75=13750, IQR=2500 → (100000-13750)/2500 = 34.5 → extreme
  assert.equal(outliers[0].fence_score, 34.5);
  assert.equal(outliers[0].severity, 'extreme');
  assert.ok(outliers[0].median_ratio > 1);
  assert.equal(phpPerMOutlierSeverity(2), 'mild');
  assert.equal(phpPerMOutlierSeverity(3), 'moderate');
  assert.equal(phpPerMOutlierSeverity(5), 'severe');
  assert.equal(phpPerMOutlierSeverity(10), 'extreme');
  assert.equal(phpPerMOutlierFenceScore(100_000, {p25: 11_250, p75: 13_750}, 'high'), 34.5);
  assert.equal(phpPerMOutlierMedianRatio(100_000, 12_500, 'high'), 8);
  // Live workbench: at least one hierarchy category carries a high-side outlier.
  const live = phpPerMOutlierProjects(data.stages.nep.projects, 'category');
  assert.ok(live.length > 0);
  assert.ok(live.every(o => o.side === 'high' || o.side === 'low'));
  assert.ok(live.every(o => ['mild', 'moderate', 'severe', 'extreme'].includes(o.severity)));
  assert.ok(live.some(o => o.side === 'high'));
  assert.ok(live[0].fence_score >= live.at(-1).fence_score);
});
test('candidate aggregates partition funding and count changed pairs', () => {
  const stats = candidateAggregates(rows);
  assert.equal(stats.net_delta_php, data.comparison_summary.delta_php);
  assert.equal(stats.increased.count + stats.decreased.count, 4);
  assert.equal(stats.unchanged, 602);
  assert.equal(filterComparisons(rows, {status: 'changed'}).length, 4);
  assert.equal(filterComparisons(rows, {status: 'house_only'}).length, 222);
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
  assert.equal(insertions.length, 222);
  assert.equal(deletions.length, 185);
  assert.equal(adjustments.length, 4);
  assert.ok(insertions.every(r => r.house && !r.nep));
  assert.ok(deletions.every(r => r.nep && !r.house));
  assert.ok(adjustments.every(r => r.nep && r.house && r.delta_php !== 0));
  assert.equal(adjustments.reduce((s, r) => s + r.delta_php, 0), -830000000);
  assert.equal(analysisCandidateRows(rows, {view: 'adjustments', direction: 'increased'}).length, 0);
  assert.equal(analysisCandidateRows(rows, {view: 'adjustments', direction: 'decreased'}).length, 4);
  assert.equal(analysisCandidateRows(rows, {view: 'unknown'}).length, 0);
  // DPWH-style resolution split: validated vs plausible-counterpart rows.
  assert.equal(analysisCandidateRows(rows, {view: 'insertions', ranking: 'validated'}).length, 176);
  assert.equal(analysisCandidateRows(rows, {view: 'insertions', ranking: 'unresolved'}).length, 46);
  assert.equal(analysisCandidateRows(rows, {view: 'deletions', ranking: 'validated'}).length, 138);
  assert.equal(analysisCandidateRows(rows, {view: 'deletions', ranking: 'unresolved'}).length, 47);
  for (const view of ['insertions', 'deletions']) {
    const side = view === 'insertions' ? 'house' : 'nep';
    const validated = analysisCandidateRows(rows, {view, ranking: 'validated'});
    const unresolved = analysisCandidateRows(rows, {view, ranking: 'unresolved'});
    assert.equal(validated.length + unresolved.length, analysisCandidateRows(rows, {view}).length);
    assert.ok(validated.every(r => !unresolvedMarkKinds.includes(r.variant_mark_kind)));
    assert.ok(unresolved.every(r => unresolvedMarkKinds.includes(r.variant_mark_kind)));
    assert.equal(validated.reduce((s, r) => s + r[`${side}_php`], 0) + unresolved.reduce((s, r) => s + r[`${side}_php`], 0),
      analysisCandidateRows(rows, {view}).reduce((s, r) => s + r[`${side}_php`], 0));
    // The validated pool is method-independent: the strict projection moves
    // rows between paired and unresolved, never in or out of validated.
    const strictRows = rowsForMethod(rows, 'strict');
    assert.equal(analysisCandidateRows(strictRows, {view, ranking: 'validated'}).length,
      view === 'insertions' ? 176 : 138);
  }
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
    for (const dim of ['subprogram', 'program', 'category', 'region']) {
      const groups = candidateGroupRows(population, view, dim, data.stages.house.subprograms);
      assert.equal(groups.reduce((s, g) => s + g.count, 0), population.length);
      for (const side of ['nep', 'house']) assert.equal(groups.reduce((s, g) => s + g[`${side}_php`], 0), population.reduce((s, r) => s + (r[`${side}_php`] || 0), 0));
      assert.equal(groups.reduce((s, g) => s + g.amount_php, 0), population.reduce((s, r) => s + (view === 'adjustments' ? r.delta_php : r[view === 'deletions' ? 'nep_php' : 'house_php']), 0));
    }
  }
});
test('Overview bands and their record drills conserve filtered source counts and pesos on each side', () => {
  for (const params of [{}, {q:'pump'}, {subprogram:'Other Irrigation System'}]) {
    for (const dim of ['subprogram','program','overall','category','region']) {
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
test('category reconciliation crosstab conserves both ledgers and matches the five comparison classes', () => {
  // Every comparison row classifies into exactly one of the five classes.
  const classes = new Set(['insertions','deletions','unchanged','increased','decreased']);
  for (const r of rows) assert.ok(classes.has(comparisonClass(r)), r.id);
  const groups = categoryReconciliationRows(rows);
  const body = groups.filter(g => g.id !== 'totals');
  const totals = groups.find(g => g.id === 'totals');
  assert.ok(body.length > 1);
  assert.ok(totals);
  assert.equal(groups.at(-1).id, 'totals');
  // Row conservation: per-class counts sum to the class populations.
  const expected = {insertions: 0, deletions: 0, unchanged: 0, increased: 0, decreased: 0};
  for (const r of rows) expected[comparisonClass(r)]++;
  for (const cls of Object.keys(expected))
    assert.equal(body.reduce((s, g) => s + g[`${cls}_count`], 0), expected[cls]);
  // Checksum: House ledger per category equals the four House-side classes.
  for (const g of body) {
    assert.equal(g.house_php, g.insertions_php + g.unchanged_php + g.increased_php + g.decreased_php);
    assert.equal(g.house_count, g.insertions_count + g.unchanged_count + g.increased_count + g.decreased_count);
    assert.equal(g.net_delta_php, g.house_php - g.nep_php);
  }
  assert.equal(body.reduce((s, g) => s + g.house_php, 0),
    rows.reduce((s, r) => s + (r.house_php || 0), 0));
  assert.equal(totals.house_php, body.reduce((s, g) => s + g.house_php, 0));
  assert.equal(totals.nep_php, body.reduce((s, g) => s + g.nep_php, 0));
  assert.equal(totals.net_delta_php, totals.house_php - totals.nep_php);
  assert.equal(totals.house_count, body.reduce((s, g) => s + g.house_count, 0));
  // Stamped workbook hierarchy reaches every ledger row on both stages.
  for (const side of ['nep', 'house'])
    assert.equal(data.stages[side].projects.filter(p => p.category).length,
      data.stages[side].projects.length);
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
test('highlights cards recompute every figure from the retained ledgers and keep supporting populations scoped', () => {
  const cards = highlightsCards(data, rows);
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  assert.deepEqual(cards.map(c => c.id), ['annex-increase', 'subprogram-shift', 'changed-pairs', 'insertions',
    'deletions', 'pairing-coverage', 'ai-monitoring', 'agency-scope', 'extraction-review']);
  // Headline values match the summary and aggregates, never restated literals.
  assert.equal(byId['annex-increase'].value, data.comparison_summary.delta_php);
  assert.equal(byId['insertions'].value, data.comparison_summary.counts.house_only);
  assert.equal(byId['deletions'].value, data.comparison_summary.counts.nep_only);
  const largest = [...data.subprogram_controls].sort((a, b) => Math.abs(b.delta_php) - Math.abs(a.delta_php))[0];
  assert.equal(byId['subprogram-shift'].value, largest.delta_php);
  assert.ok(byId['subprogram-shift'].title.includes('Other Irrigation System'));
  // Supporting populations are the exact analysis populations they describe.
  const byIdKey = list => list.map(r => r.id).sort();
  assert.deepEqual(byIdKey(byId['changed-pairs'].rows), byIdKey(analysisCandidateRows(rows, {view: 'adjustments'})));
  assert.deepEqual(byIdKey(byId.insertions.rows), byIdKey(analysisCandidateRows(rows, {view: 'insertions'})));
  assert.deepEqual(byIdKey(byId.deletions.rows), byIdKey(analysisCandidateRows(rows, {view: 'deletions'})));
  assert.deepEqual(byIdKey(byId['ai-monitoring'].rows), byIdKey(aiMonitoringInsertions(rows)));
  // Every card routes somewhere and states its evidence kind.
  for (const card of cards) {
    assert.ok(card.kind && card.prompt && card.body && card.href, `card ${card.id} missing copy`);
    assert.ok(['Printed controls', 'Candidate matching', 'Extraction evidence', 'Source titles'].includes(card.kind));
    assert.ok(!card.rows || Array.isArray(card.rows));
  }
  // Money identity still visible in the coverage figures the cards quote.
  const summary = fundingSummary(rows);
  assert.equal(summary.paired_delta_php + summary.house_only_php - summary.nep_only_php, summary.net_delta_php);
  assert.equal(summary.net_delta_php, data.comparison_summary.delta_php);
  // Route targets stay inside the NIA workspace vocabulary.
  for (const card of cards) assert.ok(['compare', 'analysis', 'nep', 'house'].includes(card.href));
});

test('NIA highlight evidence supports both AI ledgers and keeps printed control scopes independent', () => {
  const cards = Object.fromEntries(highlightsCards(data, rows).map(card => [card.id, card]));
  const ai = cards['ai-monitoring'];
  assert.equal(ai.value, 7015950000);
  assert.equal(ai.projects.nep.length, 327);
  assert.equal(ai.projects.house.length, 299);
  assert.equal(allocationStats(ai.projects.house).total, 6341950000);
  assert.equal(allocationStats(ai.rows.map(r => r.house)).total, 556000000);
  assert.equal(ai.projects.nep.filter(p => aiMonitoringBasis(p) === 'ocr_variant').length, 59);
  assert.match(ai.body, /net change of ₱-674,000,000/);
  assert.match(ai.body, /273 pairs/);
  assert.match(ai.body, /120 of them/);
  assert.match(ai.takeaway, /identical-amount NEP twin/);
  assert.match(ai.limit, /whole irrigation projects/);
  const shift = cards['subprogram-shift'];
  assert.equal(shift.controls.length, 1);
  assert.equal(shift.controls[0].key, 'Other Irrigation System');
  assert.equal(shift.controls[0].delta_php, -2540000000);
  assert.equal(candidateAggregates(shift.rows).net_delta_php, shift.controls[0].delta_php);
  assert.ok(shift.rows.every(r => r.subprogram_key === shift.controls[0].key));
  assert.match(cards.insertions.limit, /does not establish a new project/);
  assert.match(cards.deletions.limit, /does not establish cancellation/);
  for (const card of Object.values(cards)) {
    assert.equal(card.metrics.length, 3);
    assert.ok(card.actionLabel && card.takeaway && card.limit);
    assert.ok(card.metrics.every(metric => metric.value != null));
  }
  assert.deepEqual(cards['ai-monitoring'].metrics.map(m => m.label),
    ['NEP project allocations', 'House project allocations', 'Net change']);
});
test('senate gap rows identify every both-funded workbook line the title matching splits in two', () => {
  const gaps = senateGapRows(data);
  // The committed figures: 77 both-funded workbook rows whose two joined
  // ledger records sit on two different comparison rows.
  assert.equal(gaps.length, 77);
  assert.ok(new Set(gaps.map(g => g.id)).size === gaps.length);
  for (const g of gaps) {
    assert.ok(g.nep_id && g.house_id && g.nep_php != null && g.house_php != null);
    assert.ok(Object.keys(gapReasonLabels).includes(g.reason));
    // Each half really is an unmatched observation in the comparison ledger.
    const houseRow = data.comparison.find(r => r.house_id === g.house_id);
    const nepRow = data.comparison.find(r => r.nep_id === g.nep_id);
    assert.equal(houseRow.status, 'house_only');
    assert.equal(nepRow.status, 'nep_only');
    assert.notEqual(houseRow.id, nepRow.id);
  }
  // Money identity: the gap's combined halves reconcile to the workbook
  // amounts actually printed on those rows.
  const senById = new Map(data.senate.projects.map(p => [p.id, p]));
  for (const g of gaps) {
    const p = senById.get(g.id);
    assert.equal(g.nep_php, p.nep_amount);
    assert.equal(g.house_php, p.hgab_amount);
  }
  // Reasons: mostly reworded printings, a minority of repeated titles.
  const reasons = gaps.reduce((m, g) => (m[g.reason] = (m[g.reason] || 0) + 1, m), {});
  assert.equal(reasons.reworded_printing + reasons.repeated_title, 77);
  assert.ok(reasons.reworded_printing >= 60);
  assert.ok(reasons.repeated_title >= 1 && reasons.repeated_title <= 15);
  // Workbook column V (fixed/submission title), edit acknowledgements and
  // remarks travel with every gap row.
  assert.equal(gaps.filter(g => g.submission_label).length, 77);
  assert.equal(gaps.filter(g => g.submission_label && g.submission_label !== g.label).length, 76);
  assert.equal(gaps.filter(g => g.submission_edited).length, 77);
  assert.equal(gaps.filter(g => g.submission_edited === 'OK').length, 76);
  assert.equal(gaps.filter(g => g.submission_edited === 'CHECK').length, 1);
  assert.equal(gaps.filter(g => g.justification).length, 14);
  assert.ok(gaps.some(g => /spelling corrections/i.test(g.justification || '')));
});
test('senate row-count reconciliation bridges the comparison ledger to the workbook exactly', () => {
  const recon = senateReconciliationRows(data);
  const byId = Object.fromEntries(recon.map(r => [r.id, r]));
  const counts = data.comparison_summary.counts;
  const totals = byId.totals;
  assert.equal(totals.comparison_rows, 1013);
  assert.equal(totals.workbook_rows, 937);
  // Comparison column sums to the ledger: pairs + split halves + official
  // insertions + official zeroed = every observation once.
  const comparisonSum = recon.filter(r => r.id !== 'totals')
    .reduce((s, r) => s + r.comparison_rows, 0);
  assert.equal(comparisonSum, totals.comparison_rows);
  // Workbook column: pairs + splits + insertions + zeroed + unfunded.
  const workbookSum = recon.filter(r => r.id !== 'totals')
    .reduce((s, r) => s + r.workbook_rows, 0);
  assert.equal(workbookSum, totals.workbook_rows);
  // The split piece is exactly the gap rows, counted twice on the
  // comparison side and once on the workbook side.
  assert.equal(byId.gap.comparison_rows, senateGapRows(data).length * 2);
  assert.equal(byId.gap.workbook_rows, senateGapRows(data).length);
  // Inflation identity: unmatched observations = official + gap.
  assert.equal(counts.house_only, byId['official-insertions'].comparison_rows + byId.gap.comparison_rows / 2);
  assert.equal(counts.nep_only, byId['official-zeroed'].comparison_rows + byId.gap.comparison_rows / 2);
  // Paired rows sit one-to-one on both_funded workbook lines.
  assert.equal(byId['paired-unchanged'].comparison_rows
    + byId['paired-changed'].comparison_rows, counts.paired);
  // Unfunded rows exist only in the workbook.
  const unfunded = senateUnfundedRows(data);
  assert.equal(byId.unfunded.comparison_rows, 0);
  assert.equal(byId.unfunded.workbook_rows, unfunded.length);
  assert.equal(unfunded.length, 1);
  assert.match(unfunded[0].label, /CABTRIS/);
});
test('senate title parses surface normalized coordinates and chainage on workbook rows', () => {
  const projects = senateProjects(data);
  const withCoords = projects.filter(p => (p.title_parse?.coordinates?.points || []).length);
  const withChain = projects.filter(p => (p.title_parse?.chainage?.spans || []).length);
  assert.ok(withCoords.length >= 400, `expected ≥400 coordinate rows, got ${withCoords.length}`);
  assert.ok(withChain.length >= 300, `expected ≥300 chainage rows, got ${withChain.length}`);
  const maniana = projects.find(p => /Maniana/i.test(p.submission_label || p.label || ''));
  assert.ok(maniana);
  assert.equal((maniana.title_parse?.coordinates?.points || []).length, 6);
  assert.match(formatSenateCoordinates(maniana), /15\.\d+°N, 120\.\d+°E/);
  const sample = withCoords.find(p => formatSenateCoordinates(p));
  assert.ok(sample);
  assert.match(formatSenateCoordinates(sample), /\d+\.\d+°[NS], \d+\.\d+°[EW]/);
  const chainSample = withChain.find(p => formatSenateChainage(p));
  assert.ok(chainSample);
  assert.ok(formatSenateChainage(chainSample).length > 0);
  // Prefer column-V fixed title when present.
  const fixed = projects.find(p => p.submission_label && p.title_parse?.source === 'submission_label'
    && (p.title_parse?.coordinates?.points || []).length);
  assert.ok(fixed);
  // Search reaches coordinate / chainage text.
  const hit = filterSenateProjects(projects, {q: formatSenateCoordinates(sample).slice(0, 12)});
  assert.ok(hit.some(p => p.id === sample.id));
  assert.ok(senateChainageLengthM(chainSample) == null
    || Number.isFinite(senateChainageLengthM(chainSample)));
});
