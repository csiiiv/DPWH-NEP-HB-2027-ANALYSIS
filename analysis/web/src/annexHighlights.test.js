import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildStageIndex, columnSum, controlArithmetic, isFlagged, isInterpreted} from './hfepModel.js';
import {allocationStats, candidateAggregates, comparisonRows} from './fmrModel.js';
import {hfepCategoryMovements, hfepColumnReconciliation, hfepControlEvidence, hfepHighlights, hfepHospitalPriorities} from './hfepHighlights.js';
import {fmrFundingGroups, fmrHighlights} from './fmrHighlights.js';

const load = name => JSON.parse(fs.readFileSync(new URL(`../../../other-analysis/data/${name}_workbench.json`, import.meta.url)));
const hfep = load('hfep'), fmr = load('fmr');
const rows = comparisonRows(fmr);

test('HFEP printed columns and categories reconcile the same change, with the NEP defect held separately', () => {
  const columns = hfepColumnReconciliation(hfep), categories = hfepCategoryMovements(hfep);
  const total = columns.find(r => r.id === 'total');
  assert.equal(total.delta_php, -4451000000);
  assert.equal(columns.filter(r => r.id !== 'total').reduce((s, r) => s + r.delta_php, 0), total.delta_php);
  assert.equal(categories.reduce((s, r) => s + r.delta_php, 0), total.delta_php);
  assert.equal(total.nep_residual_php, 140000);
  assert.equal(columns.find(r => r.id === 'medical_equipment').nep_residual_php, 140000);
  assert.ok(columns.every(r => r.house_residual_php === 0));
  assert.equal(categories.find(r => r.id === '3').delta_php, -6378000000);
  assert.equal(categories.find(r => r.id === '2').delta_php, 3130155000);
  const added = categories.find(r => r.id === '8');
  assert.equal(added.nep_php, null); // No invented printed zero.
  assert.equal(added.house_php, 202000000);
  assert.equal(added.delta_php, 202000000);
  assert.notEqual(categories.find(r => r.id === '5').nep.label, categories.find(r => r.id === '5').house.label);
});

test('HFEP internal control evidence reproduces all retained checks and all four columns', () => {
  const index = buildStageIndex(hfep.stages.house), controls = hfepControlEvidence(index);
  assert.equal(controls.length, hfep.stages.house.audit_summary.internal_control_checks);
  assert.equal(controls.length, 311);
  assert.ok(controls.every(c => c.max_difference_php === 0 && c.columns.length === 4 && c.source.pdf_page));
  assert.equal(controls.flatMap(c => c.columns).length, 1244);
  assert.ok(controls.some(c => c.columns.some(column => column.printed == null)));
  for (const control of controls) for (const column of control.columns)
    assert.equal(column.printed, control.amounts_php[column.column] ?? null);
  const root = controlArithmetic(index, hfep.stages.house.root.id);
  assert.equal(root.facilities, 513);
  assert.equal(root.columns.find(c => c.column === 'total').facility_sum, 10021659000);
});

test('Hospital-priority evidence retains both source populations and the opposing category movements', () => {
  const evidence = hfepHospitalPriorities(hfep);
  assert.deepEqual(evidence.categories.map(c=>c.id).sort(), ['2','3']);
  assert.equal(evidence.projects.nep.length, 236);
  assert.equal(evidence.projects.house.length, 254);
  assert.equal(columnSum(evidence.projects.nep,'total'), 11938094000);
  assert.equal(columnSum(evidence.projects.house,'total'), 8690249000);
  for (const side of ['nep','house']) {
    assert.equal(new Set(evidence.projects[side].map(f=>f.id)).size, evidence.projects[side].length);
    for (const category of evidence.categories)
      assert.equal(columnSum(evidence.projects[side].filter(f=>f.path_labels[1]===category[side].label),'total'),category[`${side}_php`]);
  }
  const story = hfepHighlights(hfep).find(c=>c.id==='hospital-priorities');
  assert.deepEqual(story.metrics.map(m=>m.value),[-6378000000,3130155000,-3247845000]);
  assert.ok(story.aliases.includes('agency-check'));
  assert.match(story.prompt,/access to care/);
  assert.match(story.limit,/do not establish a direct transfer/);
});

