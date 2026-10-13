import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bandRows, buildStageIndex, columnAmount, controlArithmetic, facilityCsv, facilityScope, facilityStats,
  filterFacilities, flagLabel, isFlagged, isInterpreted, lineageLabel, matchesReviewCategory, nodePath,
  normalizationLabel, provenanceOptions, repeatedAmounts, reviewCategories, roundingLadder, scopeRows,
  comparisonIndex, filterComparisons, comparisonCsv,
  COMPONENT_COLUMNS, lineItemRecords, filterRecords, recordAggregates, recordsCsv,
} from './hfepModel.js';

// Tests run against the real built payload (prebuild regenerates it), plus a
// tiny synthetic stage for structural edge cases.
const payload = JSON.parse(fs.readFileSync(new URL('../../../other-analysis/data/hfep_workbench.json', import.meta.url), 'utf8'));
const house = buildStageIndex(payload.stages.house);
const nep = buildStageIndex(payload.stages.nep);

test('every HFEP browser source opens its annex volume at the printed page', () => {
  for (const [index, pdf, offset, first, last] of [
    [house, 'HB_BUDGET/2 - HB 10858 VOL IB.pdf', 20, 877, 893],
    [nep, 'dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf', 8, 727, 739],
  ]) {
    assert.equal(index.stage.preview_pdf, pdf);
    for (const [id, node] of index.byId) {
      assert.equal(node.source.source_pdf, pdf, id);
      assert.equal(node.source.pdf_page, node.source.printed_page + offset, id);
      assert.ok(node.source.pdf_page >= first && node.source.pdf_page <= last, id);
    }
  }
});

const synthetic = () => buildStageIndex({
  key: 'syn', label: 'Synthetic annex', preview_pdf: 'syn.pdf', root: {id: 'r', label: 'Program', amounts_php: {total: 300}, source: {}},
  grand_total: {id: 'gt', label: 'Grand Total', amounts_php: {total: 300}, source: {}},
  categories: [{id: 'c1', label: 'Cat A', amounts_php: {total: 300}, child_ids: ['s1'], source: {}}],
  subcategories: [{id: 's1', label: 'Sub A', parent_id: 'c1', amounts_php: {total: 300}, child_ids: ['rg1'], source: {}}],
  regions: [{id: 'rg1', label: 'Region I', parent_id: 's1', amounts_php: {total: 300}, child_ids: ['pv1'], source: {}}],
  provinces: [{id: 'pv1', label: 'Prov A', parent_id: 'rg1', amounts_php: {total: 300}, facility_ids: ['f1', 'f2'], source: {}}],
  facilities: [
    {id: 'f1', stage: 'syn', title: 'Alpha BHS', path_labels: ['Program', 'Cat A', 'Sub A', 'Region I', 'Prov A', 'Alpha BHS'], parent_id: 'pv1',
      amounts_php: {total: 100, infrastructure: 100}, amounts_raw: {total: '100'}, flags: [], normalizations: [], amount_lineage: [],
      source: {source_pdf: 'syn.pdf', pdf_page: 1, printed_page: 1, row_id: 'f1'}},
    {id: 'f2', stage: 'syn', title: 'Beta Hospital =start', path_labels: ['Program', 'Cat A', 'Sub A', 'Region I', 'Prov A', 'Beta Hospital =start'], parent_id: 'pv1',
      amounts_php: {total: 200, medical_equipment: 200}, amounts_raw: {total: '200', infrastructure: '='}, flags: [{flag: 'ocr_suspect_label', id: 'x', note: 'typo'}],
      normalizations: [{type: 'label_whitespace_collapse'}], amount_lineage: [{column: 'motor_vehicle', rule: 'derived_from_row_identity_total_minus_components', raw: '=', interpreted: '0'}],
      source: {source_pdf: 'syn.pdf', pdf_page: 1, printed_page: 1, row_id: 'f2'}},
  ],
  facility_ledger: {total: 300}, annex_control: {total: 300}, printed_defects: [], audit_summary: {},
});

