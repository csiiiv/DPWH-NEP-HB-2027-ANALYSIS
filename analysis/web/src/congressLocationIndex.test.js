import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hydrateProjects} from './comparisonData.js';
import {regionCandidates} from './regionCandidates.js';
import {partition} from './overviewSummary.js';
import {locationCards, LOCATION_TIER_LABELS, summaryTotals} from './congressModel.js';

/** Build-level guards for the location district lens index.
 *
 * Mirrors congressIndex.test.js's role for the DEO index: the committed
 * location_district_index_2027.json must classify every comparison row exactly
 * once, tie out to the published ledger across every numeric partition field,
 * enforce the five-layer resolution order, and retain every row exactly once.
 *
 * The index is derived (buildLocationLens.py, predev/prebuild, gitignored);
 * on a bare checkout the suite skips rather than crashing on ENOENT.
 */

const DATA = new URL('../../data/', import.meta.url);
const NAME = 'location_district_index_2027.json';
const haveData = ['comparison_projects_2027.json', 'congress_district_index_2027.json', NAME]
  .every(name => existsSync(new URL(name, DATA)));
const skip = haveData ? false : {skip: 'location lens datasets not built — run buildLocationLens.py'};

const read = name => JSON.parse(readFileSync(new URL(name, DATA)));
const detail = haveData ? read('comparison_projects_2027.json') : null;
const deoIndex = haveData ? read('congress_district_index_2027.json') : null;
const index = haveData ? read(NAME) : null;

const BUCKETS = ['insertions', 'deletions', 'increased', 'reduced', 'unchanged', 'scope_review'];
const leaves = (value, prefix = '', out = {}) => {
  if (typeof value === 'number') out[prefix] = value;
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
};

test(skip, 'every row lands on exactly one card — no residual, no double booking', () => {
  const rows = regionCandidates(hydrateProjects(detail));
  const byId = new Set(rows.map(row => row.id));
  const seen = new Map();
  for (const card of locationCards(index)) {
    assert.ok(card.location_tier in LOCATION_TIER_LABELS, `card ${card.id} lacks a chain tier`);
    for (const bucket of BUCKETS) {
      for (const id of card.row_ids[bucket]) {
        assert.ok(byId.has(id), `card ${card.id} cites unknown row ${id}`);
        assert.ok(!seen.has(id), `row ${id} booked to both ${seen.get(id)} and ${card.id}`);
        seen.set(id, card.id);
      }
    }
  }
  assert.equal(seen.size, rows.length, `${rows.length - seen.size} rows were dropped`);
  assert.equal(index.reconciliation.row_counts.total, rows.length);
  assert.equal(index.reconciliation.row_counts.cards, rows.length);
  assert.equal(index.reconciliation.row_counts.residual, 0);
});

test(skip, 'search-summary collations tie out across a filtered set, region cards included', () => {
  // The grid's Show summary modal collates whatever the filters left visible.
  // A live search's set can mix district and region/DEO cards, so the collated
  // movements must rebuild the collated stage totals on that mixed set too.
  const cards = locationCards(index).filter(card => card.ledger_names.length &&
    card.ledger_names.some(name => name.toLowerCase().includes('manila 3rd')));
  assert.ok(cards.length > 1, 'expected a mixed card set for the Manila 3rd DEO search');
  const totals = summaryTotals(cards);
  assert.equal(totals.cards, cards.length);
  assert.equal(totals.rows, cards.reduce((n, card) => n + card.rows, 0));
  assert.equal(totals.delta_php, totals.house.amount_php - totals.nep.amount_php);
  assert.equal(totals.ties, true, 'a filtered mixed set must tie out exactly');
  // The full grid — every tier at once — must tie to the published ledger.
  const whole = summaryTotals(locationCards(index));
  assert.equal(whole.ties, true);
  assert.equal(whole.house.amount_php, index.reconciliation.whole.sources.house.amount_php);
  assert.equal(whole.nep.amount_php, index.reconciliation.whole.sources.nep.amount_php);
});

