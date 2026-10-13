import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disposePdfLoadingTask} from './pdfLifecycle.js';

test('closing a loading viewer waits for initialization before terminating the worker', async () => {
  let initialized = false, destroyed = 0, resolve;
  const task = {promise: new Promise(r => {resolve = r;}), destroy: () => {
    assert.equal(initialized, true, 'early destruction races the document manager');
    destroyed++;
    return Promise.resolve();
  }};
  const cleanup = disposePdfLoadingTask(task);
  await Promise.resolve();
  assert.equal(destroyed, 0);
  initialized = true;
  resolve({});
  await cleanup;
  assert.equal(destroyed, 1);
});
test('a failed document still releases its loading task', async () => {
  let destroyed = 0;
  const task = {promise: Promise.reject(new Error('Source unavailable')), destroy: async () => {destroyed++;}};
  await disposePdfLoadingTask(task);
  assert.equal(destroyed, 1);
});
test('cleanup handles an already destroyed worker without an unhandled rejection', async () => {
  const task = {promise: Promise.resolve({}), destroy: async () => {throw Error('Worker already closed');}};
  await assert.doesNotReject(disposePdfLoadingTask(task));
});
