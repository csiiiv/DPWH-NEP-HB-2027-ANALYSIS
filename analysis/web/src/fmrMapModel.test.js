import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUB_COLOR, PAIRED_COLOR, RED_FLAG_COLOR, MARKER_RADIUS, buildMapOverlay, coordKey, filterOverlayByObjects,
  normalizedPointCoordinates, offsetLine, stackForFeature,
} from './fmrMapModel.js';

const seg = (id, coordinates, index = 1, pointIds = []) => ({
  id, segment_index: index, section_label: '', coordinates,
  straight_line_distance_km: 1.2, point_ids: pointIds,
});
const point = (id, lon, lat, fragment, rules = []) => ({
  id, role: 'start', longitude: lon, latitude: lat, rules,
  source_fragment_raw: fragment, source_fragment_interpreted: fragment,
});
const project = (id, title, stage, coordinates, {
  status = 'normalized', amount = 1000, points = [], segments = null, segment_count = 1,
} = {}) => ({
  id, title, region_key: 'I', region: 'Region I', amount_php: amount, status,
  review_flags: [], original_review_flags: [], normalization_rules: [],
  segment_count, point_count: points.length || 2,
  source: {source_pdf: 'x.pdf', pdf_page: 1, printed_page: 1},
  coordinates: [coordinates],
  points,
  segments: segments || [seg(`${id}:segment1`, coordinates, 1, points.slice(0, 2).map(p => p.id))],
});

const coords = [[120.1, 18.1], [120.2, 18.2]];
const other = [[121.1, 16.1], [121.2, 16.2]];

function dataFixture() {
  const nepPts = [
    point('nep_a:p1', 120.1, 18.1, ' 18.1, 120.1\n'),
    point('nep_a:p2', 120.2, 18.2, ' 18.2, 120.2'),
  ];
  const housePts = [
    point('house_a:p1', 120.1, 18.1, ' 18.1, 120.1\n'),
    point('house_a:p2', 120.2, 18.2, ' 18.2, 120.2'),
  ];
  const houseBPts = [
    point('house_b:p1', 120.1, 18.1, ' 18.1, 120.1\n'),
    point('house_b:p2', 120.2, 18.2, ' 18.2, 120.2'),
  ];
  const houseDPts = [
    point('house_d:p1', 120.1, 18.1, ' 18.1, 120.1\n'),
    point('house_d:p2', 120.2, 18.2, ' 18.2, 120.2'),
  ];
  const nepCPts = [
    point('nep_c:p1', 121.1, 16.1, ' 16.1, 121.1\n'),
    point('nep_c:p2', 121.2, 16.2, ' 16.2, 121.2'),
  ];
  // Digit-repaired Escoda start: reviewed 18.00918, normalized printed 17.00918.
  const escodaPts = [
    point('ib:p667:r7:point1', 120.7245783, 18.00918, ' 17.00918, 120.7245783\n', ['off_by_one_digit_repair_accepted']),
    point('ib:p667:r7:point2', 120.732015, 17.9980347, ' 17.9980347, 120.732015'),
  ];
  const nepA = project('nep_a', 'Road A NEP', 'nep', coords, {points: nepPts, amount: 1000});
  const houseA = project('house_a', 'Road A House', 'house', coords, {points: housePts, amount: 1500});
  const houseB = project('house_b', 'Parallel Road 1', 'house', coords, {points: houseBPts});
  const houseD = project('house_d', 'Parallel Road 2', 'house', coords, {points: houseDPts});
  const nepC = project('nep_c', 'Solo NEP', 'nep', other, {points: nepCPts});
  const houseEscoda = project('ib:p667:r7', 'Escoda Elizabeth FMR', 'house',
    [[120.7245783, 18.00918], [120.732015, 17.9980347]], {
      points: escodaPts,
      normalization_rules: ['off_by_one_digit_repair_accepted'],
    });
  const multiSegs = [
    seg('house_m:segment1', [[120.3, 17.1], [120.4, 17.2]], 1, ['house_m:p1', 'house_m:p2']),
    seg('house_m:segment2', [[120.5, 17.3], [120.6, 17.4]], 2, ['house_m:p3', 'house_m:p4']),
  ];
  const houseM = project('house_m', 'Two section FMR', 'house', multiSegs[0].coordinates, {
    segment_count: 2,
    segments: multiSegs,
    points: [
      point('house_m:p1', 120.3, 17.1, ' 17.1, 120.3\n'),
      point('house_m:p2', 120.4, 17.2, ' 17.2, 120.4'),
      point('house_m:p3', 120.5, 17.3, ' 17.3, 120.5\n'),
      point('house_m:p4', 120.6, 17.4, ' 17.4, 120.6'),
    ],
  });
  return {
    stages: {
      nep: {key: 'nep', label: 'DBM NEP', projects: [nepA, nepC]},
      house: {key: 'house', label: 'House GAB', projects: [houseA, houseB, houseD, houseM, houseEscoda]},
    },
    comparison: [
      {id: 'pair:nep_a:house_a', status: 'paired', method: 'title_and_coordinates', region_key: 'I',
        nep_id: 'nep_a', house_id: 'house_a', delta_php: 500},
      {id: 'house_only:house_b', status: 'house_only', method: null, region_key: 'I',
        nep_id: null, house_id: 'house_b', delta_php: null},
      {id: 'house_only:house_d', status: 'house_only', method: null, region_key: 'I',
        nep_id: null, house_id: 'house_d', delta_php: null},
      {id: 'house_only:house_m', status: 'house_only', method: null, region_key: 'I',
        nep_id: null, house_id: 'house_m', delta_php: null},
      {id: 'house_only:ib:p667:r7', status: 'house_only', method: null, region_key: 'I',
        nep_id: null, house_id: 'ib:p667:r7', delta_php: null},
      {id: 'nep_only:nep_c', status: 'nep_only', method: null, region_key: 'I',
        nep_id: 'nep_c', house_id: null, delta_php: null},
    ],
  };
}

