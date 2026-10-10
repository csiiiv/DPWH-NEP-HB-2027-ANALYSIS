/** Identity quality vs inspection flags for Compare project filters.

Match status is mutually exclusive (how titles paired). Flags are orthogonal
(presence, amount delta, Transparency coverage) and may combine with status.
*/

export const MATCH_STATUS_OPTIONS = [
  ['matched', 'Already matched'],
  ['matched_normalized', 'Matched after normalization'],
  ['matched_chainage', 'Matched after chainage check'],
  ['fuzzy', 'Fuzzy match'],
  ['ambiguous', 'Ambiguous key'],
  ['no_match', 'No match'],
];

export const FLAG_OPTIONS = [
  ['house_only', 'House only candidate'],
  ['nep_only', 'NEP only candidate'],
  ['nep_only_suggested', 'NEP only · possible replacement'],
  ['amount_increase', 'NEP → HGAB increased'],
  ['amount_decrease', 'NEP → HGAB decreased'],
  ['transparency_gap', 'Transparency gap (NEP not listed)'],
  ['outside_api', 'Outside Transparency scope'],
];

export const MATCH_STATUS_INFO = Object.fromEntries([
  ['matched', ['Already matched', 'Unique House↔NEP pair under the retained matching key with identical raw titles. Identity remains provisional.']],
  ['matched_normalized', ['Matched after normalization', 'Unique House↔NEP pair whose titles agree only after live normalize rules (Brgy./place slips/structure IDs) or another retained pairing rule. Printed titles stay as extracted.']],
  ['matched_chainage', ['Matched after chainage check', 'Unique House↔NEP pair that shares the same road title_base with differing station spans. Attached for identity; reasons include station-marker adjustment, increased/decreased project length, or re-segmentation. Amount flags still apply.']],
  ['fuzzy', ['Fuzzy match', 'High title similarity in the same scope with residual OCR/spelling drift. Primary queue for new normalize rules; suggestions do not attach the NEP row.']],
  ['ambiguous', ['Ambiguous key', 'Duplicate exact matching keys prevent a unique one-to-one pairing.']],
  ['no_match', ['No match', 'House-only or NEP-only under the retained matcher — no unique exact pair and no fuzzy suggestion on this row.']],
  // Legacy deep links that still ask for match=chainage.
  ['chainage', ['Matched after chainage check', 'Same road title_base with differing station spans — now an attached match after chainage check.']],
]);

export const REVIEW_FLAG_INFO = Object.fromEntries([
  ['house_only', ['House only candidate', 'House record with no attached NEP or Transparency source. Not a confirmed insertion.']],
  ['nep_only', ['NEP only candidate', 'NEP record with no attached House reading. Not a confirmed deletion.']],
  ['nep_only_suggested', ['NEP only · possible replacement', 'NEP-only row that an unmatched House row names as a fuzzy counterpart.']],
  ['amount_increase', ['NEP → HGAB increased', 'Retained candidate pair where House amount is larger than NEP.']],
  ['amount_decrease', ['NEP → HGAB decreased', 'Retained candidate pair where House amount is smaller than NEP.']],
  ['transparency_gap', ['Transparency gap', 'Printed NEP allocation missing from the retained Transparency listing.']],
  ['outside_api', ['Outside Transparency scope', 'NEP record outside the Transparency listing scope (commonly FAP).']],
]);

/** Map legacy status= / trace values onto the new match/flag model. */
export const LEGACY_STATUS_MAP = {
  exact_candidate: {matchStatus: 'matched'},
  amount_same: {matchStatus: 'matched'},
  fuzzy_candidate: {matchStatus: 'fuzzy'},
  chainage_candidate: {matchStatus: 'matched_chainage'},
  chainage: {matchStatus: 'matched_chainage'},
  ambiguous: {matchStatus: 'ambiguous'},
  house_only_candidate: {flag: 'house_only'},
  nep_only_candidate: {flag: 'nep_only'},
  candidate_increase: {flag: 'amount_increase'},
  candidate_decrease: {flag: 'amount_decrease'},
  transparency_gap_nep_only: {flag: 'transparency_gap'},
  transparency_gap_then_amount_same: {flag: 'transparency_gap'},
  transparency_gap_then_candidate_increase: {flag: 'transparency_gap'},
  transparency_gap_then_candidate_decrease: {flag: 'transparency_gap'},
  outside_api_nep_only: {flag: 'outside_api'},
  outside_api_then_amount_same: {flag: 'outside_api'},
  outside_api_then_candidate_increase: {flag: 'outside_api'},
  outside_api_then_candidate_decrease: {flag: 'outside_api'},
  region_difference_candidate: {matchStatus: 'matched_normalized'},
};

