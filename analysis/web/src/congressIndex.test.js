import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hydrateProjects} from './comparisonData.js';
import {regionCandidates} from './regionCandidates.js';
import {partition} from './overviewSummary.js';
import {buildCongressIndex, officeJoinKey, classifyRow, buildCrosswalk} from '../buildCongressIndex.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
const readRepo = path => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url)));

const detail = read('comparison_projects_2027.json');
const overview = read('comparison_overview_2027.json');
const crosswalk = readRepo('DEO2LEG/outputs/deo_leg_crosswalk.json');
const committed = read('congress_district_index_2027.json');

const BUCKETS = ['insertions', 'deletions', 'increased', 'reduced', 'unchanged', 'scope_review'];
const flat = (list, key) => list.flatMap(card => card[key]);

// Independent re-derivation of partition()'s buckets from the raw rows. This
// deliberately does NOT call the builder's own bucketRowIds helper: the
// explorer filters the shared comparison payload by these IDs, so a card and
// its table must agree even if the builder's helper drifts.
function expectedBuckets(rows) {
  const out = Object.fromEntries(BUCKETS.map(bucket => [bucket, []]));
  for (const row of rows) {
    const segmentScope = row.house_match === 'segment_scope_candidate' ||
      String(row.trace).includes('segment_scope_review');
    if (row.third && !row.nep) out.insertions.push(row.id);
    else if (row.nep && !row.third) out.deletions.push(row.id);
    else if (segmentScope) out.scope_review.push(row.id);
    else if (row.third.amount_php > row.nep.amount_php) out.increased.push(row.id);
    else if (row.third.amount_php < row.nep.amount_php) out.reduced.push(row.id);
    else out.unchanged.push(row.id);
  }
  for (const bucket of BUCKETS) out[bucket].sort();
  return out;
}

// ---------------------------------------------------------------------------
// The join vocabulary
// ---------------------------------------------------------------------------

test('the office join key collapses the ledger and registry vocabularies', () => {
  // The ledger prints the long form and has already collapsed the hyphen; the
  // crosswalk registry prints the abbreviation and keeps it.
  assert.equal(officeJoinKey('Las Piñas-Muntinlupa DEO'), officeJoinKey('Las Piñas Muntinlupa District Engineering Office'));
  assert.equal(officeJoinKey('Camarines Norte Sub-DEO'), officeJoinKey('Camarines Norte Sub District Engineering Office'));
  assert.equal(officeJoinKey('Malabon-Navotas DEO'), officeJoinKey('Malabon Navotas District Engineering Office'));
  assert.equal(officeJoinKey('Tarlac DEO'), officeJoinKey('Tarlac District Engineering Office'));
  assert.equal(officeJoinKey('Metro Manila 3rd DEO'), officeJoinKey('Metro Manila 3rd District Engineering Office'));
  // Distinct offices must stay distinct, or two districts would share a card.
  assert.notEqual(officeJoinKey('Ilocos Norte 1st DEO'), officeJoinKey('Ilocos Norte 2nd DEO'));
  assert.notEqual(officeJoinKey('Tarlac DEO'), officeJoinKey('Tarlac City DEO'));
});

test('the join key absorbs the office-name OCR slips the ledger carries', () => {
  // Regression guard for the three slips mined out of the House NEP annexes.
  // Without them each typo formed its own office bucket, splitting one office
  // in two across every filter and dropping it out of the crosswalk join.
  for (const [slip, correct] of [
    ['Misamis Occidenatal 2nd District Engineering Office', 'Misamis Occidental 2nd District Engineering Office'],
    ['Batagas 2nd District Engineering Office', 'Batangas 2nd District Engineering Office'],
    ['Ilolilo 2nd District Engineering Office', 'Iloilo 2nd District Engineering Office'],
  ]) {
    assert.equal(officeJoinKey(slip), officeJoinKey(correct), `${slip} must join to ${correct}`);
  }
});

