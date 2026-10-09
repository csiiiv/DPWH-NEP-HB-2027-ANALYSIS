import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceReference, treeSourceReference, retainedAssetUrl } from './data.js';

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
