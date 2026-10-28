import {formatChainageSpans, totalLengthM} from './chainageDisplay.js';
import {rowFlags, flagLabel, identityMatchStatus, matchStatusLabel, rowDiffTags} from './matchFilters.js';
import {DIFF_TAG_LABELS} from './diffTags.js';
import {hydrateProjects} from './comparisonData.js';
import {regionCandidates} from './regionCandidates.js';
import {officeDiscrepancy} from '../../viewers/project_offices.mjs';
import {RED_FLAG_RULES, RED_FLAG_MEASUREMENT_NOTE} from './fmrRedFlags.js';

// View-model helpers for the #congress workspace. Pure functions over the
// committed congress_district_index_2027.json and the shared comparison payload,
// so card figures and explorer rows are testable under `node --test` without a
// browser. Rendering lives in CongressApp.jsx; nothing here returns markup.
//
// The index carries row IDs, never record copies: the explorer filters the same
// comparison payload every other DPWH view uses, so a card and its table cannot
// drift apart.

export const BUCKETS = ['insertions', 'deletions', 'increased', 'reduced', 'unchanged', 'scope_review'];

export const BUCKET_LABELS = {
  insertions: 'Insertions',
  deletions: 'Deletions',
  increased: 'Increases',
  reduced: 'Decreases',
  unchanged: 'Unchanged pairs',
  scope_review: 'Segment-scope review',
};

// What each bucket counts and which stage's money it reports. Insertions exist
// only in the House reading; deletions only in the NEP. Increases/decreases are
// paired rows, reported as the signed movement plus each stage's base.
export const BUCKET_BASIS = {
  insertions: {side: 'house', basis: 'House rows with no attached NEP record. Not confirmed insertions.'},
  deletions: {side: 'nep', basis: 'NEP rows with no attached House reading. Not confirmed deletions.'},
  increased: {side: 'house', basis: 'Paired rows where the House amount exceeds the NEP amount.'},
  reduced: {side: 'nep', basis: 'Paired rows where the House amount is below the NEP amount.'},
  unchanged: {side: 'house', basis: 'Paired rows whose recorded allocations are equal on both stages.'},
  scope_review: {side: 'house', basis: 'Same-road pairs with non-overlapping station spans. Deltas are deliberately not booked as adjustments.'},
};

export const DATASETS = [
  {key: 'dpwh', label: 'DPWH', status: 'active'},
  {key: 'hfep', label: 'HFEP', status: 'not_attributable'},
  {key: 'fmr', label: 'FMR', status: 'not_attributable'},
  {key: 'nia', label: 'NIA', status: 'not_attributable'},
];

export const TIER_LABELS = {
  A: 'Tier A · attributable to this district alone',
  B: 'Tier B · undivided range shared with the co-served districts',
  none: 'No district engineering office ledger',
  region: 'Region catch-all · money this lens cannot place on a district',
  deo: 'DEO · multi-district office, allocation kept intact',
  unassigned: 'Unassigned catch-all · no DEO or region available',
};

export const TIER_SHORT = {A: 'Tier A', B: 'Tier B', none: 'No DEO ledger', region: 'Region'};

// Location-lens vocabulary. District-resolved cards use the existing Tier A
// face layout; DEO, region and unassigned cards carry their own grain. The
// `location_tier` value is the authoritative resolution basis.
export const LOCATION_TIER_LABELS = {
  title_psgc: 'Funded-section title location resolves cleanly, supported by a usable DEO, coordinate, direct title hierarchy, or reviewed named site',
  deo_to_leg: 'Title PSGC not clean; printed DEO maps one-to-one to one legislative district',
  deo: 'Printed DEO serves multiple legislative districts; full allocation retained on the DEO',
  region: 'No printed DEO across linked sources; assigned to region',
  unassigned: 'No printed DEO or region; retained on the unassigned catch-all',
};

export const LOCATION_TIER_SHORT = {
  title_psgc: 'Title PSGC', deo_to_leg: 'DEO → LEG', deo: 'DEO',
  region: 'Region', unassigned: 'Unassigned',
};

export const FMR_TIER_LABELS = {
  fmr_district: 'FMR title and/or accepted coordinate PSGC resolves to one legislative district',
  fmr_spanning: 'Affirmative title and coordinate evidence supports several districts; allocation kept intact',
  fmr_region: 'No clean legislative-district route; allocation retained on its printed region',
  location_evidence_conflict: 'Title, coordinate, or candidate-stage locations disagree; retained for review',
  unassigned: 'No clean district route or source region; retained on the unassigned catch-all',
};

export const FMR_TIER_SHORT = {
  fmr_district: 'FMR → LEG', fmr_spanning: 'FMR range', fmr_region: 'Region',
  location_evidence_conflict: 'Evidence conflict', unassigned: 'Unassigned',
};

export const FMR_TIER_FILTER = [
  ['fmr_district', 'Legislative district'],
  ['fmr_spanning', 'Undivided district range'],
  ['fmr_region', 'Region fallback'],
  ['location_evidence_conflict', 'Location-evidence conflict'],
  ['unassigned', 'Unassigned'],
];

export const FMR_FLAG_LABELS = {
  title_coordinate_conflict: 'Title vs coordinate conflict',
  stage_location_conflict: 'House vs NEP location conflict',
  multi_district_span: 'Multi-district span',
  linked_stage_location: 'Location supplied by one candidate stage',
  coordinate_review: 'Coordinate review',
  title_location_unresolved: 'Title location unresolved',
  split_city_barangay_required: 'Split city requires barangay',
  empty_or_incomplete_suffix: 'Incomplete locality suffix',
  barangay_mentioned_but_unmatched: 'Printed barangay unmatched',
  title_or_heading_province_conflict: 'Printed hierarchy conflict',
  ...Object.fromEntries(RED_FLAG_RULES.map(rule => [rule.id, rule.label])),
};

