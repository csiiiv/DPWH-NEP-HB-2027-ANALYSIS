import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identityMatchStatus,
  matchesFlag,
  matchesMatchStatus,
  parseLegacyStatus,
  rowFlags,
} from './matchFilters.js';

test('identity match status splits exact, normalized, chainage, fuzzy and no match', () => {
  assert.equal(identityMatchStatus({house_match: 'exact_candidate'}), 'matched');
  assert.equal(identityMatchStatus({
    house_match: 'exact_candidate',
    reason: 'Titles match only after abbreviation/repeat normalization; raw spellings differ.',
  }), 'matched_normalized');
  assert.equal(identityMatchStatus({house_match: 'fuzzy_candidate'}), 'fuzzy');
  assert.equal(identityMatchStatus({
    house_match: 'chainage_candidate',
    reason: 'Same road title_base with differing chainage (increased project length).',
    nep: {id: 'n'},
    house: {id: 'h'},
  }), 'matched_chainage');
  assert.equal(identityMatchStatus({house_match: 'house_unmatched'}), 'no_match');
  assert.equal(identityMatchStatus({house_match: 'nep_unmatched'}), 'no_match');
});

test('flags cover presence, amount deltas and Transparency coverage', () => {
  assert.deepEqual(rowFlags({second: {id: 'h'}, nep: null}), ['house_only']);
  assert.deepEqual(rowFlags({nep: {id: 'n'}}), ['nep_only']);
  assert.ok(rowFlags({
    nep: {id: 'n'},
    house_minus_nep_php: 1e6,
    second: {id: 'h'},
  }).includes('amount_increase'));
  assert.ok(rowFlags({
    house_match: 'chainage_candidate',
    nep: {id: 'n'},
    second: {id: 'h'},
    house_minus_nep_php: -1e6,
  }).includes('amount_decrease'));
  assert.ok(rowFlags({
    api_presence: 'nep_not_in_transparency',
    nep: {id: 'n'},
    second: {id: 'h'},
  }).includes('transparency_gap'));
});

test('select helpers and legacy status mapping', () => {
  const fuzzy = {house_match: 'fuzzy_candidate', second: {id: 'h'}};
  assert.equal(matchesMatchStatus(fuzzy, 'fuzzy'), true);
  assert.equal(matchesMatchStatus(fuzzy, 'matched'), false);
  assert.equal(matchesFlag({nep: {id: 'n'}}, 'nep_only', new Map()), true);
  assert.equal(matchesFlag({nep: {id: 'n'}}, 'nep_only', new Map([['x', 1]])), true);
  assert.equal(matchesFlag({id: 'n', nep: {id: 'n'}}, 'nep_only', new Map([['n', 1]])), false);
  assert.equal(matchesFlag({id: 'n', nep: {id: 'n'}}, 'nep_only_suggested', new Map([['n', 1]])), true);
  assert.deepEqual(parseLegacyStatus('fuzzy_candidate'), {matchStatus: 'fuzzy', flag: '', trace: ''});
  assert.deepEqual(parseLegacyStatus('candidate_increase'), {matchStatus: '', flag: 'amount_increase', trace: ''});
});
