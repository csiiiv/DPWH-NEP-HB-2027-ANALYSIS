import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {hydrateProjects} from './src/comparisonData.js';
import {regionCandidates} from './src/regionCandidates.js';
import {officeJoinKey} from '../viewers/project_offices.mjs';
export {officeJoinKey} from '../viewers/project_offices.mjs';
import {partition, dpwhSummary} from './src/overviewSummary.js';

// The DEO lens authorized by DEO2LEG/README.md, applied to the DPWH operations
// ledger. Grouping unit is the OFFICE the source documents printed — never an
// inference about which representative moved money. Every aggregate carries its
// attribution tier, Tier B money is never divided, the unattributable residual
// is published in full, and the upstream honesty buckets (provisional matches,
// segment-scope review) stay separate instead of being folded into a card.
//
// Why this builder is Node, not Python: the buckets a card reports are produced
// by `partition()` in src/overviewSummary.js, the same function behind the
// published Overview. Reimplementing it in another language would let the
// congress cards silently disagree with the Overview. Importing it makes that
// impossible, and the reconciliation block below proves the cards sum back to
// the published whole.
function fail(message) {throw new Error(`Congress index: ${message}`);}
const sum = (rows, pick) => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);

// ---------------------------------------------------------------------------
// Crosswalk side: office -> district set, district -> representative.
// ---------------------------------------------------------------------------

// Ledger offices print "… 2nd District Engineering Office"; the crosswalk
// registry prints "… 2nd DEO" and hyphenates twins ("Las Piñas-Muntinlupa DEO")
// where the ledger has already collapsed the hyphen. Canonicalize both sides
// through the same office normalizer, then expand the DEO abbreviation and drop
// hyphens so the two vocabularies meet on one key.
// BARMM is `type: "regional_group"`, not an office, and DEO2LEG policy forbids
// counting a regional grouping as a district-level actor. Only real engineering
// offices may carry money to a district; everything else is residual.
const OFFICE_TYPES = new Set(['district_engineering_office', 'sub_district_engineering_office']);

export function buildCrosswalk(crosswalk) {
  if (crosswalk.schemaVersion !== '2.1.0') fail(`unsupported crosswalk schema ${crosswalk.schemaVersion}`);
  const offices = crosswalk.offices, districts = crosswalk.legislativeDistricts;

  // Offices that may carry money, keyed by every name form the registry offers.
  const keyToOffices = new Map();
  const rejected = [];
  for (const [officeId, office] of Object.entries(offices)) {
    if (!OFFICE_TYPES.has(office.type)) {rejected.push({officeId, type: office.type, name: office.name}); continue;}
    const names = [office.name, ...(office.aliases ?? [])];
    for (const name of names) {
      const key = officeJoinKey(name);
      if (!key) continue;
      if (!keyToOffices.has(key)) keyToOffices.set(key, []);
      const list = keyToOffices.get(key);
      if (!list.includes(officeId)) list.push(officeId);
    }
  }

  // A "group" is the set of offices that serve the SAME district set. Two Tier A
  // offices covering one district (Apayao 1st + 2nd DEO both -> leg:apayao:lone)
  // are one undivided pool, so they share a card. Offices spanning several
  // districts are Tier B: their money is an undivided range across those
  // districts and is never split.
  const groups = new Map();
  const officeToGroup = new Map();
  for (const [officeId, office] of Object.entries(offices)) {
    if (!OFFICE_TYPES.has(office.type)) continue;
    if (!office.evidence?.inAllocationTable) continue; // legacy registry-only: no ledger
    const districtIds = [...(office.legislativeDistrictIds ?? [])].sort();
    if (!districtIds.length) continue;
    const groupId = `office-group:${districtIds.join('+')}`;
    if (!groups.has(groupId)) {
      groups.set(groupId, {id: groupId, districtIds, tier: districtIds.length === 1 ? 'A' : 'B', offices: []});
    }
    groups.get(groupId).offices.push(officeId);
    officeToGroup.set(officeId, groupId);
  }

  // Districts reachable from a money-carrying office group.
  const covered = new Set();
  for (const group of groups.values()) for (const districtId of group.districtIds) covered.add(districtId);
  // Districts whose only crosswalk link is a regional group (BARMM serves 5)
  // have no office-level ledger to attribute. Policy forbids booking the
  // regional grouping as an office, so these are reported as their own card
  // kind carrying zero attributed money — never folded into the residual as if
  // a DEO had covered them, and never given a divided share of BARMM's total.
  const regionalGroupOnly = Object.keys(districts).filter(id => !covered.has(id));
  const unexpected = regionalGroupOnly.filter(id => !(districts[id].officeIds ?? [])
    .every(officeId => offices[officeId]?.type === 'regional_group'));
  if (unexpected.length) {
    fail(`districts with no money-carrying office and no regional-group explanation: ${unexpected.join(', ')}`);
  }

  return {offices, districts, keyToOffices, groups, officeToGroup, rejectedGroups: rejected, regionalGroupOnly};
}

