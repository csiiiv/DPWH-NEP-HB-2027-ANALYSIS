import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {
  colorDistrictFeatures, decorateDistrictIds, districtIdBridge,
  mpbNationalMapOverlay, districtCardId, mpbUnmappedDistrictBadges,
  mpbUnmappedBadgeViews, mpbUnmappedClassTotals,
  mpbApproxMapOverlay, mpbApproxMarkerViews, mpbApproxPlacedRowIds,
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
  assert.equal(congressMapObjectsParam({districts: true, fmr: false, fmr_repairs: false,
    mpb: true, mpb_approx: false, mpb_unmapped: false}), 'districts,mpb');
  assert.deepEqual(readCongressMapObjects(new URLSearchParams('objects=mpb')), {
    districts: false, fmr: false, fmr_repairs: false, mpb: true,
    mpb_approx: false, mpb_unmapped: false,
  });
  assert.deepEqual(readCongressMapObjects(new URLSearchParams('objects=none')), {
    districts: false, fmr: false, fmr_repairs: false, mpb: false,
    mpb_approx: false, mpb_unmapped: false,
  });
});

test('congress map types default to class chips on and total off', () => {
  assert.deepEqual(readCongressMapTypes(new URLSearchParams()), DEFAULT_CONGRESS_MAP_TYPES);
  assert.equal(DEFAULT_CONGRESS_MAP_TYPES.mpb_unmapped.total, false);
  assert.equal(DEFAULT_CONGRESS_MAP_TYPES.mpb_unmapped.house_only, true);
  assert.equal(congressMapTypesParam(DEFAULT_CONGRESS_MAP_TYPES), null);
  assert.equal(congressMapTypesParam({
    ...DEFAULT_CONGRESS_MAP_TYPES,
    fmr: {nep_only: true, house_only: false, paired: true},
    mpb: {nep_only: false, house_only: false, paired: true},
  }), 'fmr:nep_only,fmr:paired,fmr_repairs:link,fmr_repairs:point,mpb:paired,'
    + 'mpb_approx:house_only,mpb_approx:nep_only,mpb_approx:paired,'
    + 'mpb_unmapped:house_only,mpb_unmapped:nep_only,mpb_unmapped:paired');
  assert.deepEqual(readCongressMapTypes(new URLSearchParams('types=mpb:paired,fmr:house_only')), {
    fmr: {nep_only: false, house_only: true, paired: false},
    fmr_repairs: {link: false, point: false},
    mpb: {nep_only: false, house_only: false, paired: true},
    mpb_approx: {house_only: false, nep_only: false, paired: false},
    mpb_unmapped: {house_only: false, nep_only: false, paired: false, total: false},
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

test('mpbUnmappedDistrictBadges aggregates coordinate-less rows per district', () => {
  const mpbIndex = {
    cards: [
      {id: 'mpb:title_psgc:leg:sample:1st', districts: [{id: 'leg:sample:1st'}],
        row_ids: {unchanged: ['m1', 'm2', 'm3'], insertions: ['m7']}},
      // Same district also served by a DEO→LEG card — counts must add.
      {id: 'mpb:deo_to_leg:leg:sample:1st', districts: [{id: 'leg:sample:1st'}],
        row_ids: {unchanged: ['m4']}},
      {id: 'mpb:title_psgc:leg:other:2nd', districts: [{id: 'leg:other:2nd'}],
        row_ids: {unchanged: ['m5', 'm6'], deletions: ['m8']}},
    ],
    region_cards: [],
    row_points: {m1: [{lng: 121, lat: 14}], m3: [{lng: 122, lat: 15}]},
  };
  const districts = {
    type: 'FeatureCollection',
    features: [
      {type: 'Feature', properties: {district_id: 'leg:sample:1st',
        jurisdiction: 'Sample', district_label: '1st District', leg_id: 'leg:ph:sample:1st:2025'},
        geometry: {type: 'Polygon', coordinates: [[[120, 14], [121, 14], [121, 15], [120, 14]]]}},
      {type: 'Feature', properties: {district_id: 'leg:other:2nd',
        jurisdiction: 'Other', district_label: '2nd District', leg_id: 'leg:ph:other:2nd:2025'},
        geometry: {type: 'Polygon', coordinates: [[[122, 10], [123, 10], [123, 11], [122, 10]]]}},
    ],
  };
  const badges = mpbUnmappedDistrictBadges(mpbIndex, districts);
  // Per-class split: insertions = House only, deletions = NEP only, the
  // pair buckets (unchanged here) = matched pairs; cross-card totals add.
  assert.deepEqual(badgeBy(badges, 'leg:sample:1st').properties.unmappedByClass,
    {house_only: 1, nep_only: 0, paired: 2}); // m7 + (m2, m4)
  assert.deepEqual(badgeBy(badges, 'leg:other:2nd').properties.unmappedByClass,
    {house_only: 0, nep_only: 1, paired: 2}); // m8 + (m5, m6)
  // Flat copies ride along for the icon-image expression (MapLibre `get`
  // cannot traverse nested objects).
  const flat = badgeBy(badges, 'leg:sample:1st').properties;
  assert.equal(flat.house_only, 1);
  assert.equal(flat.nep_only, 0);
  assert.equal(flat.paired, 2);
  assert.equal(badgeBy(badges, 'leg:sample:1st').properties.unmapped, 3);
  assert.equal(badgeBy(badges, 'leg:other:2nd').properties.unmapped, 3);
  // Badge sits inside its district polygon (centroid of the triangle ring).
  const [cx, cy] = badgeBy(badges, 'leg:sample:1st').geometry.coordinates;
  assert.ok(cx > 120 && cx < 121 && cy >= 14 && cy <= 15, `centroid in bounds: ${cx},${cy}`);
  // Districts without unmapped rows get no badge.
  assert.equal(badgeBy(badges, 'leg:quiet:3rd'), undefined);

  assert.deepEqual(mpbUnmappedClassTotals(badges),
    {house_only: 1, nep_only: 1, paired: 4, total: 6});

  // Class toggles zero disabled tiers; total square is opt-in.
  const houseOnly = mpbUnmappedBadgeViews(badges, {
    mpb_unmapped: {house_only: true, nep_only: false, paired: false, total: false},
  });
  assert.equal(houseOnly.stack.features.length, 1);
  assert.deepEqual(houseOnly.stack.features[0].properties.unmappedByClass,
    {house_only: 1, nep_only: 0, paired: 0});
  assert.equal(houseOnly.total.features.length, 0);

  const withTotal = mpbUnmappedBadgeViews(badges, {
    mpb_unmapped: {house_only: false, nep_only: false, paired: false, total: true},
  });
  assert.equal(withTotal.stack.features.length, 0);
  assert.equal(withTotal.total.features.length, 2);
  assert.equal(withTotal.total.features[0].properties.unmapped, 3);

  // Rows already on the PSGC-approx overlay drop out of district badges.
  const leftover = mpbUnmappedDistrictBadges(mpbIndex, districts, new Set(['m2', 'm4', 'm5', 'm7']));
  assert.equal(badgeBy(leftover, 'leg:sample:1st'), undefined);
  assert.deepEqual(badgeBy(leftover, 'leg:other:2nd').properties.unmappedByClass,
    {house_only: 0, nep_only: 1, paired: 1}); // m8 + m6
});

test('mpbApproxMapOverlay collapses supplement markers into dashed features', () => {
  const supplement = {
    markers: [{
      id: 'mpb-approx:0102807000',
      psgc_code: '0102807000',
      level: 'municipality',
      name: 'Carasi',
      barangay: null,
      municipality: 'Carasi',
      province: 'Ilocos Norte',
      district_ids: ['leg:ilocos-norte:1st'],
      lng: 120.8652583,
      lat: 18.2188582,
      centroid_source: 'municipality_2023',
      counts: {house_only: 2, nep_only: 0, paired: 1, total: 3},
      row_ids: ['house-reading:a', 'house-reading:b', 'house-reading:c'],
    }],
    counts: {rows_by_class: {house_only: 2, nep_only: 0, paired: 1}},
  };
  const overlay = mpbApproxMapOverlay(supplement);
  assert.equal(overlay.features.length, 1);
  const props = overlay.features[0].properties;
  assert.equal(props.objectKind, 'mpb_approx');
  assert.equal(props.placement, 'psgc_centroid');
  assert.equal(props.count, 3);
  assert.equal(props.category, 'house_only'); // majority
  assert.equal(props.rowIds, 'house-reading:a,house-reading:b,house-reading:c');
  assert.deepEqual(mpbApproxPlacedRowIds(supplement),
    new Set(['house-reading:a', 'house-reading:b', 'house-reading:c']));

  const houseOnly = mpbApproxMarkerViews(overlay, {
    mpb_approx: {house_only: true, nep_only: false, paired: false},
  });
  assert.equal(houseOnly.features.length, 1);
  assert.equal(houseOnly.features[0].properties.count, 2);

  const none = mpbApproxMarkerViews(overlay, {
    mpb_approx: {house_only: false, nep_only: true, paired: false},
  });
  assert.equal(none.features.length, 0);
});

function badgeBy(badges, districtId) {
  return badges.features.find(f => f.properties.districtId === districtId);
}