test('every ledger office resolves to a group or is knowingly unattributable', () => {
  const map = buildCrosswalk(crosswalk);
  const groupsForOffice = name => {
    const officeIds = map.keyToOffices.get(officeJoinKey(name));
    if (!officeIds) return null;
    const groupIds = new Set(officeIds.map(id => map.officeToGroup.get(id)).filter(Boolean));
    return groupIds.size === 1 ? [...groupIds][0] : null;
  };
  const rows = regionCandidates(hydrateProjects(detail));
  const unmatched = new Set();
  for (const row of rows) {
    for (const side of ['third', 'nep']) {
      const source = row[side];
      if (!source) continue;
      for (const record of source.records ?? [source]) {
        const office = record.office_canonical ?? record.office;
        if (office && !groupsForOffice(office)) unmatched.add(office);
      }
    }
  }
  // Only Central Office, the Regional Offices and the BARMM grouping may fail to
  // join. Any DEO-shaped name in this set is a broken join, not a policy call.
  for (const office of unmatched) {
    const isRegional = /^Regional Office\b/.test(office) || /Regional Office$/.test(office) ||
      office === 'BARMM' || office === 'Central Office';
    assert.ok(isRegional, `unattributable office looks like a DEO and should have joined: ${office}`);
    assert.ok(!/District Engineering Office$/.test(office), `a DEO failed to join the crosswalk: ${office}`);
  }
});

test('a regional grouping is never treated as a district office', () => {
  const map = buildCrosswalk(crosswalk);
  const barmm = crosswalk.offices['office:barmm'];
  assert.equal(barmm.type, 'regional_group');
  // Excluded from the money-carrying join, and recorded as excluded.
  assert.equal(map.keyToOffices.get(officeJoinKey('BARMM')), undefined);
  assert.ok(map.rejectedGroups.some(entry => entry.officeId === 'office:barmm' && entry.type === 'regional_group'));
  // Its six districts are still reachable — five only through BARMM.
  assert.equal(map.regionalGroupOnly.length, 5);
  for (const districtId of map.regionalGroupOnly) {
    const district = crosswalk.legislativeDistricts[districtId];
    assert.ok(district.officeIds.every(id => crosswalk.offices[id].type === 'regional_group'),
      `${districtId} has a real office but was reported as regional-group-only`);
  }
});

// ---------------------------------------------------------------------------
// Freshness and reconciliation
// ---------------------------------------------------------------------------