const MATCH_VALUES = new Set(MATCH_STATUS_OPTIONS.map(([v]) => v));
const FLAG_VALUES = new Set(FLAG_OPTIONS.map(([v]) => v));

export function identityMatchStatus(row) {
  const hm = row.house_match;
  if (hm === 'exact_candidate') return row.reason ? 'matched_normalized' : 'matched';
  if (hm === 'chainage_candidate') return 'matched_chainage';
  if (hm === 'fuzzy_candidate' || row.trace === 'fuzzy_candidate') return 'fuzzy';
  if (hm === 'ambiguous' || row.trace === 'ambiguous') return 'ambiguous';
  if (hm === 'region_difference_candidate' || row.trace === 'region_difference_candidate') {
    return 'matched_normalized';
  }
  if (hm === 'house_unmatched' || hm === 'nep_unmatched') return 'no_match';
  // Unified rows without house_match: infer from attached sides / trace.
  if (row.trace === 'fuzzy_candidate') return 'fuzzy';
  if (row.trace === 'ambiguous') return 'ambiguous';
  if (row.nep && (row.second || row.third || row.house)) {
    if (typeof row.reason === 'string' && /chainage|station numbers differing/i.test(row.reason)) {
      return 'matched_chainage';
    }
    return row.reason || row.region_difference ? 'matched_normalized' : 'matched';
  }
  return 'no_match';
}

export function rowFlags(row, counterparts = null) {
  const flags = [];
  const hasHouse = Boolean(row.second || row.third || row.house);
  const hasNep = Boolean(row.nep);
  if (hasHouse && !hasNep && !row.api) flags.push('house_only');
  if (hasNep && !hasHouse) {
    flags.push('nep_only');
    if (counterparts?.has(row.id)) flags.push('nep_only_suggested');
  }
  const delta = row.house_minus_nep_php;
  if (delta != null && delta > 0) flags.push('amount_increase');
  else if (delta != null && delta < 0) flags.push('amount_decrease');
  else if (typeof row.trace === 'string') {
    if (row.trace.includes('candidate_increase')) flags.push('amount_increase');
    else if (row.trace.includes('candidate_decrease')) flags.push('amount_decrease');
  }
  if (row.api_presence === 'nep_not_in_transparency' || (typeof row.trace === 'string' && row.trace.includes('transparency_gap'))) {
    flags.push('transparency_gap');
  }
  if (row.api_presence === 'outside_api_scope' || (typeof row.trace === 'string' && row.trace.includes('outside_api'))) {
    flags.push('outside_api');
  }
  return flags;
}

export function matchesMatchStatus(row, matchStatus) {
  if (!matchStatus) return true;
  // Legacy match=chainage deep links.
  if (matchStatus === 'chainage') return identityMatchStatus(row) === 'matched_chainage';
  return identityMatchStatus(row) === matchStatus;
}

export function matchesFlag(row, flag, counterparts = null) {
  if (!flag) return true;
  if (flag === 'nep_only') {
    // Plain NEP-only excludes rows that have a House fuzzy referral.
    return Boolean(row.nep) && !row.second && !row.third && !row.house
      && !counterparts?.has(row.id);
  }
  if (flag === 'nep_only_suggested') {
    return Boolean(row.nep) && !row.second && !row.third && !row.house
      && counterparts?.has(row.id);
  }
  return rowFlags(row, counterparts).includes(flag);
}

export function parseLegacyStatus(status) {
  if (!status || status === 'all') return {matchStatus: '', flag: '', trace: ''};
  if (MATCH_VALUES.has(status)) return {matchStatus: status, flag: '', trace: ''};
  if (FLAG_VALUES.has(status)) return {matchStatus: '', flag: status, trace: ''};
  const mapped = LEGACY_STATUS_MAP[status];
  if (mapped) return {matchStatus: mapped.matchStatus || '', flag: mapped.flag || '', trace: ''};
  // Unknown legacy compound trace — keep exact trace filter for deep links.
  return {matchStatus: '', flag: '', trace: status};
}

export function matchStatusLabel(value) {
  return MATCH_STATUS_OPTIONS.find(([v]) => v === value)?.[1]
    || MATCH_STATUS_INFO[value]?.[0]
    || value;
}

export function flagLabel(value) {
  return FLAG_OPTIONS.find(([v]) => v === value)?.[1] || value;
}