/**
 * Disagreement flags the location lens raises. These label the flag select in
 * the explorer and the badge on a flagged card; they never override an
 * attribution silently — see location_district_lens_method.md §5–6.
 */
export const LOCATION_FLAG_LABELS = {
  office_location_mismatch: 'Office ↔ location mismatch (DEO and geometry disagree; both readings kept)',
  title_gps_conflict: 'Title vs GPS conflict (fully disjoint readings; demoted to fallback)',
  district_boundary_conflict: 'District boundary conflict (adjacent split-city readings; demoted to fallback)',
  legacy_location_conflict: 'Legacy join conflict (master_list district disagrees with geometry; demoted to fallback)',
  changed_office: 'Changed office (linked sources print different offices; assignment unchanged)',
  deo_office_conflict: 'Multiple printed DEOs resolve to different office groups',
};

export const STAGE_LABELS = {
  'house-third': 'HGAB3 · 3rd reading',
  nep: 'DBM NEP',
  api: 'DPWH Transparency API',
};

/** The physical volume each stage's page references point into. Mirrors the
 * document registry in data.js (the SSR-testable model cannot import it), so
 * page chips can cite document + page instead of a bare page number. */
export const STAGE_DOCUMENT_LABELS = {
  'house-third': 'HB 10858 · 3rd reading · Vol I-C',
  nep: 'NEP 2027 · Vol II-B',
  api: null,
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function money(value) {
  if (!Number.isFinite(value)) return '—';
  return `₱${Math.round(value).toLocaleString('en-PH')}`;
}

/** Compact billion/million form for card faces. */
export function moneyCompact(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `₱${(value / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `₱${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `₱${(value / 1e3).toFixed(0)}K`;
  return `₱${Math.round(value)}`;
}

export function signedMoney(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return money(0);
  return `${value > 0 ? '+' : '−'}${money(Math.abs(value))}`;
}

export function percent(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * The headline figures a card face shows, straight from the committed summary.
 *
 * Sign convention: `increased.amount_php` and `reduced.amount_php` are both
 * magnitudes (House−NEP and NEP−House respectively), so neither reads as
 * negative on a card. `adjustment_net_php` is the signed net movement, and is
 * the only figure that may carry a minus sign.
 */
export function cardHeadline(card) {
  const summary = card.summary;
  return {
    insertions: summary.insertions,
    deletions: summary.deletions,
    increased: {
      count: summary.adjustments.increased_count,
      amount_php: summary.adjustments.increased_php,
      house_php: summary.adjustments.increased_house_php,
      nep_php: summary.adjustments.increased_nep_php,
    },
    reduced: {
      count: summary.adjustments.reduced_count,
      amount_php: summary.adjustments.reduced_php,
      house_php: summary.adjustments.reduced_house_php,
      nep_php: summary.adjustments.reduced_nep_php,
    },
    adjustment_net_php: summary.adjustments.net_php,
    unchanged: summary.unchanged,
    scope_review: summary.scope_review,
    nep: {count: summary.sources.nep.count, amount_php: summary.sources.nep.amount_php},
    house: {count: summary.sources.house.count, amount_php: summary.sources.house.amount_php},
    delta_php: summary.delta_php,
  };
}

/**
 * Both stages' money per bucket, uniformly shaped. The summary stores paired
 * adjustments as deltas and scope review as two separate sides, so this is the
 * one place that normalizes them — a card face and the bucket census both read
 * it, and neither can then report a bucket on one side only.
 */
export function bucketTotals(card) {
  const summary = card.summary;
  const out = {
    insertions: {count: summary.insertions.count, house_php: summary.insertions.amount_php, nep_php: 0},
    deletions: {count: summary.deletions.count, house_php: 0, nep_php: summary.deletions.amount_php},
    increased: {count: summary.adjustments.increased_count,
      house_php: summary.adjustments.increased_house_php, nep_php: summary.adjustments.increased_nep_php},
    reduced: {count: summary.adjustments.reduced_count,
      house_php: summary.adjustments.reduced_house_php, nep_php: summary.adjustments.reduced_nep_php},
    unchanged: {count: summary.unchanged.count,
      house_php: summary.unchanged.amount_php, nep_php: summary.unchanged.amount_php},
    scope_review: {count: summary.scope_review.count,
      house_php: summary.scope_review.house_php, nep_php: summary.scope_review.nep_php},
  };
  // The two sides must rebuild the published card totals exactly, so a card can
  // never show bucket figures that disagree with its own headline.
  const house = out.insertions.house_php + out.increased.house_php + out.reduced.house_php +
    out.unchanged.house_php + out.scope_review.house_php;
  const nep = out.deletions.nep_php + out.increased.nep_php + out.reduced.nep_php +
    out.unchanged.nep_php + out.scope_review.nep_php;
  if (house !== summary.sources.house.amount_php || nep !== summary.sources.nep.amount_php) {
    return {buckets: out, house_php: house, nep_php: nep, ties: false};
  }
  return {buckets: out, house_php: house, nep_php: nep, ties: true};
}

/**
 * Budget movements and totals collated across a set of cards — the figures
 * behind the grid's "Show summary" modal. Pure addition over the committed
 * per-card summaries: no row is re-derived, no undivided amount is split, and
 * `ties` re-verifies the addition against the summed card totals so a summary
 * can never print figures its own cards do not back.
 *
 * Units stay per measure, as on the card faces: insertions/deletions count
 * records, adjustments and scope review count pairs (one pair drives two
 * ledger rows), and record totals come from `card.rows`.
 */
export function summaryTotals(cards) {
  const out = {
    cards: 0,
    rows: 0,
    house: {count: 0, amount_php: 0},
    nep: {count: 0, amount_php: 0},
    insertions: {count: 0, amount_php: 0},
    deletions: {count: 0, amount_php: 0},
    increased: {count: 0, amount_php: 0, house_php: 0, nep_php: 0},
    reduced: {count: 0, amount_php: 0, house_php: 0, nep_php: 0},
    adjustment_net_php: 0,
    unchanged: {count: 0, amount_php: 0},
    scope_review: {count: 0, house_php: 0, nep_php: 0},
    delta_php: 0,
  };
  for (const card of cards) {
    const summary = card.summary;
    out.cards++;
    out.rows += card.rows;
    out.house.count += summary.sources.house.count;
    out.house.amount_php += summary.sources.house.amount_php;
    out.nep.count += summary.sources.nep.count;
    out.nep.amount_php += summary.sources.nep.amount_php;
    out.insertions.count += summary.insertions.count;
    out.insertions.amount_php += summary.insertions.amount_php;
    out.deletions.count += summary.deletions.count;
    out.deletions.amount_php += summary.deletions.amount_php;
    out.increased.count += summary.adjustments.increased_count;
    out.increased.amount_php += summary.adjustments.increased_php;
    out.increased.house_php += summary.adjustments.increased_house_php;
    out.increased.nep_php += summary.adjustments.increased_nep_php;
    out.reduced.count += summary.adjustments.reduced_count;
    out.reduced.amount_php += summary.adjustments.reduced_php;
    out.reduced.house_php += summary.adjustments.reduced_house_php;
    out.reduced.nep_php += summary.adjustments.reduced_nep_php;
    out.adjustment_net_php += summary.adjustments.net_php;
    out.unchanged.count += summary.unchanged.count;
    out.unchanged.amount_php += summary.unchanged.amount_php;
    out.scope_review.count += summary.scope_review.count;
    out.scope_review.house_php += summary.scope_review.house_php;
    out.scope_review.nep_php += summary.scope_review.nep_php;
    out.delta_php += summary.delta_php;
  }
  // The tie-out bucketTotals() enforces per card, verified across the set:
  // the summed movements must rebuild the summed stage totals exactly.
  const house = out.insertions.amount_php + out.increased.house_php + out.reduced.house_php +
    out.unchanged.amount_php + out.scope_review.house_php;
  const nep = out.deletions.amount_php + out.increased.nep_php + out.reduced.nep_php +
    out.unchanged.amount_php + out.scope_review.nep_php;
  return {...out, ties: house === out.house.amount_php && nep === out.nep.amount_php};
}

/**
 * A district label safe to print. `districtLabel` is `lone` for lone districts
 * and an ordinal otherwise, so it must never be concatenated with "District"
 * verbatim — that would print "lone District".
 */
export function districtLabel(district) {
  const label = district.districtLabel;
  if (!label || label === 'lone') return 'Lone District';
  return `${label} District`;
}

/**
 * Per-district seats on a card, so an unresolved seat shows both candidates.
 * Field names are deliberately explicit: `districtName` is the jurisdiction
 * string ("ABRA (LONE DISTRICT)"), `representative` is the person. Neither is
 * ever inferred — an unresolved seat carries `representative: null` plus the
 * candidates the upstream roster listed.
 */
export function districtSeats(card) {
  return card.districts.map(district => {
    const rep = district.representative;
    const ambiguous = rep.resolutionStatus !== 'resolved';
    return {
      id: district.id,
      districtName: district.displayName,
      jurisdiction: district.jurisdiction,
      ordinal: district.districtLabel,
      label: districtLabel(district),
      region: district.region,
      representative: rep.name,
      officialSeat: rep.officialSeat,
      status: rep.resolutionStatus,
      ambiguous,
      candidates: rep.candidates ?? [],
      note: rep.note ?? null,
      leadershipRoles: rep.leadershipRoles ?? [],
      memberCode: rep.memberCode ?? null,
      detailUrl: rep.detailUrl ?? null,
      photoPath: rep.photoPath ?? null,
      positionType: rep.positionType ?? null,
      verified: rep.verifiedAgainstOfficialDirectory ?? false,
    };
  });
}

/** A representative label that never invents a single owner for shared money. */
export function representativeLabel(card) {
  const representative = card.representative;
  // Seats the upstream roster left unresolved (succession or protest). Surfaced
  // on the card even when other seats on it are resolved, so the face never
  // implies a contested seat was settled here.
  const unresolved = card.districts
    .filter(district => district.representative.resolutionStatus !== 'resolved')
    .map(district => ({
      district: district.displayName,
      status: district.representative.resolutionStatus,
      candidates: district.representative.candidates ?? [],
      note: district.representative.note ?? null,
    }));
  if (!representative) return {text: 'Unknown seat', kind: 'unknown', names: [], unresolved};
  if (representative.multiple) {
    return {
      text: representative.names?.length
        ? `${representative.names.length} representatives · undivided range`
        : 'No resolved representative',
      kind: representative.names?.length ? 'multiple' : 'unresolved',
      names: representative.names ?? [],
      unresolved,
    };
  }
  if (representative.resolutionStatus !== 'resolved' || !representative.name) {
    return {text: 'Seat not resolved', kind: 'ambiguous',
      names: representative.candidates ?? [], unresolved};
  }
  return {text: representative.name, kind: 'resolved',
    names: [representative.name], unresolved};
}

/** Canonical DEO name for an office-group card, with printed names as fallback. */
export function deoCardLabel(card) {
  const canonical = [...new Set((card.offices ?? [])
    .map(office => office.name?.trim())
    .filter(Boolean))];
  if (canonical.length) return canonical.join(' · ');
  const printed = [...new Set((card.ledger_names ?? [])
    .map(name => name?.trim())
    .filter(Boolean))];
  return printed.length ? printed.join(' · ') : null;
}

/** Leadership badges — only what the crosswalk records, on the card that holds it. */
export function leadershipRoles(card) {
  return card.districts.flatMap(district => (district.representative.leadershipRoles ?? [])
    .map(role => ({role, district: district.displayName, name: district.representative.name})));
}

/** Co-served districts named on the face of a Tier B card. */
export function coServed(card, districtId) {
  return card.districts.filter(district => district.id !== districtId)
    .map(district => district.displayName);
}

/** Whether a card may report any attributed amount at all. */
export function cardCarriesMoney(card) {
  return card.tier !== 'none' && card.rows > 0;
}

/**
 * Sort keys the card grid offers. Each entry pairs the URL value with what it
 * measures, so the control and the model cannot drift apart: `records` sorts
 * count columns, `amount` sorts allocation money, and both directions apply to
 * either. `district` stays alphabetical-only (ascending reads naturally;
 * descending names is noise, so it normalizes to ascending).
 */
export const CARD_SORT_OPTIONS = [
  {key: 'house_php', kind: 'amount', label: 'HGAB3 amount'},
  {key: 'nep_php', kind: 'amount', label: 'NEP amount'},
  {key: 'insertions', kind: 'records', label: 'Insertion records'},
  {key: 'deletions', kind: 'records', label: 'Deletion records'},
  {key: 'adjustments', kind: 'records', label: 'Adjusted pairs'},
  {key: 'rows', kind: 'records', label: 'All records on the card'},
  {key: 'district', kind: 'name', label: 'District name (A→Z)'},
];

export const CARD_SORT_DEFAULT = {key: 'house_php', direction: 'desc'};

/**
 * Parse `?sort=` and `?dir=` into a sort the model understands. An unknown key
 * falls back to the default rather than being read as a column; a name sort is
 * ascending only; every other key accepts both directions and defaults to
 * descending (largest / most first).
 */
export function parseCardSort(sortValue, dirValue) {
  const option = CARD_SORT_OPTIONS.find(entry => entry.key === sortValue);
  if (!option) return {...CARD_SORT_DEFAULT};
  if (option.kind === 'name') return {key: option.key, direction: 'asc'};
  const direction = dirValue === 'asc' ? 'asc' : 'desc';
  return {key: option.key, direction};
}

/** The two URL params a sort round-trips through, or null for the default. */
export function cardSortParams({key, direction}) {
  const option = CARD_SORT_OPTIONS.find(entry => entry.key === key);
  if (!option) return null;
  if (option.kind === 'name') return {sort: key};
  if (key === CARD_SORT_DEFAULT.key && direction === CARD_SORT_DEFAULT.direction) return null;
  return {sort: key, dir: direction};
}

/**
 * Cards sorted for the grid. `records` keys sort by count and `amount` keys by
 * money; ties break on district name so the order is deterministic.
 */
export function sortedCards(cards, {key = 'house_php', direction = 'desc'} = {}) {
  const option = CARD_SORT_OPTIONS.find(entry => entry.key === key);
  // Region catch-alls and other district-less cards sort by their printed
  // label; the districts array is empty by design on those cards.
  const name = card => card.districts?.[0]?.displayName
    ?? card.card_label ?? card.id;
  const value = card => {
    const headline = cardHeadline(card);
    switch (key) {
      case 'house_php': return headline.house.amount_php;
      case 'nep_php': return headline.nep.amount_php;
      case 'insertions': return headline.insertions.count;
      case 'deletions': return headline.deletions.count;
      case 'adjustments': return headline.increased.count + headline.reduced.count;
      case 'rows': return card.rows;
      case 'district': return name(card);
      default: return headline.house.amount_php;
    }
  };
  const factor = direction === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    const x = value(a), y = value(b);
    if (typeof x === 'string' || typeof y === 'string') {
      return String(x).localeCompare(String(y), 'en', {numeric: true}) * factor;
    }
    return ((x ?? 0) - (y ?? 0)) * factor ||
      name(a).localeCompare(name(b), 'en', {numeric: true});
  });
}

// ---------------------------------------------------------------------------
// Explorer
// ---------------------------------------------------------------------------

/** ID → row lookup for the shared comparison payload. */
export function indexRowsById(rows) {
  return new Map((Array.isArray(rows) ? rows : rows?.projects ?? []).map(row => [row.id, row]));
}

/** Rows for a card, taken from the shared payload by the IDs the index pinned. */
export function cardRows(card, rowsById) {
  const out = [];
  for (const bucket of BUCKETS) {
    for (const id of card.row_ids[bucket] ?? []) {
      const row = rowsById.get(id);
      if (row) out.push({...row, congress_bucket: bucket});
    }
  }
  return out;
}

/** Rows for one bucket, for the per-bucket explorer view. */
export function bucketRows(card, rowsById, bucket) {
  return (card.row_ids[bucket] ?? []).map(id => rowsById.get(id))
    .filter(Boolean).map(row => ({...row, congress_bucket: bucket}));
}

function parsePages(value) {
  if (Array.isArray(value)) return value.filter(page => Number.isInteger(page));
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(page => Number.isInteger(page)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeParse(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function recordView(record, kind) {
  if (!record) return null;
  return {
    kind,
    kindLabel: STAGE_LABELS[kind] ?? kind,
    id: record.id,
    title: record.title,
    title_base: record.title_base,
    amount_php: record.amount_php,
    office: record.office,
    office_canonical: record.office_canonical,
    pdf_page: Number.isInteger(record.pdf_page) ? record.pdf_page : null,
    pdf_pages: parsePages(record.pdf_pages),
    record_kind: record.record_kind ?? null,
    source_record_id: record.source_record_id ?? null,
    native_node_id: record.native_node_id ?? null,
    chainage_incomplete: record.chainage_incomplete ?? null,
    chainage_length_review: record.chainage_length_review ?? null,
    evidence: record.evidence ?? null,
  };
}

/**
 * Chainage spans from both stages plus the measured length, when parsed.
 * A side can print station spans without a usable length (absurd spans are
 * omitted on purpose), so `spans` and `length_m` are independent — and a delta
 * exists only when both sides actually measured one.
 */
export function chainageView(third, nep) {
  const side = source => {
    if (!source) return null;
    const chainages = typeof source.chainages === 'string'
      ? safeParse(source.chainages) : source.chainages;
    if (!Array.isArray(chainages) || !chainages.length) return null;
    const spans = formatChainageSpans(chainages);
    const length_m = totalLengthM(chainages);
    // Nothing printable and nothing measurable is not a chainage side.
    if (!spans && length_m == null) return null;
    return {
      spans,
      length_m,
      measured: length_m != null,
      count: chainages.length,
      incomplete: source.chainage_incomplete ?? false,
      length_review: source.chainage_length_review ?? null,
      raw: chainages,
    };
  };
  const house = side(third), nepSide = side(nep);
  if (!house && !nepSide) return null;
  const delta = house?.length_m != null && nepSide?.length_m != null
    ? house.length_m - nepSide.length_m : null;
  return {house, nep: nepSide, length_delta_m: delta};
}

/** PDF page references per stage, for the source preview deep-links.
 * `documentLabel` names the physical volume the page sits in (e.g. "House
 * 3rd reading · Volume I-C"), so a page chip can cite document + page rather
 * than a bare page number — page 939 means nothing without its volume. */
export function pdfView(third, nep, api) {
  const refs = [];
  for (const [kind, record] of [['house-third', third], ['nep', nep], ['api', api]]) {
    if (!record) continue;
    const pages = Number.isInteger(record.pdf_page) ? [record.pdf_page] : parsePages(record.pdf_pages);
    for (const page of pages) {
      if (!Number.isInteger(page) || page < 1) continue;
      refs.push({kind, label: STAGE_LABELS[kind], page, id: record.id,
        documentLabel: STAGE_DOCUMENT_LABELS[kind] ?? null});
    }
  }
  return refs;
}

/** A Philippine bounding box, used to reject a mis-parsed coordinate pair. */
const PH_LNG = [116, 127];
const PH_LAT = [4, 22];

function inPhilippines(lng, lat) {
  return Number.isFinite(lng) && Number.isFinite(lat) &&
    lng > PH_LNG[0] && lng < PH_LNG[1] && lat > PH_LAT[0] && lat < PH_LAT[1];
}

/**
 * Coordinates the row itself carries. The geolocation workspace owns coordinate
 * parsing; this only surfaces what is already on the record plus a decimal pair
 * printed in the title, and never claims a PSGC or locality agreement.
 *
 * Ledger titles print `(longitude, latitude)` — the lookbehind keeps a 3-digit
 * longitude from being read as a 2-digit one, which would silently move a
 * project into the sea. A pair outside the Philippine box is dropped rather
 * than shown, because a wrong coordinate on a map is worse than no coordinate.
 */
export function coordinateView(row) {
  const out = [];
  for (const side of ['third', 'nep', 'api']) {
    const source = row[side];
    if (!source) continue;
    for (const record of source.records ?? [source]) {
      const coordinates = record.coordinates ?? record.gps ?? record.points;
      if (!coordinates) continue;
      const lng = Number(coordinates.lng ?? coordinates.longitude ?? coordinates.x);
      const lat = Number(coordinates.lat ?? coordinates.latitude ?? coordinates.y);
      if (lng && lat && !inPhilippines(lng, lat)) continue;
      out.push({side, id: record.id, coordinates, from_title: false});
    }
  }
  if (out.length) return out;
  const match = /(?<![\d.])(\d{2,3}\.\d+)\s*,\s*(\d{1,2}\.\d+)/.exec(row.title ?? '');
  if (match) {
    const lng = Number(match[1]), lat = Number(match[2]);
    if (inPhilippines(lng, lat)) {
      out.push({side: 'title', id: row.id, from_title: true,
        coordinates: {lat, lng}, printed: match[0].trim()});
    }
  }
  return out.length ? out : null;
}

/**
 * Human-readable provenance for one location-lens placement. The builder's
 * `basis` says where the row landed; `title_gate` says which evidence allowed
 * a clean title PSGC chain to choose a legislative district.
 */
export function assignmentEvidence(resolution) {
  if (!resolution) return null;

  const place = resolution.title_psgc;
  const placeLabel = place
    ? [place.barangay, place.municipality, place.province]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join(', ') || place.name || place.psgc_code
    : null;
  const offices = [...new Set((resolution.printed_offices ?? [])
    .filter(reading => reading.deo_group_ids?.length)
    .map(reading => reading.office)
    .filter(Boolean))];
  const officeLabel = offices.join(' / ');
  const base = {
    basis: resolution.basis,
    targetId: resolution.target_id,
  };

  if (resolution.basis === 'title_psgc') {
    if (resolution.title_gate === 'named_site') return {...base,
      key: 'named_site',
      label: 'Reviewed named site',
      evidence: placeLabel ?? resolution.named_site_id,
      detail: `A reviewed named-site registry entry resolves the title to one legislative district${resolution.named_site_id ? ` (${resolution.named_site_id})` : ''}.`,
    };
    if (resolution.title_gate === 'coordinate') {
      const points = Number(place?.clean_coordinate_points ?? 0);
      return {...base,
        key: 'coordinate',
        label: 'Title location + coordinate',
        evidence: [placeLabel, points ? `${points} clean coordinate point${points === 1 ? '' : 's'}` : null]
          .filter(Boolean).join(' · '),
        detail: 'The title PSGC chain maps to one legislative district and is corroborated by a parsed coordinate.',
      };
    }
    if (resolution.title_gate === 'title_context') return {...base,
      key: 'title_context',
      label: 'Direct title hierarchy',
      evidence: placeLabel,
      detail: 'The title directly supplies a consistent barangay/city/province hierarchy that maps to one legislative district.',
    };
    return {...base,
      key: 'printed_deo',
      label: 'Title location + printed DEO',
      evidence: [placeLabel, officeLabel].filter(Boolean).join(' · '),
      detail: 'The title PSGC chain maps to one legislative district, and a linked source supplies a usable printed DEO.',
    };
  }

  if (resolution.basis === 'deo_to_leg') return {...base,
    key: 'deo_to_leg',
    label: 'DEO → one district',
    evidence: officeLabel || resolution.deo_group_ids?.join(' / ') || null,
    detail: 'The title did not supply a clean district route; the printed DEO maps one-to-one to this legislative district.',
  };
  if (resolution.basis === 'deo') return {...base,
    key: 'deo',
    label: 'Multi-district DEO',
    evidence: officeLabel || resolution.deo_group_ids?.join(' / ') || null,
    detail: 'The printed DEO serves multiple legislative districts, so its allocation stays intact on the DEO card.',
  };
  if (resolution.basis === 'region') return {...base,
    key: 'region',
    label: 'Region fallback',
    evidence: placeLabel
      ? `${placeLabel} did not resolve to one legislative district`
      : 'No usable printed DEO',
    detail: 'No district-level route passed the policy, so the row was assigned to its recorded region.',
  };
  return {...base,
    key: 'unassigned',
    label: 'Unassigned fallback',
    evidence: 'No usable printed DEO or region',
    detail: 'No district-level route or recorded region was available, so the row remains in the unassigned catch-all.',
  };
}

/** FMR assignment disclosure; candidate-stage links never become certified identities. */
export function fmrAssignmentEvidence(resolution) {
  if (!resolution) return null;
  const stage = resolution.contributing_stage === 'both' ? 'both candidate stages'
    : `${resolution.contributing_stage} candidate stage`;
  const stageRecords = [resolution.house, resolution.nep].filter(Boolean);
  const locations = [...new Set(stageRecords.flatMap(record => record.selected_locations ?? [])
    .map(location => [...new Set([location.name,
      location.ancestry?.municipality?.name ?? location.ancestry?.city?.name,
      location.ancestry?.province?.name].filter(Boolean))].join(', ')))];
  const pointObservations = stageRecords.flatMap(record => record.point_districts ?? []);
  const uniquePoints = new Set(pointObservations.map(point => {
    const coordinates = point.coordinates ?? [];
    if (coordinates.length === 2) return coordinates.map(value => Number(value).toFixed(7)).join(',');
    return [point.psgc?.barangay_psgc, point.psgc?.municipality_psgc, point.role]
      .filter(Boolean).join(':');
  }).filter(Boolean));
  const pointEvidence = uniquePoints.size
    ? `${uniquePoints.size} unique accepted PSGC point${uniquePoints.size === 1 ? '' : 's'}` +
      (pointObservations.length > uniquePoints.size
        ? ` · ${pointObservations.length} stage observations` : '')
    : null;
  const labels = {
    title_coordinate: 'Title PSGC + coordinates', title_psgc: 'Title PSGC',
    coordinate: 'Accepted coordinates', spanning: 'Undivided district span',
    linked_stage: 'Linked-stage location', linked_stages_agree: 'Candidate stages agree',
    title_coordinate_conflict: 'Title-coordinate conflict',
    stage_location_conflict: 'Stage-location conflict', region: 'Region fallback',
    unassigned: 'Unassigned fallback',
  };
  return {
    key: resolution.basis,
    basis: resolution.basis,
    targetId: resolution.target_ids?.join(' · ') || resolution.target_type,
    label: labels[resolution.basis] ?? resolution.basis,
    evidence: [locations.join(' / '), pointEvidence]
      .filter(Boolean).join(' · '),
    detail: `Assigned from ${stage}. House/NEP links are deterministic comparison candidates, not certified project identities.`,
  };
}

/** Adapt the FMR workbench comparison grain to the shared card explorer. */
export function fmrRows(detail) {
  const projects = Object.fromEntries(['house', 'nep'].map(stage => [stage,
    new Map(detail.stages[stage].projects.map(project => [project.id, project]))]));
  const side = (project, kind) => project ? {
    ...project,
    id: project.id,
    amount_php: project.amount_php,
    pdf_page: project.source?.pdf_page ?? null,
    printed_page: project.source?.printed_page ?? null,
    source_pdf: project.source?.source_pdf ?? null,
    office: null,
    kind,
  } : null;
  return detail.comparison.map(comparison => {
    const houseProject = projects.house.get(comparison.house_id) ?? null;
    const nepProject = projects.nep.get(comparison.nep_id) ?? null;
    const house = side(houseProject, 'fmr-house');
    const nep = side(nepProject, 'fmr-nep');
    const bucket = house && !nep ? 'insertions' : nep && !house ? 'deletions'
      : house.amount_php > nep.amount_php ? 'increased'
      : house.amount_php < nep.amount_php ? 'reduced' : 'unchanged';
    return {
      ...comparison,
      title: house?.title ?? nep?.title ?? '(untitled)',
      region: house?.region ?? nep?.region ?? comparison.region_key,
      third: house,
      nep,
      congress_bucket: bucket,
      house_minus_nep_php: house && nep ? house.amount_php - nep.amount_php : null,
      match_basis: comparison.method,
      reading_status: comparison.status,
    };
  });
}

export function fmrExplorerRow(row, resolution, analysisByStage = null) {
  const view = explorerRow(row);
  const assignmentFlags = resolution?.flags ?? [];
  const analysisFindings = [['house', row.third], ['nep', row.nep]]
    .flatMap(([stage, project]) => {
      const assessment = project && analysisByStage?.[stage]?.get(project.id);
      return (assessment?.flags ?? []).map(finding => ({
        ...finding,
        stage,
        stageLabel: stage === 'house' ? 'House FMR annex' : 'NEP FMR schedule',
        projectId: project.id,
        label: FMR_FLAG_LABELS[finding.id] ?? finding.id.replaceAll('_', ' '),
      }));
    });
  const analysisFlags = [...new Set(analysisFindings.map(finding => finding.id))];
  const flags = [...new Set([...assignmentFlags, ...analysisFlags])];
  const coordinates = [['house', row.third], ['nep', row.nep]].flatMap(([stage, project]) =>
    (project?.points ?? []).map(point => ({
      side: stage, id: point.id, from_title: false,
      coordinates: {lng: point.longitude, lat: point.latitude},
    })));
  return {
    ...view,
    fmr: true,
    bucketLabel: row.congress_bucket === 'insertions' ? 'House only'
      : row.congress_bucket === 'deletions' ? 'NEP only' : BUCKET_LABELS[row.congress_bucket],
    status: row.status,
    statusLabel: row.status === 'paired' ? 'Candidate pair'
      : row.status === 'house_only' ? 'House only' : 'NEP only',
    flags,
    flagLabels: flags.map(flag => FMR_FLAG_LABELS[flag] ?? flag.replaceAll('_', ' ')),
    assignmentFlags,
    analysisFlags,
    analysisFindings,
    analysisMeasurementNote: analysisFindings.length ? RED_FLAG_MEASUREMENT_NOTE : null,
    // Keep references to the retained source projects for the lazy segment-map
    // modal. Geometry stays at source-project grain and never duplicates money.
    fmrProjects: {house: row.third ?? null, nep: row.nep ?? null},
    pdf: [row.third && {kind: 'fmr-house', label: 'House FMR annex', page: row.third.pdf_page, id: row.third.id,
        documentLabel: 'HB 10858 · 2nd reading · Vol I-B (FMR annex)'},
      row.nep && {kind: 'fmr-nep', label: 'NEP FMR schedule', page: row.nep.pdf_page, id: row.nep.id,
        documentLabel: 'NEP 2027 · FMR schedule'}]
      .filter(ref => ref && Number.isInteger(ref.page)),
    coordinates: coordinates.length ? coordinates : null,
    psgc_location: [resolution?.house, resolution?.nep].filter(Boolean)
      .flatMap(stage => stage.selected_locations ?? [])[0] ?? null,
    assignment: fmrAssignmentEvidence(resolution),
    location_resolution: resolution ?? null,
  };
}

/** One explorer table row: both stages, flags, and every derived trace we hold. */
export function explorerRow(row, {counterparts = null, psgc = null, resolution = null} = {}) {
  const third = row.third, nep = row.nep, api = row.api;
  const flags = rowFlags(row, counterparts);
  const tags = rowDiffTags(row);
  const status = identityMatchStatus(row);
  // The index's bucket is authoritative for scope review: it was assigned at
  // build time and the explorer must not re-derive a different membership.
  const scopeReview = row.congress_bucket
    ? row.congress_bucket === 'scope_review'
    : flags.includes('segment_scope');
  return {
    id: row.id,
    title: row.title ?? third?.title ?? nep?.title ?? '(untitled)',
    bucket: row.congress_bucket ?? null,
    status,
    statusLabel: matchStatusLabel(status),
    flags,
    flagLabels: flags.map(flagLabel),
    diffTags: tags,
    diffTagLabels: tags.map(tag => DIFF_TAG_LABELS[tag] ?? tag),
    program: row.program ?? third?.program ?? nep?.program ?? null,
    pap: row.pap ?? third?.pap ?? nep?.pap ?? null,
    zone: row.zone ?? third?.zone ?? nep?.zone ?? null,
    region: row.region ?? third?.region ?? nep?.region ?? null,
    house: recordView(third, 'house-third'),
    nep: recordView(nep, 'nep'),
    api: recordView(api, 'api'),
    house_office: third?.office ?? null,
    nep_office: nep?.office ?? null,
    house_php: third?.amount_php ?? null,
    nep_php: nep?.amount_php ?? null,
    delta_php: row.house_minus_nep_php ??
      (third && nep ? third.amount_php - nep.amount_php : null),
    reading_status: row.reading_status ?? null,
    match_basis: row.match_basis ?? null,
    confidence: row.confidence ?? null,
    reason: row.reason ?? null,
    trace: row.trace ?? null,
    region_difference: row.region_difference ?? null,
    office_discrepancy: officeDiscrepancy(row),
    chainage: chainageView(third, nep),
    pdf: pdfView(third, nep, api),
    coordinates: coordinateView(row),
    scope_review: scopeReview,
    // Title-derived location and the exact layered-policy route used by the
    // location lens. Both are copied from the built index, never re-derived in
    // the browser.
    psgc_location: psgc ?? null,
    assignment: assignmentEvidence(resolution),
    location_resolution: resolution ?? null,
  };
}

/** Explorer column descriptors. Rendering is supplied by the component. */
export const EXPLORER_COLUMNS = [
  {key: 'title', label: 'Project', scope: 'row', align: 'left'},
  {key: 'bucket', label: 'Bucket', value: row => BUCKET_LABELS[row.bucket] ?? row.bucket},
  {key: 'statusLabel', label: 'Match status'},
  {key: 'flagLabels', label: 'Analytic flags', sortable: false},
  {key: 'psgc_location', label: 'Title PSGC location', sortable: false},
  {key: 'assignment', label: 'Assignment basis', sortable: false},
  {key: 'region', label: 'Region'},
  {key: 'program', label: 'Program'},
  {key: 'house_office', label: 'HGAB3 office', value: row => row.house?.office ?? null},
  {key: 'nep_office', label: 'NEP office', value: row => row.nep?.office ?? null},
  {key: 'house_php', label: 'HGAB3 ₱', align: 'right'},
  {key: 'nep_php', label: 'NEP ₱', align: 'right'},
  {key: 'delta_php', label: 'Δ ₱', align: 'right'},
  {key: 'map', label: 'Map', sortable: false, align: 'right', value: row => row.fmr ? true : null},
  {key: 'chainage', label: 'Chainage', sortable: false},
  {key: 'pdf', label: 'Source page', sortable: false, align: 'right'},
];

/** Counts of every flag across a row set, for the explorer's filter chips. */
export function flagCensus(rows, labels = null) {
  const counts = new Map();
  for (const row of rows) {
    for (const flag of row.flags) counts.set(flag, (counts.get(flag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([flag, count]) => ({flag, count, label: labels?.[flag] ?? flagLabel(flag)}));
}

export function bucketCensus(rows) {
  const counts = new Map(), house = new Map(), nep = new Map();
  for (const row of rows) {
    counts.set(row.bucket, (counts.get(row.bucket) ?? 0) + 1);
    house.set(row.bucket, (house.get(row.bucket) ?? 0) + (row.house_php ?? 0));
    nep.set(row.bucket, (nep.get(row.bucket) ?? 0) + (row.nep_php ?? 0));
  }
  return BUCKETS.filter(bucket => counts.has(bucket)).map(bucket => ({
    bucket, count: counts.get(bucket), label: BUCKET_LABELS[bucket],
    basis: BUCKET_BASIS[bucket].basis, side: BUCKET_BASIS[bucket].side,
    house_php: house.get(bucket) ?? 0, nep_php: nep.get(bucket) ?? 0,
  }));
}

/** Filter an explorer row set by bucket, flag and free text. */
export function filterExplorerRows(rows, {bucket = '', flag = '', query = ''} = {}) {
  const needle = String(query ?? '').trim().toLowerCase();
  return rows.filter(row => {
    if (bucket && row.bucket !== bucket) return false;
    if (flag && !row.flags.includes(flag)) return false;
    if (!needle) return true;
    return [row.title, row.region, row.program, row.pap, row.id,
      row.house?.office, row.nep?.office, row.assignment?.label,
      row.assignment?.evidence, row.assignment?.targetId].some(value =>
      value && String(value).toLowerCase().includes(needle));
  });
}

/** The residual panel, phrased as what it is and what it is not. */
export function residualPanel(index) {
  const residual = index.residual, share = residual.share_of_ledger;
  return {
    id: 'residual',
    title: 'No district — unattributable residual',
    kind: 'residual',
    nep: residual.summary.sources.nep,
    house: residual.summary.sources.house,
    delta_php: residual.summary.delta_php,
    share,
    shareText: `${percent(share.nep)} of the NEP side and ${percent(share.house)} of the HGAB3 side`,
    rows: residual.row_ids.length,
    note: residual.note,
  };
}

/**
 * Paired rows whose two stages name different offices. Held out so neither
 * district card books money the other stage did not attribute to it.
 */
export function officeChangePanel(index) {
  const change = index.office_change;
  const crossDistrict = change.rows.filter(row => row.cross_district);
  return {
    id: 'office-change',
    title: 'Office changed between stages — held out',
    kind: 'office_change',
    note: change.note,
    rows: change.rows.length,
    rowIds: change.rows.map(row => row.id),
    crossDistrict: crossDistrict.length,
    oneSideUnattributable: change.rows.length - crossDistrict.length,
    nep: change.summary.sources.nep,
    house: change.summary.sources.house,
    records: change.rows.map(row => ({
      id: row.id,
      title: row.title,
      cross_district: row.cross_district,
      third_office: row.offices?.third ?? [],
      nep_office: row.offices?.nep ?? [],
      third_php: row.third_php,
      nep_php: row.nep_php,
    })),
  };
}

/**
 * Datasets the explorer offers. Only DPWH joins the crosswalk; the rest are
 * gated with the reason the index recorded, never with a guessed attribution.
 */
export function datasetOptions(index) {
  return DATASETS.map(dataset => {
    const entry = index.datasets[dataset.key] ?? {};
    return {
      ...dataset,
      status: entry.status ?? dataset.status,
      basis: entry.basis ?? null,
      reason: entry.reason ?? null,
      attributable: entry.status === 'active',
    };
  });
}

/** Lens and provenance text for the workspace footer and About. */
export function lensPanel(index) {
  const lens = index.lens;
  return {
    name: lens.name,
    authority: lens.authority,
    grouping_unit: lens.grouping_unit,
    grain: lens.grain,
    stages: lens.stages,
    tiers: lens.tiers,
    not_claimed: lens.not_claimed,
    regional_groups_excluded: lens.regional_groups_excluded,
    provenance: index.input_provenance,
    counts: index.counts,
    reconciliation: {
      tied_numeric_fields: index.reconciliation.tied_numeric_fields,
      row_counts: index.reconciliation.row_counts,
    },
  };
}

/**
 * The row set the explorer filters. This must be exactly what the index
 * classified: hydrateProjects() expands each side's inherited fields, and
 * regionCandidates() adds the relaxed-region rows and their `region_difference`
 * evidence. Skipping either would let a card and its table disagree.
 */
export function congressRows(detail) {
  return regionCandidates(hydrateProjects(detail));
}

// ---------------------------------------------------------------------------
// Location lens helpers
// ---------------------------------------------------------------------------

/**
 * Cards for the location-lens grid: district cards plus the region catch-alls.
 * The region cards carry no district or representative, so the grid renders
 * them with their own label instead of a seat — they are deliberately not
 * dressed up as districts. Card ids stay globally unique (`location:*`,
 * `location-fallback:*`, `location-region:*`), so a deep link cannot collide
 * with a DEO card id. Tolerates a DEO index (no region cards) so the District
 * explorer can look up either lens's card with one call.
 */
export function locationCards(index) {
  return [...(index?.cards ?? []), ...(index?.region_cards ?? [])];
}

/** A printable face label for a card that has no district (region catch-all). */
export function locationCardLabel(card) {
  return card.card_label ?? card.districts[0]?.displayName ?? card.id;
}

/** Location-lens tier options for the grid's filter select. */
export const LOCATION_TIER_FILTER = [
  ['title_psgc', 'Title PSGC → LEG'],
  ['deo_to_leg', 'DEO → LEG'],
  ['deo', 'Multi-district DEO'],
  ['region', 'Region'],
  ['unassigned', 'Unassigned'],
];

/** The disagreement flags a card's rows carry, for a badge on the card face. */
export function cardLocationFlags(card, rowFlags) {
  const out = new Set();
  for (const ids of Object.values(card.row_ids ?? {})) {
    for (const id of ids) {
      for (const flag of rowFlags[id] ?? []) out.add(flag);
    }
  }
  return [...out];
}
