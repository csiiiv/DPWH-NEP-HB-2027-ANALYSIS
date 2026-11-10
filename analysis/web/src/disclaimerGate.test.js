import test from 'node:test';
import assert from 'node:assert/strict';
import {DISCLAIMER_ACK_KEY, DISCLAIMER_ACK_VALUE, acknowledgeDisclaimer, disclaimerAcknowledged} from './disclaimerGate.js';

test('a first visit requires acknowledgement; reloading after acknowledgement does not', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  assert.equal(disclaimerAcknowledged(storage), false);
  assert.equal(acknowledgeDisclaimer(storage), true);
  assert.equal(disclaimerAcknowledged(storage), true);
  assert.equal(values.size, 1);
  assert.equal(values.get(DISCLAIMER_ACK_KEY), DISCLAIMER_ACK_VALUE);
});

test('old values and other workbenches do not suppress a versioned disclaimer', () => {
  const values = new Map([[DISCLAIMER_ACK_KEY, 'old'], ['fy2027-budget-workbenches:disclaimer:v1', DISCLAIMER_ACK_VALUE], ['other-project:disclaimer:v1', DISCLAIMER_ACK_VALUE]]);
  const storage = {getItem: key => values.get(key)};
  assert.equal(disclaimerAcknowledged(storage), false);
});

test('storage denial never breaks use of the app and does not create a false saved choice', () => {
  const storage = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }};
  assert.equal(disclaimerAcknowledged(storage), false);
  assert.equal(acknowledgeDisclaimer(storage), false);
  assert.equal(disclaimerAcknowledged(null), false);
  assert.equal(acknowledgeDisclaimer(null), false);
});
