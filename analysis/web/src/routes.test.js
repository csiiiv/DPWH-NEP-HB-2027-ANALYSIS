import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routes, legacyRoutes, readRoute, readWorkspace, routeHref, workspaceHref, fmrPages } from './routes.js';

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
  assert.equal(routeHref('nep', {node: 'p195:r4'}, 'dpwh'), '#nep?node=p195%3Ar4');
  assert.equal(readRoute('#missing').key, 'missing');
});

test('fmr workspace routes are prefixed and keep their query params', () => {
  assert.equal(readWorkspace('#fmr/home'), 'fmr');
  assert.equal(readWorkspace('#compare?view=projects'), 'dpwh');
  assert.equal(readWorkspace(''), 'dpwh');
  const route = readRoute('#fmr/nep?view=tree&node=nep_fmr%3Ap1%3Ar5');
  assert.equal(route.workspace, 'fmr');
  assert.equal(route.key, 'nep');
  assert.equal(route.params.get('node'), 'nep_fmr:p1:r5');
  assert.equal(readRoute('#fmr').key, 'home');
  assert.equal(readRoute('#fmr/').key, 'home');
  // Workspace keys never leak into DPWH route keys.
  assert.equal(readRoute('#nep').workspace, 'dpwh');
});
test('route hrefs stay inside the requested workspace', () => {
  assert.equal(routeHref('compare', {view: 'projects'}, 'fmr'), '#fmr/compare?view=projects');
  assert.equal(routeHref('home', {}, 'fmr'), '#fmr/home');
  assert.equal(routeHref('home', {}, 'dpwh'), '#home');
  assert.equal(routeHref('nep', {view: 'review'}, 'dpwh'), '#nep?view=review');
});
test('workspace switching keeps analogous tabs and falls back home', () => {
  assert.equal(workspaceHref('fmr', readRoute('#compare?view=projects')), '#fmr/compare');
  assert.equal(workspaceHref('dpwh', readRoute('#fmr/highlights?story=x')), '#highlights');
  // FMR has no transparency/resources/about tabs: fall back to home.
  assert.equal(workspaceHref('fmr', readRoute('#transparency')), '#fmr/home');
  assert.equal(workspaceHref('fmr', readRoute('#about')), '#fmr/home');
  // Shared FMR tabs exist in DPWH; Map is FMR-only and falls back to Home.
  for (const [key] of fmrPages) {
    if (key === 'map') assert.equal(workspaceHref('dpwh', readRoute(`#fmr/${key}`)), '#home');
    else assert.ok(routes[key]);
  }
});
