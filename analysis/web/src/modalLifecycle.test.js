import test from 'node:test';
import assert from 'node:assert/strict';
import {openModalDialog} from './modalLifecycle.js';

test('nested source dialogs retain scroll lock when a route closes the parent first', () => {
  let focused = 0;
  globalThis.document = {body: {style: {overflow: 'auto'}}, activeElement: {isConnected: true, focus() {focused++;}}};
  const element = () => ({showModal() {}, close() {}});
  const closeParent = openModalDialog(element()), closePdf = openModalDialog(element());
  closeParent();
  assert.equal(document.body.style.overflow, 'hidden');
  closePdf();
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(focused, 2);
  closePdf();
  assert.equal(focused, 2);
});
