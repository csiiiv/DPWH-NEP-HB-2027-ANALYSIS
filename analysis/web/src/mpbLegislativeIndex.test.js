import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {locationCards, summaryTotals, indexRowsById, cardRows,
  mpbExplorerRow, mpbGridExportRows, MPB_TIER_LABELS, MPB_TIER_FILTER} from './congressModel.js';
import {mpbRecordMapOverlay, mpbDistrictMapOverlay, MPB_POINT_CLASSES,
  mpbOverlayFrame} from './mpbSegmentOverlay.js';

const DATA = new URL('../../data/', import.meta.url);
const INDEX = new URL('mpb_legislative_index_2027.json', DATA);
const COMPARISON = new URL('comparison_projects_2027.json', DATA);
const ready = [INDEX, COMPARISON].every(existsSync);
const skip = ready ? false : {skip: 'MPB legislative artifacts not built — run predev/prebuild'};
const read = url => JSON.parse(readFileSync(url, 'utf8'));
const index = ready ? read(INDEX) : null;
const comparison = ready ? read(COMPARISON) : null;
const BUCKETS = ['insertions', 'deletions', 'increased', 'reduced', 'unchanged', 'scope_review'];

test(skip, 'every scoped MPB comparison row is booked on exactly one card', () => {
  const expected = new Set(Object.keys(index.row_resolution));
  const seen = new Set();
  for (const card of locationCards(index)) {
    for (const bucket of BUCKETS) for (const id of card.row_ids[bucket]) {
      assert.ok(expected.has(id), `${card.id} cites unknown ${id}`);
      assert.ok(!seen.has(id), `${id} is booked twice`);
      seen.add(id);
    }
  }
  assert.equal(seen.size, index.counts.rows);
  assert.equal(index.reconciliation.row_counts.residual, 0,
    'the builder must tie every scoped row onto a card with no residual');
});

test(skip, 'card figures tie out to the scoped House and NEP source totals', () => {
  const totals = summaryTotals(locationCards(index));
  assert.equal(totals.ties, true, 'summaryTotals must reconcile cards against sources');
  assert.equal(totals.house.amount_php, index.reconciliation.whole.sources.house.amount_php);
  assert.equal(totals.nep.amount_php, index.reconciliation.whole.sources.nep.amount_php);
  assert.equal(totals.rows, index.counts.rows);
});

test(skip, 'scope rules are disclosed per row and are a union of PAP and title', () => {
  const accepted = new Set(['pap', 'pap+title', 'title']);
  assert.equal(Object.keys(index.row_scope).length, index.counts.rows);
  for (const [id, scope] of Object.entries(index.row_scope)) {
    assert.ok(accepted.has(scope.rules.join('+')), `${id}: unexpected scope ${scope.rules.join('+')}`);
    if (scope.rules.includes('title')) {
      assert.ok(scope.title_fragment, `${id}: title-scoped rows cite their fragment`);
    }
  }
  // Every scoped row must still exist in the shared comparison payload — the
  // MPB lens never invents rows, it subsets the DPWH ledger.
  const byId = indexRowsById(comparison.projects ?? comparison);
  for (const id of Object.keys(index.row_scope)) {
    assert.ok(byId.has(id), `${id} missing from the comparison payload`);
  }
});

test(skip, 'resolution is the committed location-lens record, never re-derived', () => {
  const accepted = new Set(['title_psgc', 'deo_to_leg', 'deo', 'region', 'unassigned']);
  assert.equal(Object.keys(index.row_resolution).length, index.counts.rows);
  for (const [id, resolution] of Object.entries(index.row_resolution)) {
    assert.ok(accepted.has(resolution.basis), `${id}: ${resolution.basis}`);
    // A resolution names its landing card — a target id present in the index.
    assert.ok(resolution.target_id, `${id}: resolution has no target`);
  }
  const cardIds = new Set(locationCards(index).map(card => card.id));
  for (const [id, resolution] of Object.entries(index.row_resolution)) {
    // Card ids carry the basis prefix, so the landing card is reconstructible
    // from the resolution alone: mpb:<basis>:<target> (region cards use the
    // mpb-region: prefix shared with the location lens).
    const landed = resolution.basis === 'region'
      ? `mpb-region:${resolution.target_id}`
      : `mpb:${resolution.basis}:${resolution.target_id}`;
    assert.ok(cardIds.has(landed), `${id}: resolution target ${landed} is not a card`);
  }
  // Tier vocabulary is pinned: the lens copy renames only the labels.
  assert.deepEqual(new Set(Object.keys(MPB_TIER_LABELS)), accepted);
  assert.deepEqual(new Set(MPB_TIER_FILTER.map(([key]) => key)), accepted);
});

test(skip, 'title coordinate points survive only inside the Philippine bounding box', () => {
  const withPoints = Object.entries(index.row_points);
  assert.equal(withPoints.length, index.counts.rows_with_coordinates);
  const pointTotal = withPoints.reduce((sum, [, points]) => sum + points.length, 0);
  assert.equal(pointTotal, index.counts.coordinate_points);
  for (const [id, points] of withPoints) {
    for (const point of points) {
      assert.ok(point.lng > 116 && point.lng < 127 && point.lat > 4 && point.lat < 22,
        `${id}: point outside the PH box (${point.lat}, ${point.lng})`);
      assert.ok(Array.isArray(point.stages));
    }
  }
  assert.ok(index.counts.coordinate_points_dropped_outside_ph >= 0);
});