test(skip, 'cards rebuild the published ledger exactly across every partition field', () => {
  const rows = regionCandidates(hydrateProjects(detail));
  const whole = partition(rows, 'third');
  const expected = leaves(whole), actual = {};
  for (const card of locationCards(index)) {
    for (const [path, value] of Object.entries(leaves(card.summary))) {
      actual[path] = (actual[path] ?? 0) + value;
    }
  }
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const key of keys) {
    assert.equal(actual[key] ?? 0, expected[key] ?? 0, `cards do not tie to the ledger on ${key}`);
  }
  assert.equal(index.reconciliation.tied_numeric_fields, keys.length);
  // The location lens covers the same ledger the DEO lens and Overview publish.
  assert.equal(whole.sources.house.amount_php, deoIndex.reconciliation.whole.sources.house.amount_php);
});

test(skip, 'every row publishes one of the five accepted resolution bases', () => {
  const bases = new Set(['title_psgc', 'deo_to_leg', 'deo', 'region', 'unassigned']);
  assert.equal(Object.keys(index.row_resolution).length, index.reconciliation.row_counts.total);
  for (const [id, resolution] of Object.entries(index.row_resolution)) {
    assert.ok(bases.has(resolution.basis), `${id}: ${resolution.basis}`);
  }
});

test(skip, 'card tier and row resolution basis agree', () => {
  for (const card of locationCards(index)) {
    for (const bucket of BUCKETS) for (const id of card.row_ids[bucket]) {
      assert.equal(index.row_resolution[id].basis, card.location_tier, `${id} vs ${card.id}`);
    }
  }
});

test(skip, 'disagreement flags are published, and every flag has detail', () => {
  const flags = index.counts.flags;
  assert.ok(flags.office_location_mismatch > 0);
  assert.ok(flags.changed_office > 0);
  for (const id of Object.keys(index.row_flags)) {
    if (index.row_flags[id].includes('office_location_mismatch')) {
      assert.ok(index.office_location_mismatch_detail[id],
        `row ${id} is flagged mismatched but carries no office-vs-location detail`);
    }
  }
});

test(skip, 'multi-district DEO money stays on DEO cards', () => {
  const cards = locationCards(index).filter(card => card.location_tier === 'deo');
  assert.ok(cards.length > 0);
  for (const card of cards) {
    assert.ok(card.undivided);
    // Undivided cards still name their co-served districts (and their
    // representatives) so the grid and the sort never face an empty list —
    // the DEO lens publishes the same shape on its Tier B cards.
    assert.ok(card.districts.length >= 2, `${card.id} must name its co-served districts`);
    assert.ok(card.districts.every(d => d.displayName), `${card.id} has a nameless member`);
    assert.ok(card.offices.length > 0);
    assert.match(card.tier_note, /full allocation stays on the DEO/i);
  }
});

test(skip, 'region catch-all cards are plain about not being districts', () => {
  for (const card of index.region_cards) {
    assert.ok(['region', 'unassigned'].includes(card.location_tier));
    // 'region' — not DEO-lens 'none': these cards carry real money at region
    // grain, and cardCarriesMoney must let them show it.
    assert.equal(card.tier, card.location_tier);
    assert.deepEqual(card.districts, [], 'a region card must not name districts');
    assert.equal(card.representative, null, 'a region card has no representative');
    assert.ok(card.card_label, 'a region card must carry its region label');
    // The card must actually carry what it claims: a ₱0 region catch-all would
    // mean the fallback chain routed its rows somewhere unexpected.
    assert.ok(card.rows > 0, `${card.card_label} carries no rows`);
  }
  assert.ok(index.region_cards.length >= 15);
});

test(skip, 'title PSGC without a DEO, coordinate, or direct title context falls to region', () => {
  const row = Object.entries(index.row_resolution).find(([, r]) =>
    r.title_psgc && !r.deo_group_ids.length && !r.title_psgc.coordinate_corroborated &&
    !r.title_psgc.title_context_corroborated);
  assert.ok(row, 'expected a locatable title with neither gate');
  assert.equal(row[1].basis, 'region');
  assert.equal(row[1].title_gate, null);
});

