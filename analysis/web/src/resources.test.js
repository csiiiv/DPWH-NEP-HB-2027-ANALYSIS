import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindLabel, resourceGroups } from './resources.js';
import { routes } from './routes.js';

test('resources route is registered and catalog covers data, docs, and PDFs', () => {
  assert.equal(routes.resources.label, 'Resources');
  const items = resourceGroups.flatMap((group) => group.items);
  assert.ok(items.length >= 30);
  assert.ok(items.every((item) => item.label && item.path && item.purpose && item.coverage && kindLabel[item.kind]));
  assert.ok(items.some((item) => item.path.endsWith('nep_2027_tree.json')));
  assert.ok(items.some((item) => item.path.endsWith('hb_dpwh_native_ic_projects.json')));
  assert.ok(items.some((item) => item.path.endsWith('fy2027-combined.json')));
  assert.ok(items.some((item) => item.kind === 'pdf' && item.path.includes('NEP-2027-VOLUME-2B')));
  assert.ok(items.some((item) => item.kind === 'pdf' && item.path.includes('HB_BUDGET')));
  assert.ok(items.some((item) => item.kind === 'pdf' && item.path.includes('HB_BUDGET_3rd_reading')));
  assert.ok(items.some((item) => item.kind === 'repo' && item.path.endsWith('NEP-2027-VOLUME-3_OCR.pdf')));
  assert.ok(items.some((item) => item.kind === 'external' && item.path.startsWith('https://www.dbm.gov.ph/')));
  assert.ok(items.filter((item) => item.kind === 'doc').every((item) => item.path.endsWith('.md')));
});