test('stage index is an exact partition: every node reachable, facilities once', () => {
  const index = synthetic();
  const seen = [];
  const walk = id => {const n = index.byId.get(id); seen.push(id); n.children.forEach(walk);};
  walk(index.stage.root.id);
  assert.equal(seen.length, index.byId.size - 1); // grand total excluded from root walk
  assert.equal(index.rollup.get(index.stage.root.id).count, 2);
  assert.equal(index.rollup.get('pv1').amounts_php.total, 300);
  assert.equal(index.rollup.get('r').amounts_php.infrastructure, 100);
  assert.equal(index.rollup.get('r').amounts_php.medical_equipment, 200);
});

test('control arithmetic balances the synthetic annex on every column', () => {
  const arithmetic = controlArithmetic(synthetic(), 'r');
  assert.equal(arithmetic.columns.find(c => c.column === 'total').status, 'balanced');
  assert.equal(arithmetic.columns.find(c => c.column === 'total').facility_sum, 300);
  assert.equal(arithmetic.columns.find(c => c.column === 'infrastructure').printed, 0); // unprinted root component reads 0
});

test('the documented NEP ₱140,000 defect chain is classified, not a review finding', () => {
  const chain = controlArithmetic(nep, 'nep_hfep:p1:title');
  const med = chain.columns.find(c => c.column === 'medical_equipment');
  assert.equal(med.difference, 140000);
  assert.equal(med.status, 'documented');
  assert.equal(med.defect, 'metro_manila_med_overhang_140000');
  const infra = chain.columns.find(c => c.column === 'infrastructure');
  assert.equal(infra.status, 'balanced');
  // Every non-defect node on both stages balances on every column.
  for (const index of [house, nep]) for (const [id, node] of index.byId) {
    if (node.kind === 'facility') continue;
    const columns = controlArithmetic(index, id).columns;
    for (const c of columns) assert.ok(['balanced', 'documented'].includes(c.status), `${id} ${c.column} ${c.status}`);
  }
});

test('facility scope reads the five-level path; paths start at the program root', () => {
  const facility = nep.stage.facilities[0];
  const scope = facilityScope(nep, facility);
  assert.deepEqual(Object.keys(scope), ['category', 'subcategory', 'region', 'province']);
  assert.equal(scope.region, facility.path_labels[3]);
  assert.equal(nodePath(nep, facility.id).map(n => n.kind).join(','),
    'root,category,subcategory,region,province,facility');
});

test('status axes stay separate: flags, interpretation, and clean rows', () => {
  const index = synthetic();
  const [f1, f2] = index.stage.facilities;
  assert.equal(isFlagged(f1), false);
  assert.equal(isInterpreted(f1), false);
  assert.equal(isFlagged(f2), true);   // flag axis
  // The label normalization makes f2 interpreted even though its only amount
  // lineage is the routine row-identity derivation.
  assert.equal(isInterpreted(f2), true);
  const routineOnly = {...f2, normalizations: []};
  assert.equal(isInterpreted(routineOnly), false);
  const weird = {...f2, normalizations: [], amount_lineage: [{column: 'total', rule: 'unparseable'}]};
  assert.equal(isInterpreted(weird), true);
});

test('filters compose without mutating the ledger and keep counts by grain', () => {
  const index = synthetic();
  const all = index.stage.facilities;
  assert.deepEqual(filterFacilities(all, {q: 'alpha'}).map(f => f.id), ['f1']);
  assert.deepEqual(filterFacilities(all, {region: 'Region I'}).length, 2);
  assert.deepEqual(filterFacilities(all, {flag: 'ocr_suspect_label'}).map(f => f.id), ['f2']);
  assert.deepEqual(filterFacilities(all, {lineage: 'label_whitespace_collapse'}).map(f => f.id), ['f2']);
  assert.deepEqual(filterFacilities(all, {minAmount: '150'}).map(f => f.id), ['f2']);
  assert.deepEqual(filterFacilities(all, {status: 'clean'}).map(f => f.id), ['f1']);
  assert.equal(all.length, 2);
  // Search covers flags, lineage and hierarchy labels.
  assert.equal(filterFacilities(all, {q: 'ocr_suspect'}).length, 1);
  assert.equal(filterFacilities(all, {q: 'Sub A'}).length, 2);
});