// ---------------------------------------------------------------------------
// Ledger side: which group does each comparison row belong to?
// ---------------------------------------------------------------------------

function sideOffices(row, side) {
  const source = row[side];
  if (!source) return [];
  const records = source.records ?? [source];
  return records.map(record => record.office_canonical ?? record.office ?? '').filter(Boolean);
}

// A row is attributable only when every stage that printed an office agrees on
// one group. Anything else is published separately rather than guessed:
//   - no attributable office at all            -> residual (Central/Regional/BARMM)
//   - the two stages name different groups     -> office_change
//   - one stage names a group, the other does not (e.g. NEP printed Central
//     Office, HGAB3 printed a DEO)             -> office_change
// The last case is deliberately NOT booked to the district: the NEP-side money
// was printed under Central Office, so charging it to a DEO would move money
// between the residual and a card without evidence.
export function classifyRow(row, crosswalk, groupsForOffice) {
  const present = ['third', 'nep'].filter(side => row[side]);
  if (!present.length) return {kind: 'no_stage'};
  const attributed = new Set();
  let unattributable = false, officesSeen = 0;
  for (const side of present) {
    for (const office of sideOffices(row, side)) {
      officesSeen += 1;
      const groupId = groupsForOffice(office);
      if (groupId) attributed.add(groupId);
      else unattributable = true;
    }
  }
  if (!officesSeen) return {kind: 'no_office'};
  if (attributed.size === 1 && !unattributable) return {kind: 'group', groupId: [...attributed][0]};
  if (attributed.size === 0) return {kind: 'residual', offices: [...new Set(present.flatMap(side => sideOffices(row, side)))]};
  return {
    kind: 'office_change',
    groupIds: [...attributed].sort(),
    // Both stages named a real office but they differ: the implementing office
    // changed between NEP and the 3rd reading. Worth surfacing, never assigning.
    crossDistrict: attributed.size > 1,
    oneSideUnattributable: unattributable,
    offices: {third: sideOffices(row, 'third'), nep: sideOffices(row, 'nep')},
  };
}

// ---------------------------------------------------------------------------
// Reconciliation: cards + residual + office_change must rebuild the whole.
// ---------------------------------------------------------------------------

