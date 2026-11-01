import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {
  colorDistrictFeatures, decorateDistrictIds, districtIdBridge,
  mpbNationalMapOverlay, districtCardId,
  readCongressMapObjects, congressMapObjectsParam, DEFAULT_CONGRESS_MAP_OBJECTS,
  readCongressMapTypes, congressMapTypesParam, DEFAULT_CONGRESS_MAP_TYPES,
  congressMapCategoryFilter,
} from './congressMapModel.js';
import {districtLensCounts} from './congressModel.js';

const REPO = new URL('../../../', import.meta.url);
const VIZ = new URL('PSGC2LEG/viz/leg_districts.geojson', REPO);
const HUES = new URL('PSGC2LEG/viz/province_hues.json', REPO);
const MAP = new URL('analysis/data/congress_district_map_2027.json', REPO);
const MPB = new URL('analysis/data/mpb_legislative_index_2027.json', REPO);
const haveViz = existsSync(VIZ) && existsSync(HUES);
const haveMap = existsSync(MAP);
const haveMpb = existsSync(MPB);
const read = url => JSON.parse(readFileSync(url, 'utf8'));

test(haveViz ? false : {skip: 'PSGC2LEG viz not present'},
  'viz districts receive province-hue colors', () => {
    const geojson = read(VIZ);
    const hues = read(HUES);
    const colored = colorDistrictFeatures(geojson, hues);
    assert.equal(colored.features.length, 254);
    for (const feature of colored.features.slice(0, 20)) {
      assert.match(feature.properties.color, /^hsl\(\d+, \d+%, \d+%\)$/);
    }
    // Lone districts use the mid shade; multi-district jurisdictions vary.
    const abra = colored.features.find(f => f.properties.jurisdiction === 'Abra');
    const qc = colored.features.filter(f => f.properties.jurisdiction === 'Quezon City');
    assert.ok(abra);
    assert.ok(qc.length > 1);
    const shades = new Set(qc.map(f => f.properties.color));
    assert.ok(shades.size > 1, 'Quezon City districts should not share one shade');
  });

test(haveViz && haveMap ? false : {skip: 'viz or map artifact missing'},
  'map artifact bridges every viz leg_id to a lens district_id', () => {
    const geojson = read(VIZ);
    const bridge = districtIdBridge(read(MAP));
    assert.equal(bridge.size, 254);
    const decorated = decorateDistrictIds(colorDistrictFeatures(geojson, read(HUES)), bridge);
    for (const feature of decorated.features) {
      assert.ok(feature.properties.district_id,
        `${feature.properties.leg_id} missing district_id bridge`);
      assert.match(feature.properties.district_id, /^leg:/);
    }
  });

test('congress map objects default to all on and serialize sparse selections', () => {
  assert.deepEqual(readCongressMapObjects(new URLSearchParams()), DEFAULT_CONGRESS_MAP_OBJECTS);
  assert.equal(congressMapObjectsParam(DEFAULT_CONGRESS_MAP_OBJECTS), null);
  assert.equal(congressMapObjectsParam({districts: true, fmr: false, fmr_repairs: false, mpb: true}),
    'districts,mpb');
  assert.deepEqual(readCongressMapObjects(new URLSearchParams('objects=mpb')), {
    districts: false, fmr: false, fmr_repairs: false, mpb: true,
  });
  assert.deepEqual(readCongressMapObjects(new URLSearchParams('objects=none')), {
    districts: false, fmr: false, fmr_repairs: false, mpb: false,
  });
});

test('congress map types default to all on and serialize sparse selections', () => {
  assert.deepEqual(readCongressMapTypes(new URLSearchParams()), DEFAULT_CONGRESS_MAP_TYPES);
  assert.equal(congressMapTypesParam(DEFAULT_CONGRESS_MAP_TYPES), null);
  assert.equal(congressMapTypesParam({
    ...DEFAULT_CONGRESS_MAP_TYPES,
    fmr: {nep_only: true, house_only: false, paired: true},
    mpb: {nep_only: false, house_only: false, paired: true},
  }), 'fmr:nep_only,fmr:paired,fmr_repairs:link,fmr_repairs:point,mpb:paired');
  assert.deepEqual(readCongressMapTypes(new URLSearchParams('types=mpb:paired,fmr:house_only')), {
    fmr: {nep_only: false, house_only: true, paired: false},
    fmr_repairs: {link: false, point: false},
    mpb: {nep_only: false, house_only: false, paired: true},
  });
  assert.equal(congressMapCategoryFilter(['paired', 'nep_only'])[0], 'in');
  assert.deepEqual(congressMapCategoryFilter(['paired']), ['==', ['get', 'category'], 'paired']);
});