test('provenance option lists and review categories count the population in view', () => {
  const index = synthetic();
  const options = provenanceOptions(index.stage.facilities);
  assert.deepEqual(options.flags, [['ocr_suspect_label', 1]]);
  assert.ok(options.rules.some(([id, count]) => id === 'label_whitespace_collapse' && count === 1));
  const categories = reviewCategories(index.stage.facilities);
  assert.ok(categories.some(c => c.id === 'flag:ocr_suspect_label' && c.count === 1));
  const f2 = index.stage.facilities[1];
  assert.equal(matchesReviewCategory(f2, 'flag:ocr_suspect_label'), true);
  assert.equal(matchesReviewCategory(f2, 'rule:label_whitespace_collapse'), true);
  assert.equal(matchesReviewCategory(f2, null), true);
  assert.equal(matchesReviewCategory(index.stage.facilities[0], null), false);
});

test('regional scope rows aggregate facilities by label across subcategory blocks', () => {
  const rows = scopeRows(nep, 'region');
  assert.equal(rows.length, 18);
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  assert.equal(total, columnAmount(nep.stage.facility_ledger, 'total'));
  const car = rows.find(r => r.label === 'CAR');
  assert.equal(car.count, car.facilities?.length ?? car.count);
});

test('allocation stats: bands partition, ladder shares sum to one, repeats need five', () => {
  const facilities = nep.stage.facilities;
  for (const row of bandRows(facilities))
    for (const f of facilities) {
      const v = columnAmount(f.amounts_php, 'total');
      const inThisBand = v >= row.min && v < row.max;
      assert.equal(filterFacilities([f], {minAmount: String(row.min), maxAmount: String(row.max)}).length > 0, inThisBand);
    }
  assert.equal(Math.abs(roundingLadder(facilities).reduce((s, r) => s + r.share, 0) - 1) < 1e-9, true);
  assert.equal(repeatedAmounts(facilities, 5).every(r => r.facilities >= 5), true);
  const stats = facilityStats(facilities);
  assert.equal(stats.count, facilities.length);
  assert.equal(stats.total, columnAmount(nep.stage.facility_ledger, 'total'));
});

test('CSV export keeps raw marks, provenance and the formula-injection guard', () => {
  const index = synthetic();
  const csv = facilityCsv(index.stage.facilities, index);
  const lines = csv.split('\r\n').filter(Boolean);
  assert.equal(lines.length, 3);
  assert.ok(csv.startsWith('\uFEFF'));
  const row = lines[2]; // f2 carries "=" raw cells and mid-title equals mark
  assert.ok(row.includes('Beta Hospital =start'), 'mid-title equals mark kept as-is');
  assert.ok(row.includes("'="), 'raw "=" dash mark escaped for spreadsheet safety');
  assert.ok(row.includes('ocr_suspect_label:x'));
  assert.ok(row.includes('motor_vehicle:derived_from_row_identity_total_minus_components'));
  assert.ok(row.includes('label_whitespace_collapse'));
  // A leading formula character in a title would be escaped by the shared guard.
  const hostile = facilityCsv([{...index.stage.facilities[0], title: '=HYPERLINK("x")'}], index);
  assert.ok(hostile.includes("'=HYPERLINK"), 'leading formula guard applied');
});

