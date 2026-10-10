import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chainageAmendment,
  chainageSideDetail,
  formatChainageSpans,
  formatSignedKm,
  formatSignedPct,
  totalLengthM,
} from './chainageDisplay.js';

test('chainage spans and lengths format for NEP → HGAB review', () => {
  assert.equal(totalLengthM([{length_m: 527}, {length_m: 100}]), 627);
  assert.equal(formatChainageSpans([{from: 'K0041+827', to: 'K0042+354'}]), 'K0041+827 – K0042+354');
  assert.equal(formatSignedKm(1200), '+1.20 km');
  assert.equal(formatSignedKm(-64), '−0.06 km');
  assert.equal(formatSignedKm(0), '0.00 km');
  assert.equal(formatSignedPct(-10.829), '−10.8%');

  const summary = chainageAmendment({
    nep: {chainages: [{kind: 'K', from: 'K0042+000', to: 'K0042+591', length_m: 591}]},
    third: {chainages: [{kind: 'K', from: 'K0041+827', to: 'K0042+354', length_m: 527}]},
  });
  assert.equal(summary.direction, 'down');
  assert.equal(summary.deltaKm, '−0.06 km');
  assert.equal(summary.deltaPct, '−10.8%');
  assert.equal(summary.nepSpans, 'K0042+000 – K0042+591');
  assert.equal(summary.houseSpans, 'K0041+827 – K0042+354');
  assert.equal(summary.nepLengthKm, '0.59 km');
  assert.equal(summary.houseLengthKm, '0.53 km');

  const nep = {chainages: [{from: 'K0042+000', to: 'K0042+591', length_m: 591}]};
  const house = {chainages: [{from: 'K0041+827', to: 'K0042+354', length_m: 527}]};
  assert.equal(chainageSideDetail(nep).deltaKm, null);
  const houseCell = chainageSideDetail(house, nep, {withDelta: true});
  assert.equal(houseCell.deltaKm, '−0.06 km');
  assert.equal(houseCell.deltaPct, '−10.8%');

  const nepPoint = {chainages: [{point: true, from: 'K0096+090', to: 'K0096+090', meters_from: 96090, length_m: null}]};
  const housePoint = {chainages: [{point: true, from: 'K0095+075', to: 'K0095+075', meters_from: 95075, length_m: null}]};
  assert.equal(formatChainageSpans(nepPoint.chainages), 'K0096+090');
  const shift = chainageSideDetail(housePoint, nepPoint, {withDelta: true});
  assert.equal(shift.deltaKind, 'station');
  assert.equal(shift.deltaKm, '−1.01 km');
  assert.equal(shift.deltaPct, null);
  assert.equal(shift.lengthKm, null);
});
