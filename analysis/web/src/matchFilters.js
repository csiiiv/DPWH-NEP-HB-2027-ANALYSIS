import {DIFF_TAG_LABELS} from './diffTags.js';
import {officeDiscrepancy} from '../../viewers/project_offices.mjs';

/** Identity quality vs inspection flags for Compare project filters.

Match status is mutually exclusive (how titles paired). Flags are orthogonal
(presence, amount delta, Transparency coverage) and may combine with status.
`diff:<tag>` flags select fuzzy rows whose suggestions carry a specific
title-difference tag, so each sub-flag has its own review queue.
*/

export const MATCH_STATUS_OPTIONS = [
  ['matched', 'Already matched'],
  ['matched_normalized', 'Matched after normalization'],
  ['matched_chainage', 'Matched after chainage check'],
  ['matched_segment_scope', 'Matched — segment scope review'],
  ['matched_location', 'Matched as location amendment'],
  ['matched_soft', 'Matched after soft review'],
  ['matched_scope', 'Matched as scope amendment'],
  ['fuzzy', 'Fuzzy match'],
  ['ambiguous', 'Ambiguous key'],
  ['no_match', 'No match'],
];

export const DIFF_FLAG_PREFIX = 'diff:';

export const DIFF_FLAG_OPTIONS = Object.keys(DIFF_TAG_LABELS)
  .filter(tag => tag !== 'identical')
  .map(tag => [`${DIFF_FLAG_PREFIX}${tag}`, `Fuzzy · ${DIFF_TAG_LABELS[tag]}`]);

export const FLAG_OPTIONS = [
  ['house_only', 'House only candidate'],
  ['nep_only', 'NEP only candidate'],
  ['nep_only_all', 'NEP only · all candidates'],
  ['nep_only_suggested', 'NEP only · possible replacement'],
  ['amount_increase', 'NEP → HGAB increased'],
  ['amount_decrease', 'NEP → HGAB decreased'],
  ['amount_same', 'NEP = HGAB (unchanged pair)'],
  ['transparency_gap', 'Transparency gap (NEP not listed)'],
  ['outside_api', 'Outside Transparency scope'],
  ['group_exhausted', 'Grouping · unpaired HGAB row (insertion candidate)'],
  ['group_nep_leftover', 'Grouping · unpaired NEP row (deletion candidate)'],
  ['segment_scope', 'Segment scope review (delta not booked)'],
  ['twin_review', 'Twin review · identical unmatched pair'],
  ['changed_office', 'Changed office'],
  ...DIFF_FLAG_OPTIONS,
];

export const MATCH_STATUS_INFO = Object.fromEntries([
  ['matched', ['Already matched', 'Unique House↔NEP pair under the retained matching key with identical raw titles. Identity remains provisional.']],
  ['matched_normalized', ['Matched after normalization', 'Unique House↔NEP pair whose titles agree only after live normalize rules (Brgy./place slips/structure IDs), a stage-qualifier bridge (Construction (Completion) ↔ Construction), or another retained pairing rule. Printed titles stay as extracted.']],
  ['matched_chainage', ['Matched after chainage check', 'Unique House↔NEP pair that shares the same road title_base with differing station spans. Attached for identity; reasons include station-marker adjustment, increased/decreased project length, or re-segmentation. Amount flags still apply.']],
  ['matched_segment_scope', ['Matched — segment scope review', 'Same road title_base whose measured station spans share NO overlap — different segments of one road, attached for scope review only. The amount delta is deliberately NOT booked as a same-project increase/decrease; treat as possible split, re-segmentation or separate work until certified.']],
  ['matched_location', ['Matched as location amendment', 'Unique House↔NEP pair that shares the project shell but relocates a place slot (province / street / barangay) or changes a point-to-point barangay corridor endpoint. Attached as an amendment; amount flags still apply.']],
  ['matched_soft', ['Matched after soft review', 'Unique equal-amount House↔NEP pair soft-attached after review: OCR/spelling slip, facility qualifier only (Gym / Gymnasium / Covered Court), or high-identity punct/sub-barangay detail. Always carries a typed reason plus diff_tags and identity_score — not a silent exact match.']],
  ['matched_scope', ['Matched as scope amendment', 'Unique House↔NEP pair (identity ≥ 0.90, soft tags only) attached as a scope amendment after Tier-3 review: GPS-confirmed scope change, re-surveyed chainage digits, unit/phase re-scope, facility or parenthetical scope, Solar/Footbridge wording. Amount deltas apply and stay flagged; provenance (reason + diff_tags + identity_score) is always carried.']],
  ['fuzzy', ['Fuzzy match', 'High title similarity in the same scope with residual OCR/spelling drift. Primary queue for new normalize rules; suggestions do not attach the NEP row.']],
  ['ambiguous', ['Ambiguous key', 'Duplicate exact matching keys prevent a unique one-to-one pairing.']],
  ['no_match', ['No match', 'House-only or NEP-only under the retained matcher — no unique exact pair and no fuzzy suggestion on this row.']],
  // Legacy deep links that still ask for match=chainage.
  ['chainage', ['Matched after chainage check', 'Same road title_base with differing station spans — now an attached match after chainage check.']],
]);