test('labels resolve known vocabulary and fall back for unknown ids', () => {
  assert.equal(flagLabel('ocr_suspect_label'), 'OCR-suspect label');
  assert.equal(lineageLabel('derived_from_row_identity_total_minus_components'), 'Derived: total − components');
  assert.equal(normalizationLabel('label_whitespace_collapse'), 'Label whitespace collapsed');
  assert.equal(flagLabel('future_flag'), 'future flag');
});

test('real payload: both stage indexes partition and the ledgers reconcile', () => {
  for (const [index, ledgerTotal] of [[house, 10021659000], [nep, 14472519000]]) {
    assert.equal(index.rollup.get(index.stage.root.id).amounts_php.total, ledgerTotal);
    assert.equal(index.rollup.get(index.stage.grand_total.id).count, index.stage.facilities.length);
  }
  assert.equal(house.stage.facilities.length, 513);
  assert.equal(nep.stage.facilities.length, 464);
});

test('comparison: pairs are unique, scoped and never alter either ledger', () => {
  const comparison = comparisonIndex(payload);
  assert.equal(comparison.counts.pairs, 341);
  assert.equal(comparison.counts.pairs + comparison.counts.house_only, house.stage.facilities.length);
  assert.equal(comparison.counts.pairs + comparison.counts.nep_only, nep.stage.facilities.length);
  assert.equal(new Set(comparison.rows.map(r => r.house.id)).size, comparison.rows.length);
  assert.equal(new Set(comparison.rows.map(r => r.nep.id)).size, comparison.rows.length);
  // Every pair sits in one region/province block and carries a score ≥ 0.95.
  for (const row of comparison.rows) {
    assert.ok(row.similarity >= 0.95);
    assert.equal(row.house_scope.region, row.nep_scope.region);
    assert.equal(row.house_scope.province, row.nep_scope.province);
    // Per-column deltas conserve the row identity on both sides, and the
    // event classifies the record grain: blank cells never fake a zero delta.
    for (const column of ['infrastructure', 'medical_equipment', 'motor_vehicle', 'total']) {
      const h = columnAmount(row.house.amounts_php, column);
      const n = columnAmount(row.nep.amounts_php, column);
      const cell = row.columns[column];
      if (h == null || n == null) assert.equal(cell.difference, null);
      else assert.equal(cell.difference, n - h);
      assert.equal(cell.event, h == null && n == null ? 'none' : h == null ? 'added'
        : n == null ? 'dropped' : h === n ? 'same' : 'revised');
    }
    // "Changed" now means a printed component record was revised; a total
    // that differs only via column switches must NOT count as changed.
    assert.equal(row.changed, ['infrastructure', 'medical_equipment', 'motor_vehicle']
      .some(c => row.columns[c].event === 'revised'));
  }
  // Column totals reconcile to the printed controls.
  assert.equal(comparison.column_totals.total.house_php, 10021659000);
  assert.equal(comparison.column_totals.total.nep_php, 14472659000);
  assert.equal(comparison.column_totals.total.difference_php, 4451000000);
});

test('comparison: unmatched rows stay whole and reconcile with counts', () => {
  const comparison = comparisonIndex(payload);
  const {house_only_rows, nep_only_rows, counts, rows} = comparison;
  assert.equal(house_only_rows.length, counts.house_only);
  assert.equal(nep_only_rows.length, counts.nep_only);
  // No row appears both paired and unmatched; scopes are resolved.
  const pairedHouse = new Set(rows.map(r => r.house.id));
  for (const row of house_only_rows) {
    assert.ok(!pairedHouse.has(row.id));
    assert.equal(typeof row.scope.region, 'string');
  }
  // Insertion/deletion headline arithmetic: allocations sum from the rows.
  assert.equal(house_only_rows.reduce((s, r) => s + (columnAmount(r.amounts_php, 'total') || 0), 0),
    house_only_rows.reduce((s, r) => s + (r.amounts_php.total || 0), 0));
});

