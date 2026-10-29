import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceReference, treeSourceReference, retainedAssetUrl, pdfSourceFromUrl, publishedSourceLink } from './data.js';

test('tree and project references preserve different House volumes under project hosting', () => {
  globalThis.window = {location: {href: 'https://example.test/project/app/#house'}};
  const tree = treeSourceReference('house', {label: 'Branch', source: {pdf_page: 13}});
  assert.equal(tree.url, 'https://example.test/project/HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf');
  assert.equal(tree.page, 13);
  assert.match(sourceReference('house', 942).url, /VOL%20IC\.pdf$/);
  assert.equal(treeSourceReference('nep', {label: 'Branch', source: {pdf_page: 132}}).url,
    'https://example.test/project/pdfs/NEP-2027-VOLUME-2B_OCR.pdf');
  for (const page of [null, 0, -1, 1.5, '8']) assert.equal(treeSourceReference('house', {source: {pdf_page: page}}), null);
  assert.equal(treeSourceReference('transparency', {source: {pdf_page: 8}}), null);
  assert.equal(treeSourceReference('nep', {label: 'Derived'}), null);
});
test('source assets resolve centrally without preserving obsolete checkout URL prefixes', () => {
  globalThis.window = {location: {href: 'https://example.test/project/app/#nep'}};
  assert.equal(retainedAssetUrl('../data/source_review_evidence/p132-r10.webp'),
    'https://example.test/project/analysis/source_review_evidence/p132-r10.webp');
  assert.equal(retainedAssetUrl('../../dpwh-transparency-nep-data/json/fy2027-combined.json'),
    'https://example.test/project/analysis/fy2027-combined.json');
  assert.equal(retainedAssetUrl('../docs/nep_2027_source_audit.md#scope'),
    'https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/analysis/docs/nep_2027_source_audit.md#scope');
});

test('each House reading opens its own I-C PDF under the project prefix', () => {
  globalThis.window = {location: {href: 'https://example.test/project/app/#compare?view=readings'}};
  const second = sourceReference('house-second', 323);
  const third = sourceReference('house-third', 323);
  assert.match(second.url, /project\/HB_BUDGET\//);
  assert.match(third.url, /project\/HB_BUDGET_3rd_reading\//);
  assert.equal(third.document, 'House 3rd reading · Volume I-C');
  assert.notEqual(second.url, third.url);
});

test('page labels identify the volume and reading without renumbering file pages', () => {
  globalThis.window = {location: {href: 'https://example.test/project/app/#compare'}};
  assert.equal(sourceReference('house', 373).pageLabel, 'House 2nd · I-C');
  assert.equal(sourceReference('house-third', 373).pageLabel, 'House 3rd · I-C');
  assert.equal(treeSourceReference('house', {source: {pdf_page: 25}}).pageLabel, 'House 2nd · I-B');
  assert.equal(sourceReference('nep', 688).pageLabel, 'NEP · II-B (retained OCR)');
  assert.equal(sourceReference('house-third', 373).page, 373);
});

test('PDF anchors preserve document, stage and file page for the shared modal', () => {
  globalThis.window = {location: {href: 'https://example.test/project/app/#highlights'}};
  const reference = sourceReference('house-third-controls', 9);
  const source = pdfSourceFromUrl(reference.url + '#page=9', 'Agency control');
  assert.equal(source.page, 9);
  assert.equal(source.document, reference.document);
  assert.equal(source.url, reference.url);
  assert.equal(source.title, 'Agency control');
  assert.equal(pdfSourceFromUrl('../pdfs/NEP-2027-VOLUME-2B_OCR.pdf#page=424').page, 424);
  for (const suffix of ['', '#page=0', '#page=-1', '#page=1.5', '#page=no'])
    assert.equal(pdfSourceFromUrl(reference.url + suffix).page, 1);
  assert.equal(pdfSourceFromUrl('https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/blob/main/dbm-nep-data/NEP-2027-VOLUME-1_OCR.pdf').url,
    'https://raw.githubusercontent.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/main/dbm-nep-data/NEP-2027-VOLUME-1_OCR.pdf');
  for (const value of ['#highlights', 'https://example.test/a.json', 'javascript:alert(1)', 'data:application/pdf;base64,AAA'])
    assert.equal(pdfSourceFromUrl(value), null);
});

// Exported citations must survive the session they were made in, so they are
// rooted at the published site rather than at whatever origin served the app.
const PUBLISHED = 'https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS';

test('published source links ignore the serving origin and anchor the page', () => {
  for (const href of ['http://127.0.0.1:5173/app/#congress', 'http://localhost:4173/app/#congress',
    'https://test.simple-systems.dev/app/#congress']) {
    globalThis.window = {location: {href}};
    assert.equal(publishedSourceLink('house-third', 201),
      `${PUBLISHED}/HB_BUDGET_3rd_reading/3-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-C%20.pdf#page=201`,
      `dev origin ${href} must not leak into an exported link`);
    assert.equal(publishedSourceLink('nep', 645),
      `${PUBLISHED}/pdfs/NEP-2027-VOLUME-2B_OCR.pdf#page=645`);
  }
  // Each stage keeps its own volume, including the FMR annex pair.
  assert.equal(publishedSourceLink('house-second', 323),
    `${PUBLISHED}/HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf#page=323`);
  assert.equal(publishedSourceLink('fmr-house', 88),
    `${PUBLISHED}/HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf#page=88`);
  assert.equal(publishedSourceLink('fmr-nep', 42),
    `${PUBLISHED}/dbm-other-nep-line-data/FMR.pdf#page=42`);
  // Uncitable inputs return null so callers can degrade instead of emitting a
  // link that 404s or lands on the wrong page.
  for (const page of [null, 0, -1, 1.5, '8', undefined])
    assert.equal(publishedSourceLink('nep', page), null);
  for (const kind of ['api', 'unknown-volume', null, undefined])
    assert.equal(publishedSourceLink(kind, 12), null, `${kind} has no published page link`);
});

test('published links point into the packaged site, so the PDFs are really served', async () => {
  // The registry and the Pages package must agree; a link to a document the
  // deploy never copies is a 404 in a reader's spreadsheet.
  const {existsSync} = await import('node:fs');
  const root = new URL('../../', import.meta.url);
  const site = new URL('_site/', root);
  if (!existsSync(site)) return; // packaging is a build step; skip when absent
  for (const link of ['house-tree', 'house-projects', 'house-third-controls',
    'house-third', 'nep', 'fmr-house', 'fmr-nep'].map(kind => publishedSourceLink(kind, 1))) {
    assert.ok(link, 'every registered document must produce a link');
    const path = decodeURIComponent(link.replace(`${PUBLISHED}/`, '').split('#')[0]);
    assert.ok(existsSync(new URL(path, site)), `packaged site must serve ${path}`);
  }
});
