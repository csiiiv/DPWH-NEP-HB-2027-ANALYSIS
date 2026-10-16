import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindLabel, sourceGroups } from './sourcesCatalog.js';
import { readWorkspace, routes, workspaces } from './routes.js';

test('sources catalog covers every workspace plus the folded-in DPWH resources', () => {
  const items = sourceGroups.flatMap((group) => group.items);
  assert.ok(items.length >= 30);
  assert.ok(items.every((item) => item.label && item.purpose && item.coverage && kindLabel[item.kind]));
  assert.ok(items.every((item) => item.kind === 'text' || (item.path && item.path.length > 0)));
  // The three DPWH baselines.
  assert.ok(items.some((item) => item.path?.endsWith('nep_2027_tree.json')));
  assert.ok(items.some((item) => item.path?.endsWith('hb_dpwh_native_ic_projects.json')));
  assert.ok(items.some((item) => item.path?.endsWith('fy2027-combined.json')));
  // DPWH audit and review entries folded in from the former Resources tab.
  assert.ok(items.some((item) => item.path?.endsWith('nep_2027_tree_validation.json')));
  assert.ok(items.some((item) => item.path?.endsWith('nep_2027_native_amount_review.json')));
  assert.ok(items.some((item) => item.path?.endsWith('hb_native_ib_rollup_checks.md')));
  assert.ok(items.some((item) => item.path?.endsWith('gab_fy2027_reference_crosscheck.md')));
  assert.ok(items.some((item) => item.path?.endsWith('source_verification_overview.json')));
  // Annex workspaces and the packaged payloads.
  assert.ok(sourceGroups.some((group) => ['fmr', 'hfep', 'nia', 'geo'].includes(group.id)));
  assert.ok(items.some((item) => item.path?.endsWith('main_overview_2027.json')));
  // CSV dataset exports: one complete CSV per dataset, all packaged for download.
  const csvGroup = sourceGroups.find((group) => group.id === 'csv-exports');
  assert.ok(csvGroup, 'csv-exports group missing');
  assert.ok(csvGroup.items.length >= 6);
  assert.ok(csvGroup.items.every((item) => item.kind === 'data' && /\.(csv|7z)$/.test(item.path)));
  assert.ok(csvGroup.items.some((item) => item.path.endsWith('dpwh_comparison_all_2027.csv')));
  assert.ok(csvGroup.items.some((item) => item.path.endsWith('hgab_hfep_facilities.csv')));
  assert.ok(csvGroup.items.some((item) => item.path.endsWith('hgab_nia_projects.csv')));
  // Source PDFs and pinned external references.
  assert.ok(sourceGroups.some((group) => group.id === 'sources'));
  assert.ok(items.some((item) => item.kind === 'external' && item.path?.includes('kimileeee/gab-fy2027-dataset')));
  assert.ok(items.some((item) => item.kind === 'external' && item.path?.includes('ajamontesa/ph-budget-analysis')));
  assert.ok(items.some((item) => item.kind === 'external' && item.path?.includes('dpwh-transparency-data-api-scraper')));
  assert.ok(items.some((item) => item.kind === 'external' && item.path?.startsWith('https://www.dbm.gov.ph/')));
  assert.ok(items.filter((item) => item.kind === 'doc').every((item) => item.path.endsWith('.md')));
  // Every workspace link is either a DPWH route key or <workspace>/<route>.
  for (const group of sourceGroups) {
    if (!group.workspace) continue;
    const segments = group.workspace.split('/');
    if (segments.length === 1) assert.ok(routes[segments[0]], `group ${group.id} links unknown route ${group.workspace}`);
    else assert.ok(workspaces[segments[0]], `group ${group.id} links unknown workspace ${segments[0]}`);
  }
});

test('the former DPWH resources route now resolves to the Sources workspace', () => {
  assert.equal(routes.resources, undefined);
  assert.equal(readWorkspace('#resources'), 'sources');
  assert.equal(readWorkspace('#resources?x=1'), 'sources');
  // About is now its own workspace, not a DPWH tab.
  assert.equal(readWorkspace('#about'), 'about');
  assert.equal(readWorkspace('#about'), 'about');
});