test('offsetLine shifts perpendicular without changing endpoint count', () => {
  const shifted = offsetLine(coords, 1, 45);
  assert.equal(shifted.length, 2);
  assert.notDeepEqual(shifted, coords);
  const mid = offsetLine(coords, 0);
  assert.deepEqual(mid, coords);
});

test('paired exact coordinates merge to one purple overlay at true geometry', () => {
  const {lines, hubs, increases, summary} = buildMapOverlay(dataFixture());
  const paired = lines.features.filter(f => f.properties.objectKind === 'paired');
  assert.equal(paired.length, 1);
  assert.equal(paired[0].properties.titleDiffers, true);
  assert.equal(paired[0].properties.houseTitle, 'Road A House');
  assert.equal(paired[0].properties.color, PAIRED_COLOR);
  assert.deepEqual(paired[0].geometry.coordinates, coords);
  assert.equal(JSON.parse(paired[0].properties.trueCoordinates).length, 2);
  const offset = lines.features.filter(f => f.properties.offset);
  assert.equal(offset.length, 2);
  assert.deepEqual(offset.map(f => f.properties.projectId).sort(), ['house_b', 'house_d']);
  assert.equal(hubs.features.length, 1);
  assert.equal(hubs.features[0].properties.color, HUB_COLOR);
  assert.equal(hubs.features[0].properties.objectKind, 'shared_marker');
  assert.equal(increases.features.length, 1);
  assert.equal(increases.features[0].properties.objectKind, 'pair_increase');
  assert.ok(summary.paired >= 1);
});

test('stackForFeature groups offset members by hub', () => {
  const {lines} = buildMapOverlay(dataFixture());
  const offset = lines.features.find(f => f.properties.offset);
  const stack = stackForFeature(lines, offset);
  assert.equal(stack.length, 2);
  assert.ok(stack.every(f => f.properties.hubKey === offset.properties.hubKey));
});

test('candidate status filter hides unpaired source-only rows', () => {
  const {lines, summary} = buildMapOverlay(dataFixture(), {status: 'paired'});
  assert.equal(summary.nep_only, 0);
  assert.equal(summary.house_only, 0);
  assert.equal(summary.paired, 1);
  assert.ok(lines.features.every(f => f.properties.objectKind === 'paired'));
});

