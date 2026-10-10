/** Derive Analysis · Chainage rows from unified comparison projects. */

import {
  chainageLengthReviewLabel,
  chainageSideDetail,
  formatSignedPct,
  totalLengthM,
} from './chainageDisplay.js';
import {identityMatchStatus} from './matchFilters.js';

/** Amendment archetypes: budget Δ × scope Δ × unit-rate Δ, ±10% deadband each.
 * Labels read as [budget, scope, rate]: the rate axis is the kickback lever —
 * same money over less road lifts the take without touching the topline. */
export const CHAINAGE_MODUS = {
  compromise_concentration: {label: 'Budget cut · scope cut · rate marked up', hint: 'Smaller budget, shorter road, higher price per km — padded rate as the concession'},
  hold_the_rate: {label: 'Budget cut · scope cut · rate held', hint: 'Budget and road shrank together; unit rate kept — clean triage'},
  cut_to_the_bone: {label: 'Budget cut · rate cut', hint: 'Everything down; honest austerity'},
  cut_but_longer: {label: 'Budget cut · scope longer · rate cut', hint: 'Less money stretched over more road; only tenable with cheaper works'},
  cut_scope_up: {label: 'Budget cut · scope up · rate held', hint: 'Less money, more claimed road at the same rate — math needs scrutiny'},
  hold_concentrate: {label: 'Budget held · scope cut · rate marked up', hint: 'Same money over less road — the classic padded-rate signature'},
  hold_hold: {label: 'Budget held · scope held · rate held', hint: 'Nothing meaningful moved'},
  hold_rate_creep: {label: 'Budget held · scope held · rate crept up', hint: 'Money and scope flat while the per-km rate just crossed the deadband — edge case, verify'},
  hold_rate_ebb: {label: 'Budget held · scope held · rate crept down', hint: 'Mirror of the rate creep; deadband edge'},
  hold_scope_drift: {label: 'Budget held · scope up · rate held', hint: 'Longer claimed road with money and rate flat'},
  hold_stretch: {label: 'Budget held · scope up · rate cut', hint: 'Same money spread over more road; plausible span correction'},
  hold_short_scope: {label: 'Budget held · scope down · rate held', hint: 'Same rate over less road; check what happened to the freed scope'},
  gain_short_scope: {label: 'Budget up · scope cut · rate marked up', hint: 'More money, less road, higher rate — protected and greedy'},
  gain_scope_hold: {label: 'Budget up · scope held · rate marked up', hint: 'Same road, more money per km — pure rate lift'},
  gain_compound: {label: 'Budget up · scope held · rate held', hint: 'Both axes inside the deadband yet the budget rose >10% — compounding at the edge'},
  gain_scope_up: {label: 'Budget up · scope up · rate held', hint: 'Bigger road at stable unit cost; legitimate expansion'},
  gain_rate_cut: {label: 'Budget up · scope up · rate cut', hint: 'More road, cheaper per km; economies of scale or span fix'},
  gain_longer_cheap: {label: 'Budget up · scope longer · rate up', hint: 'Larger scope at a lifted rate; both ends feeding'},
  gain_shorter_cheap: {label: 'Budget up · scope shorter · rate cut', hint: 'Extra money with shrinking scope; span data suspect'},
};

export const MODUS_DEADBAND = 10;

export const CHAINAGE_FOCUS = {
  all: 'All chainage matches',
  length_up: 'Length increased (HGAB > NEP)',
  length_down: 'Length decreased (HGAB < NEP)',
  length_same: 'Length unchanged',
  review: 'Length review flags',
  points: 'Point stations only',
  ...Object.fromEntries(
    Object.entries(CHAINAGE_MODUS).map(([key, modus]) => [`modus_${key}`, `Modus: ${modus.label}`])
  ),
};

function houseSide(row) {
  return row.third || row.second || row.house || null;
}