test(skip, 'browser adapter exposes MPB scope, points and reused assignment', () => {
  const LA_UNION = 'mpb:title_psgc:leg:la-union:1st';
  const card = locationCards(index).find(entry => entry.id === LA_UNION);
  assert.ok(card, 'La Union 1st MPB card is missing');
  const byId = indexRowsById(comparison.projects ?? comparison);
  const rows = cardRows(card, byId);
  assert.ok(rows.length >= 30, `expected the La Union card to stay populous, saw ${rows.length}`);

  const sevilla = rows.find(row => row.third?.id === 'hb:third:c12286');
  assert.ok(sevilla, 'Sevilla multi-purpose building row missing');
  const view = mpbExplorerRow(sevilla, index.row_scope[sevilla.id],
    index.row_points[sevilla.id], index.row_resolution[sevilla.id], index.row_psgc[sevilla.id]);
  assert.equal(view.mpb, true);
  assert.equal(view.scopeLabel, 'BIP MPB programme line + MPB title');
  assert.ok(view.titleFragment.includes('Multi-purpose Building'));
  assert.equal(view.mpbPoints.length, 1);
  assert.deepEqual(view.mpbPoints[0].stages, ['second', 'third']);
  assert.equal(view.coordinates.length, 1);
  assert.equal(view.assignment.basis, 'title_psgc');
});

test(skip, 'record overlay maps buildings as points coloured by comparison class', () => {
  const byId = indexRowsById(comparison.projects ?? comparison);
  const sevilla = byId.get('house-reading:11076');
  const view = mpbExplorerRow(sevilla, index.row_scope[sevilla.id],
    index.row_points[sevilla.id], index.row_resolution[sevilla.id], index.row_psgc[sevilla.id]);
  const overlay = mpbRecordMapOverlay(view);
  assert.equal(overlay.count, 1);
  const feature = overlay.points.features[0];
  assert.equal(feature.geometry.type, 'Point');
  assert.deepEqual(feature.geometry.coordinates, [120.321499, 16.5964]);
  assert.equal(feature.properties.category, 'house_only');
  assert.equal(feature.properties.categoryLabel, 'House only');
  assert.equal(feature.properties.printedByHouse, true);
  assert.equal(feature.properties.printedByNep, false);
  assert.equal(feature.properties.color, MPB_POINT_CLASSES.house_only.color);
  // Frames fit the point set: two finite numbers per point.
  const frame = mpbOverlayFrame(overlay);
  assert.equal(frame.length, 1);
  assert.ok(frame.every(pair => pair.length === 2 && pair.every(Number.isFinite)));
});

test(skip, 'district overlay partitions card points by comparison class', () => {
  const LA_UNION = 'mpb:title_psgc:leg:la-union:1st';
  const card = locationCards(index).find(entry => entry.id === LA_UNION);
  const byId = indexRowsById(comparison.projects ?? comparison);
  const views = cardRows(card, byId)
    .map(row => mpbExplorerRow(row, index.row_scope[row.id],
      index.row_points[row.id], index.row_resolution[row.id], index.row_psgc[row.id]));
  const overlay = mpbDistrictMapOverlay(views);

  const expectedRecords = {nep_only: 0, house_only: 0, paired: 0};
  for (const view of views) {
    const category = view.house_php != null && view.nep_php != null ? 'paired'
      : view.nep_php != null ? 'nep_only' : 'house_only';
    expectedRecords[category] += 1;
  }
  assert.deepEqual(Object.fromEntries(Object.entries(overlay.counts)
    .map(([key, value]) => [key, value.records])), expectedRecords);
  assert.equal(overlay.points.features.length, 8,
    'La Union 1st pins its eight unique building points');
  for (const feature of overlay.points.features) {
    assert.ok(views.some(view => view.id === feature.properties.recordId));
    const [lng, lat] = feature.geometry.coordinates;
    assert.ok(lng > 116 && lng < 127 && lat > 4 && lat < 22);
  }
});

test(skip, 'grid export covers every scoped row exactly once with card placement', () => {
  const rows = mpbGridExportRows(index, comparison);
  assert.equal(rows.length, index.counts.rows);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.ok(rows.every(row => row.card_id && row.card_label && row.mpb),
    'every exported row must identify its card and keep the MPB adapter mark');
  // Sevilla (La Union 1st) keeps its scope disclosure in the all-districts download.
  const sevilla = rows.find(row => row.id === 'house-reading:11076');
  assert.ok(sevilla);
  assert.equal(sevilla.card_id, 'mpb:title_psgc:leg:la-union:1st');
  assert.match(sevilla.card_label, /LA UNION \(FIRST DISTRICT\)/i);
  assert.equal(sevilla.scopeLabel, 'BIP MPB programme line + MPB title');
  assert.equal(sevilla.mpbPoints.length, 1);
});