test(skip, 'coordinate-corroborated title PSGC can pass without a printed DEO', () => {
  const cases = [
    ['house-reading:6124', 'leg:quezon-city:3rd', 'Matandang Balara'],
    ['house-reading:10612', 'leg:paranaque-city:2nd', 'San Antonio'],
  ];
  for (const [id, district, locality] of cases) {
    const r = index.row_resolution[id];
    assert.equal(r.basis, 'title_psgc', id);
    assert.equal(r.target_id, district, id);
    assert.equal(r.title_gate, 'coordinate', id);
    assert.equal(r.title_psgc.name, locality, id);
    assert.equal(r.title_psgc.coordinate_corroborated, true, id);
    assert.deepEqual(r.deo_group_ids, [], `${id} must not manufacture a DEO`);
  }
});

test(skip, 'positive title context can pass without a DEO or coordinate', () => {
  const cases = [
    ['house-reading:4908', 'leg:misamis-oriental:1st', 'Mandangoa'],
    ['house-reading:9769', 'leg:misamis-oriental:2nd', 'Taytayan'],
    ['house-reading:9770', 'leg:misamis-oriental:2nd', 'Taytayan'],
  ];
  for (const [id, district, locality] of cases) {
    const r = index.row_resolution[id];
    assert.equal(r.basis, 'title_psgc', id);
    assert.equal(r.target_id, district, id);
    assert.equal(r.title_gate, 'title_context', id);
    assert.equal(r.title_psgc.name, locality, id);
    assert.equal(r.title_psgc.title_context_corroborated, true, id);
    assert.deepEqual(r.deo_group_ids, [], `${id} must not manufacture a DEO`);
  }
});

test(skip, 'registry-only title candidates remain in the region fallback', () => {
  const r = index.row_resolution['house-reading:2761'];
  assert.equal(r.basis, 'region');
  assert.equal(r.title_gate, null);
  assert.equal(r.title_psgc.title_context_corroborated, false);
  assert.equal(r.title_psgc.text_support, 0);
});

test(skip, 'reviewed named sites refine multi-district NCR cities', () => {
  const cases = [
    ['house-reading:16141', 'leg:manila:4th', '1380606016', 'pup-rizal-campus-lepanto'],
    ['house-reading:16142', 'leg:manila:6th', '1380606235', 'pup-ndc-compound-pureza'],
    ['house-reading:16154', 'leg:quezon-city:4th', '1381300124', 'up-resilience-institute-diliman'],
  ];
  for (const [id, district, psgc, site] of cases) {
    const r = index.row_resolution[id];
    assert.equal(r.basis, 'title_psgc', id);
    assert.equal(r.target_id, district, id);
    assert.equal(r.title_gate, 'named_site', id);
    assert.equal(r.named_site_id, site, id);
    assert.equal(r.title_psgc.psgc_code, psgc, id);
    assert.ok(r.title_psgc.named_site_sources.length >= 2, id);
    assert.deepEqual(r.deo_group_ids, [], `${id} must retain Central Office without a synthetic DEO`);
  }
});

test(skip, 'Bulacan examples retain coordinate and office diagnostics', () => {
  const obando = index.row_resolution['house-reading:4042'];
  assert.equal(obando.basis, 'title_psgc');
  assert.equal(obando.target_id, 'leg:bulacan:4th');
  assert.equal(obando.title_psgc.name, 'Paco');
  assert.equal(obando.title_psgc.coordinate_corroborated, false,
    'the printed points spatially conflict with the Obando title');

  const sjdm = index.row_resolution['house-reading:7659'];
  assert.equal(sjdm.basis, 'title_psgc');
  assert.equal(sjdm.target_id, 'leg:san-jose-del-monte-city:lone');
  assert.equal(sjdm.title_psgc.name, 'Santo Niño II');
  assert.equal(sjdm.title_psgc.coordinate_corroborated, true,
    'the longitude-first point must be reordered and spatially corroborate the title');
});

