import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  chainageExportFileName, exportChainageCsv, exportChainageJson,
} from './niaChainageExport.js';

test('chainage summary export covers simple and full scopes', () => {
  const rows = [{
    id: 'Roads', label: 'Roads', projects: 2, with_chainage: 1, chainage_share: 0.5,
    median: 10000, mean: 12000, p25: 8000, p75: 14000, min: 8000, max: 16000,
  }];
  const simpleCsv = exportChainageCsv(rows, {kind: 'summary', scope: 'simple', stage: 'nep', dim: 'category'});
  assert.match(simpleCsv, /Group/);
  assert.match(simpleCsv, /Median PHP per m/);
  assert.doesNotMatch(simpleCsv, /Mean PHP per m/);
  const fullCsv = exportChainageCsv(rows, {kind: 'summary', scope: 'full', stage: 'nep', dim: 'category'});
  assert.match(fullCsv, /Mean PHP per m/);
  assert.match(fullCsv, /Group id/);
  const json = JSON.parse(exportChainageJson(rows, {kind: 'summary', scope: 'full', stage: 'nep', dim: 'category'}));
  assert.equal(json.row_count, 1);
  assert.equal(json.rows[0].mean, 12000);
  assert.equal(chainageExportFileName({kind: 'summary', scope: 'simple', stage: 'nep', dim: 'category'}, 'csv'),
    'nia_chainage-summary_nep_category_simple.csv');
});

test('chainage project export keeps PDF citations on full scope only', () => {
  const rows = [{
    id: 'nep-1', senate_id: 'sen:r1', title: 'Road A annex',
    display_title: 'Road A fixed Sta. 0+000 – 0+100', submission_label: 'Road A fixed Sta. 0+000 – 0+100',
    ledger_title: 'Road A annex', funding_label: 'NEP+House', funding_scope: 'both_funded',
    workbook_status: 'both_funded', category: 'Roads', region: 'NCR',
    province: 'Metro Manila', subprogram_key: 'nis', program_group: 'RESTORE',
    chainage_spans: '0+000 – 0+100', chainage_length_m: 100, php_per_m: 5000,
    amount_php: 500000, has_location: true, location_basis: 'Title GPS',
    source: {source_pdf: 'dbm-other-nep-line-data/NIA.pdf', pdf_page: 3, printed_page: 1},
  }];
  const simple = exportChainageCsv(rows, {kind: 'projects', scope: 'simple', stage: 'nep', dim: 'category', group: 'Roads'});
  assert.match(simple, /Title \(fixed \/ submission\)/);
  assert.match(simple, /Road A fixed/);
  assert.match(simple, /Funding/);
  assert.match(simple, /NEP\+House/);
  assert.match(simple, /Map basis/);
  assert.doesNotMatch(simple, /Source id/);
  const full = exportChainageCsv(rows, {kind: 'projects', scope: 'full', stage: 'nep', dim: 'category', group: 'Roads'});
  assert.match(full, /Source id/);
  assert.match(full, /Annex print title/);
  assert.match(full, /Funding scope key/);
  assert.match(full, /NIA\.pdf/);
  const json = JSON.parse(exportChainageJson(rows, {kind: 'projects', scope: 'full', stage: 'nep', dim: 'category', group: 'Roads'}));
  assert.equal(json.rows[0].source.pdf_page, 3);
  assert.equal(json.rows[0].display_title, 'Road A fixed Sta. 0+000 – 0+100');
  assert.equal(json.rows[0].funding_label, 'NEP+House');
  assert.equal(json.group, 'Roads');
});

test('chainage outlier export covers Tukey side and whisker fences', () => {
  const rows = [{
    id: 'nep-9', title: 'Far CIS', group_id: 'Roads', group_label: 'Roads', side: 'high',
    funding_label: 'NEP Only', funding_scope: 'house_zeroed', workbook_status: 'house_zeroed',
    severity: 'extreme', fence_score: 34.5, median_ratio: 8,
    php_per_m: 100_000, median: 12_000, p25: 11_250, p75: 13_750, iqr: 2_500,
    whisker_low: 10_000, whisker_high: 14_000,
    chainage_length_m: 100, amount_php: 10_000_000, category: 'Roads', region: 'NCR',
    subprogram_key: 'nis', program_group: 'RESTORE',
    source: {source_pdf: 'dbm-other-nep-line-data/NIA.pdf', pdf_page: 4, printed_page: 2},
  }];
  const simple = exportChainageCsv(rows, {kind: 'outliers', scope: 'simple', stage: 'nep', dim: 'category'});
  assert.match(simple, /Title \(fixed \/ submission\)/);
  assert.match(simple, /Funding/);
  assert.match(simple, /NEP Only/);
  assert.match(simple, /Side/);
  assert.match(simple, /Severity/);
  assert.match(simple, /Fence score/);
  assert.match(simple, /Group whisker high/);
  assert.doesNotMatch(simple, /Source id/);
  const full = exportChainageCsv(rows, {kind: 'outliers', scope: 'full', stage: 'nep', dim: 'category'});
  assert.match(full, /Source id/);
  assert.match(full, /Annex print title/);
  assert.match(full, /Group median PHP per m/);
  assert.match(full, /Group IQR PHP per m/);
  assert.match(full, /NIA\.pdf/);
  const json = JSON.parse(exportChainageJson(rows, {kind: 'outliers', scope: 'full', stage: 'nep', dim: 'category'}));
  assert.equal(json.kind, 'outliers');
  assert.equal(json.rows[0].side, 'high');
  assert.equal(json.rows[0].severity, 'extreme');
  assert.equal(json.rows[0].funding_label, 'NEP Only');
  assert.equal(json.rows[0].fence_score, 34.5);
  assert.equal(json.rows[0].source.pdf_page, 4);
  assert.equal(chainageExportFileName({kind: 'outliers', scope: 'simple', stage: 'nep', dim: 'category'}, 'csv'),
    'nia_chainage-outliers_nep_category_simple.csv');
});