test('Objects checklist can hide shared markers and pair deltas', () => {
  const full = buildMapOverlay(dataFixture());
  const filtered = filterOverlayByObjects(full, {
    nep_only: true, house_only: true, paired: true,
    shared_marker: false, pair_increase: false, pair_decrease: false, multi_segment: false,
  });
  assert.equal(filtered.hubs.features.length, 0);
  assert.equal(filtered.increases.features.length, 0);
  assert.equal(filtered.decreases.features.length, 0);
  assert.equal(filtered.multis.features.length, 0);
  assert.ok(filtered.lines.features.length > 0);
});

test('multi-segment projects emit a multi_segment marker', () => {
  const {multis, summary} = buildMapOverlay(dataFixture());
  assert.equal(summary.multis, 1);
  assert.equal(multis.features[0].properties.objectKind, 'multi_segment');
  assert.equal(multis.features[0].properties.projectId, 'house_m');
  assert.equal(multis.features[0].properties.segmentCount, 2);
});

test('NEP, House and paired markers remain independent from segment visibility', () => {
  const full = buildMapOverlay(dataFixture());
  const markersOnly = filterOverlayByObjects(full, {nep_only:false, house_only:false, paired:false});
  assert.equal(markersOnly.lines.features.length, 0);
  assert.equal(markersOnly.markers.features.length, full.lines.features.length);
  assert.equal(markersOnly.selectionLines.features.length, full.lines.features.length);
  assert.ok(markersOnly.markers.features.every(f => f.geometry.type === 'Point'));
  const segmentsOnly = filterOverlayByObjects(full, {nep_marker:false, house_marker:false, paired_marker:false});
  assert.equal(segmentsOnly.lines.features.length, full.lines.features.length);
  assert.equal(segmentsOnly.markers.features.length, 0);
  for (const [marker, matchKind] of [['nep_marker','nep_only'],['house_marker','house_only'],['paired_marker','paired']]) {
    const hidden = filterOverlayByObjects(full, {[marker]:false});
    assert.equal(hidden.lines.features.length, full.lines.features.length);
    assert.equal(hidden.markers.features.some(f => f.properties.matchKind === matchKind), false);
  }
});

test('Normalized undoes accepted digit repairs; Reviewed keeps them', () => {
  const reviewed = buildMapOverlay(dataFixture(), {coordBasis: 'reviewed'});
  const normalized = buildMapOverlay(dataFixture(), {coordBasis: 'normalized'});
  const reviewedSeg = reviewed.lines.features.find(f => f.properties.projectId === 'ib:p667:r7');
  const normalizedSeg = normalized.lines.features.find(f => f.properties.projectId === 'ib:p667:r7');
  assert.deepEqual(reviewedSeg.geometry.coordinates[0], [120.7245783, 18.00918]);
  assert.deepEqual(normalizedSeg.geometry.coordinates[0], [120.7245783, 17.00918]);
  assert.equal(reviewed.summary.coordBasis, 'reviewed');
});

test('normalizedPointCoordinates restores printed pairs for repaired points', () => {
  assert.deepEqual(
    normalizedPointCoordinates(point('ib:p667:r7:point1', 120.7245783, 18.00918, 'x')),
    [120.7245783, 17.00918],
  );
  assert.deepEqual(
    normalizedPointCoordinates(point('other:p1', 120.1, 18.1, 'x')),
    [120.1, 18.1],
  );
});

test('marker radius ramp is shared', () => {
  assert.equal(MARKER_RADIUS[0], 'interpolate');
  assert.ok(MARKER_RADIUS.includes(5.5));
});

test('coordKey is stable for identical arrays', () => {
  assert.equal(coordKey(coords), coordKey([[120.1, 18.1], [120.2, 18.2]]));
});