test(skip, 'district cards publish their printed implementing DEOs and are findable by office name', () => {
  // The card face shows the offices the budget documents print for its rows,
  // and the grid search matches ledger_names — so typing a DEO must surface
  // the district cards it printed records onto.
  const cards = locationCards(index).filter(c =>
    c.location_tier === 'title_psgc' || c.location_tier === 'deo_to_leg');
  const withOffices = cards.filter(c => c.ledger_names.length > 0);
  assert.ok(withOffices.length > 400, 'most district cards carry printed DEOs');
  for (const card of withOffices) {
    for (const name of card.ledger_names) {
      assert.match(name, /district engineering office/i,
        `${card.id}: ledger_names must hold implementing offices, not places`);
    }
  }
  // Searching "Nueva Ecija 1st District Engineering Office" must surface the
  // NE 2nd located card (the Bantug/Poblacion East projects print NE 1st DEO
  // while sitting in NE 2nd by title location).
  const needle = 'nueva ecija 1st district engineering office';
  const hits = locationCards(index).filter(card =>
    card.ledger_names.some(name => name.toLowerCase().includes(needle)));
  assert.ok(hits.some(c => c.id === 'location:title_psgc:leg:nueva-ecija:2nd'),
    'DEO search must reach the district whose projects that office printed');
});

test(skip, 'barangay selections locate through their ancestry chain (the Licab regression)', () => {
  // house-reading:4129 — "Brgy. Aquino, Licab, Nueva Ecija" — resolves at
  // barangay level (0304914013), which the municipality-keyed assignment
  // table cannot see directly. v1 dropped it to the region catch-all; the
  // ancestry rollup (§3.2) must place it on Nueva Ecija 1st with its PSGC
  // chain intact for the explorer column.
  const psgc = index.row_psgc?.['house-reading:4129'];
  assert.ok(psgc, 'the Licab row must carry its resolved PSGC chain');
  assert.equal(psgc.barangay, 'Aquino');
  assert.equal(psgc.municipality, 'Licab');
  assert.equal(psgc.province, 'Nueva Ecija');
  const card = index.cards.find(c => (c.row_ids?.house_only ?? [])
    .includes('house-reading:4129') || Object.values(c.row_ids ?? {})
    .some(ids => ids.includes('house-reading:4129')));
  assert.ok(card, 'the Licab row must sit on a card');
  assert.equal(card.location_tier, 'title_psgc');
  assert.equal(card.districts[0]?.id, 'leg:nueva-ecija:1st');
});

test(skip, 'the five bases conserve the whole ledger', () => {
  const share = index.counts.located_rows / 17613;
  assert.ok(share > 0.7,
    `located share collapsed to ${(share * 100).toFixed(1)}% — ancestry rollup broken?`);
  const total = index.counts.title_psgc_rows + index.counts.deo_to_leg_rows +
    index.counts.deo_rows + index.counts.region_rows + index.counts.unassigned_rows;
  assert.equal(total, 17613);
});

test(skip, 'Nangcaon resolves to Opol → Misamis Oriental 2nd and keeps changed-office evidence', () => {
  const r = index.row_resolution['house-reading:2410'];
  assert.equal(r.basis, 'title_psgc');
  assert.equal(r.target_id, 'leg:misamis-oriental:2nd');
  assert.equal(r.title_psgc.name, 'Opol');
  assert.equal(r.title_psgc.psgc_code, '1004321000');
  assert.equal(r.title_gate, 'printed_deo');
  assert.deepEqual(r.printed_offices.map(o => o.office), [
    'Central Office', 'Central Office', 'Central Office',
    'Misamis Oriental 2nd District Engineering Office',
  ]);
  assert.ok(index.row_flags['house-reading:2410'].includes('changed_office'));
});

