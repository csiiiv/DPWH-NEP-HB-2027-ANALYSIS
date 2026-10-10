import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCHMARK_SOURCES,
  outlierUnits,
  peerCohorts,
  peerGroupKey,
  unitDeviation,
  unitPerKm,
} from './chainageBenchmark.js';

const unit = (over = {}) => ({
  id: 'u1', source: 'nep', reading: null,
  title: 'Sample road', title_base: 'sample road',
  program: 'Regular Infrastructure Program', pap: 'Roads',
  zone: 'non_fap', region: 'Region III', office: null,
  amount_php: 10_000_000, chainages: [], chainage_incomplete: null,
  length_review: null, length_m: 1000, point_only: false,
  ...over,
});

test('per-km and peer keys derive from unit fields', () => {
  assert.equal(unitPerKm(unit()), 10_000_000);           // 10M / 1km
  assert.equal(unitPerKm(unit({length_m: null, point_only: true})), null);
  assert.equal(unitPerKm(unit({amount_php: 0})), null);
  assert.equal(peerGroupKey(unit()), 'Regular Infrastructure Program|Region III|non_fap');
});

test('peer cohorts compute robust spread and rank outliers by |z|', () => {
  // Cohort of 6: 10M,10M,10M,10M,10M per-km and one 25M outlier.
  const peers = Array.from({length: 5}, (_, i) => unit({id: `p${i}`}));
  const crazy = unit({id: 'crazy', amount_php: 25_000_000});
  const units = [...peers, crazy, unit({program: 'Other', region: 'Visayas'})];
  const cohorts = peerCohorts(units, {minPeers: 5});
  assert.equal(cohorts.length, 1); // the 2-member cohort is below minPeers
  const cohort = cohorts[0];
  assert.equal(cohort.units, 6);
  assert.equal(cohort.median_per_km, 10_000_000);
  assert.equal(cohort.min_per_km, 10_000_000);
  assert.equal(cohort.max_per_km, 25_000_000);
  // MAD = 0 (5 of 6 values identical) → deviation null, not Infinity.
  assert.equal(unitDeviation(crazy, cohort), null);
  const ranked = outlierUnits(units, {minPeers: 5});
  assert.equal(ranked.length, 0); // degenerate cohort yields no z rows at all
  // A spread cohort does produce usable z-scores.
  const spread = [10, 12, 14, 16, 18, 60].map((m, i) => unit({id: `s${i}`, amount_php: m * 1_000_000}));
  const spreadCohort = peerCohorts(spread, {minPeers: 5})[0];
  const crazySpread = spread[5];
  const z = unitDeviation(crazySpread, spreadCohort);
  assert.ok(z > 2, `expected strong outlier z, got ${z}`);
  const rankedSpread = outlierUnits(spread, {minPeers: 5});
  assert.equal(rankedSpread[0].unit.id, 's5');
});

test('source filter and BENCHMARK_SOURCES stay coherent', () => {
  const units = [unit(), unit({source: 'hb3'}), unit({source: 'hb3', program: 'Other'})];
  assert.equal(peerCohorts(units, {source: 'hb3', minPeers: 1}).length, 2);
  assert.equal(peerCohorts(units, {source: 'nep', minPeers: 1}).length, 1);
  assert.ok(BENCHMARK_SOURCES.all && BENCHMARK_SOURCES.hb3);
});