export const REVIEW_FLAG_INFO = Object.fromEntries([
  ['house_only', ['House only candidate', 'House record with no attached NEP or Transparency source. Not a confirmed insertion.']],
  ['nep_only', ['NEP only candidate', 'NEP record with no attached House reading. Not a confirmed deletion.']],
  ['nep_only_all', ['NEP only · all candidates', 'All NEP records without an attached House reading, including possible replacements named by unresolved House suggestions. Not confirmed deletions.']],
  ['group_exhausted', ['Unpaired HGAB in shell grouping', 'House row on a road-corridor or project-shell grouping (work + municipality + province) whose NEP rows are all paired to other House rows — no NEP counterpart remains for this allocation. Insertion candidate with group context; identity never certified.']],
  ['group_nep_leftover', ['Unpaired NEP in shell grouping', 'NEP row on a shell grouping whose House side is fully paired while this NEP item remains unmatched — likely dropped or re-titled at HGAB. Deletion candidate with group context; identity never certified.']],
  ['segment_scope', ['Segment scope review', 'Paired rows on the same road whose station spans share no overlap. Delta deliberately excluded from adjustment totals — review as different-segment work (split / re-segmentation / separate project), not a same-project change.']],
  ['twin_review', ['Twin review', 'Unmatched row whose identical normalized title + region + zone + equal amount exists unmatched on the other side (typically under a different program/PAP). Likely transfer or duplicate printing; kept unpaired — insertion/deletion candidacy stands until reviewed.']],
  ['nep_only_suggested', ['NEP only · possible replacement', 'NEP-only row that an unmatched House row names as a fuzzy counterpart.']],
  ['amount_increase', ['NEP → HGAB increased', 'Retained candidate pair where House amount is larger than NEP.']],
  ['amount_decrease', ['NEP → HGAB decreased', 'Retained candidate pair where House amount is smaller than NEP.']],
  ['transparency_gap', ['Transparency gap', 'Printed NEP allocation missing from the retained Transparency listing.']],
  ['outside_api', ['Outside Transparency scope', 'NEP record outside the Transparency listing scope (commonly FAP).']],
  ['changed_office', ['Changed office', 'Linked House readings, DBM NEP or DPWH Transparency API records name different implementing offices after normalization. This is a source discrepancy, not proof of an actual office transfer. Missing offices do not establish a change. Assignment follows the resolution hierarchy independently.']],
]);

/** Map legacy status= / trace values onto the new match/flag model. */
export const LEGACY_STATUS_MAP = {
  exact_candidate: {matchStatus: 'matched'},
  amount_same: {matchStatus: 'matched'},
  fuzzy_candidate: {matchStatus: 'fuzzy'},
  chainage_candidate: {matchStatus: 'matched_chainage'},
  chainage: {matchStatus: 'matched_chainage'},
  segment_scope_candidate: {matchStatus: 'matched_segment_scope'},
  segment_scope_review: {matchStatus: 'matched_segment_scope'},
  transparency_gap_then_segment_scope_review: {matchStatus: 'matched_segment_scope', flag: 'transparency_gap'},
  outside_api_then_segment_scope_review: {matchStatus: 'matched_segment_scope', flag: 'outside_api'},
  location_amendment_candidate: {matchStatus: 'matched_location'},
  soft_match_candidate: {matchStatus: 'matched_soft'},
  scope_amendment_candidate: {matchStatus: 'matched_scope'},
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
  if (hm === 'segment_scope_candidate') return 'matched_segment_scope';
  if (typeof row.trace === 'string' && row.trace.includes('segment_scope_review')) return 'matched_segment_scope';
  if (hm === 'location_amendment_candidate') return 'matched_location';
  if (hm === 'soft_match_candidate') return 'matched_soft';
  if (hm === 'scope_amendment_candidate') return 'matched_scope';
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
    if (typeof row.reason === 'string' && /location (reassignment )?amendment|point-to-point barangay/i.test(row.reason)) {
      return 'matched_location';
    }
    if (typeof row.reason === 'string' && /soft-attached after review/i.test(row.reason)) {
      return 'matched_soft';
    }
    if (typeof row.reason === 'string' && /scope amendment after Tier-3 review/i.test(row.reason)) {
      return 'matched_scope';
    }
    return row.reason || row.region_difference ? 'matched_normalized' : 'matched';
  }
  return 'no_match';
}

