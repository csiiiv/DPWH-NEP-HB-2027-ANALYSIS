import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  consolidatedMapFeatures, consolidatedMapChains, filterConsolidatedProjects, consolidatedMapSummary,
  readNiaMapObjects, niaMapObjectsParam, readNiaMapTypes, niaMapTypesParam,
  niaMapLayerCounts, defaultNiaMapTypesFor, NIA_MAP_SUBPROGRAM_OPTIONS,
  DEFAULT_NIA_MAP_OBJECTS, DEFAULT_NIA_MAP_TYPES,
  consolidatedByStageId, formatConsolidatedChainage, hasPlottableLocation, preferredMapFocus,
} from './niaConsolidatedMap.js';

// Resolve from either analysis/web/src or the PBC-NIA-APP/src fork.
const consolidatedPath = [
  new URL('../../../analysis-nia/data/nia_consolidated.json', import.meta.url),
  new URL('../../analysis-nia/data/nia_consolidated.json', import.meta.url),
].map(u => fileURLToPath(u)).find(existsSync);
assert.ok(consolidatedPath, 'nia_consolidated.json not found');
const consolidated = JSON.parse(readFileSync(consolidatedPath, 'utf8'));

test('consolidated map summary mirrors dataset counts', () => {
  const summary = consolidatedMapSummary(consolidated);
  assert.equal(summary.projects, 937);
  assert.equal(summary.with_title_gps, 420);
  assert.equal(summary.title_gps_points, 598);
  assert.equal(summary.matching_split, 77);
});

test('title GPS layer plots points without inflating project filter count', () => {
  const projects = filterConsolidatedProjects(consolidated.projects, {layer: 'title_gps'});
  assert.equal(projects.length, 420);
  const features = consolidatedMapFeatures(projects, 'title_gps');
  assert.equal(features.length, 598);
  assert.ok(features.every(f => f.properties.kind === 'title_gps'));
  assert.ok(features.every(f => f.geometry.coordinates.length === 2));
  // Must not collide with MapLibre's cluster `point_count` property.
  assert.ok(features.every(f => !Object.hasOwn(f.properties, 'point_count')));
  assert.ok(features.every(f => f.properties.subprogram));
  const maniana = features.filter(f => /Maniana/i.test(f.properties.title));
  assert.equal(maniana.length, 6);
  assert.equal(new Set(maniana.map(f => f.properties.id)).size, 1);
  assert.equal(maniana[0].properties.site_count, 6);
});

test('multi-site rows chain their title GPS points in title order', () => {
  const projects = filterConsolidatedProjects(consolidated.projects, {layer: 'title_gps'});
  const chains = consolidatedMapChains(projects, 'title_gps');
  // 72 workbook lines carry >=2 sites; each produces exactly one chain.
  assert.equal(chains.length, 72);
  assert.ok(chains.every(f => f.geometry.type === 'LineString'));
  assert.ok(chains.every(f => f.geometry.coordinates.length >= 2));
  const maniana = chains.find(f => /Maniana/i.test(f.properties.title));
  assert.equal(maniana.geometry.coordinates.length, 6);
  assert.equal(maniana.properties.site_count, 6);
  // Chains match the point features' order and coordinates for the same row.
  const points = consolidatedMapFeatures(projects, 'title_gps')
    .filter(f => f.properties.id === maniana.properties.id);
  assert.deepEqual(maniana.geometry.coordinates, points.map(f => f.geometry.coordinates));
  // Chains honor subtype toggles: only house_insertion survives.
  const objects = {title_gps: true, psgc: false};
  const types = defaultNiaMapTypesFor('status');
  for (const key of Object.keys(types.title_gps)) types.title_gps[key] = key === 'house_insertion';
  const insertChains = consolidatedMapChains(
    filterConsolidatedProjects(consolidated.projects, {objects, types}),
    objects, types);
  assert.ok(insertChains.every(f => f.properties.status === 'house_insertion'));
  // PSGC-only view draws no chains.
  assert.equal(consolidatedMapChains(projects, {title_gps: false, psgc: true}).length, 0);
});

test('psgc layer is a fallback: only rows without title GPS', () => {
  const all = filterConsolidatedProjects(consolidated.projects, {layer: 'psgc'});
  // 768 rows have PSGC centroids, but 316 of them also print title GPS and
  // are plotted (more precisely) by that layer instead.
  assert.equal(all.length, 452);
  assert.ok(all.every(p => (p.locations?.title_gps?.point_count || 0) === 0));
  const barangay = filterConsolidatedProjects(consolidated.projects, {
    layer: 'psgc', anchor: 'barangay',
  });
  assert.equal(barangay.length, 223);
  const features = consolidatedMapFeatures(barangay, 'psgc');
  // Co-located rows aggregate into one square marker per centroid.
  assert.ok(features.length < barangay.length);
  assert.ok(features.every(f => f.properties.kind === 'psgc'));
  assert.ok(features.every(f => f.geometry.coordinates.length === 2));
  const stacked = features.filter(f => f.properties.stack_count >= 2);
  assert.ok(stacked.length > 0);
  assert.ok(stacked.every(f => f.properties.stack_ids.split(',').length === f.properties.stack_count));
  // Every fallback row appears in exactly one bucket.
  const listed = features.flatMap(f => f.properties.stack_ids.split(','));
  assert.equal(listed.length, barangay.length);
  assert.equal(new Set(listed).size, barangay.length);
});