test('comparison: filters and CSV keep the review workflow honest', () => {
  const comparison = comparisonIndex(payload);
  const changed = filterComparisons(comparison.rows, {changed: 'changed'});
  assert.equal(changed.length, comparison.rows.filter(r => r.changed).length);
  assert.ok(changed.length > 0 && changed.length < comparison.rows.length);
  assert.equal(filterComparisons(comparison.rows, {changed: 'same'}).length,
    comparison.rows.length - changed.length);
  // Region filter matches either side of the pair.
  const region = comparison.rows[0].house_scope.region;
  assert.ok(filterComparisons(comparison.rows, {region}).length >= 1);
  // Search spans both titles and scope labels.
  assert.ok(filterComparisons(comparison.rows, {q: region.toLowerCase()}).length >= 1);
  // CSV carries ids, scope and every delta column.
  const csv = comparisonCsv(comparison.rows);
  const header = csv.split('\r\n')[0];
  for (const column of ['similarity', 'house_id', 'nep_id', 'delta_total_php']) {
    assert.ok(header.includes(column), column);
  }
  assert.equal(csv.trimEnd().split('\r\n').length - 1, comparison.rows.length);
});

test('line-item records: grain, events and the conservation bridge', () => {
  const comparison = comparisonIndex(payload);
  const records = lineItemRecords(comparison);
  const aggregates = recordAggregates(records);
  // Every record is a component cell (never the total column) with a value on
  // at least one side, and matched-pair records classify into an event.
  for (const r of records) {
    assert.ok(['infrastructure', 'medical_equipment', 'motor_vehicle'].includes(r.column));
    assert.ok(['revised', 'added', 'dropped', 'same', 'unmatched'].includes(r.event));
    assert.ok(r.house_value != null || r.nep_value != null);
  }
  // Record counts by event from the retained FY2027 ledgers (after repairing
  // the Clark OCR garble and matching short-path NEP categories by path tail).
  assert.equal(aggregates.byEvent.revised.count, 82);
  assert.equal(aggregates.byEvent.added.count, 58);
  assert.equal(aggregates.byEvent.dropped.count, 17);
  assert.equal(aggregates.byEvent.same.count, 281);
  assert.equal(aggregates.byEvent.unmatched.count, 387);
  // Conservation bridge: revised net + added − dropped equals the total-column
  // movement on matched pairs.
  assert.equal(aggregates.bridge.total_net, 180122000);
  // The West Visayas pair must NOT classify as revised: House infra ₱200M vs
  // NEP med-equip ₱100M is one dropped + one added record, not a revision.
  const wvsu = comparison.rows.find(r => r.house.title.startsWith('West Visayas State University Medical Center'));
  assert.ok(wvsu && !wvsu.changed);
  assert.equal(wvsu.columns.infrastructure.event, 'dropped');
  assert.equal(wvsu.columns.medical_equipment.event, 'added');
  // Clark Multi-Specialty was OCR-garbled as "cYao 80,000,000 。" on NEP p9;
  // after repair it pairs with the House counterpart and revises infrastructure.
  const clark = comparison.rows.find(r => r.nep.id === 'nep_hfep:p9:r37');
  assert.ok(clark);
  assert.match(clark.nep.title, /Clark Multi-Specialty Medical Center/);
  assert.equal(clark.columns.infrastructure.event, 'revised');
  assert.equal(clark.columns.infrastructure.difference, 50000000);
  // Filters narrow by event, column and search; CSV exports carry sources.
  assert.equal(filterRecords(records, {event: 'revised'}).length, 82);
  assert.ok(filterRecords(records, {column: 'medical_equipment'}).length > 0);
  assert.ok(filterRecords(records, {q: 'navotas'}).every(r => r.title.toLowerCase().includes('navotas')));
  const recordCsv = recordsCsv(records);
  assert.equal(recordCsv.trimEnd().split('\r\n').length - 1, records.length);
  assert.ok(recordCsv.split('\r\n')[0].includes('house_pdf_page'));
});