test('mpb national overlay tags objectKind and links same-title multi-points', () => {
  const records = [{
    id: 'row-a', title: 'Multi-Purpose Building, Sample',
    house_php: 1e6, nep_php: 1e6,
    mpbPoints: [{lng: 121.0, lat: 14.5, stages: ['second'], issues: []}],
  }, {
    id: 'row-b', title: 'MPB House only',
    house_php: 2e6, nep_php: null,
    mpbPoints: [
      {lng: 120.5, lat: 15.0, stages: ['third'], issues: []},
      {lng: 120.6, lat: 15.1, stages: ['nep'], issues: ['outside_ph']},
    ],
  }];
  const overlay = mpbNationalMapOverlay(records);
  assert.equal(overlay.points.features.length, 3);
  assert.ok(overlay.points.features.every(f => f.properties.objectKind === 'mpb'));
  assert.equal(overlay.counts.paired.points, 1);
  assert.equal(overlay.counts.house_only.points, 2);
  assert.equal(overlay.lines.features.length, 1);
  assert.equal(overlay.lines.features[0].properties.recordId, 'row-b');
  assert.deepEqual(overlay.lines.features[0].geometry.coordinates,
    [[120.5, 15.0], [120.6, 15.1]]);
});

test(haveMpb ? false : {skip: 'mpb index missing'},
  'districtCardId resolves an MPB card for a known district', () => {
    const index = read(MPB);
    const withCard = index.cards.find(card => card.districts?.[0]?.id);
    assert.ok(withCard);
    const districtId = withCard.districts[0].id;
    const cardId = districtCardId(index, districtId);
    assert.equal(cardId, withCard.id);
  });

test('districtLensCounts counts all card rows and reports the mapped share', () => {
  const fmrIndex = {
    cards: [{
      id: 'fmr:district:leg:sample:1st',
      districts: [{id: 'leg:sample:1st'}],
      row_ids: {insertions: ['f1', 'f2'], deletions: ['f3'], unchanged: ['f4']},
    }],
    row_resolution: {
      f1: {house: {point_districts: [{district_id: 'leg:sample:1st'}]}},
      f2: {house: {point_districts: []}, nep: {point_districts: []}},
      f3: {},
      f4: {nep: {point_districts: [{district_id: 'leg:sample:1st'}]}},
    },
  };
  const mpbIndex = {
    cards: [{
      id: 'mpb:title_psgc:leg:sample:1st',
      districts: [{id: 'leg:sample:1st'}],
      row_ids: {unchanged: ['m1', 'm2', 'm3']},
    }],
    row_points: {m1: [{lng: 121, lat: 14}], m3: [{lng: 122, lat: 15}]},
  };
  const counts = districtLensCounts(fmrIndex, mpbIndex, 'leg:sample:1st');
  // All four FMR rows count; only the two with point geometry are "mapped".
  assert.equal(counts.fmr.rows, 4);
  assert.equal(counts.fmr.mapped, 2);
  assert.equal(counts.fmr.cardId, 'fmr:district:leg:sample:1st');
  // All three MPB rows count; two print coordinates.
  assert.equal(counts.mpb.rows, 3);
  assert.equal(counts.mpb.mapped, 2);
  assert.equal(counts.mpb.cardId, 'mpb:title_psgc:leg:sample:1st');

  // A district with no card in either lens reports nothing.
  assert.equal(districtLensCounts(fmrIndex, mpbIndex, 'leg:elsewhere:2nd'), null);
  // One lens missing still reports the other.
  const fmrOnly = districtLensCounts(fmrIndex, null, 'leg:sample:1st');
  assert.equal(fmrOnly.mpb.rows, 0);
  assert.equal(fmrOnly.mpb.cardId, null);
});
