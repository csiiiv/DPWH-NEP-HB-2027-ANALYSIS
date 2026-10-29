import test from 'node:test';
import assert from 'node:assert/strict';
import {exportExplorerCsv, exportExplorerJson, explorerExportFileName} from './explorerExport.js';

// Two representative explorer rows: one paired DPWH row with record views,
// one FMR-style row with flags and coordinates.
const rows = [
  {
    id: 'pair:ib:p18:r15:ib:p685:r5',
    title: 'Construction of Brgy. Tampac I FMR, Brgy. Tampac I, Guimba, Nueva Ecija',
    bucket: 'paired',
    statusLabel: 'Paired',
    flagLabels: ['Coordinate repair', 'Office discrepancy'],
    psgc_location: {chain: ['Guimba (municipality)', 'Nueva Ecija (province)']},
    assignment: {label: 'Title PSGC → district'},
    region: 'III',
    program: 'DPWH Regular',
    pap: null,
    house_office: 'NE-3 DEO',
    nep_office: 'NE-3 DEO',
    house_php: 50000000,
    nep_php: 50000000,
    delta_php: 0,
    house: {records: [{source_record_id: 'ib:p18:r15', pdf_page: 201}], source_pdf: 'HOUSE.pdf'},
    nep: {records: [{source_record_id: 'ib:p685:r5', pdf_page: 645}], source_pdf: 'NEP.pdf'},
    reading_status: 'third',
    trace: 'identity',
    coordinates: '120.8030109, 15.6682462',
    scope_review: false,
  },
  {
    id: 'nep_only:ib:p900:r1',
    title: 'Regravelling of Farm-to-Market Road, Somewhere, Elsewhere',
    bucket: 'inserted',
    statusLabel: 'NEP only',
    flagLabels: [],
    psgc_location: null,
    assignment: null,
    region: 'VII',
    program: null,
    house_office: null,
    nep_office: 'CV-7 DEO',
    house_php: null,
    nep_php: 25000000,
    delta_php: -25000000,
    house: null,
    nep: {records: [{source_record_id: 'ib:p900:r1', pdf_pages: [12, 13]}], source_pdf: 'NEP.pdf'},
    reading_status: null,
    trace: null,
    coordinates: null,
    scope_review: null,
  },
];

test('CSV has every heading, formula-safe cells and both rows', () => {
  const csv = exportExplorerCsv(rows, {lens: 'location', card: 'x', filters: {}});
  const lines = csv.split('\r\n');
  assert.ok(csv.startsWith('\ufeff'), 'BOM for Excel');
  assert.match(lines[0], /ID,Title,Bucket/);
  assert.match(lines[0], /HGAB3 source records/);
  assert.equal(lines.length, 3, 'heading + 2 rows');
  const first = lines[1];
  assert.match(first, /Tampac I FMR/);
  assert.match(first, /Coordinate repair; Office discrepancy/, 'flags joined');
  assert.match(first, /ib:p18:r15/, 'house evidence id');
  assert.match(first, /NEP\.pdf/, 'nep evidence pdf');
  // Formula injection guard: a title starting with = must be quoted-prefixed.
  const hostile = exportExplorerCsv([{...rows[0], title: '=SUM(A1:A9)'}], {});
  assert.match(hostile.split('\r\n')[1], /"'=SUM/);
});

test('NEP-only row exports empty house evidence and both PDF pages', () => {
  const csv = exportExplorerCsv(rows, {});
  const nepOnly = csv.split('\r\n')[2];
  assert.match(nepOnly, /NEP only/);
  assert.match(nepOnly, /12; 13/, 'multi-page evidence joined');
});

test('JSON carries provenance, counts and structured evidence', () => {
  const json = JSON.parse(exportExplorerJson(rows, {
    lens: 'location', card: 'location:title_psgc:leg:agusan-del-norte:lone',
    filters: {q: 'road', bucket: null, flag: null},
  }));
  assert.equal(json.schema_version, 1);
  assert.equal(json.row_count, 2);
  assert.equal(json.lens, 'location');
  assert.equal(json.filters.q, 'road');
  assert.equal(json.rows[0].evidence.house.source_ids, 'ib:p18:r15');
  assert.equal(json.rows[1].evidence.nep.pages, '12; 13');
  assert.deepEqual(json.rows[0].flags, ['Coordinate repair', 'Office discrepancy']);
  assert.equal(json.rows[0].house_php, 50000000);
});

test('file name slugs lens, card and active filters', () => {
  const name = explorerExportFileName({
    lens: 'location',
    card: 'location:title_psgc:leg:dinagat-islands:lone',
    filters: {q: null, bucket: 'paired', flag: null},
  }, 'csv');
  assert.match(name, /^location_/);
  assert.match(name, /dinagat-islands/, 'card ID survives into name');
  assert.match(name, /bucket-paired\.csv$/);
  assert.doesNotMatch(name, /null/, 'default filters are omitted');
});
