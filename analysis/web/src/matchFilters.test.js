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
  flagLabel,
  REVIEW_FLAG_INFO,
} from './matchFilters.js';
import {officeDiscrepancy} from '../../viewers/project_offices.mjs';

test('changed office catches a Transparency discrepancy even when the budget stages agree', () => {
  const row = {
    second: {id: 'h2', office: 'Central Office'},
    third: {id: 'h3', office: 'Central Office'},
    nep: {id: 'n', office: 'Central Office'},
    api: {id: 'a', office: 'Misamis Oriental 2nd District Engineering Office'},
  };
  assert.ok(rowFlags(row).includes('changed_office'));
  assert.equal(matchesFlag(row, 'changed_office'), true);
  assert.equal(flagLabel('changed_office'), 'Changed office');
  assert.match(REVIEW_FLAG_INFO.changed_office[1], /not proof/);
  assert.deepEqual(officeDiscrepancy(row).assignments.map(a => [a.stage, a.office]), [
    ['second', 'Central Office'], ['third', 'Central Office'], ['nep', 'Central Office'],
    ['api', 'Misamis Oriental 2nd District Engineering Office'],
  ]);
});

test('changed office compares the earlier reading and each grouped source record', () => {
  assert.ok(rowFlags({second: {office: 'Central Office'}, third: {office: 'Tarlac DEO'}})
    .includes('changed_office'));
  const row = {third: {records: [{id: 'h1', office: 'Central Office'},
    {id: 'h2', office: 'Tarlac DEO'}]}, nep: {id: 'n', office: 'Central Office'}};
  assert.ok(rowFlags(row).includes('changed_office'));
  assert.deepEqual(officeDiscrepancy(row).assignments.map(a => a.id), ['h1', 'h2', 'n']);
  assert.ok(rowFlags({house: {office: 'Tarlac DEO'}, nep: {office: 'Tarlac City DEO'}})
    .includes('changed_office'));
});

test('normalization, missing offices and suggestions do not imply a changed office', () => {
  for (const [left, right] of [
    ['Las Pi ñ as-Muntinlupa DEO', 'Las Piñas Muntinlupa District Engineering Office'],
    ['Camarines Norte Sub-DEO', 'Camarines Norte Sub District Engineering Office'],
    ['Misamis Occidenatal 1st DEO', 'Misamis Occidental 1st District Engineering Office'],
    ['Regional Office IVA', 'Regional Office IV-A'],
    [' CENTRAL OFFICE ', 'Central Office'],
  ]) {
    const row = {third: {office: left}, nep: {office: right}};
    assert.equal(officeDiscrepancy(row), null, `${left} vs ${right}`);
    assert.equal(matchesFlag(row, 'changed_office'), false);
  }
  assert.equal(officeDiscrepancy({third: {office: 'OCR office', office_canonical: 'Tarlac DEO'},
    nep: {office: 'Tarlac District Engineering Office'}}), null);
  for (const row of [{}, {third: {office: 'Central Office'}, nep: {}},
    {third: {office: 'Central Office'}, suggestions: [{office: 'Tarlac DEO'}]}]) {
    assert.equal(officeDiscrepancy(row), null);
    assert.equal(matchesFlag(row, 'changed_office'), false);
  }
});

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
  // Unified comparison rows without house_minus_nep_php: the paired delta is
  // derived from the attached sides (3rd reading preferred).
  assert.ok(rowFlags({
    nep: {id: 'n', amount_php: 5},
    third: {id: 'h', amount_php: 5},
  }).includes('amount_same'));
  assert.ok(rowFlags({
    nep: {id: 'n', amount_php: 5},
    third: {id: 'h', amount_php: 7},
    trace: 'exact_candidate',
  }).includes('amount_increase'));
  assert.ok(rowFlags({
    api_presence: 'nep_not_in_transparency',
    nep: {id: 'n'},
    second: {id: 'h'},
  }).includes('transparency_gap'));
});

test('segment-scope review rows carry the scope flag, not amount flags', () => {
  // Trace-level segment scope (stage trace vocabulary).
  const traceRow = {
    trace: 'segment_scope_review',
    house_match: 'segment_scope_candidate',
    nep: {id: 'n', amount_php: 5},
    third: {id: 'h', amount_php: 50},
  };
  assert.equal(identityMatchStatus(traceRow), 'matched_segment_scope');
  assert.ok(rowFlags(traceRow).includes('segment_scope'));
  assert.ok(!rowFlags(traceRow).includes('amount_increase'));
  // Prefix variants map through the legacy vocabulary.
  assert.deepEqual(parseLegacyStatus('segment_scope_review'), {matchStatus: 'matched_segment_scope', flag: '', trace: ''});
  assert.equal(parseLegacyStatus('transparency_gap_then_segment_scope_review').flag, 'transparency_gap');
  assert.equal(matchesFlag(traceRow, 'segment_scope'), true);
});

test('twin-review rows are flagged without changing their match status', () => {
  const row = {
    house_match: 'house_unmatched',
    second: {id: 'h'},
    twin_review: {kind: 'twin_unmatched_pair', other_side_id: 'n'},
  };
  assert.equal(identityMatchStatus(row), 'no_match');
  assert.ok(rowFlags(row).includes('house_only'));
  assert.ok(rowFlags(row).includes('twin_review'));
  assert.equal(matchesFlag(row, 'twin_review'), true);
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
