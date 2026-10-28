import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {locationCards, summaryTotals, fmrRows, fmrExplorerRow, indexRowsById, cardRows} from './congressModel.js';
import {buildFmrRedFlags} from './fmrRedFlags.js';
import {fmrDistrictMapOverlay, fmrRecordMapOverlay} from './fmrSegmentOverlay.js';

const DATA = new URL('../../data/', import.meta.url);
const INDEX = new URL('fmr_legislative_index_2027.json', DATA);
const WORKBENCH = new URL('../../../other-analysis/data/fmr_workbench.json', import.meta.url);
const LOCATIONS = new URL('../../../other-analysis/data/fmr_psgc_locations_2027.json', import.meta.url);
const ready = [INDEX, WORKBENCH, LOCATIONS].every(existsSync);
const skip = ready ? false : {skip: 'FMR legislative artifacts not built'};
const read = url => JSON.parse(readFileSync(url, 'utf8'));
const index = ready ? read(INDEX) : null;
const workbench = ready ? read(WORKBENCH) : null;
const locations = ready ? read(LOCATIONS) : null;
const BUCKETS = ['insertions', 'deletions', 'increased', 'reduced', 'unchanged', 'scope_review'];

test(skip, 'FMR source extraction covers each stage project once', () => {
  assert.equal(locations.records.length, 1668);
  assert.equal(new Set(locations.records.map(record => record.record_id)).size, 1668);
  assert.equal(locations.summary.house, 964);
  assert.equal(locations.summary.nep, 704);
});

test(skip, 'every FMR comparison row is booked once and source totals remain intact', () => {
  const expected = new Set(workbench.comparison.map(row => row.id));
  const seen = new Set();
  for (const card of locationCards(index)) {
    for (const bucket of BUCKETS) for (const id of card.row_ids[bucket]) {
      assert.ok(expected.has(id), `${card.id} cites unknown ${id}`);
      assert.ok(!seen.has(id), `${id} is booked twice`);
      seen.add(id);
    }
  }
  assert.equal(seen.size, 1059);
  assert.equal(index.reconciliation.whole.sources.house.amount_php, 19_628_100_000);
  assert.equal(index.reconciliation.whole.sources.nep.amount_php, 16_000_000_000);
  const totals = summaryTotals(locationCards(index));
  assert.equal(totals.ties, true);
  assert.equal(totals.house.amount_php, 19_628_100_000);
  assert.equal(totals.nep.amount_php, 16_000_000_000);
});

test(skip, 'published FMR resolutions use explicit accepted bases', () => {
  const accepted = new Set(['title_coordinate', 'title_psgc', 'coordinate', 'spanning',
    'linked_stage', 'linked_stages_agree', 'title_coordinate_conflict',
    'stage_location_conflict', 'region', 'unassigned']);
  assert.equal(Object.keys(index.row_resolution).length, 1059);
  for (const [id, resolution] of Object.entries(index.row_resolution)) {
    assert.ok(accepted.has(resolution.basis), `${id}: ${resolution.basis}`);
    assert.ok(['district', 'range', 'region', 'unassigned'].includes(resolution.target_type));
  }
  // No endpoint union is published as a span unless the audit finds affirmative
  // title and coordinate evidence for the exact same district set.
  assert.equal(index.counts.basis.spanning ?? 0, 0);
});

test(skip, 'documented title regressions preserve exact PSGC interpretation', () => {
  const byTitle = new Map(locations.records.map(record => [record.raw_title, record]));
  const rango = byTitle.get('Construction of Sitio Rango, Brgy. Tubburan FMR, Brgy. Tubburan, Bacarra, Ilocos Norte');
  assert.equal(rango.title_match.selected_locations[0].name, 'Tubburan');

  const route = byTitle.get('Construction of Brgy. Escoda - Brgy. Elizabeth FMR, Brgy. Escoda and Brgy. Elizabeth, Marcos, Ilocos Norte');
  assert.deepEqual(route.title_match.selected_locations.map(location => location.name).sort(), ['Elizabeth', 'Escoda']);

  const typo = byTitle.get('Construction of Brgy. Cawayan FMR, Brgy. Cawayan, Bongabon, Oriental Mindoro');
  assert.deepEqual(typo.title_match.selected_locations, []);
  assert.ok(typo.title_match.review_flags.includes('title_or_heading_province_conflict'));

  const huc = byTitle.get('Construction of Brgy. Granada FMR, Brgy. Granada, Bacolod City, Negros Occidental');
  assert.deepEqual(huc.title_match.selected_locations.map(location => location.name), ['Granada']);
  assert.ok(huc.title_match.review_flags.includes('independent_city_with_separate_province_context'));
});

test(skip, 'unmatched barangay spelling retains a coherent one-district parent', () => {
  const byTitle = new Map(locations.records.map(record => [record.raw_title, record]));
  const ordinal = byTitle.get('Construction of Brgy. Sinulatan First FMR, Brgy. Sinulatan First, Camiling, Tarlac');
  assert.deepEqual(ordinal.title_match.selected_locations.map(location => location.name), ['Camiling']);
  assert.ok(ordinal.title_match.review_flags.includes('barangay_mentioned_but_unmatched'));

  const longerName = byTitle.get('Construction of Brgy. Silangan Calutan FMR, Agdangan, Quezon');
  assert.deepEqual(longerName.title_match.selected_locations.map(location => location.name), ['Agdangan']);

  const resolution = Object.values(index.row_resolution).find(entry =>
    entry.house?.project_id === ordinal.source_project_id);
  assert.equal(resolution.target_type, 'district');
  assert.equal(resolution.basis, 'title_psgc');
});