/** Comparison rows attached after chainage check, with length Δ fields. */
export function chainageAmendmentRows(projects) {
  if (!Array.isArray(projects)) return [];
  const out = [];
  for (const project of projects) {
    if (identityMatchStatus(project) !== 'matched_chainage') continue;
    const house = houseSide(project);
    const nep = project.nep;
    if (!house?.chainages?.length || !nep?.chainages?.length) continue;
    const nepCell = chainageSideDetail(nep);
    const houseCell = chainageSideDetail(house, nep, {withDelta: true});
    if (!nepCell || !houseCell) continue;
    const nepM = totalLengthM(nep.chainages);
    const houseM = totalLengthM(house.chainages);
    const budgetGap =
      house?.amount_php != null && nep?.amount_php != null
        ? house.amount_php - nep.amount_php
        : null;
    const lengthReview =
      house.chainage_length_review ||
      nep.chainage_length_review ||
      houseCell.lengthReview ||
      nepCell.lengthReview ||
      null;
    const nepPhp = nep.amount_php ?? null;
    const housePhp = house.amount_php ?? null;
    const nepPerKm = nepM != null && nepM > 0 && nepPhp != null ? nepPhp / (nepM / 1000) : null;
    const housePerKm = houseM != null && houseM > 0 && housePhp != null ? housePhp / (houseM / 1000) : null;
    const perKmDelta = nepPerKm != null && housePerKm != null ? housePerKm - nepPerKm : null;
    const perKmPct =
      perKmDelta != null && nepPerKm !== 0
        ? (perKmDelta / Math.abs(nepPerKm)) * 100
        : null;
    const budgetGapPct =
      budgetGap != null && nepPhp !== 0
        ? (budgetGap / Math.abs(nepPhp)) * 100
        : null;
    const lengthDeltaPctValue =
      houseCell.deltaM != null && nepM
        ? (houseCell.deltaM / Math.abs(nepM)) * 100
        : null;
    const row = {
      id: project.id,
      title: project.title || house.title || nep.title,
      program: project.program,
      region: project.region,
      office: house.office || nep.office || project.office || '',
      reason: project.reason || null,
      nep_spans: nepCell.spans,
      house_spans: houseCell.spans,
      nep_length_m: nepM,
      house_length_m: houseM,
      length_delta_m: houseCell.deltaM,
      length_delta_pct: formatSignedPct(lengthDeltaPctValue),
      length_delta_pct_value: lengthDeltaPctValue,
      length_direction: houseCell.direction,
      length_review: lengthReview,
      length_review_label: chainageLengthReviewLabel(lengthReview),
      nep_php: nepPhp,
      house_php: housePhp,
      budget_gap_php: budgetGap,
      budget_gap_pct: budgetGapPct,
      nep_per_km: nepPerKm,
      house_per_km: housePerKm,
      per_km_delta: perKmDelta,
      per_km_pct: perKmPct,
      point_only: nepM == null && houseM == null,
    };
    row.modus = chainageModus(row);
    out.push(row);
  }
  return out;
}

export function summarizeChainage(rows) {
  const summary = {
    rows: rows.length,
    length_up: 0,
    length_down: 0,
    length_same: 0,
    point_only: 0,
    review: 0,
    repaired_km_ocr: 0,
    absurd_unresolved: 0,
    length_delta_m_net: 0,
    budget_gap_php_net: 0,
  };
  for (const row of rows) {
    if (row.point_only) summary.point_only++;
    else if (row.length_direction === 'up') summary.length_up++;
    else if (row.length_direction === 'down') summary.length_down++;
    else if (row.length_direction === 'same') summary.length_same++;
    if (row.length_review) {
      summary.review++;
      if (row.length_review === 'repaired_km_ocr') summary.repaired_km_ocr++;
      if (row.length_review === 'absurd_unresolved') summary.absurd_unresolved++;
    }
    if (row.length_delta_m != null) summary.length_delta_m_net += row.length_delta_m;
    if (row.budget_gap_php != null) summary.budget_gap_php_net += row.budget_gap_php;
  }
  return summary;
}

export function filterChainageRows(rows, focus) {
  if (!focus || focus === 'all') return rows;
  if (focus.startsWith('modus_')) return rows.filter(r => r.modus === focus.slice(6));
  if (focus === 'length_up') return rows.filter(r => r.length_direction === 'up');
  if (focus === 'length_down') return rows.filter(r => r.length_direction === 'down');
  if (focus === 'length_same') return rows.filter(r => r.length_direction === 'same' && !r.point_only);
  if (focus === 'review') return rows.filter(r => r.length_review);
  if (focus === 'points') return rows.filter(r => r.point_only);
  return rows;
}

/** Tally rows into fixed-width pct bins, carrying allocations per bin. */
function tallyPctBins(rows, valueOf, {edges} = {}) {
  const step = edges[1] - edges[0];
  const minEdge = edges[0];
  const bins = edges.map(edge => ({edge, records: 0, nep_php: 0, house_php: 0}));
  let missing = 0, missingPhp = 0;
  for (const row of rows) {
    const value = valueOf(row);
    if (value == null) {
      missing++;
      missingPhp += row.house_php ?? 0;
      continue;
    }
    const index = Math.min(Math.max(Math.floor((value - minEdge) / step), 0), bins.length - 1);
    bins[index].records++;
    bins[index].nep_php += row.nep_php ?? 0;
    bins[index].house_php += row.house_php ?? 0;
  }
  return {
    bins,
    measurable: bins.reduce((sum, b) => sum + b.records, 0),
    missing,
    missingPhp,
    totalPhp: bins.reduce((sum, b) => sum + b.house_php, 0),
  };
}

