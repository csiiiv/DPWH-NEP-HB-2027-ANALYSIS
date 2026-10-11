import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCHMARK_DIMENSIONS,
  BENCHMARK_SOURCES,
  outlierUnits,
  peerCohorts,
  peerDimensionValue,
  peerGroupKey,
  perKmBands,
  summarizeUnits,
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

test('DEO dimension groups peers by office and falls back to region', () => {
  const bulacan = unit({id: 'b1', office: 'Bulacan 1st District Engineering Office'});
  const pampanga = unit({id: 'p1', office: 'Pampanga 2nd District Engineering Office', region: 'Region III'});
  // Office-less units group under a "No recorded office · <region>" cohort.
  assert.equal(peerDimensionValue(bulacan, 'deo'), 'Bulacan 1st District Engineering Office');
  assert.equal(peerDimensionValue(unit(), 'deo'), 'No recorded office · Region III');
  assert.equal(peerDimensionValue(unit(), 'region'), 'Region III');
  const sameRegion = [bulacan, pampanga];
  assert.equal(peerCohorts(sameRegion, {minPeers: 1, dimension: 'region'}).length, 1);
  const deoCohorts = peerCohorts(sameRegion, {minPeers: 1, dimension: 'deo'});
  assert.equal(deoCohorts.length, 2); // same region, different districts
  assert.ok(deoCohorts.every(c => c.dimension === 'deo' && c.office));
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

test('outliers and cohort keys honor the DEO dimension end to end', () => {
  const office = 'Bulacan 1st District Engineering Office';
  // Six peers in the same DEO with spread per-km; the last is the outlier.
  const peers = [10, 12, 14, 16, 18, 60].map((m, i) => unit({id: `d${i}`, office, amount_php: m * 1_000_000}));
  const ranked = outlierUnits(peers, {minPeers: 5, dimension: 'deo'});
  assert.equal(ranked.length, 6);
  assert.equal(ranked[0].unit.id, 'd5');
  assert.equal(ranked[0].cohort.office, office);
  // Region cohorts ignore offices entirely: a different DEO in the same
  // region still pools with the others, but splits off under the DEO axis.
  const mixedOffices = [
    ...[10, 12, 14, 16, 18].map((m, i) => unit({id: `m${i}`, amount_php: m * 1_000_000, office})),
    unit({id: 'far', amount_php: 60_000_000, office: 'Samar 1st District Engineering Office'}),
  ];
  const regionRanked = outlierUnits(mixedOffices, {minPeers: 5, dimension: 'region'});
  assert.equal(regionRanked[0].unit.id, 'far'); // pools both regions (same default region field)
  const deoRanked = outlierUnits(mixedOffices, {minPeers: 5, dimension: 'deo'});
  assert.equal(deoRanked.length, 5); // far office cohort has 1 unit < minPeers → dropped
});

test('source filter and BENCHMARK_SOURCES stay coherent', () => {
  const units = [unit(), unit({source: 'hb3'}), unit({source: 'hb3', program: 'Other'})];
  assert.equal(peerCohorts(units, {source: 'hb3', minPeers: 1}).length, 2);
  assert.equal(peerCohorts(units, {source: 'nep', minPeers: 1}).length, 1);
  assert.ok(BENCHMARK_SOURCES.all && BENCHMARK_SOURCES.hb3);
  assert.ok(BENCHMARK_DIMENSIONS.region && BENCHMARK_DIMENSIONS.deo);
});

test('summarizeUnits tallies one row per source with measurable splits', () => {
  const units = [
    unit({id: 'a'}),                                          // nep, 10M/km measurable
    unit({id: 'b', source: 'hb3', length_m: null, point_only: true}), // hb3 point
    unit({id: 'c', source: 'hb3', length_review: 'absurd_unresolved'}), // hb3 measurable + review
  ];
  const rows = summarizeUnits(units);
  assert.deepEqual(rows.map(r => r.source), ['nep', 'hb3']); // ordered nep → hb2 → hb3
  const [nep, hb3] = rows;
  assert.equal(nep.units, 1);
  assert.equal(nep.measurable, 1);
  assert.equal(nep.points, 0);
  const nepLength = rows[0].length_m;
  assert.equal(nepLength, 1000);
  const hb3Row = rows[1];
  assert.equal(hb3Row.units, 2);
  assert.equal(hb3Row.measurable, 1); // point excluded, reviewed span counted
  assert.equal(hb3Row.points, 1);
  assert.equal(hb3Row.review, 1);
  // Source filter narrows to that source only.
  assert.deepEqual(summarizeUnits(units, {source: 'hb3'}).map(r => r.source), ['hb3']);
});

test('perKmBands tallies fixed peso bands with length and allocations', () => {
  const mk = (id, perKmM, km = 1) => unit({id, amount_php: perKmM * 1_000_000, length_m: km * 1000});
  const units = [
    mk('cheap', 0.5),        // < ₱1M
    mk('mid', 22),           // ₱10–25M
    mk('high', 60),          // ₱50–100M
    mk('insane', 2000),      // ₱100M+
    unit({id: 'point', length_m: null, point_only: true}), // unmeasurable
  ];
  const result = perKmBands(units);
  assert.equal(result.measurable, 4);
  assert.equal(result.unmeasurable, 1);
  const byLabel = Object.fromEntries(result.bands.map(b => [b.label, b]));
  assert.equal(byLabel['< ₱1M'].units, 1);
  assert.equal(byLabel['₱10–25M'].units, 1);
  assert.equal(byLabel['₱50–100M'].units, 1);
  assert.equal(byLabel['₱100M+'].units, 1);
  assert.equal(byLabel['₱10–25M'].amount_php, 22_000_000);
  // Boundaries: exactly ₱25M/km lands in the 25–50 band, not 10–25.
  const boundary = perKmBands([mk('edge', 25)]);
  assert.equal(boundary.bands.find(b => b.units === 1).label, '₱25–50M');
});