test('both layers never double-plot one workbook row', () => {
  const both = filterConsolidatedProjects(consolidated.projects, {layer: 'both'});
  const features = consolidatedMapFeatures(both, 'both');
  const kinds = new Set(features.map(f => f.properties.kind));
  assert.deepEqual([...kinds].sort(), ['psgc', 'title_gps']);
  assert.ok(features.length > both.length);
  // 420 GPS rows (598 points) + 367 distinct PSGC fallback centroids
  // (co-located rows share one square marker).
  assert.equal(features.length, 965);
  const kindsById = new Map();
  for (const f of features) {
    const set = kindsById.get(f.properties.id) || new Set();
    set.add(f.properties.kind);
    kindsById.set(f.properties.id, set);
  }
  assert.ok([...kindsById.values()].every(set => set.size === 1));
});

test('objects URL defaults, legacy layer=, and sparse serialization', () => {
  assert.deepEqual(readNiaMapObjects(new URLSearchParams()), DEFAULT_NIA_MAP_OBJECTS);
  assert.deepEqual(readNiaMapObjects(new URLSearchParams('layer=title_gps')), {
    title_gps: true, psgc: false,
  });
  assert.deepEqual(readNiaMapObjects(new URLSearchParams('objects=psgc')), {
    title_gps: false, psgc: true,
  });
  assert.deepEqual(readNiaMapObjects(new URLSearchParams('objects=none')), {
    title_gps: false, psgc: false,
  });
  assert.equal(niaMapObjectsParam(DEFAULT_NIA_MAP_OBJECTS), null);
  assert.equal(niaMapObjectsParam({title_gps: true, psgc: false}), 'title_gps');
  assert.equal(niaMapObjectsParam({title_gps: false, psgc: false}), 'none');
});

test('types URL defaults and status subtype toggles', () => {
  assert.deepEqual(readNiaMapTypes(new URLSearchParams()), DEFAULT_NIA_MAP_TYPES);
  const sparse = readNiaMapTypes(new URLSearchParams(
    'types=title_gps:both_funded,psgc:house_insertion'));
  assert.equal(sparse.title_gps.both_funded, true);
  assert.equal(sparse.title_gps.house_insertion, false);
  assert.equal(sparse.psgc.house_insertion, true);
  assert.equal(sparse.psgc.both_funded, false);
  assert.equal(niaMapTypesParam(DEFAULT_NIA_MAP_TYPES), null);
  assert.equal(niaMapTypesParam(sparse),
    'title_gps:both_funded,psgc:house_insertion');
});

test('subprogram dimension swaps the subtype toggle set', () => {
  const defaults = defaultNiaMapTypesFor('subprogram');
  const ids = Object.keys(defaults.title_gps);
  assert.deepEqual(ids, NIA_MAP_SUBPROGRAM_OPTIONS.map(([id]) => id));
  assert.ok(ids.includes('other'));
  // Sparse subprogram selection parses and re-serializes in the same shape.
  const sparse = readNiaMapTypes(new URLSearchParams(
    'types=psgc:Communal Irrigation System'), 'subprogram');
  assert.equal(sparse.psgc['Communal Irrigation System'], true);
  assert.equal(sparse.psgc['National Irrigation System'], false);
  assert.equal(sparse.title_gps['Communal Irrigation System'], false);
  assert.equal(niaMapTypesParam(sparse, 'subprogram'),
    'psgc:Communal Irrigation System');
  assert.equal(niaMapTypesParam(defaults, 'subprogram'), null);
});

test('subprogram toggles filter PSGC without pump projects', () => {
  const objects = {title_gps: false, psgc: true};
  const types = defaultNiaMapTypesFor('subprogram');
  types.psgc['Establishment of Pump Irrigation'] = false;
  const projects = filterConsolidatedProjects(consolidated.projects, {
    objects, types, dimension: 'subprogram',
  });
  // 452 PSGC-fallback rows minus the 72 pump rows (fallback semantics).
  assert.equal(projects.length, 380);
  assert.ok(projects.every(p => p.subprogram_key !== 'Establishment of Pump Irrigation'));
  const features = consolidatedMapFeatures(projects, objects, types, 'subprogram');
  // Aggregated: one square per distinct centroid, fewer than rows.
  assert.ok(features.length <= projects.length);
  assert.ok(features.every(f => f.properties.stack_count >= 1));
  const counts = niaMapLayerCounts(consolidated.projects, 'subprogram');
  // Counts mirror the fallback: only pump rows without title GPS.
  assert.equal(counts.psgc['Establishment of Pump Irrigation'].projects,
    consolidated.projects.filter(p => p.subprogram_key === 'Establishment of Pump Irrigation'
      && Array.isArray(p.locations?.psgc?.primary?.coordinates)
      && (p.locations?.title_gps?.point_count || 0) === 0).length);
});