/** Bin rows by |%Δ price/km| in 25-point steps; carry allocations per bin. */
export function perKmChangeBins(rows, {redFlagPct = 10, step = 25, maxBin = 200} = {}) {
  const edges = [];
  for (let edge = 0; edge <= maxBin; edge += step) edges.push(edge);
  const result = tallyPctBins(rows, r => (r.per_km_pct == null ? null : Math.abs(r.per_km_pct)), {edges});
  for (const bin of result.bins) bin.red_flag = bin.edge >= redFlagPct;
  result.redFlagPct = redFlagPct;
  result.noLength = result.missing;
  result.noLengthPhp = result.missingPhp;
  return result;
}

/** Signed 25-point bins of %Δ allocation amount (decreases bottom out at −100%). */
export function amountChangeBins(rows, {step = 25, minEdge = -100, maxEdge = 200} = {}) {
  const edges = [];
  for (let edge = minEdge; edge <= maxEdge; edge += step) edges.push(edge);
  return tallyPctBins(rows, r => r.budget_gap_pct, {edges});
}

/** Direction of a pct value against the ±deadband: 1 up, -1 down, 0 flat. */
function axisDirection(value, deadband) {
  if (value == null) return null;
  if (value > deadband) return 1;
  if (value < -deadband) return -1;
  return 0;
}

/** Classify one measurable row by budget × scope × unit-rate directions. */
export function chainageModus(row, deadband = MODUS_DEADBAND) {
  if (row.budget_gap_pct == null || row.length_delta_pct_value == null || row.per_km_pct == null) return null;
  const budget = axisDirection(row.budget_gap_pct, deadband);
  const scope = axisDirection(row.length_delta_pct_value, deadband);
  const rate = axisDirection(row.per_km_pct, deadband);
  const key = `${budget},${scope},${rate}`;
  const TABLE = {
    '-1,-1,1': 'compromise_concentration',
    '-1,-1,0': 'hold_the_rate',
    '-1,-1,-1': 'cut_to_the_bone',
    '-1,1,-1': 'cut_but_longer',
    '-1,1,0': 'cut_scope_up',
    '-1,0,1': 'compromise_concentration',
    '-1,0,0': 'hold_the_rate',
    '-1,0,-1': 'cut_to_the_bone',
    '0,-1,1': 'hold_concentrate',
    '0,-1,0': 'hold_short_scope',
    '0,-1,-1': 'cut_to_the_bone',
    '0,0,1': 'hold_rate_creep',
    '0,0,0': 'hold_hold',
    '0,0,-1': 'hold_rate_ebb',
    '0,1,1': 'gain_longer_cheap',
    '0,1,0': 'hold_scope_drift',
    '0,1,-1': 'hold_stretch',
    '1,-1,1': 'gain_short_scope',
    '1,-1,0': 'gain_short_scope',
    '1,-1,-1': 'cut_to_the_bone',
    '1,0,1': 'gain_scope_hold',
    '1,0,0': 'gain_compound',
    '1,0,-1': 'gain_shorter_cheap',
    '1,1,1': 'gain_longer_cheap',
    '1,1,0': 'gain_scope_up',
    '1,1,-1': 'gain_rate_cut',
  };
  return TABLE[key] ?? null;
}

/** Aggregate records, allocations, net gap and per-axis medians per archetype. */
export function modusSummary(rows) {
  const order = ['compromise_concentration', 'hold_the_rate', 'cut_to_the_bone', 'cut_but_longer', 'cut_scope_up', 'hold_concentrate', 'hold_hold', 'hold_rate_creep', 'hold_rate_ebb', 'hold_stretch', 'hold_scope_drift', 'hold_short_scope', 'gain_short_scope', 'gain_scope_hold', 'gain_compound', 'gain_scope_up', 'gain_rate_cut', 'gain_longer_cheap', 'gain_shorter_cheap'];
  const map = new Map();
  let measurable = 0;
  const median = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  for (const row of rows) {
    const modus = chainageModus(row);
    if (!modus) continue;
    measurable++;
    let group = map.get(modus);
    if (!group) map.set(modus, group = {
      modus,
      records: 0, nep_php: 0, house_php: 0, gap_php: 0,
      budget_pcts: [], scope_pcts: [], rate_pcts: [],
    });
    group.records++;
    group.nep_php += row.nep_php ?? 0;
    group.house_php += row.house_php ?? 0;
    group.gap_php += row.budget_gap_php ?? 0;
    group.budget_pcts.push(row.budget_gap_pct);
    group.scope_pcts.push(row.length_delta_pct_value);
    group.rate_pcts.push(row.per_km_pct);
  }
  const groups = order.filter(key => map.has(key)).map(key => {
    const group = map.get(key);
    return {
      ...group,
      median_budget_pct: median(group.budget_pcts),
      median_scope_pct: median(group.scope_pcts),
      median_rate_pct: median(group.rate_pcts),
    };
  });
  return {groups, measurable};
}

export function redFlagPerKm(rows, thresholdPct = 10) {
  return rows.filter(r => r.per_km_pct != null && Math.abs(r.per_km_pct) > thresholdPct);
}