// Flatten every numeric leaf so the tie-out cannot miss a field added to
// partition() later. A new bucket that is not summed here fails the build.
function numericLeaves(value, prefix = '', out = {}) {
  if (typeof value === 'number') {out[prefix] = value; return out;}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) numericLeaves(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function assertTies(label, whole, parts) {
  const expected = numericLeaves(whole);
  const actual = {};
  for (const part of parts) {
    for (const [path, value] of Object.entries(numericLeaves(part))) {
      actual[path] = (actual[path] ?? 0) + value;
    }
  }
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of [...keys].sort()) {
    const want = expected[key] ?? 0, got = actual[key] ?? 0;
    if (want !== got) fail(`${label} does not tie on ${key}: whole=${want} parts=${got}`);
  }
  return keys.size;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const ROW_BUCKET_KEYS = ['insertions', 'deletions', 'increased', 'reduced', 'unchanged', 'scope_review'];

export function buildCongressIndex({detail, overview, crosswalk}, builtAt = new Date().toISOString(),
  provenance = null) {
  const map = buildCrosswalk(crosswalk);
  const officeToGroup = name => {
    const officeIds = map.keyToOffices.get(officeJoinKey(name));
    if (!officeIds) return null;
    const groupIds = new Set(officeIds.map(id => map.officeToGroup.get(id)).filter(Boolean));
    // A name form resolving to offices in different groups is not a safe join.
    if (groupIds.size !== 1) return null;
    return [...groupIds][0];
  };

  const rows = regionCandidates(hydrateProjects(detail));
  if (!rows.every(row => !row.third || row.nep || !row.api)) fail('House/API-only scope needs a separate adapter');

  const whole = partition(rows, 'third');
  // Anchor against the published Overview adapter, which asserts the same
  // numbers against the printed headlines. If this throws, the ledger moved.
  const published = dpwhSummary(overview, detail);
  assertTies('published Overview vs local partition', stripWorkspace(published), [whole]);

  const byGroup = new Map(), residualRows = [], changeRows = [];
  const classification = {group: 0, residual: 0, office_change: 0, no_office: 0, no_stage: 0};
  const rowIds = {};
  for (const row of rows) {
    const verdict = classifyRow(row, map, officeToGroup);
    classification[verdict.kind] = (classification[verdict.kind] ?? 0) + 1;
    if (verdict.kind === 'group') {
      if (!byGroup.has(verdict.groupId)) byGroup.set(verdict.groupId, []);
      byGroup.get(verdict.groupId).push(row);
    } else if (verdict.kind === 'residual') {
      residualRows.push(row);
      (rowIds.residual ??= []).push(row.id);
    } else if (verdict.kind === 'office_change') {
      changeRows.push(row);
      (rowIds.office_change ??= []).push(row.id);
    } else {
      // No stage or no printed office: still money, still published, never a card.
      residualRows.push(row);
      (rowIds.residual ??= []).push(row.id);
    }
  }
  if (classification.no_stage) fail(`${classification.no_stage} rows carry neither HGAB3 nor NEP stage`);

  const residual = partition(residualRows, 'third');
  const officeChange = partition(changeRows, 'third');

  const cards = [];
  // Collect the exact spellings the ledger printed for each group once, so the
  // ledger_names below are a lookup rather than a rescan per office.
  const ledgerNames = new Map();
  for (const row of rows) {
    for (const side of ['third', 'nep']) {
      for (const office of sideOffices(row, side)) {
        const groupId = officeToGroup(office);
        if (!groupId) continue;
        if (!ledgerNames.has(groupId)) ledgerNames.set(groupId, new Set());
        ledgerNames.get(groupId).add(office);
      }
    }
  }
  for (const group of map.groups.values()) {
    const groupRows = byGroup.get(group.id) ?? [];
    const summary = partition(groupRows, 'third');
    const districts = group.districtIds.map(districtId => describeDistrict(map.districts[districtId], districtId));
    cards.push({
      id: group.id,
      tier: group.tier,
      // Tier B is an undivided range: these districts share one pool of money
      // that this data cannot split. Listed on the card face, never divided.
      undivided: group.tier === 'B',
      offices: group.offices.map(officeId => ({
        id: officeId,
        name: map.offices[officeId].name,
        type: map.offices[officeId].type,
        region: map.offices[officeId].region,
      })),
      // The exact spellings the ledger printed, so a card can be traced back to
      // source rows without re-deriving the join in the browser.
      ledger_names: [...(ledgerNames.get(group.id) ?? [])].sort(),
      districts,
      representative: soleRepresentative(districts),
      region: map.offices[group.offices[0]].region,
      rows: groupRows.length,
      summary,
      row_ids: bucketRowIds(groupRows),
    });
  }
  // Districts served only by the BARMM regional group get a card so the seat is
  // visible, but the card states plainly that no office-level ledger exists for
  // it. `partition([])` is all zeros, so these cards add nothing to the tie-out
  // and cannot quietly absorb BARMM's money.
  for (const districtId of map.regionalGroupOnly) {
    const districts = [describeDistrict(map.districts[districtId], districtId)];
    cards.push({
      id: `no-office:${districtId}`,
      kind: 'regional_group_only',
      // Explicit non-tier: policy forbids booking a regional grouping as a
      // district office, and there is no DEO ledger to attribute.
      tier: 'none',
      tier_note: 'This district is linked in the crosswalk only to the BARMM regional grouping, which is type "regional_group" and not an office. No district engineering office ledger exists to attribute, so no amount is shown. BARMM rows stay in the unattributable residual.',
      undivided: false,
      offices: [],
      ledger_names: [],
      districts,
      representative: soleRepresentative(districts),
      region: map.districts[districtId].region,
      rows: 0,
      summary: partition([], 'third'),
      row_ids: Object.fromEntries(ROW_BUCKET_KEYS.map(key => [key, []])),
    });
  }
  cards.sort((a, b) => b.summary.sources.house.amount_php - a.summary.sources.house.amount_php ||
    a.districts[0].displayName.localeCompare(b.districts[0].displayName));

  // The four policy conditions are asserted, not documented.
  const tieFields = assertTies('cards + residual + office_change vs whole ledger', whole,
    [...cards.map(card => card.summary), residual, officeChange]);
  const TIERS = new Set(['A', 'B', 'none']);
  for (const card of cards) {
    if (!TIERS.has(card.tier)) fail(`card ${card.id} is missing a valid attribution tier`);
    if (card.tier === 'none' && !card.tier_note) fail(`tier-none card ${card.id} must explain why it carries no amount`);
    if (card.tier === 'none' && card.rows !== 0) fail(`tier-none card ${card.id} must not carry attributed rows`);
  }
  const residualShare = {
    nep: whole.sources.nep.amount_php ? residual.sources.nep.amount_php / whole.sources.nep.amount_php : 0,
    house: whole.sources.house.amount_php ? residual.sources.house.amount_php / whole.sources.house.amount_php : 0,
  };
  // Condition 3 guard: Central Office money is the bulk of this ledger, so the
  // residual must stay the majority. If a join bug ever routed Central Office
  // rows onto cards, district cards would imply full coverage of a budget they
  // account for a minority of — exactly the misleading reading the policy
  // forbids. Asserting majority catches that inversion.
  if (residualShare.nep < 0.5 || residualShare.house < 0.5) {
    fail(`unattributable residual fell to ${(residualShare.nep * 100).toFixed(1)}% NEP / ` +
      `${(residualShare.house * 100).toFixed(1)}% HGAB3; district cards would overstate coverage`);
  }
  const centralOffice = residualRows.some(row =>
    ['third', 'nep'].some(side => sideOffices(row, side).some(office => office.trim() === 'Central Office')));
  if (!centralOffice) fail('Central Office records left the residual');
  if (map.rejectedGroups.every(entry => entry.type !== 'regional_group')) {
    fail('crosswalk no longer carries the BARMM regional_group the lens must exclude');
  }

  // Coverage invariants. Every district must appear on a card, or the workspace
  // silently drops a seat. A district may appear on more than one card when two
  // multi-district offices overlap (Manila 6th is served by both North and South
  // Manila DEO) — that is honest, since each card's rows are distinct and the
  // money tie-out above already proves no row is booked twice. What is not
  // acceptable is a district carrying two different tiers, which would label
  // the same money both attributable and undivided.
  const districtTiers = new Map();
  for (const card of cards) {
    for (const district of card.districts) {
      const seen = districtTiers.get(district.id);
      if (seen && seen !== card.tier) {
        fail(`district ${district.id} carries conflicting tiers (${seen} and ${card.tier})`);
      }
      districtTiers.set(district.id, card.tier);
    }
  }
  const uncovered = Object.keys(map.districts).filter(id => !districtTiers.has(id));
  if (uncovered.length) fail(`districts with no card: ${uncovered.join(', ')}`);
  if (districtTiers.size !== Object.keys(map.districts).length) {
    fail('district coverage count disagrees with the crosswalk');
  }
  // A Tier A card must name exactly one district: that is the whole basis on
  // which its money is called attributable rather than an undivided range.
  if (cards.some(card => card.tier === 'A' && card.districts.length !== 1)) {
    fail('Tier A card does not serve exactly one district');
  }
  if (cards.some(card => card.tier === 'B' && card.districts.length < 2)) {
    fail('Tier B card serves fewer than two districts');
  }

  return {
    schema_version: 1,
    fiscal_year: 2027,
    built_at: builtAt,
    lens: {
      name: 'DPWH district engineering office lens',
      authority: 'DEO2LEG/README.md — "The one authorized project-level use: the DEO lens"',
      grouping_unit: 'The implementing office printed on the source row, mapped through DEO2LEG/outputs/deo_leg_crosswalk.json.',
      grain: 'One printed DPWH allocation record; grouped House members counted individually.',
      stages: 'HGAB3 · 3rd reading (House) ↔ DBM NEP. The DPWH Transparency API side corroborates but is not a stage and never decides attribution.',
      tiers: {
        A: 'The office group serves exactly one district, so the figure is attributable to that district alone.',
        B: 'The office group serves two or more districts. The figure is an undivided range shared with the named co-served districts and is never split.',
      },
      not_claimed: 'Nothing here establishes that a representative requested, sponsored, or controlled any project or amount. A card reports what the office that serves that district printed.',
      regional_groups_excluded: map.rejectedGroups,
    },
    datasets: {
      dpwh: {status: 'active', basis: 'Every source row prints an implementing office, so records join the crosswalk directly.'},
      fmr: {status: 'not_attributable', reason: 'The FMR annex prints no office field; attribution would need a municipality/barangay → district mapping this index does not carry.'},
      hfep: {status: 'not_attributable', reason: 'HFEP carries province-level hierarchy only, with no coordinates; multi-district provinces cannot be resolved to a district.'},
      nia: {status: 'not_attributable', reason: 'NIA rows carry no coordinates or LGU fields; inventing an office from free text is forbidden by the upstream no_office flag.'},
    },
    reconciliation: {
      whole,
      cards_total: sumParts(cards.map(card => card.summary)),
      residual,
      office_change: officeChange,
      tied_numeric_fields: tieFields,
      row_classification: classification,
      row_counts: {total: rows.length, cards: sum(cards, card => card.rows),
        residual: residualRows.length, office_change: changeRows.length},
    },
    residual: {
      // Condition 3: publish the residual in full. District cards account for a
      // minority of this ledger and the view must say so.
      summary: residual,
      share_of_ledger: residualShare,
      note: 'Records printed under a Central Office, a Regional Office, the BARMM regional grouping, or no office at all. They have no district and are never folded into a card.',
      row_ids: rowIds.residual ?? [],
    },
    office_change: {
      summary: officeChange,
      note: 'Paired rows whose two stages do not agree on one office group: either the implementing office changed between the NEP and the 3rd reading, or one stage printed an office with no district. Published separately so no card books money the other stage did not attribute to it.',
      rows: changeRows.map(row => ({
        id: row.id,
        title: row.title,
        cross_district: classifyRow(row, map, officeToGroup).crossDistrict,
        offices: classifyRow(row, map, officeToGroup).offices,
        third_php: row.third?.amount_php ?? 0,
        nep_php: row.nep?.amount_php ?? 0,
      })),
    },
    cards,
    districts: districtIndex(map, cards),
    counts: {
      cards: cards.length,
      tier_a: cards.filter(card => card.tier === 'A').length,
      tier_b: cards.filter(card => card.tier === 'B').length,
      regional_group_only: cards.filter(card => card.tier === 'none').length,
      // Office-group cards are fewer than offices: two Tier A offices serving the
      // same single district share one undivided card (8 such merges).
      offices_represented: sum(cards, card => card.offices.length),
      districts: Object.keys(map.districts).length,
      representatives_resolved: Object.values(map.districts)
        .filter(district => district.representative?.resolutionStatus === 'resolved').length,
      representatives_ambiguous: Object.values(map.districts)
        .filter(district => district.representative?.resolutionStatus !== 'resolved').length,
    },
    input_provenance: provenance,
  };
}

// Only the fields partition() produces, so the Overview adapter's extra
// presentation keys (links, labels, readings) do not enter the tie-out.
const PARTITION_FIELDS = ['sources', 'insertions', 'deletions', 'unchanged', 'paired_comparison_rows',
  'adjustments', 'scope_review', 'delta_php'];
function stripWorkspace(workspace) {
  return Object.fromEntries(PARTITION_FIELDS.filter(key => key in workspace).map(key => [key, workspace[key]]));
}
function sumParts(parts) {
  const total = {};
  for (const part of parts) {
    for (const [path, value] of Object.entries(numericLeaves(part))) {
      total[path] = (total[path] ?? 0) + value;
    }
  }
  return total;
}

function bucketRowIds(rows) {
  const ids = Object.fromEntries(ROW_BUCKET_KEYS.map(key => [key, []]));
  for (const row of rows) {
    const segmentScope = row.house_match === 'segment_scope_candidate' || String(row.trace).includes('segment_scope_review');
    if (row.third && !row.nep) ids.insertions.push(row.id);
    else if (row.nep && !row.third) ids.deletions.push(row.id);
    else if (segmentScope) ids.scope_review.push(row.id);
    else if (row.third.amount_php > row.nep.amount_php) ids.increased.push(row.id);
    else if (row.third.amount_php < row.nep.amount_php) ids.reduced.push(row.id);
    else ids.unchanged.push(row.id);
  }
  // The explorer filters the shared comparison payload by these IDs, so they
  // must reproduce partition() exactly or a card and its table would disagree.
  const counted = sum(ROW_BUCKET_KEYS, key => ids[key].length);
  if (counted !== rows.length) fail(`row buckets lost ${rows.length - counted} rows`);
  return ids;
}

function describeDistrict(district, districtId) {
  if (!district) fail(`crosswalk district missing: ${districtId}`);
  const representative = district.representative ?? {};
  const profile = representative.profile ?? null;
  return {
    id: districtId,
    displayName: district.displayName,
    jurisdiction: district.jurisdiction,
    districtLabel: district.districtLabel,
    region: district.region,
    representative: {
      name: representative.name ?? null,
      officialSeat: representative.officialSeat ?? null,
      // Leadership only: the Speaker badge appears on the one card that holds
      // it and nowhere else. Committee assignments are not in this dataset.
      leadershipRoles: representative.leadershipRoles ?? [],
      resolutionStatus: representative.resolutionStatus ?? null,
      verifiedAgainstOfficialDirectory: representative.verifiedAgainstOfficialDirectory ?? false,
      // An ambiguous seat names no representative. Both candidates are shown so
      // the card states the uncertainty instead of picking a side.
      candidates: representative.candidates ?? null,
      note: representative.note ?? null,
      memberCode: profile?.memberCode ?? null,
      detailUrl: profile?.detailUrl ?? null,
      photoPath: profile?.photoPath ?? null,
      positionType: profile?.positionType ?? null,
    },
  };
}

// One representative label per card. A Tier B range serves several districts and
// therefore several representatives, so it lists them rather than inventing a
// single owner for shared money.
function soleRepresentative(districts) {
  const resolved = districts.map(district => district.representative)
    .filter(representative => representative.resolutionStatus === 'resolved' && representative.name);
  if (districts.length === 1) return districts[0].representative;
  return {multiple: true, count: resolved.length, names: resolved.map(representative => representative.name)};
}

// District-level lookup so a district card can point at the office group that
// carries its money, and a Tier B district can name its co-served neighbours.
function districtIndex(map, cards) {
  const index = {};
  for (const [districtId, district] of Object.entries(map.districts)) {
    const groups = cards.filter(card => card.districts.some(entry => entry.id === districtId));
    if (!groups.length) fail(`district ${districtId} is served by no card`);
    // The district inherits the tier its cards assert. Deriving it independently
    // (as "not Tier A, therefore Tier B") mislabels the regional-group-only
    // districts, whose cards carry tier 'none' because no office ledger exists.
    const tiers = new Set(groups.map(card => card.tier));
    if (tiers.size > 1) {
      fail(`district ${districtId} sits on cards with conflicting tiers: ${[...tiers].join(', ')}`);
    }
    const tier = [...tiers][0];
    // Tier A is a claim that the money belongs to this district alone, so the
    // card must serve exactly one district for that claim to hold.
    if (tier === 'A' && groups.some(card => card.districts.length !== 1)) {
      fail(`district ${districtId} is Tier A but sits on a multi-district card`);
    }
    index[districtId] = {
      displayName: district.displayName,
      region: district.region,
      tier,
      cardIds: groups.map(card => card.id),
      coServedDistricts: [...new Set(groups.flatMap(card => card.districts.map(entry => entry.id)))].filter(id => id !== districtId).sort(),
      representative: describeDistrict(district, districtId).representative,
    };
  }
  return index;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Paths are given relative to this file; repoPath records them the way the
  // rest of the repo cites them, so provenance points at a real file.
  const sources = {
    detail: {file: '../data/comparison_projects_2027.json', repoPath: 'analysis/data/comparison_projects_2027.json'},
    overview: {file: '../data/comparison_overview_2027.json', repoPath: 'analysis/data/comparison_overview_2027.json'},
    crosswalk: {file: '../../DEO2LEG/outputs/deo_leg_crosswalk.json', repoPath: 'DEO2LEG/outputs/deo_leg_crosswalk.json'},
  };
  const raw = {}, provenance = {};
  for (const [key, {file, repoPath}] of Object.entries(sources)) {
    const bytes = readFileSync(new URL(file, import.meta.url));
    const payload = JSON.parse(bytes);
    if (key !== 'crosswalk' && payload.schema_version !== 1) fail(`unsupported ${key} schema`);
    raw[key] = payload;
    provenance[key] = {path: repoPath, sha256: createHash('sha256').update(bytes).digest('hex')};
  }
  const index = buildCongressIndex(raw, new Date().toISOString(), provenance);
  writeFileSync(new URL('../data/congress_district_index_2027.json', import.meta.url), JSON.stringify(index) + '\n');
  const c = index.counts, r = index.reconciliation.row_counts;
  process.stdout.write(`Congress index built: ${c.cards} cards — ${c.tier_a} Tier A, ${c.tier_b} Tier B, ${c.regional_group_only} regional-group-only — over ${c.districts} districts\n`);
  process.stdout.write(`  rows ${r.total} = cards ${r.cards} + residual ${r.residual} + office_change ${r.office_change}\n`);
  process.stdout.write(`  unattributable share: NEP ${(index.residual.share_of_ledger.nep * 100).toFixed(1)}% · HGAB3 ${(index.residual.share_of_ledger.house * 100).toFixed(1)}%\n`);
  process.stdout.write(`  tied ${index.reconciliation.tied_numeric_fields} numeric fields against the published Overview\n`);
}