test('the committed index matches a fresh build', () => {
  const fresh = buildCongressIndex({detail, overview, crosswalk}, committed.built_at,
    committed.input_provenance);
  assert.deepEqual(committed, fresh,
    'congress_district_index_2027.json is stale; run node analysis/web/buildCongressIndex.mjs');
  // The build must be reproducible: same inputs, same bytes apart from the
  // timestamp, or a card figure could drift between rebuilds.
  const again = buildCongressIndex({detail, overview, crosswalk}, committed.built_at,
    committed.input_provenance);
  assert.deepEqual(again, fresh, 'the build is not deterministic');
  // Provenance pins the exact inputs, so a mixed-build pair is detectable.
  assert.deepEqual(Object.keys(committed.input_provenance).sort(), ['crosswalk', 'detail', 'overview']);
  for (const entry of Object.values(committed.input_provenance)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    // The cited path must resolve to the real file, or the provenance is decoration.
    const bytes = readFileSync(new URL(`../../../${entry.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
      `${entry.path} does not hash to the recorded digest`);
  }
});

test('cards plus residual plus office change rebuild the published ledger exactly', () => {
  const rows = regionCandidates(hydrateProjects(detail));
  const whole = partition(rows, 'third');
  const parts = [...committed.cards.map(card => card.summary),
    committed.residual.summary, committed.office_change.summary];

  // Every numeric leaf partition() emits must sum back to the whole. Recomputing
  // the leaves here means a field added to partition() later cannot escape the
  // tie-out unnoticed.
  const leaves = (value, prefix = '', out = {}) => {
    if (typeof value === 'number') out[prefix] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  };
  const expected = leaves(whole), actual = {};
  for (const part of parts) {
    for (const [path, value] of Object.entries(leaves(part))) actual[path] = (actual[path] ?? 0) + value;
  }
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  assert.ok(keys.length >= 20, `tie-out only covers ${keys.length} fields; partition() grew`);
  for (const key of keys) {
    assert.equal(actual[key] ?? 0, expected[key] ?? 0, `cards do not tie to the ledger on ${key}`);
  }
  assert.equal(committed.reconciliation.tied_numeric_fields, keys.length);

  // Anchor to the published Overview so a congress card can never contradict it.
  const published = committed.reconciliation.whole;
  assert.equal(published.sources.house.amount_php, overview.headlines.sources.third.amount_php);
  assert.equal(published.sources.house.count, overview.headlines.sources.third.records);
  assert.equal(published.sources.nep.amount_php, overview.headlines.sources.nep.amount_php);
  assert.equal(published.sources.nep.count, overview.headlines.sources.nep.records);
});

test('every row lands in exactly one place', () => {
  const rows = regionCandidates(hydrateProjects(detail));
  const byId = new Map(rows.map(row => [row.id, row]));
  const seen = new Map();
  const note = (id, where) => {
    assert.ok(byId.has(id), `${where} cites unknown row ${id}`);
    assert.ok(!seen.has(id), `row ${id} booked to both ${seen.get(id)} and ${where}`);
    seen.set(id, where);
  };
  for (const card of committed.cards) {
    for (const bucket of BUCKETS) for (const id of card.row_ids[bucket]) note(id, `card ${card.id}`);
  }
  for (const id of committed.residual.row_ids) note(id, 'residual');
  for (const entry of committed.office_change.rows) note(entry.id, 'office_change');

  assert.equal(seen.size, rows.length,
    `${rows.length - seen.size} rows were dropped and never published`);
  assert.deepEqual(committed.reconciliation.row_counts, {
    total: rows.length,
    cards: flat(committed.cards, 'rows').reduce((total, n) => total + n, 0),
    residual: committed.residual.row_ids.length,
    office_change: committed.office_change.rows.length,
  });
  // Office-change rows are held out, so no card may also claim them.
  for (const entry of committed.office_change.rows) {
    for (const card of committed.cards) {
      for (const bucket of BUCKETS) {
        assert.ok(!card.row_ids[bucket].includes(entry.id),
          `office-change row ${entry.id} is also booked to card ${card.id}`);
      }
    }
  }
});

test('each card publishes the row IDs its own summary describes', () => {
  const rows = new Map(regionCandidates(hydrateProjects(detail)).map(row => [row.id, row]));
  for (const card of committed.cards) {
    if (card.tier === 'none') {
      for (const bucket of BUCKETS) assert.deepEqual(card.row_ids[bucket], [], `${card.id} claims rows it cannot attribute`);
      assert.equal(card.rows, 0);
      continue;
    }
    const cardRows = BUCKETS.flatMap(bucket => card.row_ids[bucket]).map(id => rows.get(id));
    assert.equal(cardRows.length, card.rows, `${card.id} row_ids disagree with its row count`);
    assert.deepEqual(expectedBuckets(cardRows), Object.fromEntries(BUCKETS.map(bucket =>
      [bucket, [...card.row_ids[bucket]].sort()])), `${card.id} row_ids are not the buckets its summary counts`);
    // The summary must be reproducible from exactly those rows.
    assert.deepEqual(partition(cardRows, 'third'), card.summary,
      `${card.id} summary does not reproduce from its own row IDs`);
    // Every row on this card must belong to one of the card's offices.
    const names = new Set(card.ledger_names);
    for (const row of cardRows) {
      for (const side of ['third', 'nep']) {
        const source = row[side];
        if (!source) continue;
        for (const record of source.records ?? [source]) {
          const office = record.office_canonical ?? record.office;
          if (!office) continue;
          assert.ok(names.has(office), `${card.id} carries a row printed under ${office}, outside its ledger names`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The four policy conditions
// ---------------------------------------------------------------------------

test('every aggregate carries an attribution tier and the tiers mean what they say', () => {
  assert.ok(committed.cards.length > 0);
  for (const card of committed.cards) {
    assert.ok(['A', 'B', 'none'].includes(card.tier), `${card.id} has tier ${card.tier}`);
    if (card.tier === 'A') {
      // Attributable to one district alone.
      assert.equal(card.districts.length, 1, `Tier A card ${card.id} serves ${card.districts.length} districts`);
      assert.equal(card.undivided, false);
    } else if (card.tier === 'B') {
      assert.ok(card.districts.length >= 2, `Tier B card ${card.id} serves one district`);
      assert.equal(card.undivided, true);
    } else {
      assert.ok(card.tier_note, `tier-none card ${card.id} must explain itself`);
      assert.equal(card.rows, 0);
    }
  }
  assert.equal(committed.counts.tier_a + committed.counts.tier_b + committed.counts.regional_group_only,
    committed.counts.cards);
});

test('Tier B money is never divided among its districts', () => {
  const tierB = committed.cards.filter(card => card.tier === 'B');
  assert.ok(tierB.length > 0, 'no Tier B cards; the lens lost its shared offices');
  // Any KEY that would carry a per-district amount means the forbidden split
  // has crept back in. Scanning keys (not prose) avoids matching the policy
  // wording itself, which says the money is undivided.
  const forbidden = /per_?district|district_?(share|amount|total|php)|allocated|share_?php|split/i;
  const badKeys = (value, path = '', out = []) => {
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (forbidden.test(key)) out.push(`${path}.${key}`);
        badKeys(child, `${path}.${key}`, out);
      }
    }
    return out;
  };
  for (const card of tierB) {
    assert.deepEqual(badKeys(card.summary), [], `${card.id} summary divides its money`);
    // One undivided summary for the whole office group: count + amount per side,
    // and nothing per district.
    assert.deepEqual(Object.keys(card.summary.sources.house).sort(), ['amount_php', 'count']);
    assert.deepEqual(Object.keys(card.summary.sources.nep).sort(), ['amount_php', 'count']);
    // Co-served districts are all named on the card face, each exactly once, and
    // each keeps its own representative rather than sharing one invented owner.
    const ids = card.districts.map(district => district.id);
    assert.equal(new Set(ids).size, ids.length, `${card.id} repeats a district`);
    assert.ok(card.districts.length >= 2);
    assert.ok(card.districts.every(district => district.displayName && district.representative));
    assert.equal(card.undivided, true);
    // A divided total would not survive the whole-ledger tie-out, but assert the
    // obvious invariant too: the card's own rows reproduce its own summary.
    assert.equal(card.rows, card.row_ids.insertions.length + card.row_ids.deletions.length +
      card.row_ids.increased.length + card.row_ids.reduced.length + card.row_ids.unchanged.length +
      card.row_ids.scope_review.length);
  }
  // Districts inside a Tier B range must say so, and name their neighbours.
  for (const card of tierB) {
    for (const district of card.districts) {
      const entry = committed.districts[district.id];
      assert.equal(entry.tier, 'B', `${district.id} sits on a Tier B card but is labelled ${entry.tier}`);
      for (const neighbour of card.districts.filter(other => other.id !== district.id)) {
        assert.ok(entry.coServedDistricts.includes(neighbour.id),
          `${district.id} does not name its co-served district ${neighbour.id}`);
      }
    }
  }
});

test('the unattributable residual is published in full and holds the Central Office money', () => {
  const residual = committed.residual;
  const whole = committed.reconciliation.whole.sources;
  const share = residual.share_of_ledger;
  assert.equal(share.nep, residual.summary.sources.nep.amount_php / whole.nep.amount_php);
  assert.equal(share.house, residual.summary.sources.house.amount_php / whole.house.amount_php);
  // Central Office dominates this ledger, so the residual must stay the
  // majority. If it ever flips, district cards would overstate their coverage.
  assert.ok(share.nep > 0.5, `NEP residual share fell to ${(share.nep * 100).toFixed(1)}%`);
  assert.ok(share.house > 0.5, `HGAB3 residual share fell to ${(share.house * 100).toFixed(1)}%`);
  assert.ok(residual.row_ids.length > 0);
  assert.ok(residual.note.includes('Central Office'));
  // The documented figures in DEO2LEG/README.md must match what is published.
  // Collapse whitespace first: the README is hard-wrapped, so a phrase can span
  // a line break without meaning anything changed.
  const readme = readFileSync(new URL('../../../DEO2LEG/README.md', import.meta.url), 'utf8')
    .replace(/\s+/g, ' ');
  assert.ok(readme.includes(`${(share.nep * 100).toFixed(1)}% of the NEP side`),
    'DEO2LEG/README.md states a different residual share than the index publishes');
  assert.ok(readme.includes(`${(share.house * 100).toFixed(1)}% of the HGAB3 side`),
    'DEO2LEG/README.md states a different residual share than the index publishes');
});

test('the upstream honesty buckets survive into every card', () => {
  // Condition 4: segment-scope review stays its own bucket rather than being
  // folded into increases/decreases, on each card as well as in the whole.
  const whole = partition(regionCandidates(hydrateProjects(detail)), 'third');
  const summed = key => committed.cards.reduce((total, card) => total + card.summary.scope_review[key], 0) +
    committed.residual.summary.scope_review[key] + committed.office_change.summary.scope_review[key];
  assert.equal(summed('count'), whole.scope_review.count);
  assert.equal(summed('net_php'), whole.scope_review.net_php);
  assert.ok(whole.scope_review.count > 0, 'no segment-scope rows; the carve-out is untested');
  for (const card of committed.cards) {
    if (card.summary.scope_review.count > 0) {
      assert.equal(card.row_ids.scope_review.length, card.summary.scope_review.count,
        `${card.id} scope_review count does not match its row IDs`);
      // Deltas are deliberately not booked as same-project adjustments.
      assert.equal(card.summary.adjustments.increased_count + card.summary.adjustments.reduced_count,
        card.summary.paired_comparison_rows - card.summary.unchanged.count - card.summary.scope_review.count);
    }
  }
});

// ---------------------------------------------------------------------------
// Coverage and representation
// ---------------------------------------------------------------------------

test('every legislative district appears on a card with a consistent tier', () => {
  const seen = new Map();
  for (const card of committed.cards) {
    for (const district of card.districts) {
      assert.ok(!seen.has(district.id) || seen.get(district.id) === card.tier,
        `${district.id} is labelled ${seen.get(district.id)} on one card and ${card.tier} on another`);
      seen.set(district.id, card.tier);
    }
  }
  const expected = Object.keys(crosswalk.legislativeDistricts);
  assert.deepEqual([...seen.keys()].sort(), expected.sort(),
    'district coverage does not match the crosswalk');
  assert.equal(committed.counts.districts, expected.length);
  // The district index agrees with the cards it points at.
  assert.deepEqual(Object.keys(committed.districts).sort(), expected.sort());
  for (const [districtId, entry] of Object.entries(committed.districts)) {
    assert.ok(entry.cardIds.length > 0, `${districtId} has no card`);
    const tiers = entry.cardIds.map(id => committed.cards.find(card => card.id === id).tier);
    assert.ok(tiers.every(tier => tier === tiers[0]), `${districtId} spans conflicting card tiers`);
    assert.equal(entry.tier, tiers[0]);
    for (const coServed of entry.coServedDistricts) {
      assert.ok(committed.districts[coServed], `${districtId} names unknown co-served district ${coServed}`);
      assert.ok(committed.districts[coServed].coServedDistricts.includes(districtId),
        `co-served link is one-way between ${districtId} and ${coServed}`);
    }
  }
});

test('leadership roles appear only where the crosswalk records them', () => {
  const withRole = [];
  for (const card of committed.cards) {
    for (const district of card.districts) {
      for (const role of district.representative.leadershipRoles) withRole.push([card.id, district.id, role]);
    }
  }
  // Exactly the Speaker of the House, on exactly one seat.
  assert.deepEqual(withRole.map(entry => entry[2]), ['Speaker of the House']);
  assert.equal(withRole[0][1], 'leg:isabela:6th');
  const source = crosswalk.legislativeDistricts['leg:isabela:6th'].representative.leadershipRoles;
  assert.deepEqual(source, ['Speaker of the House']);
  // No card invents a role the crosswalk does not carry.
  for (const [districtId, district] of Object.entries(crosswalk.legislativeDistricts)) {
    const published = committed.districts[districtId].representative.leadershipRoles;
    assert.deepEqual(published, district.representative?.leadershipRoles ?? []);
  }
});

test('an ambiguous seat names no representative and shows both candidates', () => {
  const ambiguous = Object.entries(crosswalk.legislativeDistricts)
    .filter(([, district]) => district.representative?.resolutionStatus !== 'resolved')
    .map(([districtId]) => districtId);
  assert.deepEqual(ambiguous.sort(), ['leg:antipolo-city:2nd', 'leg:cavite:4th']);
  for (const districtId of ambiguous) {
    const published = committed.districts[districtId].representative;
    assert.equal(published.name, null, `${districtId} picked a representative the source left ambiguous`);
    assert.equal(published.resolutionStatus, 'ambiguous_multiple_listed');
    assert.equal(published.candidates.length, 2);
    assert.deepEqual(published.candidates, crosswalk.legislativeDistricts[districtId].representative.candidates);
    assert.ok(published.note, `${districtId} must carry the upstream explanation`);
    // The card face must not silently promote one candidate either.
    const card = committed.cards.find(entry => entry.districts.some(district => district.id === districtId));
    assert.ok(card, `${districtId} has no card`);
    const face = card.districts.find(district => district.id === districtId).representative;
    assert.equal(face.name, null);
    if (!card.representative.multiple) assert.equal(card.representative.name, null);
  }
  assert.equal(committed.counts.representatives_ambiguous, ambiguous.length);
  assert.equal(committed.counts.representatives_resolved + committed.counts.representatives_ambiguous,
    committed.counts.districts);
});

test('a card names a single representative only when one district is served', () => {
  for (const card of committed.cards) {
    if (card.districts.length === 1) {
      assert.ok(!card.representative.multiple, `${card.id} serves one district but lists several representatives`);
      assert.deepEqual(card.representative, card.districts[0].representative);
    } else {
      // A Tier B range serves several districts, so it must not invent one owner
      // for money this data cannot split.
      assert.equal(card.representative.multiple, true, `${card.id} spans ${card.districts.length} districts but names one representative`);
      assert.equal(card.representative.names.length,
        card.districts.filter(district => district.representative.resolutionStatus === 'resolved').length);
    }
  }
});

test('office-change rows are published as evidence, not assigned to a district', () => {
  const change = committed.office_change;
  assert.ok(change.rows.length > 0, 'no office-change rows; the hold-out is untested');
  const crossDistrict = change.rows.filter(row => row.cross_district);
  assert.equal(crossDistrict.length, 10, 'the count of rows whose implementing office changed between stages drifted');
  for (const row of change.rows) {
    assert.ok(row.id && row.title, 'office-change row lost its identity');
    // Both stages are shown so a reader can see the disagreement themselves.
    assert.ok(row.offices.third || row.offices.nep, `${row.id} records no offices`);
    assert.ok(!row.districtId && !row.district, `${row.id} was assigned a district`);
  }
  // The two stages genuinely disagree on the cross-district rows: both name a
  // real office and the offices differ. A row held out for no other reason
  // would be hiding an ordinary record.
  for (const row of crossDistrict) {
    const third = row.offices.third.filter(Boolean), nep = row.offices.nep.filter(Boolean);
    assert.ok(third.length && nep.length, `${row.id} is cross-district without offices on both stages`);
    assert.notDeepEqual(new Set(third), new Set(nep), `${row.id} is not actually a cross-office disagreement`);
    assert.ok(third.every(office => /District Engineering Office$/.test(office)) &&
      nep.every(office => /District Engineering Office$/.test(office)),
      `${row.id} disagrees over something other than two district offices`);
  }
  // Every held-out row must have a stated reason: differing offices, or one
  // side with no district. A row with neither would be unexplained suppression.
  for (const row of change.rows) {
    const third = row.offices.third.filter(Boolean), nep = row.offices.nep.filter(Boolean);
    assert.ok(third.length || nep.length, `${row.id} was held out with no office evidence`);
  }
  assert.ok(change.note.includes('office'));
});

test('the lens states what it does not claim and which datasets it cannot cover', () => {
  assert.ok(committed.lens.not_claimed.includes('requested, sponsored, or controlled'));
  assert.equal(committed.lens.authority.includes('DEO2LEG/README.md'), true);
  assert.equal(committed.lens.regional_groups_excluded.length, 1);
  assert.equal(committed.datasets.dpwh.status, 'active');
  for (const key of ['fmr', 'hfep', 'nia']) {
    assert.equal(committed.datasets[key].status, 'not_attributable',
      `${key} was marked attributable without a district mapping in this index`);
    assert.ok(committed.datasets[key].reason, `${key} must explain why it is not attributable`);
  }
  // Stages are the two ledgers being compared; the API side never decides
  // attribution, so it must not be listed as a stage.
  assert.ok(!committed.lens.stages.toLowerCase().includes('transparency api') ||
    committed.lens.stages.includes('not a stage'));
});

test('classifyRow never attributes a row whose stages disagree', () => {
  const map = buildCrosswalk(crosswalk);
  const groupsForOffice = name => {
    const officeIds = map.keyToOffices.get(officeJoinKey(name));
    if (!officeIds) return null;
    const groupIds = new Set(officeIds.map(id => map.officeToGroup.get(id)).filter(Boolean));
    return groupIds.size === 1 ? [...groupIds][0] : null;
  };
  const counts = {group: 0, residual: 0, office_change: 0, no_office: 0, no_stage: 0};
  for (const row of regionCandidates(hydrateProjects(detail))) {
    counts[classifyRow(row, map, groupsForOffice).kind] += 1;
  }
  assert.deepEqual(counts, committed.reconciliation.row_classification);
  assert.equal(counts.no_stage, 0, 'a row carries neither stage');
  // A synthetic row whose stages name different offices must be held out.
  const fabricated = {
    id: 'synthetic', title: 'Synthetic', trace: '',
    third: {amount_php: 1, records: [{id: 'a', amount_php: 1, office_canonical: 'Tarlac District Engineering Office'}]},
    nep: {amount_php: 1, records: [{id: 'b', amount_php: 1, office_canonical: 'Ilocos Norte 1st District Engineering Office'}]},
  };
  const verdict = classifyRow(fabricated, map, groupsForOffice);
  assert.equal(verdict.kind, 'office_change');
  assert.equal(verdict.crossDistrict, true);
  // One stage attributed, the other Central Office: still held out, because
  // charging the Central Office money to a DEO would move money without evidence.
  const mixed = {
    id: 'synthetic2', title: 'Synthetic', trace: '',
    third: {amount_php: 1, records: [{id: 'a', amount_php: 1, office_canonical: 'Tarlac District Engineering Office'}]},
    nep: {amount_php: 1, records: [{id: 'b', amount_php: 1, office_canonical: 'Central Office'}]},
  };
  const mixedVerdict = classifyRow(mixed, map, groupsForOffice);
  assert.equal(mixedVerdict.kind, 'office_change');
  assert.equal(mixedVerdict.crossDistrict, false);
  assert.equal(mixedVerdict.oneSideUnattributable, true);
});
