import test from 'node:test';
import assert from 'node:assert/strict';
import {niaLocationAggregates, locationFlagLabels, NIA_LOCATION_NOTE} from './niaLocationModel.js';

// A minimal workbench payload shaped like analysis-nia/data/nia_workbench.json.
const data = {
  comparison: [
    {id: 'pair:1:2', status: 'paired', delta_php: 100, house: {title: 'Cabugoan CIS', amount_php: 1000}, nep: {title: 'Cabugoan CIS', amount_php: 900}},
    {id: 'house_only:3', status: 'house_only', house: {title: 'Dupitac Sabo Dam', amount_php: 500}, nep: null},
    {id: 'nep_only:4', status: 'nep_only', house: null, nep: {title: 'Malingin CIS', amount_php: 300}},
  ],
  geolocation: {
    summary: {records: 3, located: 2, located_pct: 66.67, unlocated: 1, with_coordinates: 2,
      barangay_anchor: 1, municipality_anchor: 1},
    records: [
      {id: 'pair:1:2', located: true, coordinates: [124.1, 12.1], coordinate_anchor: 'barangay',
        flags: [], barangay: 'Cabugoan', municipality: 'Bogo', province: 'Cebu',
        legislative_district: 'CEBU (FOURTH DISTRICT)', psgc: '0721904003'},
      {id: 'house_only:3', located: true, coordinates: [120.7, 18.1], coordinate_anchor: 'municipality',
        flags: ['municipality_level_anchor'], barangay: 'Piddig', municipality: 'Piddig', province: 'Ilocos Norte',
        legislative_district: null, psgc: '0102818000'},
      {id: 'nep_only:4', located: false, coordinates: null, coordinate_anchor: null,
        flags: [], barangay: null, municipality: null, province: null, legislative_district: null, psgc: null},
    ],
  },
};

test('location aggregates group provinces, municipalities and districts over located rows', () => {
  const aggregates = niaLocationAggregates(data);
  assert.equal(aggregates.provinces.length, 2);
  assert.equal(aggregates.provinces[0].count, 1); // sorted by count desc then key
  const cebu = aggregates.provinces.find(p => p.key === 'Cebu');
  assert.equal(cebu.count, 1);
  assert.equal(cebu.amount_php, 1000);
  assert.equal(cebu.statuses.paired, 1);
  const bogo = aggregates.municipalities.find(m => m.key === 'Bogo · Cebu');
  assert.ok(bogo);
  const district = aggregates.districts.find(d => d.key === 'CEBU (FOURTH DISTRICT)');
  assert.ok(district);
  // The unlocated NEP-only row shows up as a coverage gap, not a location.
  assert.deepEqual(aggregates.unlocatedStatuses, {nep_only: 1});
});

test('flagged rows are surfaced with human labels', () => {
  const aggregates = niaLocationAggregates(data);
  assert.equal(aggregates.flagged.length, 1);
  assert.equal(aggregates.flagged[0].flags[0], 'municipality_level_anchor');
  assert.equal(locationFlagLabels.municipality_level_anchor, 'Municipality-level anchor');
  assert.ok(NIA_LOCATION_NOTE.includes('AI-assisted'));
});

test('missing geolocation layer yields null instead of throwing', () => {
  assert.equal(niaLocationAggregates({comparison: []}), null);
});
