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
    pdf: [
      {kind: 'house-third', label: 'HGAB3 · 3rd reading', page: 201},
      {kind: 'nep', label: 'DBM NEP', page: 645},
    ],
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
    pdf: [{kind: 'nep', label: 'DBM NEP', page: 12}, {kind: 'nep', label: 'DBM NEP', page: 13}],
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

test('simple scope exports exactly the requested columns and no more', () => {
  const csv = exportExplorerCsv(rows, {scope: 'simple'});
  const headings = csv.split('\r\n')[0].replace('\ufeff', '').split(',');
  assert.deepEqual(headings, [
    'Project Title', 'Bucket', 'Match Status', 'Analytic Flags', 'Region', 'Program',
    'NEP Office', 'HGAB3 Office', 'HGAB3 Value', 'NEP Value', 'DELTA PESO',
    'HGAB3 Source Page', 'NEP Source Page',
  ]);
  // Full-only fields must not leak into the shortlist.
  const first = csv.split('\r\n')[1];
  assert.doesNotMatch(first, /pair:ib:p18:r15/, 'record ids stay in Full');
  assert.doesNotMatch(first, /identity/, 'trace stays in Full');
  assert.match(first, /Tampac I FMR/, 'title survives');
  assert.match(first, /50000000/, 'amounts survive');
});

test('scope is echoed in JSON and defaults to full', () => {
  assert.equal(JSON.parse(exportExplorerJson(rows, {scope: 'simple'})).scope, 'simple');
  assert.equal(JSON.parse(exportExplorerJson(rows, {scope: 'full'})).scope, 'full');
  assert.equal(JSON.parse(exportExplorerJson(rows, {})).scope, 'full');
  const simple = JSON.parse(exportExplorerJson(rows, {scope: 'simple'})).rows[0];
  assert.deepEqual(Object.keys(simple).filter(k => k !== 'source_pages'), [
    'title', 'bucket', 'statusLabel', 'flags', 'region', 'program',
    'nep_office', 'house_office', 'house_php', 'nep_php', 'delta_php',
  ]);
  assert.equal(simple.evidence, undefined, 'simple drops the evidence blob');
  assert.equal(simple.id, undefined, 'simple drops the record id');
});

// The published Pages origin every exported citation must point at.
const PUBLISHED = 'https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS';