/** Paired amount delta (House − NEP) for unified comparison rows; null when
 *  the row is not a retained candidate pair. Prefers the 3rd reading. */
function pairedAmountDelta(row) {
  const house = row.third ?? row.second ?? row.house;
  if (!row.nep || !house) return null;
  return house.amount_php - row.nep.amount_php;
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
  const delta = row.house_minus_nep_php ?? pairedAmountDelta(row);
  // Segment-scope review pairs never take amount flags: their delta is a
  // different-segment artifact, not a same-project increase/decrease. The
  // segment_scope flag below is the only amount-adjacent signal they carry.
  const segmentScopeRow = row.house_match === 'segment_scope_candidate' ||
    (typeof row.trace === 'string' && row.trace.includes('segment_scope_review'));
  if (!segmentScopeRow) {
    if (delta != null && delta > 0) flags.push('amount_increase');
    else if (delta != null && delta < 0) flags.push('amount_decrease');
    else if (delta === 0) flags.push('amount_same');
    else if (typeof row.trace === 'string') {
      if (row.trace.includes('candidate_increase')) flags.push('amount_increase');
      else if (row.trace.includes('candidate_decrease')) flags.push('amount_decrease');
    }
  }
  if (row.api_presence === 'nep_not_in_transparency' || (typeof row.trace === 'string' && row.trace.includes('transparency_gap'))) {
    flags.push('transparency_gap');
  }
  if (row.api_presence === 'outside_api_scope' || (typeof row.trace === 'string' && row.trace.includes('outside_api'))) {
    flags.push('outside_api');
  }
  if (row.road_group?.flag === 'insertion_candidate_group_exhausted') {
    flags.push('group_exhausted');
  }
  if (row.road_group?.flag === 'deletion_candidate_group_house_paired') {
    flags.push('group_nep_leftover');
  }
  if (row.house_match === 'segment_scope_candidate' ||
      (typeof row.trace === 'string' && row.trace.includes('segment_scope_review'))) {
    flags.push('segment_scope');
  }
  if (row.twin_review) flags.push('twin_review');
  if (officeDiscrepancy(row)) flags.push('changed_office');
  return flags;
}

/** All title-difference tags across a row's fuzzy suggestions (deduplicated,
 *  order of first appearance). */
export function rowDiffTags(row) {
  const tags = new Set();
  for (const suggestion of row.suggestions ?? []) {
    for (const tag of suggestion.diff_tags ?? []) {
      if (tag !== 'identical') tags.add(tag);
    }
  }
  // Attached location amendments carry tags on the row itself.
  for (const tag of row.diff_tags ?? []) {
    if (tag !== 'identical') tags.add(tag);
  }
  return [...tags];
}

export function matchesMatchStatus(row, matchStatus) {
  if (!matchStatus) return true;
  // Legacy match=chainage deep links.
  if (matchStatus === 'chainage') return identityMatchStatus(row) === 'matched_chainage';
  return identityMatchStatus(row) === matchStatus;
}

export function matchesFlag(row, flag, counterparts = null) {
  if (!flag) return true;
  if (flag === 'nep_only_all') return Boolean(row.nep) && !row.second && !row.third && !row.house;
  if (flag.startsWith(DIFF_FLAG_PREFIX)) {
    // diff:<tag> — any of the row's suggestions carries this difference tag.
    return rowDiffTags(row).includes(flag.slice(DIFF_FLAG_PREFIX.length));
  }
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
  return FLAG_OPTIONS.find(([v]) => v === value)?.[1]
    || REVIEW_FLAG_INFO[value]?.[0]
    || (value.startsWith(DIFF_FLAG_PREFIX)
      ? `Fuzzy · ${DIFF_TAG_LABELS[value.slice(DIFF_FLAG_PREFIX.length)] || value.slice(DIFF_FLAG_PREFIX.length)}`
      : value);
}