test('HFEP extraction highlight includes flagged and interpreted rows once, including unflagged dash readings', () => {
  const story = hfepHighlights(hfep).find(c => c.id === 'ocr-flags');
  assert.equal(story.projects.length, 19);
  assert.equal(story.projects.filter(isFlagged).length, 10);
  assert.equal(story.projects.filter(isInterpreted).length, 11);
  assert.equal(new Set(story.projects.map(f => f.id)).size, story.projects.length);
  assert.ok(story.projects.some(f => !isFlagged(f) && f.amount_lineage.some(r => r.rule === 'single_digit_dash_fragment_read_as_dash')));
  assert.ok(story.projects.every(f => isFlagged(f) || isInterpreted(f)));
  assert.equal(hfepHighlights(hfep).find(c => c.id === 'nep-defect').metrics.at(-1).value, 140000);
});

test('FMR program and regional bridges account for every candidate row and reconcile printed controls', () => {
  const cards = fmrHighlights(fmr, rows), groups = fmrFundingGroups(rows, fmr.regions);
  assert.equal(groups.reduce((s, g) => s + g.rows, 0), rows.length);
  assert.equal(groups.reduce((s, g) => s + g.net_delta_php, 0), 3628100000);
  for (const group of groups) {
    assert.equal(group.paired_delta_php + group.house_only_php - group.nep_only_php, group.net_delta_php);
    assert.equal(group.net_delta_php, fmr.regions.find(r => r.id === group.id).delta_php);
  }
  const regional = cards.find(c => c.id === 'regional-increase');
  assert.equal(regional.regions[0].id, 'IVA');
  assert.equal(candidateAggregates(regional.rows).net_delta_php, 776400000);
  assert.ok(regional.rows.every(r => r.region_key === 'IVA'));
  const changed = cards.find(c => c.id === 'amount-changes');
  assert.equal(changed.rows.length, 4);
  assert.equal(candidateAggregates(changed.rows).paired_delta_php, -45000000);
  const unmatched = cards.find(c => c.id === 'house-only');
  assert.equal(unmatched.rows.length, 355);
  assert.equal(candidateAggregates(unmatched.rows).house_only_php, 5969005000);
});

test('FMR coordinate highlights distinguish empty open review from retained interpretation history', () => {
  const cards = Object.fromEntries(fmrHighlights(fmr, rows).map(c => [c.id, c]));
  assert.equal(cards['nep-coordinates'].open.length, 0);
  assert.equal(cards['nep-coordinates'].history.length, 52);
  assert.deepEqual(cards['nep-coordinates'].projects, cards['nep-coordinates'].history);
  assert.equal(cards['house-coordinates'].open.length, 2);
  assert.equal(cards['house-coordinates'].history.length, 83);
  assert.deepEqual(cards['house-coordinates'].projects, cards['house-coordinates'].open);
  for (const side of ['nep', 'house']) {
    const story = cards[`${side}-segments`];
    assert.ok(story.projects.every(p => p.segment_count > 1));
    assert.equal(story.projects.length, fmr.stages[side].summary.multi_segment_projects);
    assert.equal(story.metrics.at(-1).value, allocationStats(story.projects).total);
    assert.ok(story.metrics.at(-1).value < story.projects.reduce((s, p) => s + p.amount_php * p.segment_count, 0));
  }
});

test('Highlight definitions keep source ledgers intact and provide substantive questions and scoped evidence', () => {
  const originalHfep = JSON.stringify(hfep), originalFmr = JSON.stringify(fmr);
  for (const card of [...hfepHighlights(hfep), ...fmrHighlights(fmr, rows)]) {
    assert.ok(card.actionLabel && card.prompt && card.takeaway && card.limit);
    assert.ok(card.metrics.every(m => m.value != null));
    assert.ok(['compare','nep','house'].includes(card.href));
  }
  hfepControlEvidence(buildStageIndex(hfep.stages.house));
  assert.equal(JSON.stringify(hfep), originalHfep);
  assert.equal(JSON.stringify(fmr), originalFmr);
});
