import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {
  REPAIR_COLOR, fmrRecordMapOverlay, fmrRecordRepairOverlay, overlayFrameCoordinates,
} from './fmrSegmentOverlay.js';
import {DIGIT_REPAIR_PRINTED, reviewedPointCoordinates} from './fmrMapModel.js';

// The normalization audits are committed, so they always guard the drift checks
// below. The workbench payload is derived (predev/prebuild, gitignored), so the
// one test that reads it skips on a bare checkout instead of crashing on ENOENT
// — the same convention as congressModel.test.js. CI builds before testing, so
// it runs fully there.
const REPO = new URL('../../../', import.meta.url);
const AUDIT = layer => new URL(
  `other-analysis/data/${layer}_fmr_coordinate_normalization_audit.json`, REPO);
const WORKBENCH = new URL('other-analysis/data/fmr_workbench.json', REPO);
const haveWorkbench = existsSync(WORKBENCH);
const skipWorkbench = haveWorkbench
  ? false : {skip: 'FMR workbench payload not built — run predev/prebuild'};
const read = url => JSON.parse(readFileSync(url, 'utf8'));

// Tampac I: both stages printed END longitude 129.8030109 (outside Philippine
// bounds); the accepted digit repair moved it to 120.8030109 in Guimba.
const tampacRecord = () => ({
  id: 'pair:nep_fmr:p18:r15:ib:p685:r5',
  title: 'Construction of Brgy. Tampac I FMR, Brgy. Tampac I, Guimba, Nueva Ecija',
  status: 'paired',
  fmrProjects: {
    house: {
      id: 'ib:p685:r5', amount_php: 23375000, segment_count: 1,
      segments: [{id: 'ib:p685:r5:segment1', segment_index: 1, section_label: '',
        point_ids: ['ib:p685:r5:point1', 'ib:p685:r5:point2'],
        coordinates: [[120.7972783, 15.6352648], [120.8030109, 15.6377206]],
        straight_line_distance_km: 0.671845}],
      points: [
        {id: 'ib:p685:r5:point1', role: 'start', longitude: 120.7972783,
          latitude: 15.6352648, rules: []},
        {id: 'ib:p685:r5:point2', role: 'end', longitude: 120.8030109,
          latitude: 15.6377206, rules: ['off_by_one_digit_repair_accepted']},
      ],
    },
    nep: {
      id: 'nep_fmr:p18:r15', amount_php: 23375000, segment_count: 1,
      segments: [{id: 'nep_fmr:p18:r15:segment1', segment_index: 1, section_label: '',
        point_ids: ['nep_fmr:p18:r15:point1', 'nep_fmr:p18:r15:point2'],
        coordinates: [[120.7972783, 15.6352648], [120.8030109, 15.6377206]],
        straight_line_distance_km: 0.671845}],
      points: [
        {id: 'nep_fmr:p18:r15:point1', role: 'start', longitude: 120.7972783,
          latitude: 15.6352648, rules: []},
        {id: 'nep_fmr:p18:r15:point2', role: 'end', longitude: 120.8030109,
          latitude: 15.6377206, rules: ['off_by_one_digit_repair_accepted']},
      ],
    },
  },
});

test('repair overlay draws the printed twin and a connector on both stages', () => {
  const record = tampacRecord();
  const repair = fmrRecordRepairOverlay(record);
  assert.equal(repair.hasRepairs, true);
  assert.equal(repair.repairedPoints, 2);
  assert.deepEqual(repair.stages.map(stage => stage.key), ['house', 'nep']);
  // Printed twin keeps the accepted START and the pre-repair END.
  assert.equal(repair.lines.features.length, 2);
  for (const feature of repair.lines.features) {
    assert.deepEqual(feature.geometry.coordinates,
      [[120.7972783, 15.6352648], [129.8030109, 15.6377206]]);
    assert.equal(feature.properties.color, REPAIR_COLOR);
  }
  // One connector per repaired point, from printed to accepted.
  assert.equal(repair.connectors.features.length, 2);
  assert.deepEqual(repair.connectors.features[0].geometry.coordinates,
    [[129.8030109, 15.6377206], [120.8030109, 15.6377206]]);
  assert.equal(repair.printedPoints.features.length, 2);
  // The corrected overlay is untouched by the repair view.
  const overlay = fmrRecordMapOverlay(record);
  for (const feature of overlay.lines.features) {
    assert.deepEqual(feature.geometry.coordinates[1], [120.8030109, 15.6377206]);
  }
  // ~964 km displacement, matching the retained review evidence.
  const shift = repair.stages[0].points[0].shiftKm;
  assert.ok(shift > 960 && shift < 970, `unexpected shift ${shift}`);
});