test(skip, 'location disagreements use conflict cards rather than ordinary region cards', () => {
  const conflictRows = new Set(Object.entries(index.row_resolution)
    .filter(([, resolution]) => ['title_coordinate_conflict', 'stage_location_conflict'].includes(resolution.basis))
    .map(([id]) => id));
  const conflictCards = index.region_cards.filter(card => card.location_tier === 'location_evidence_conflict');
  const booked = new Set(conflictCards.flatMap(card => Object.values(card.row_ids).flat()));
  assert.deepEqual(booked, conflictRows);
  assert.ok(conflictCards.every(card => card.card_label.includes('location-evidence conflicts')));
});

test(skip, 'browser adapter exposes FMR assignment and source evidence', () => {
  const rows = fmrRows(workbench);
  assert.equal(rows.length, 1059);
  const row = rows.find(candidate => index.row_resolution[candidate.id].basis === 'title_coordinate');
  const view = fmrExplorerRow(row, index.row_resolution[row.id]);
  assert.equal(view.assignment.label, 'Title PSGC + coordinates');
  assert.ok(view.assignment.detail.includes('comparison candidates'));
  assert.ok(view.pdf.length >= 1);
  assert.ok(view.coordinates.length >= 2);
});

test(skip, 'assignment evidence deduplicates locations and repeated stage coordinates', () => {
  const rows = fmrRows(workbench);
  const row = rows.find(candidate => candidate.title ===
    'Construction of NRJ, Soysoyan-Ballay-Tawangan-Lusod Proper FMR, Kabayan, Benguet');
  assert.ok(row);
  const view = fmrExplorerRow(row, index.row_resolution[row.id]);
  assert.equal(view.assignment.label, 'Title-coordinate conflict');
  assert.ok(view.assignment.evidence.includes('Kabayan, Benguet'));
  assert.ok(!view.assignment.evidence.includes('Kabayan, Kabayan'));
  assert.ok(view.assignment.evidence.includes('2 unique accepted PSGC points'));
  assert.ok(view.assignment.evidence.includes('4 stage observations'));
});

test(skip, 'legislative explorer reuses source-analysis flags without changing assignment', () => {
  const analysis = Object.fromEntries(['house', 'nep'].map(stage => [stage,
    new Map(buildFmrRedFlags(workbench, stage).rows.map(row => [row.id, row]))]));
  const row = fmrRows(workbench).find(candidate => candidate.title ===
    'Construction of NRJ, Soysoyan-Ballay-Tawangan-Lusod Proper FMR, Kabayan, Benguet');
  const resolution = index.row_resolution[row.id];
  const view = fmrExplorerRow(row, resolution, analysis);

  assert.deepEqual(view.assignmentFlags, resolution.flags);
  assert.ok(view.analysisFlags.includes('long_span'));
  assert.ok(view.analysisFlags.includes('locality_disagreement'));
  assert.ok(view.flags.includes('title_coordinate_conflict'));
  assert.equal(view.analysisFindings.filter(finding => finding.id === 'long_span').length, 2);
  assert.deepEqual(new Set(view.analysisFindings.map(finding => finding.stage)),
    new Set(['house', 'nep']));
  assert.ok(view.analysisMeasurementNote.includes('straight-line distances'));
});

test(skip, 'FMR explorer record exposes reviewed House and NEP segment overlays', () => {
  const row = fmrRows(workbench).find(candidate => candidate.title ===
    'Construction of NRJ, Soysoyan-Ballay-Tawangan-Lusod Proper FMR, Kabayan, Benguet');
  const view = fmrExplorerRow(row, index.row_resolution[row.id]);
  const overlay = fmrRecordMapOverlay(view);

  assert.deepEqual(overlay.stages.map(stage => stage.key), ['house', 'nep']);
  assert.equal(overlay.lines.features.length, 2);
  assert.equal(overlay.points.features.length, 4);
  assert.deepEqual(new Set(overlay.lines.features.map(feature => feature.properties.stage)),
    new Set(['house', 'nep']));
  for (const feature of [...overlay.lines.features, ...overlay.points.features]) {
    const coordinates = feature.geometry.type === 'Point'
      ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    assert.ok(coordinates.every(pair => pair.length === 2 && pair.every(Number.isFinite)));
  }
});

test(skip, 'segment overlay retains point-only source geometry', () => {
  const sourceId = 'ib:p689:r18';
  const row = fmrRows(workbench).find(candidate => candidate.third?.id === sourceId);
  const overlay = fmrRecordMapOverlay(fmrExplorerRow(row, index.row_resolution[row.id]));
  assert.equal(overlay.lines.features.filter(feature => feature.properties.projectId === sourceId).length, 0);
  assert.equal(overlay.points.features.filter(feature => feature.properties.projectId === sourceId).length, 1);
});

test(skip, 'district segment overlay partitions Nueva Ecija 1st rows by comparison status', () => {
  const card = locationCards(index).find(entry => entry.id === 'fmr:district:leg:nueva-ecija:1st');
  const rows = fmrRows(workbench);
  const views = cardRows(card, indexRowsById(rows))
    .map(row => fmrExplorerRow(row, index.row_resolution[row.id]));
  const overlay = fmrDistrictMapOverlay(views);

  assert.equal(views.length, 74);
  assert.deepEqual(Object.fromEntries(Object.entries(overlay.counts)
    .map(([key, value]) => [key, value.records])),
  {nep_only: 21, house_only: 31, paired: 22});
  assert.equal(overlay.lines.features.length, 96);
  assert.equal(overlay.points.features.length, 192);
  assert.ok(overlay.lines.features.every(feature =>
    views.some(view => view.id === feature.properties.recordId)));
});
