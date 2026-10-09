import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routes, legacyRoutes, readRoute, routeHref } from './routes.js';
test('all six historical viewers map to an existing SPA route', () => {
  assert.equal(Object.keys(legacyRoutes).length, 7);
  for (const key of Object.values(legacyRoutes)) assert.ok(routes[key]);
});
test('hash routes preserve review and entity parameters and accept slash links', () => {
  assert.equal(readRoute('').key, 'home');
  const route = readRoute('#/nep?view=review&node=p195%3Ar4');
  assert.equal(route.key, 'nep');
  assert.equal(route.params.get('view'), 'review');
  assert.equal(route.params.get('node'), 'p195:r4');
  assert.equal(routeHref('nep', {node: 'p195:r4'}), '#nep?node=p195%3Ar4');
  assert.equal(readRoute('#missing').key, 'missing');
});