test('records with no accepted repair draw no printed twin', () => {
  const record = tampacRecord();
  for (const project of Object.values(record.fmrProjects)) {
    for (const point of project.points) point.rules = [];
  }
  const repair = fmrRecordRepairOverlay(record);
  assert.equal(repair.hasRepairs, false);
  assert.equal(repair.lines.features.length, 0);
  assert.equal(repair.stages.length, 0);
});

test('a numeric re-read with no geometry change never draws a twin on the corrected line', () => {
  // ib:p703:r11 / nep_fmr:p30:r14 printed `123.691.92`; the accepted numeric
  // reading equals the retained value, so there is nothing to connect.
  const record = {
    id: 'x', title: 't', status: 'nep_only',
    fmrProjects: {
      house: null,
      nep: {
        id: 'nep_fmr:p30:r14', amount_php: 1000, segment_count: 1,
        segments: [{id: 'nep_fmr:p30:r14:segment1', segment_index: 1,
          point_ids: ['nep_fmr:p30:r14:point1', 'nep_fmr:p30:r14:point2'],
          coordinates: [[123.5, 12.5], [123.69192, 12.528813]]}],
        points: [
          {id: 'nep_fmr:p30:r14:point1', role: 'start', longitude: 123.5,
            latitude: 12.5, rules: []},
          {id: 'nep_fmr:p30:r14:point2', role: 'end', longitude: 123.69192,
            latitude: 12.528813, rules: ['source_numeric_repair_accepted']},
        ],
      },
    },
  };
  const repair = fmrRecordRepairOverlay(record);
  assert.equal(repair.hasRepairs, false);
  assert.equal(repair.lines.features.length, 0);
});

test('a repaired point with no retained printed reading never gains an invented twin', () => {
  const record = {
    id: 'x', title: 't', status: 'nep_only',
    fmrProjects: {
      house: null,
      nep: {
        id: 'nep_fmr:m2', amount_php: 1000, segment_count: 2,
        segments: [
          {id: 'nep_fmr:m2:segment1', segment_index: 1,
            point_ids: ['nep_fmr:m2:point1', 'nep_fmr:m2:point2'],
            coordinates: [[121.587138, 14.606378], [121.583835, 14.606694]]},
          {id: 'nep_fmr:m2:segment2', segment_index: 2,
            point_ids: ['nep_fmr:m2:point3', 'nep_fmr:m2:point4'],
            coordinates: [[121.583412, 14.606488], [121.579656, 14.606957]]},
        ],
        points: [
          {id: 'nep_fmr:m2:point1', role: 'start', longitude: 121.587138,
            latitude: 14.606378, rules: []},
          // DIGIT_REPAIR_PRINTED has no entry for this synthetic point, so the
          // printed twin for section 1 cannot be completed and is skipped.
          {id: 'nep_fmr:m2:point2', role: 'end', longitude: 121.583835,
            latitude: 14.606694, rules: ['off_by_one_digit_repair_accepted']},
          {id: 'nep_fmr:m2:point3', role: 'start', longitude: 121.583412,
            latitude: 14.606488, rules: []},
          {id: 'nep_fmr:m2:point4', role: 'end', longitude: 121.579656,
            latitude: 14.606957, rules: []},
        ],
      },
    },
  };
  const repair = fmrRecordRepairOverlay(record);
  assert.equal(repair.lines.features.length, 0,
    'a section whose printed reading is not retained must not gain an invented twin');
});

