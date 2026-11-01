import test from 'node:test';
import assert from 'node:assert/strict';
import {mpbRecordMapOverlay, leftToRightOrder, mpbBoxIconImage} from './mpbSegmentOverlay.js';

test('mpb box icon is an opaque colored square', () => {
  const icon = mpbBoxIconImage('#2563eb', 32);
  assert.equal(icon.width, 32);
  assert.equal(icon.height, 32);
  assert.equal(icon.data.length, 32 * 32 * 4);
  // Center pixel should be solid brand blue.
  const mid = ((16 * 32) + 16) * 4;
  assert.equal(icon.data[mid], 0x25);
  assert.equal(icon.data[mid + 1], 0x63);
  assert.equal(icon.data[mid + 2], 0xeb);
  assert.equal(icon.data[mid + 3], 255);
});

test('leftToRightOrder starts at the westernmost point', () => {
  const a = [120.2, 15.1];
  const b = [120.0, 15.9];
  const c = [120.1, 14.0];
  assert.deepEqual(leftToRightOrder([a, b, c]), [b, c, a]);
});

test('mpb overlay links multi-point titles west to east', () => {
  const overlay = mpbRecordMapOverlay({
    id: 'row-z',
    title: 'Three-unit MPB',
    house_php: 1e6,
    nep_php: null,
    mpbPoints: [
      {lng: 120.2, lat: 15.0, stages: ['third'], issues: []},
      {lng: 120.0, lat: 15.5, stages: ['third'], issues: []},
      {lng: 120.1, lat: 14.5, stages: ['third'], issues: []},
    ],
  });
  assert.equal(overlay.points.features.length, 3);
  assert.equal(overlay.lines.features.length, 1);
  assert.equal(overlay.lines.features[0].properties.linkOrder, 'left_to_right');
  assert.deepEqual(overlay.lines.features[0].geometry.coordinates,
    [[120.0, 15.5], [120.1, 14.5], [120.2, 15.0]]);
});