test('source citations split by ledger side, per scope', () => {
  const json = JSON.parse(exportExplorerJson(rows, {scope: 'simple'}));
  assert.deepEqual(json.rows[0].source_pages.house.pages, [201]);
  assert.deepEqual(json.rows[0].source_pages.nep.pages, [645]);
  assert.deepEqual(json.rows[1].source_pages.house, {pages: null, links: null},
    'NEP-only row has no house citation');
  assert.deepEqual(json.rows[1].source_pages.nep.pages, [12, 13]);

  // Each side links to its own volume with a page fragment.
  const linked = json.rows[0].source_pages;
  assert.equal(linked.house.links[0],
    `${PUBLISHED}/HB_BUDGET_3rd_reading/3-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-C%20.pdf#page=201`);
  assert.equal(linked.nep.links[0],
    `${PUBLISHED}/pdfs/NEP-2027-VOLUME-2B_OCR.pdf#page=645`);

  // The CSV keeps both NEP pages, one per line, so neither citation is lost.
  const nepOnly = exportExplorerCsv(rows, {scope: 'simple'}).split('\r\n')[2];
  assert.match(nepOnly, /#page=12\n[^"]*#page=13/, 'both NEP pages kept, one per line');
});

test('exported links are rooted at the published site, never the serving origin', () => {
  // A reader on the dev server or a tunnel must still get a link that works
  // from anywhere else, once the local server is gone.
  for (const href of [
    'http://127.0.0.1:5173/app/#congress',
    'http://localhost:4173/app/#congress',
    'https://test.simple-systems.dev/app/#congress',
    'https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#congress',
  ]) {
    globalThis.window = {location: {href}};
    const csv = exportExplorerCsv(rows, {scope: 'simple'});
    const json = exportExplorerJson(rows, {scope: 'full'});
    assert.ok(csv.includes(`${PUBLISHED}/pdfs/NEP-2027-VOLUME-2B_OCR.pdf#page=645`),
      `CSV link must be canonical when served from ${href}`);
    assert.ok(json.includes(`${PUBLISHED}/HB_BUDGET_3rd_reading/`),
      `JSON link must be canonical when served from ${href}`);
    // No local origin may leak into a file that outlives the session.
    for (const local of ['127.0.0.1', 'localhost:5173', 'localhost:4173', 'test.simple-systems.dev'])
      assert.ok(!csv.includes(local) && !json.includes(local),
        `${local} must never appear in an export`);
    delete globalThis.window;
  }
  // And with no window at all (a headless builder) the links are unchanged.
  assert.ok(exportExplorerCsv(rows, {scope: 'simple'}).includes(`${PUBLISHED}/pdfs/`),
    'canonical links need no browser global');
});

test('FMR-lens rows cite the FMR volumes, not the 3rd-reading ones', () => {
  const fmrRow = {
    ...rows[0],
    title: 'Farm-to-Market Road, Brgy. X',
    // fmrExplorerRow() replaces `pdf` wholesale with the FMR annex kinds, which
    // live in different physical volumes than the DPWH explorer cites.
    pdf: [{kind: 'fmr-house', label: 'House FMR annex', page: 88},
      {kind: 'fmr-nep', label: 'NEP FMR schedule', page: 42}],
  };
  const citation = JSON.parse(exportExplorerJson([fmrRow], {scope: 'simple'})).rows[0].source_pages;
  assert.deepEqual(citation.house.pages, [88]);
  assert.deepEqual(citation.nep.pages, [42]);
  assert.equal(citation.house.links[0],
    `${PUBLISHED}/HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf#page=88`,
    'house side points at the supplied FMR annex volume');
  assert.equal(citation.nep.links[0],
    `${PUBLISHED}/dbm-other-nep-line-data/FMR.pdf#page=42`,
    'NEP side points at the FMR schedule');
});

test('a page that cannot be cited is dropped rather than guessed or linked', () => {
  const odd = {...rows[0], pdf: [
    // A kind no ledger side claims: the export must not invent a side for it,
    // because attributing a page to the wrong document is worse than omitting it.
    {kind: 'unknown-volume', label: 'Unregistered', page: 5},
    // A non-positive page cannot exist in a PDF.
    {kind: 'nep', label: 'DBM NEP', page: 0},
    {kind: 'nep', label: 'DBM NEP', page: 1.5},
  ]};
  const citation = JSON.parse(exportExplorerJson([odd], {scope: 'simple'})).rows[0].source_pages;
  assert.deepEqual(citation.house, {pages: null, links: null},
    'an unclassified kind is never folded into the HGAB3 side');
  assert.deepEqual(citation.nep, {pages: null, links: null},
    'pages 0 and 1.5 are not citable');
  const csv = exportExplorerCsv([odd], {scope: 'simple'}).split('\r\n')[1];
  assert.equal(csv.split('","').slice(-2).join('|'), '|"', 'both source cells stay empty');
});

test('exported links never start a formula, so the injection guard stays intact', () => {
  const csv = exportExplorerCsv(rows, {scope: 'simple'});
  // A link cell must begin with the quote + h of https, never a quoting prime.
  for (const line of csv.split('\r\n').slice(1)) {
    const last = line.split('","').at(-1);
    assert.doesNotMatch(last, /^'"/, 'no formula guard applied to a URL cell');
  }
  assert.doesNotMatch(csv, /=HYPERLINK/, 'links are bare URLs, not spreadsheet formulas');
});

test('file name records the chosen scope', () => {
  const meta = {lens: 'location', card: 'dinagat-islands', filters: {}};
  assert.match(explorerExportFileName({...meta, scope: 'simple'}, 'csv'), /dinagat-islands_simple\.csv$/);
  assert.match(explorerExportFileName({...meta, scope: 'full'}, 'json'), /dinagat-islands_full\.json$/);
  assert.match(explorerExportFileName(meta, 'csv'), /dinagat-islands_full\.csv$/, 'defaults to full');
});