test('frame excludes the printed twin unless the reviewer asks for it', () => {
  const record = tampacRecord();
  const overlay = fmrRecordMapOverlay(record);
  const repair = fmrRecordRepairOverlay(record);
  const tight = overlayFrameCoordinates(overlay, repair, {includePrinted: false});
  const wide = overlayFrameCoordinates(overlay, repair, {includePrinted: true});
  assert.equal(tight.length, 8, 'corrected lines and points only');
  assert.ok(wide.length > tight.length);
  assert.ok(tight.every(pair => Math.abs(pair[0] - 120.8) < 0.02),
    'default frame stays on the corrected geometry, not the 964 km printed reading');
  assert.ok(wide.some(pair => Math.abs(pair[0] - 129.8030109) < 1e-6));
  assert.equal(overlayFrameCoordinates(overlay, null, {includePrinted: true}).length, 8);
});

test('repair overlay tolerates missing stages and empty projects', () => {
  assert.equal(fmrRecordRepairOverlay({fmrProjects: {house: null, nep: null}}).hasRepairs, false);
  assert.equal(fmrRecordRepairOverlay({}).hasRepairs, false);
  const empty = {fmrProjects: {house: {id: 'a', points: [], segments: []}, nep: null}};
  assert.equal(fmrRecordRepairOverlay(empty).hasRepairs, false);
});

// Traceability: DIGIT_REPAIR_PRINTED is a browser-side copy of the Python-side
// acceptance audit. If the audits change and this table goes stale, the printed
// twin would silently misreport what the source actually printed.
test('DIGIT_REPAIR_PRINTED matches the committed normalization audits', () => {
  const audits = ['nep', 'hgab'].map(layer => read(AUDIT(layer)));
  const audited = new Map(audits.flatMap(audit => (audit.digit_repairs || [])
    .map(entry => [entry.point_id, entry])));
  // Every retained printed reading agrees with the audit's printed pair.
  for (const [pointId, printed] of Object.entries(DIGIT_REPAIR_PRINTED)) {
    const entry = audited.get(pointId);
    assert.ok(entry, `${pointId} is not in any committed digit-repair audit`);
    assert.deepEqual(entry.printed, printed, `${pointId} printed pair drifted`);
    assert.notDeepEqual(entry.accepted, printed,
      `${pointId} has no geometry change; it should not be a drawable twin`);
  }
  // Every audit row that actually moved a coordinate is retained here, so the
  // modal never hides a repair with a drawable pre-acceptance position. Numeric
  // re-reads (printed == accepted) have no twin and are correctly absent.
  let moved = 0;
  for (const [pointId, entry] of audited) {
    if (!entry.printed || !entry.geometry_changed) continue;
    moved += 1;
    assert.ok(DIGIT_REPAIR_PRINTED[pointId],
      `${pointId} printed pair missing from DIGIT_REPAIR_PRINTED`);
  }
  assert.equal(moved, Object.keys(DIGIT_REPAIR_PRINTED).length,
    'retained printed readings must match the audit rows that moved geometry');
});

test(skipWorkbench, 'every retained printed reading differs from the accepted workbench value', () => {
  const workbench = read(WORKBENCH);
  const retained = new Map();
  for (const stage of ['house', 'nep']) {
    for (const project of workbench.stages[stage].projects) {
      for (const point of project.points || []) retained.set(point.id, point);
    }
  }
  for (const [pointId, printed] of Object.entries(DIGIT_REPAIR_PRINTED)) {
    const point = retained.get(pointId);
    assert.ok(point, `${pointId} is not in the workbench payload`);
    const accepted = reviewedPointCoordinates(point);
    assert.ok(accepted, `${pointId} has no accepted coordinate`);
    assert.notDeepEqual(printed, accepted,
      `${pointId} printed pair equals the accepted pair; no twin should be drawn`);
    assert.ok(printed.every(Number.isFinite), `${pointId} printed pair is not numeric`);
    assert.ok((point.rules || []).some(rule => rule.endsWith('repair_accepted')),
      `${pointId} lost its accepted-repair rule in the workbench payload`);
  }
});
