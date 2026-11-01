import test from 'node:test';
import assert from 'node:assert/strict';
import {mpbRecordMapOverlay, leftToRightOrder, mpbBoxIconImage,
  mpbBadgeIconImage, mpbBadgeIconId} from './mpbSegmentOverlay.js';

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

// Minimal canvas stub: mpbBadgeIconImage only needs measureText/fillText and
// the final image dump, so record draws instead of rasterizing.
function stubCanvas() {
  const recorded = {fills: [], texts: []};
  const ctx = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    measureText: text => ({width: String(text).length * 10}),
    beginPath() {},
    roundRect() {},
    fill() { recorded.fills.push(this.fillStyle); },
    stroke() {},
    fillText: text => recorded.texts.push(String(text)),
    getImageData: () => ({data: new Uint8Array(1)}),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
  return {canvas, recorded};
}

test('mpb badge sprite stacks one colored tier per non-zero class', () => {
  const original = globalThis.document;
  const {canvas, recorded} = stubCanvas();
  globalThis.document = {createElement: () => canvas};

  try {
    const icon = mpbBadgeIconImage({house_only: 3, nep_only: 0, paired: 12});
    assert.equal(icon.width, 128);
    assert.equal(icon.height, 128);
    // Zero-count class draws no tier: two chips, not three.
    assert.deepEqual(recorded.texts, ['3', '12']);
    // Tier order follows the class vocabulary: House first, then pairs.
    const colors = recorded.fills;
    assert.deepEqual(colors, ['#2563eb', '#7c3aed']);
  } finally {
    globalThis.document = original;
  }
});

test('mpb badge icon ids are unique per count triple', () => {
  assert.equal(mpbBadgeIconId({house_only: 1, nep_only: 2, paired: 3}),
    'mpb-unmapped-badge-1-2-3');
  assert.notEqual(mpbBadgeIconId({house_only: 1, nep_only: 2, paired: 3}),
    mpbBadgeIconId({house_only: 3, nep_only: 2, paired: 1}));
});