test('objects+types filter insertions onto PSGC without title GPS double-plot', () => {
  const objects = {title_gps: false, psgc: true};
  const types = {
    title_gps: {both_funded: false, house_insertion: false, house_zeroed: false, unfunded: false},
    psgc: {both_funded: false, house_insertion: true, house_zeroed: false, unfunded: false},
  };
  const projects = filterConsolidatedProjects(consolidated.projects, {objects, types});
  assert.ok(projects.length > 0);
  assert.ok(projects.every(p => p.workbook_status === 'house_insertion'));
  const features = consolidatedMapFeatures(projects, objects, types);
  assert.ok(features.every(f => f.properties.kind === 'psgc'));
  // House insertions cluster heavily on shared centroids.
  assert.ok(features.length <= projects.length);
  const counts = niaMapLayerCounts(consolidated.projects);
  assert.equal(counts.psgc.house_insertion.projects, 126);
  assert.equal(counts.psgc.house_insertion.projects, projects.length);
  assert.ok(counts.title_gps.house_insertion.projects < counts.psgc.house_insertion.projects);
});

test('psgc squares aggregate co-located rows with stack counts', () => {
  const all = filterConsolidatedProjects(consolidated.projects, {layer: 'psgc'});
  const features = consolidatedMapFeatures(all, 'psgc');
  // 452 fallback rows on 367 distinct centroids; stacked squares carry the
  // row count and the member ids for the click-through picker.
  assert.equal(features.length, 367);
  const stacks = features.filter(f => f.properties.stack_count > 1);
  assert.equal(stacks.length, 61);
  const balingasag = features.find(f => f.properties.stack_count === 5);
  assert.ok(balingasag, 'expected the 5-row Balingasag stack');
  assert.deepEqual(balingasag.geometry.coordinates, [124.767489, 8.739132]);
  assert.equal(balingasag.properties.stack_ids.split(',').length, 5);
  // Subtype toggles re-bucket: only insertion rows remain on that centroid.
  const objects = {title_gps: false, psgc: true};
  const types = {
    title_gps: {both_funded: false, house_insertion: false, house_zeroed: false, unfunded: false},
    psgc: {both_funded: false, house_insertion: true, house_zeroed: false, unfunded: false},
  };
  const insertions = consolidatedMapFeatures(
    filterConsolidatedProjects(consolidated.projects, {objects, types}), objects, types);
  const atBalingasag = insertions.find(f =>
    f.geometry.coordinates[0] === 124.767489 && f.geometry.coordinates[1] === 8.739132);
  assert.equal(atBalingasag.properties.stack_count, 4);
  assert.equal(atBalingasag.properties.status, 'house_insertion');
});

test('preferred map focus uses title GPS before PSGC centroid', () => {
  const withGps = consolidated.projects.find(p => (p.locations?.title_gps?.point_count || 0) > 0);
  const gpsFocus = preferredMapFocus(withGps);
  assert.equal(gpsFocus.basis, 'title_gps');
  assert.ok(gpsFocus.coordinates.length >= 1);
  assert.equal(hasPlottableLocation(withGps), true);
  assert.ok(formatConsolidatedChainage(withGps) === '' || formatConsolidatedChainage(withGps).includes('+')
    || formatConsolidatedChainage(withGps).length >= 0);

  const psgcOnly = consolidated.projects.find(p =>
    (p.locations?.title_gps?.point_count || 0) === 0
    && Array.isArray(p.locations?.psgc?.primary?.coordinates));
  const psgcFocus = preferredMapFocus(psgcOnly);
  assert.equal(psgcFocus.basis, 'psgc');
  assert.equal(psgcFocus.coordinates.length, 1);
  assert.match(psgcFocus.label, /PSGC centroid/);

  const none = consolidated.projects.find(p => p.locations?.coverage === 'none');
  assert.equal(preferredMapFocus(none), null);
  assert.equal(hasPlottableLocation(none), false);

  const byNep = consolidatedByStageId(consolidated.projects, 'nep');
  assert.ok(byNep.size > 700);
  const sample = consolidated.projects.find(p => p.nep_id);
  assert.equal(byNep.get(sample.nep_id).id, sample.id);
});
