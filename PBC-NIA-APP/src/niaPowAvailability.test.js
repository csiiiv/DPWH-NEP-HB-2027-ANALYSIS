import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {filterPowCoverage, filterPowPackages, powMatchLabels, powSupportLabels, powSupportScale} from './niaPowAvailability.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pow = JSON.parse(readFileSync(
  join(root, 'analysis-nia/data/program_of_works/pow_availability.json'), 'utf8'));

test('POW availability artifact has schema and positive doc counts', () => {
  assert.equal(pow.schema_version, 1);
  assert.ok(pow.summary.packages > 0);
  assert.ok(pow.summary.total_docs > 0);
  assert.ok(pow.summary.senate_projects_with_docs > 0);
  assert.equal(pow.projects.length, pow.summary.senate_projects_with_docs);
  assert.equal(pow.coverage.length, pow.summary.senate_projects);
  assert.equal(
    pow.summary.senate_projects_with_docs + pow.summary.senate_projects_unsupported,
    pow.summary.senate_projects);
  for (const p of pow.projects) {
    assert.ok(p.doc_count >= 1, p.senate_id);
    assert.equal(p.doc_count, p.pdf_count + p.image_count);
  }
});

test('coverage splits supported and unsupported projects', () => {
  const supported = filterPowCoverage(pow.coverage, {powSupport: 'supported'});
  const unsupported = filterPowCoverage(pow.coverage, {powSupport: 'unsupported'});
  assert.equal(supported.length, pow.summary.senate_projects_with_docs);
  assert.equal(unsupported.length, pow.summary.senate_projects_unsupported);
  assert.ok(supported.every(p => p.supported && p.doc_count >= 1));
  assert.ok(unsupported.every(p => !p.supported && p.doc_count === 0));
  assert.ok(Object.keys(powSupportLabels).includes('supported'));
});

test('support scale exposes POW, photos, and none bars', () => {
  const scale = powSupportScale(pow.summary);
  assert.deepEqual(scale.map(r => r.id), ['pow', 'photos', 'none']);
  assert.equal(scale[0].count, pow.summary.senate_projects_with_pow);
  assert.equal(scale[1].count, pow.summary.senate_projects_with_photos);
  assert.equal(scale[2].count, pow.summary.senate_projects_unsupported);
  assert.ok(scale[0].count >= scale[1].count);
  assert.equal(
    filterPowCoverage(pow.coverage, {powSupport: 'pow'}).length,
    pow.summary.senate_projects_with_pow);
  assert.equal(
    filterPowCoverage(pow.coverage, {powSupport: 'photos'}).length,
    pow.summary.senate_projects_with_photos);
  assert.equal(
    filterPowCoverage(pow.coverage, {powSupport: 'none'}).length,
    pow.summary.senate_projects_unsupported);
});

test('filterPowCoverage respects region folder and match strength', () => {
  const car = filterPowCoverage(pow.coverage, {powRegion: 'CAR', powSupport: 'supported'});
  assert.ok(car.length >= 1);
  assert.ok(car.every(p => p.region === 'Cordillera Administrative Region' || p.region === 'CAR'));
  const strong = filterPowCoverage(pow.coverage, {powMatch: 'strong'});
  assert.ok(strong.every(p => p.match_strength === 'strong'));
  assert.ok(Object.keys(powMatchLabels).includes('strong'));
});

test('filterPowPackages search finds Consuelo package', () => {
  const hits = filterPowPackages(pow.packages, {q: 'consuelo'});
  assert.ok(hits.some(p => /consuelo/i.test(p.name)));
  assert.ok(hits.every(p => p.doc_count >= 1));
});
