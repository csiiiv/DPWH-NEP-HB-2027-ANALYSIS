import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFF_FLAG_OPTIONS,
  identityMatchStatus,
  matchesFlag,
  matchesMatchStatus,
  parseLegacyStatus,
  rowDiffTags,
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
  assert.equal(identityMatchStatus({
    house_match: 'location_amendment_candidate',
    reason: 'Same project shell with a relocated province. Possible location reassignment amendment, not a new insertion.',
    nep: {id: 'n'},
    house: {id: 'h'},
  }), 'matched_location');
  assert.equal(identityMatchStatus({
    house_match: 'soft_match_candidate',
    reason: 'Same project shell; residual difference is a spelling/OCR slip. Soft-attached after review; tag=spelling_ocr.',
    nep: {id: 'n'},
    house: {id: 'h'},
  }), 'matched_soft');
  assert.equal(identityMatchStatus({
    house_match: 'scope_amendment_candidate',
    reason: 'Same project shell attached as a scope amendment after Tier-3 review.',
    nep: {id: 'n'},
    house: {id: 'h'},
  }), 'matched_scope');
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

test('diff-tag flags filter fuzzy rows by suggestion difference tags', () => {
  const row = {
    house_match: 'fuzzy_candidate',
    second: {id: 'h'},
    suggestions: [
      {confidence: .95, diff_tags: ['location_subname']},
      {confidence: .9, diff_tags: ['location_subname', 'chainage_digit']},
      {confidence: .88, diff_tags: ['identical']},
    ],
  };
  // All distinct non-identical tags across suggestions, order of appearance.
  assert.deepEqual(rowDiffTags(row), ['location_subname', 'chainage_digit']);
  assert.equal(matchesFlag(row, 'diff:location_subname'), true);
  assert.equal(matchesFlag(row, 'diff:chainage_digit'), true);
  // 'identical' never becomes a filter option or a row tag.
  assert.equal(matchesFlag(row, 'diff:identical'), false);
  assert.ok(!DIFF_FLAG_OPTIONS.some(([value]) => value === 'diff:identical'));
  assert.equal(matchesFlag(row, 'diff:spelling_ocr'), false);
  // Rows without suggestions match nothing.
  assert.equal(matchesFlag({house_match: 'exact_candidate', second: {id: 'h'}}, 'diff:location_subname'), false);
  // Plain flags still compose independently: a fuzzy row with House sources
  // and no attached NEP is also a house_only insertion candidate.
  assert.equal(matchesFlag(row, 'house_only'), true);
});