test('review markers retain a single printed point with no drawable road', () => {
  const data = dataFixture();
  const p = data.stages.house.projects.find(p => p.id === 'house_b');
  p.status = 'needs_review';
  p.review_flags = ['single_point_without_endpoint_roles'];
  p.segments = [];
  p.points = [point('house_b:point', 120.1, 18.1, '18.1, 120.1')];
  const overlay = buildMapOverlay(data);
  assert.equal(overlay.lines.features.some(f => f.properties.projectId === p.id), false);
  const review = overlay.flags.features.find(f => f.properties.objectKind === 'coordinate_review' && f.properties.projectId === p.id);
  assert.ok(review);
  assert.deepEqual(review.geometry.coordinates, [120.1, 18.1]);
  assert.equal(review.properties.houseId, p.id);
  assert.equal(review.properties.color, '#0369a1');
  assert.equal(filterOverlayByObjects(overlay, {coordinate_review: false}).flags.features.some(f => f.properties.objectKind === 'coordinate_review'), false);
  assert.ok(filterOverlayByObjects(overlay, {red_flag: false}).flags.features.some(f => f.properties.objectKind === 'coordinate_review'));
  assert.equal(filterOverlayByObjects(overlay, {red_flag: false}).summary.visible_flags, 0);
});

test('resolved historical flags do not emit red flags; unlocatable reviews are counted', () => {
  const data = dataFixture();
  const p = data.stages.house.projects.find(p => p.id === 'house_b');
  p.original_review_flags = ['source_numeric_repair_candidate'];
  assert.equal(buildMapOverlay(data).flags.features.filter(f => f.properties.objectKind === 'coordinate_review').length, 0);
  p.review_flags = ['missing_or_ambiguous_segment_endpoint'];
  p.segments = [];
  p.points = [point('house_b:point', null, null, 'unreadable')];
  const overlay = buildMapOverlay(data);
  assert.equal(overlay.flags.features.some(f => f.properties.projectId === p.id), false);
  assert.equal(overlay.summary.unmapped_flags, 1);
  assert.equal(buildMapOverlay(data, {status: 'paired'}).summary.unmapped_flags, 0);
});


test('analytical markers use source-wide calculations and remain independent of coordinate reviews', () => {
  const data = dataFixture();
  const p = data.stages.house.projects.find(p => p.id === 'house_b');
  p.segments[0].straight_line_distance_km = .05;
  const overlay = buildMapOverlay(data,{project:p.id});
  const flag = overlay.flags.features.find(f => f.properties.objectKind === 'red_flag' && f.properties.projectId === p.id);
  assert.ok(flag);assert.equal(flag.properties.color,RED_FLAG_COLOR);
  assert.ok(JSON.parse(flag.properties.analyticalFlags).some(f => f.id === 'short_span'));
  assert.ok(!overlay.flags.features.some(f => f.properties.objectKind === 'coordinate_review'));
  assert.equal(filterOverlayByObjects(overlay,{red_flag:false}).flags.features.length,0);
  assert.ok(!JSON.parse(buildMapOverlay(data,{project:p.id,rf_short_m:20}).flags.features.find(f => f.properties.projectId === p.id)?.properties.analyticalFlags || '[]').some(f => f.id === 'short_span'));
});

test('map focus matches exact source and candidate IDs', () => {
  const data = dataFixture();
  assert.equal(buildMapOverlay(data,{project:'missing'}).summary.projects,0);
  const full = buildMapOverlay(data);
  const id = data.comparison[0].id;
  assert.equal(buildMapOverlay(data,{pair:id}).summary.candidates,1);
  assert.ok(full.summary.candidates > 1);
});


test('co-located analytical flag stacks retain the selected source first and exclude review markers',()=>{
  const data=dataFixture(), overlay=buildMapOverlay(data);
  const flag=overlay.flags.features.find(f=>f.properties.objectKind==='red_flag');
  assert.ok(flag);
  const other={...flag,id:'other',properties:{...flag.properties,projectId:'other'}};
  const review={...flag,id:'review',properties:{...flag.properties,objectKind:'coordinate_review'}};
  const stack=stackForFeature({features:[other,review,flag]},flag);
  assert.deepEqual(stack.map(f=>f.id),[flag.id,'other']);
});