test(skip, 'provenance pins every input hash', () => {
  const names = Object.keys(index.input_provenance).sort();
  assert.deepEqual(names, ['assignments', 'cleaned', 'comparison', 'crosswalk',
    'deo_index', 'districts', 'geojson', 'named_sites']);
  for (const entry of Object.values(index.input_provenance)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    const bytes = readFileSync(new URL(`../../../${entry.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
      `${entry.path} does not hash to the recorded digest`);
  }
});

// ---------------------------------------------------------------------------
// Map artifact (#congress/map)
// ---------------------------------------------------------------------------

const MAP_NAME = 'congress_district_map_2027.json';
const haveMap = existsSync(new URL(MAP_NAME, DATA));
const mapSkip = haveData && haveMap ? false : {skip: 'district map not built — run buildLocationLens.py'};
const map = haveMap ? read(MAP_NAME) : null;

test(mapSkip, 'the map artifact covers all 254 districts with lens figures', () => {
  assert.equal(map.type, 'FeatureCollection');
  assert.equal(map.features.length, 254);
  const lensIds = new Set(Object.keys(index.districts));
  const statuses = new Set(['matched', 'nep_only', 'house_only', 'none']);
  for (const feature of map.features) {
    const p = feature.properties;
    assert.ok(lensIds.has(p.district_id), `${p.psgc_leg_id} bridges to unknown lens id`);
    assert.ok(Number.isFinite(p.located_house_php) && p.located_house_php >= 0);
    assert.ok(Number.isFinite(p.located_nep_php) && p.located_nep_php >= 0);
    assert.ok(Number.isFinite(p.deo_house_php) && p.deo_house_php >= 0);
    assert.ok(Number.isFinite(p.matched_house_php) && p.matched_house_php >= 0);
    assert.ok(Number.isFinite(p.matched_nep_php) && p.matched_nep_php >= 0);
    assert.ok(Number.isInteger(p.insertion_count) && p.insertion_count >= 0);
    assert.ok(Number.isInteger(p.deletion_count) && p.deletion_count >= 0);
    assert.ok(statuses.has(p.pair_status), `${p.district_id} bad pair_status ${p.pair_status}`);
    // Matched money (unchanged + adjustments) never exceeds stage totals and
    // is never negative; unpaired figures are the residual, not additive.
    assert.ok(p.matched_house_php <= p.located_house_php, `${p.district_id} matched house > total`);
    assert.ok(p.matched_nep_php <= p.located_nep_php, `${p.district_id} matched nep > total`);
    assert.ok(Array.isArray(p.deo_card_ids));
    assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
  }
});

test(mapSkip, 'map figures tie to the location and DEO indexes exactly', () => {
  // Located money per district must equal the B_district card totals.
  let locatedTotal = 0;
  for (const feature of map.features) {
    const cards = index.cards.filter(c => ['title_psgc', 'deo_to_leg'].includes(c.location_tier) &&
      c.districts[0]?.id === feature.properties.district_id);
    const expectedHouse = cards.reduce((sum, c) => sum + c.summary.sources.house.amount_php, 0);
    const expectedRows = cards.reduce((sum, c) => sum + c.rows, 0);
    assert.equal(feature.properties.located_house_php,
      expectedHouse,
      `${feature.properties.district_id} map figure ≠ card total`);
    assert.equal(feature.properties.located_rows, expectedRows);
    assert.deepEqual(feature.properties.location_card_ids, cards.map(c => c.id));
    locatedTotal += feature.properties.located_house_php;
  }
  assert.equal(locatedTotal, index.counts.located_house_php);
  // DEO money per district must equal the DEO cards naming that district.
  const deoByDistrict = new Map();
  for (const card of deoIndex.cards) {
    for (const district of card.districts) {
      const entry = deoByDistrict.get(district.id) ?? {house: 0, rows: 0};
      entry.house += card.summary.sources.house.amount_php;
      entry.rows += card.rows;
      deoByDistrict.set(district.id, entry);
    }
  }
  for (const feature of map.features) {
    const expected = deoByDistrict.get(feature.properties.district_id) ?? {house: 0, rows: 0};
    assert.equal(feature.properties.deo_house_php, expected.house,
      `${feature.properties.district_id} DEO map figure ≠ card total`);
    assert.equal(feature.properties.deo_rows, expected.rows);
  }
  // Mismatch rows per district must sum to the flagged total (a row's located
  // district is where it lands, so mismatches attribute there).
  const mismatchTotal = map.features.reduce((total, f) => total + f.properties.mismatch_rows, 0);
  assert.equal(mismatchTotal, index.counts.flags.office_location_mismatch);
});

test(mapSkip, 'geometry is passed through from the PSGC2LEG viz build', () => {
  // The builder must not re-project or resimplify: identical coordinates with
  // the source geojson (spot-check the first feature's ring).
  const viz = JSON.parse(readFileSync(new URL('../../../PSGC2LEG/viz/leg_districts.geojson', import.meta.url)));
  const byPsgc = new Map(viz.features.map(f => [f.properties.leg_id, f]));
  for (const feature of map.features.slice(0, 12)) {
    const source = byPsgc.get(feature.properties.psgc_leg_id);
    assert.ok(source, `source feature missing for ${feature.properties.psgc_leg_id}`);
    assert.deepEqual(feature.geometry, source.geometry);
  }
});
