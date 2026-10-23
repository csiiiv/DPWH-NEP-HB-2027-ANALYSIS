import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {
  BUCKETS,
  DATASETS,
  TIER_SHORT,
  money,
  moneyCompact,
  signedMoney,
  percent,
  cardHeadline,
  bucketTotals,
  districtSeats,
  representativeLabel,
  leadershipRoles,
  coServed,
  cardCarriesMoney,
  sortedCards,
  CARD_SORT_OPTIONS,
  parseCardSort,
  cardSortParams,
  indexRowsById,
  cardRows,
  bucketRows,
  recordView,
  chainageView,
  pdfView,
  coordinateView,
  explorerRow,
  EXPLORER_COLUMNS,
  flagCensus,
  bucketCensus,
  filterExplorerRows,
  residualPanel,
  officeChangePanel,
  datasetOptions,
  lensPanel,
  congressRows,
} from './congressModel.js';
import {dpwhSummary} from './overviewSummary.js';
import {FLAG_OPTIONS} from './matchFilters.js';
import {suggestedCounterparts} from './suggestedCounterparts.js';

// The index and the comparison payload are derived datasets (built by
// predev/prebuild, gitignored). On a bare checkout that has not run the data
// build, the whole suite reports skipped instead of crashing on ENOENT — the
// same convention as relationsViewRender.test.js. CI builds before testing,
// so the suite runs fully there.
const haveData = existsSync(new URL('../../data/congress_district_index_2027.json', import.meta.url)) &&
  existsSync(new URL('../../data/comparison_projects_2027.json', import.meta.url)) &&
  existsSync(new URL('../../data/comparison_overview_2027.json', import.meta.url));
const skip = haveData ? false : {skip: 'congress datasets not built — run predev/prebuild'};

const read = name => JSON.parse(readFileSync(new URL(`../../data/${name}`, import.meta.url)));
// Reads and derived maps are guarded: on a bare checkout the tests are all
// skipped, so the nulls below are never dereferenced.
const index = haveData ? read('congress_district_index_2027.json') : null;
const detail = haveData ? read('comparison_projects_2027.json') : null;
const overview = haveData ? read('comparison_overview_2027.json') : null;
const rows = haveData ? congressRows(detail) : [];
const rowsById = haveData ? indexRowsById(rows) : null;
// rowFlags()/matchesFlag() take the shared suggestedCounterparts map, so the
// explorer must pass exactly this — an array would throw at .has().
const counterparts = haveData ? suggestedCounterparts(rows) : null;

// Every card's rows, once, so the heavier sweeps do not rebuild them per test.
const cardRowSets = haveData
  ? new Map(index.cards.map(card => [card.id, cardRows(card, rowsById)]))
  : new Map();

// ---------------------------------------------------------------------------
// Formatting — the card face must not silently round money into a lie
// ---------------------------------------------------------------------------

test(skip, 'formatters keep money readable and lossless at card scale', () => {
  assert.equal(money(1234567891), '₱1,234,567,891');
  assert.equal(money(NaN), '—');
  assert.equal(money(0), '₱0');
  assert.equal(moneyCompact(149_500_000_000), '₱149.5B');
  assert.equal(moneyCompact(9_500_000_000), '₱9.50B');
  assert.equal(moneyCompact(123_456_789), '₱123M');
  assert.equal(moneyCompact(9_876_543), '₱9.9M');
  assert.equal(moneyCompact(12_345), '₱12K');
  assert.equal(moneyCompact(0), '₱0');
  assert.equal(signedMoney(1_500_000), '+₱1,500,000');
  assert.equal(signedMoney(-1_500_000), '−₱1,500,000');
  assert.equal(signedMoney(0), '₱0');
  assert.equal(percent(0.7814), '78.1%');
  assert.equal(percent(NaN), '—');
  // Compact form never claims more precision than it prints.
  for (const value of [1e11, 5e10, 9.5e9, 1.2e9, 5e7, 3e6, 4e4]) {
    const text = moneyCompact(value);
    assert.match(text, /^₱[\d.,]+[BMK]?$/);
  }
});

// ---------------------------------------------------------------------------
// Card face
// ---------------------------------------------------------------------------

test(skip, 'every card exposes the six card-face figures without recomputation', () => {
  for (const card of index.cards) {
    const h = cardHeadline(card);
    for (const bucket of ['insertions', 'deletions', 'unchanged']) {
      assert.ok(Number.isInteger(h[bucket].count), `${card.id}.${bucket} count`);
      assert.ok(Number.isFinite(h[bucket].amount_php), `${card.id}.${bucket} amount`);
    }
    for (const side of ['increased', 'reduced']) {
      assert.ok(Number.isInteger(h[side].count), `${card.id}.${side} count`);
      for (const key of ['amount_php', 'house_php', 'nep_php']) {
        assert.ok(Number.isFinite(h[side][key]), `${card.id}.${side}.${key}`);
      }
      // Both card figures are magnitudes, never negative: increased is
      // House−NEP, reduced is NEP−House.
      assert.ok(h[side].amount_php >= 0, `${card.id}.${side} must not read negative`);
    }
    assert.equal(h.increased.amount_php, h.increased.house_php - h.increased.nep_php,
      `${card.id} increased delta`);
    assert.equal(h.reduced.amount_php, h.reduced.nep_php - h.reduced.house_php,
      `${card.id} reduced delta`);
    assert.equal(h.increased.count + h.reduced.count, card.summary.adjustments.count);
    assert.equal(h.adjustment_net_php, h.increased.amount_php - h.reduced.amount_php,
      `${card.id} net adjustment`);
    assert.ok(Number.isFinite(h.delta_php));
    assert.ok(Number.isFinite(h.scope_review.house_php));
    assert.ok(Number.isFinite(h.scope_review.nep_php));
  }
});

test(skip, 'both stages rebuild the card headline from its buckets', () => {
  for (const card of index.cards) {
    const totals = bucketTotals(card);
    assert.equal(totals.ties, true,
      `${card.id}: buckets must sum to the published card totals`);
    assert.equal(totals.house_php, card.summary.sources.house.amount_php);
    assert.equal(totals.nep_php, card.summary.sources.nep.amount_php);
    // Unchanged pairs are equal on both sides by definition.
    assert.equal(totals.buckets.unchanged.house_php, totals.buckets.unchanged.nep_php);
    // One-sided buckets carry money on exactly one stage.
    assert.equal(totals.buckets.insertions.nep_php, 0);
    assert.equal(totals.buckets.deletions.house_php, 0);
    for (const bucket of BUCKETS) {
      assert.ok(Number.isInteger(totals.buckets[bucket].count), `${card.id}.${bucket}`);
    }
  }
});

test(skip, 'a Tier B card never claims a single owner and names its co-served districts', () => {
  const tierB = index.cards.filter(card => card.tier === 'B');
  assert.equal(tierB.length, index.counts.tier_b);
  assert.ok(tierB.length > 0);
  for (const card of tierB) {
    assert.ok(card.districts.length > 1, card.id);
    assert.equal(card.undivided, true, `${card.id} must be marked undivided`);
    const rep = representativeLabel(card);
    assert.notEqual(rep.kind, 'resolved');
    assert.match(rep.text, /undivided|representatives|No resolved/i,
      `${card.id}: "${rep.text}" must not read as a single owner`);
    for (const district of card.districts) {
      const others = coServed(card, district.id);
      assert.equal(others.length, card.districts.length - 1);
      assert.ok(!others.includes(district.displayName));
    }
    // The summary must hold no per-district split, or the range was divided.
    const keys = JSON.stringify(Object.keys(card.summary)) +
      JSON.stringify(Object.keys(card.summary.adjustments));
    assert.doesNotMatch(keys, /"per_district|_by_district|share_pct|allocation"/,
      `${card.id} carries a divided figure`);
  }
});

test(skip, 'a single-district card names exactly one representative', () => {
  const resolved = index.cards.filter(card => card.districts.length === 1 &&
    card.districts[0].representative.resolutionStatus === 'resolved');
  assert.ok(resolved.length > 100, `only ${resolved.length} clean single-district cards`);
  for (const card of resolved) {
    const rep = representativeLabel(card);
    assert.equal(rep.kind, 'resolved');
    assert.equal(rep.names.length, 1);
    assert.ok(rep.text.length > 2);
    assert.equal(rep.unresolved.length, 0);
    assert.equal(card.undivided, false);
  }
});

test(skip, 'the Speaker badge lands on exactly one card and travels with the member', () => {
  const withLeadership = index.cards.filter(card => leadershipRoles(card).length);
  assert.equal(withLeadership.length, 1, 'Speaker of the House is one seat');
  const roles = leadershipRoles(withLeadership[0]);
  assert.deepEqual(roles.map(entry => entry.role), ['Speaker of the House']);
  assert.equal(roles[0].district, 'ISABELA (SIXTH DISTRICT)');
  assert.ok(roles[0].name.length > 0);
  // No other card, and no invented leadership role anywhere.
  const allRoles = new Set(index.cards.flatMap(card => leadershipRoles(card)).map(r => r.role));
  assert.deepEqual([...allRoles], ['Speaker of the House']);
});

test(skip, 'unresolved seats surface both candidates rather than picking one', () => {
  const ambiguous = index.cards.filter(card =>
    card.districts.some(d => d.representative.resolutionStatus !== 'resolved'));
  assert.equal(ambiguous.length, index.counts.representatives_ambiguous);
  for (const card of ambiguous) {
    const rep = representativeLabel(card);
    assert.ok(rep.unresolved.length > 0, `${card.id} must surface the unresolved seat`);
    for (const seat of rep.unresolved) {
      assert.ok(seat.candidates.length >= 2,
        `${card.id}: a contested seat must show every candidate`);
      assert.ok(seat.note, `${card.id} must carry the upstream explanation`);
    }
    // districtSeats exposes the same candidates for the card body.
    const seats = districtSeats(card).filter(seat => seat.ambiguous);
    assert.equal(seats.length, rep.unresolved.length);
    assert.deepEqual(seats[0].candidates, rep.unresolved[0].candidates);
  }
});

test(skip, 'districtSeats carries the roster links the card body renders', () => {
  const card = index.cards.find(c => c.tier === 'A');
  const [seat] = districtSeats(card);
  assert.ok(seat.districtName.length > 0);
  assert.ok(seat.representative.length > 0, 'a resolved seat names its member');
  assert.ok(seat.label.length > 0);
  assert.ok(!/\blone\b/i.test(seat.label) || seat.label === 'Lone District',
    '"lone" must never print as "lone District"');
  assert.match(seat.detailUrl, /^https:\/\/www\.congress\.gov\.ph\/house-members\/view\//);
  assert.match(seat.photoPath, /^legislative_profiles\/photos\/.+\.jpg$/);
  assert.ok(seat.memberCode.length > 0);
  assert.equal(seat.verified, true);
  assert.deepEqual(seat.leadershipRoles, []);
  assert.equal(seat.ambiguous, false);
  // A Tier B card yields one seat per district, in card order.
  const tierB = districtSeats(index.cards.find(c => c.tier === 'B'));
  assert.equal(tierB.length, index.cards.find(c => c.tier === 'B').districts.length);
});

test(skip, 'cards without a DEO ledger carry no attributed money', () => {
  const none = index.cards.filter(card => card.tier === 'none');
  assert.equal(none.length, index.counts.regional_group_only);
  assert.equal(none.length, 5);
  for (const card of none) {
    assert.equal(card.kind, 'regional_group_only');
    assert.equal(cardCarriesMoney(card), false);
    assert.equal(card.rows, 0);
    assert.equal(card.offices.length, 0);
    assert.equal(card.summary.sources.nep.amount_php, 0);
    assert.equal(card.summary.sources.house.amount_php, 0);
    assert.ok(card.tier_note.length > 20, 'a ₱0 card must say why');
    assert.match(card.tier_note, /regional group|not an office/i);
    for (const bucket of BUCKETS) {
      assert.equal(card.row_ids[bucket].length, 0, `${card.id}.${bucket} must be empty`);
    }
    assert.equal(card.summary.insertions.count, 0);
    assert.equal(card.summary.deletions.count, 0);
    assert.equal(card.summary.unchanged.count, 0);
    assert.equal(card.summary.scope_review.count, 0);
    assert.equal(card.summary.adjustments.count, 0);
  }
  assert.deepEqual(none.map(card => TIER_SHORT[card.tier]), Array(5).fill('No DEO ledger'));
  assert.equal(none.map(c => c.districts.length).reduce((a, b) => a + b), 5);
});

test(skip, 'card sorting is stable, reversible and defaults to House money', () => {
  const byHouse = sortedCards(index.cards);
  for (let i = 1; i < byHouse.length; i++) {
    assert.ok(cardHeadline(byHouse[i - 1]).house.amount_php >=
      cardHeadline(byHouse[i]).house.amount_php);
  }
  const asc = sortedCards(index.cards, {direction: 'asc'});
  assert.equal(asc[asc.length - 1].id, byHouse[0].id);
  const byDistrict = sortedCards(index.cards, {key: 'district', direction: 'asc'});
  const names = byDistrict.map(card => card.districts[0].displayName);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', {numeric: true})));
  const byInsertions = sortedCards(index.cards, {key: 'insertions'});
  assert.equal(byInsertions[0].summary.insertions.count,
    Math.max(...index.cards.map(card => card.summary.insertions.count)));
  assert.equal(sortedCards(index.cards).length, index.cards.length, 'sorting must not drop cards');
  // Sorting must not mutate the committed order.
  const before = index.cards.map(card => card.id);
  sortedCards(index.cards, {key: 'rows'});
  assert.deepEqual(index.cards.map(card => card.id), before);
});

test(skip, 'sort options parse from the URL and round-trip exactly', () => {
  // Default: largest HGAB3 first, and the default stays out of the URL.
  assert.deepEqual(parseCardSort(undefined, undefined), {key: 'house_php', direction: 'desc'});
  assert.equal(cardSortParams({key: 'house_php', direction: 'desc'}), null);
  // Every offered key parses and round-trips.
  for (const option of CARD_SORT_OPTIONS) {
    const parsed = option.kind === 'name'
      ? parseCardSort(option.key, 'desc')  // name sorts ignore direction
      : parseCardSort(option.key, 'asc');
    assert.equal(parsed.key, option.key, option.key);
    const params = cardSortParams(parsed);
    assert.ok(params, `${option.key} must round-trip`);
    const again = parseCardSort(params.sort, params.dir);
    assert.deepEqual(again, parsed, `${option.key} must survive a round-trip`);
  }
  // An unknown or garbage sort value falls back to the default instead of
  // being read as a column name.
  for (const bad of [undefined, '', 'bogus', 'DROP TABLE']) {
    assert.deepEqual(parseCardSort(bad), {key: 'house_php', direction: 'desc'});
  }
  // Direction is validated, not trusted.
  assert.equal(parseCardSort('rows', 'asc').direction, 'asc');
  assert.equal(parseCardSort('rows', 'desc').direction, 'desc');
  assert.equal(parseCardSort('rows', 'sideways').direction, 'desc');
});

test(skip, 'every record and amount sort key orders the grid in both directions', () => {
  // The regression this guards against: a sort option that silently degrades
  // to the HGAB3-descending default because the key never reached the model.
  for (const option of CARD_SORT_OPTIONS) {
    // Name sorts are ascending-only in the app (parseCardSort normalizes any
    // direction to 'asc'), so only 'asc' is meaningful for them.
    const directions = option.kind === 'name' ? ['asc'] : ['desc', 'asc'];
    for (const direction of directions) {
      const order = sortedCards(index.cards, {key: option.key, direction});
      assert.equal(order.length, index.cards.length, `${option.key} dropped cards`);
      if (option.kind === 'name') {
        const names = order.map(card => card.districts[0].displayName);
        assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', {numeric: true})));
        continue;
      }
      const measure = card => {
        const h = cardHeadline(card);
        return {house_php: h.house.amount_php, nep_php: h.nep.amount_php,
          insertions: h.insertions.count, deletions: h.deletions.count,
          adjustments: h.increased.count + h.reduced.count, rows: card.rows}[option.key];
      };
      for (let i = 1; i < order.length; i++) {
        const previous = measure(order[i - 1]), current = measure(order[i]);
        if (direction === 'desc') assert.ok(previous >= current,
          `${option.key} desc: ${order[i - 1].id}(${previous}) < ${order[i].id}(${current})`);
        else assert.ok(previous <= current,
          `${option.key} asc: ${order[i - 1].id}(${previous}) > ${order[i].id}(${current})`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Explorer: the index pins IDs, the table must render those same rows
// ---------------------------------------------------------------------------

test(skip, 'the explorer filters exactly the row set the index classified', () => {
  // congressRows() mirrors the builder: hydrateProjects() then regionCandidates().
  // Dropping either would let a card and its table disagree about a row.
  assert.equal(rows.length, index.reconciliation.row_counts.total);
  const ids = new Set(rows.map(row => row.id));
  const referenced = new Set();
  for (const card of index.cards) {
    for (const bucket of BUCKETS) {
      for (const id of card.row_ids[bucket]) referenced.add(id);
    }
  }
  for (const id of index.residual.row_ids) referenced.add(id);
  for (const id of index.office_change.rows.map(row => row.id)) referenced.add(id);
  for (const id of referenced) {
    assert.ok(ids.has(id), `index references a row the explorer cannot resolve: ${id}`);
  }
});

test(skip, 'row IDs resolve to real records and reproduce the card summary exactly', () => {
  for (const card of index.cards) {
    const cardRowsList = cardRowSets.get(card.id);
    assert.equal(cardRowsList.length, card.rows, card.id);
    assert.equal(new Set(cardRowsList.map(row => row.id)).size, cardRowsList.length);
    for (const bucket of BUCKETS) {
      assert.equal(bucketRows(card, rowsById, bucket).length, card.row_ids[bucket].length);
    }
    const sum = (list, side) => list.reduce((n, row) => n + (row[side]?.amount_php ?? 0), 0);
    const totals = bucketTotals(card);
    for (const bucket of BUCKETS) {
      const list = bucketRows(card, rowsById, bucket);
      assert.equal(sum(list, 'third'), totals.buckets[bucket].house_php,
        `${card.id}.${bucket} House side`);
      assert.equal(sum(list, 'nep'), totals.buckets[bucket].nep_php,
        `${card.id}.${bucket} NEP side`);
    }
    // Insertions are House-only and deletions NEP-only, in the rows themselves.
    for (const row of bucketRows(card, rowsById, 'insertions')) {
      assert.ok(row.third && !row.nep, `${card.id}: an insertion must be House-only`);
    }
    for (const row of bucketRows(card, rowsById, 'deletions')) {
      assert.ok(row.nep && !row.third, `${card.id}: a deletion must be NEP-only`);
    }
    for (const row of bucketRows(card, rowsById, 'unchanged')) {
      assert.equal(row.third.amount_php, row.nep.amount_php);
    }
  }
});

test(skip, 'a bucket row always carries the bucket the view claims it came from', () => {
  const card = index.cards.find(c => c.row_ids.increased.length && c.row_ids.insertions.length);
  for (const bucket of BUCKETS) {
    for (const row of bucketRows(card, rowsById, bucket)) {
      assert.equal(row.congress_bucket, bucket);
    }
  }
});

test(skip, 'no row is claimed by two buckets, two cards or a held-out panel', () => {
  const seen = new Map();
  const claim = (id, where) => {
    if (seen.has(id)) {
      assert.fail(`${id} claimed by both ${seen.get(id)} and ${where}`);
    }
    seen.set(id, where);
  };
  for (const card of index.cards) {
    for (const bucket of BUCKETS) {
      for (const id of card.row_ids[bucket]) claim(id, `${card.id}/${bucket}`);
    }
  }
  for (const id of index.residual.row_ids) claim(id, 'residual');
  for (const row of index.office_change.rows) claim(row.id, 'office_change');
  const counts = index.reconciliation.row_counts;
  assert.equal(seen.size, counts.cards + counts.residual + counts.office_change);
  assert.equal(seen.size, counts.total);
  assert.equal(counts.cards, index.reconciliation.row_counts.cards);
});

test(skip, 'recordView exposes the provenance a record drawer needs', () => {
  const card = index.cards.find(c => c.row_ids.insertions.length);
  const row = bucketRows(card, rowsById, 'insertions')[0];
  const view = recordView(row.third, 'house-third');
  assert.equal(view.kindLabel, 'HGAB3 · 3rd reading');
  assert.ok(view.title.length > 0);
  assert.ok(view.office.length > 0);
  assert.ok(view.id.length > 0);
  assert.ok(Array.isArray(view.pdf_pages));
  assert.equal(recordView(null, 'nep'), null, 'a missing side must not fabricate a record');
  assert.equal(recordView(null, 'api'), null);
  const nepView = recordView(row.nep, 'nep');
  assert.equal(nepView, null);
  // Both office vocabularies are carried so the drawer can show the join.
  const withBoth = index.cards.flatMap(c => cardRowSets.get(c.id))
    .find(r => r.third && r.nep);
  const pair = [recordView(withBoth.third, 'house-third'), recordView(withBoth.nep, 'nep')];
  for (const side of pair) {
    assert.ok(side.office_canonical.length > 0);
    assert.equal(typeof side.amount_php, 'number');
  }
});

test(skip, 'chainage is only reported when a side actually parses a span', () => {
  let withChainage = 0, withDelta = 0, checked = 0;
  for (const card of index.cards) {
    for (const row of cardRowSets.get(card.id)) {
      checked += 1;
      const view = chainageView(row.third, row.nep);
      assert.deepEqual(view, explorerRow(row).chainage,
        'the drawer must show what the model computed');
      if (!view) continue;
      withChainage += 1;
      assert.ok(view.house || view.nep);
      if (view.house && view.nep) {
        // A delta exists only when BOTH sides actually measured a length;
        // an absurd span is omitted on purpose rather than estimated.
        if (view.house.measured && view.nep.measured) {
          assert.ok(Number.isFinite(view.length_delta_m), 'both sides measured, no delta');
          assert.equal(view.length_delta_m, view.house.length_m - view.nep.length_m);
          withDelta += 1;
        } else {
          assert.equal(view.length_delta_m, null,
            'no delta while either side omits its length');
        }
      } else {
        assert.equal(view.length_delta_m, null, 'no delta without both sides');
      }
      for (const side of [view.house, view.nep]) {
        if (!side) continue;
        assert.ok(side.spans || side.measured, 'a side must print a span or a length');
        assert.ok(side.count > 0);
        assert.equal(side.measured, side.length_m != null);
        if (side.measured) assert.ok(side.length_m >= 0);
        assert.ok(Array.isArray(side.raw));
      }
    }
  }
  assert.equal(checked, index.reconciliation.row_counts.cards);
  assert.ok(withChainage > 500, `expected chainage on many rows, saw ${withChainage}`);
  assert.ok(withDelta > 50, `expected two-sided chainage on some rows, saw ${withDelta}`);
});

test(skip, 'chainage never asserts a length change the source did not print', () => {
  // An incomplete or review-flagged span must survive into the view so the
  // drawer can caveat it instead of showing a bare kilometre figure.
  let flagged = 0;
  for (const card of index.cards) {
    for (const row of cardRowSets.get(card.id)) {
      const view = chainageView(row.third, row.nep);
      if (!view) continue;
      for (const [side, source] of [[view.house, row.third], [view.nep, row.nep]]) {
        if (!side) continue;
        assert.equal(side.incomplete, source.chainage_incomplete ?? false);
        assert.deepEqual(side.length_review, source.chainage_length_review ?? null);
        if (side.incomplete || side.length_review) flagged += 1;
      }
    }
  }
  assert.ok(flagged > 0, `expected some caveated spans, saw ${flagged}`);
});

test(skip, 'pdf page references name the stage they came from', () => {
  const kinds = new Set();
  let count = 0, rowsWithPage = 0;
  for (const card of index.cards) {
    for (const row of cardRowSets.get(card.id)) {
      const refs = pdfView(row.third, row.nep, row.api);
      assert.deepEqual(refs, explorerRow(row).pdf);
      if (refs.length) rowsWithPage += 1;
      for (const ref of refs) {
        assert.ok(Number.isInteger(ref.page) && ref.page >= 1, 'no page zero or fractional page');
        assert.ok(ref.label.length);
        assert.ok(ref.id.length);
        kinds.add(ref.kind);
        count += 1;
      }
    }
  }
  assert.ok(count > 10000, `expected most rows to cite a page, saw ${count}`);
  assert.ok(rowsWithPage > 10000, `rows citing a page: ${rowsWithPage}`);
  // The Transparency API side is corroboration only and prints no page here.
  assert.deepEqual([...kinds].sort(), ['house-third', 'nep']);
});

test(skip, 'coordinates are never asserted — only what the row carries or the title prints', () => {
  let titled = 0, carried = 0, rowsChecked = 0;
  for (const card of index.cards) {
    for (const row of cardRowSets.get(card.id)) {
      rowsChecked += 1;
      const view = coordinateView(row);
      assert.deepEqual(view, explorerRow(row).coordinates);
      if (!view) continue;
      for (const entry of view) {
        assert.ok(entry.coordinates, 'a coordinate entry must have a value');
        const {lat, lng} = entry.coordinates;
        // A Philippine bounding box only; a mis-read pair is dropped, not shown.
        assert.ok(lat > 4 && lat < 22, `latitude outside the Philippines: ${lat}`);
        assert.ok(lng > 116 && lng < 127, `longitude outside the Philippines: ${lng}`);
        if (entry.from_title) {
          assert.equal(entry.side, 'title');
          // Titles print (longitude, latitude); the model must not swap them.
          const [, printedLng, printedLat] =
            /(\d{2,3}\.\d+)\s*,\s*(\d{1,2}\.\d+)/.exec(entry.printed);
          assert.equal(Number(printedLng), lng);
          assert.equal(Number(printedLat), lat);
          assert.ok(row.title.includes(entry.printed),
            'the printed pair must really appear in the title');
          titled += 1;
        } else {
          carried += 1;
        }
      }
    }
  }
  assert.equal(rowsChecked, index.reconciliation.row_counts.cards);
  // Only a minority of DPWH ledger titles print a decimal coordinate pair; the
  // point is that every one that does is surfaced, in the right order.
  assert.ok(titled > 100, `title coordinates should surface on some rows, saw ${titled}`);
  // DPWH ledgers carry no coordinate column, so nothing may be invented.
  assert.equal(carried, 0, 'a record-borne coordinate appeared where none exists');
});

test(skip, 'explorer rows carry flags, both stages and their diff tags', () => {
  const card = index.cards.find(c => c.summary.adjustments.reduced_count && c.summary.deletions.count);
  const explorerRows = cardRowSets.get(card.id).map(row => explorerRow(row, {counterparts}));
  assert.ok(explorerRows.length > 1);
  for (const row of explorerRows) {
    assert.ok(row.title.length > 0);
    assert.ok(row.statusLabel.length);
    assert.ok(Array.isArray(row.flagLabels));
    assert.ok(Array.isArray(row.diffTagLabels));
    assert.ok(BUCKETS.includes(row.bucket));
    if (row.house) assert.ok(row.house.amount_php >= 0);
    if (row.house && row.nep) {
      assert.equal(row.delta_php, row.house.amount_php - row.nep.amount_php);
    } else {
      assert.equal(row.delta_php, null);
    }
    // A one-sided bucket may not show the missing side's money.
    if (row.bucket === 'insertions') assert.equal(row.nep, null);
    if (row.bucket === 'deletions') assert.equal(row.house, null);
  }
  assert.ok(explorerRows.some(row => row.bucket === 'reduced'));
  assert.ok(explorerRows.some(row => row.bucket === 'deletions'));
});

test(skip, 'scope review is taken from the index bucket, not re-derived in the view', () => {
  const scopeIds = new Set(index.cards.flatMap(c => c.row_ids.scope_review));
  let seen = 0;
  for (const card of index.cards) {
    for (const row of cardRowSets.get(card.id)) {
      const view = explorerRow(row);
      assert.equal(view.scope_review, scopeIds.has(row.id),
        `${row.id}: scope-review membership must match the committed bucket`);
      if (view.scope_review) {
        seen += 1;
        assert.ok(view.flags.includes('segment_scope'), 'the flag must still be visible');
      }
    }
  }
  assert.equal(seen, scopeIds.size);
  assert.ok(seen > 0);
});

test(skip, 'explorer columns match the card figures a user can cross-check', () => {
  const keys = EXPLORER_COLUMNS.map(column => column.key);
  assert.deepEqual(keys.slice(0, 4), ['title', 'bucket', 'statusLabel', 'flagLabels']);
  for (const key of ['house_php', 'nep_php', 'delta_php', 'house_office', 'nep_office']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
  for (const key of ['chainage', 'pdf']) assert.ok(keys.includes(key));
  // Every column must read a field explorerRow actually produces.
  const sample = explorerRow(cardRowSets.get(index.cards.find(c => c.rows > 10).id)[0]);
  for (const column of EXPLORER_COLUMNS) {
    assert.ok(column.label.length, column.key);
    const value = column.value ? column.value(sample) : sample[column.key];
    assert.notEqual(value, undefined, `column ${column.key} reads a missing field`);
  }
});

test(skip, 'the flag census counts what the explorer can filter on', () => {
  const card = index.cards.find(c => c.row_ids.scope_review.length);
  const explorerRows = cardRowSets.get(card.id).map(row => explorerRow(row, {counterparts}));
  const census = flagCensus(explorerRows);
  assert.ok(census.some(entry => entry.flag === 'segment_scope'));
  for (const entry of census) {
    assert.ok(entry.count > 0);
    assert.ok(entry.label.length);
    assert.equal(entry.count,
      explorerRows.filter(row => row.flags.includes(entry.flag)).length);
  }
  assert.deepEqual(census.map(e => e.count), [...census.map(e => e.count)].sort((a, b) => b - a));
  // No invented flags: every census entry is a flag the shared filter knows.
  const known = new Set(FLAG_OPTIONS.map(([key]) => key));
  for (const entry of census) {
    assert.ok(known.has(entry.flag), `unknown flag ${entry.flag}`);
  }
});

test(skip, 'the bucket census restates the card summary from rows, not from the index', () => {
  const card = index.cards.find(c => c.rows > 50 && c.summary.insertions.count);
  const explorerRows = cardRowSets.get(card.id).map(row => explorerRow(row));
  const census = bucketCensus(explorerRows);
  const totals = bucketTotals(card);
  assert.ok(census.length > 1);
  for (const entry of census) {
    assert.equal(entry.count, card.row_ids[entry.bucket].length);
    assert.equal(entry.count, explorerRows.filter(row => row.bucket === entry.bucket).length);
    assert.ok(entry.basis.length > 20, 'every bucket must explain itself');
    assert.ok(['house', 'nep'].includes(entry.side));
    assert.equal(entry.house_php, totals.buckets[entry.bucket].house_php);
    assert.equal(entry.nep_php, totals.buckets[entry.bucket].nep_php);
  }
  assert.equal(census.reduce((n, entry) => n + entry.count, 0), card.rows);
});

test(skip, 'explorer filters narrow rows and never silently widen them', () => {
  const card = index.cards.find(c => c.summary.insertions.count && c.summary.deletions.count);
  const explorerRows = cardRowSets.get(card.id).map(row => explorerRow(row));
  assert.equal(filterExplorerRows(explorerRows).length, explorerRows.length);
  const insertions = filterExplorerRows(explorerRows, {bucket: 'insertions'});
  assert.equal(insertions.length, card.row_ids.insertions.length);
  assert.ok(insertions.every(row => row.bucket === 'insertions'));
  const query = filterExplorerRows(explorerRows, {query: 'road'});
  assert.ok(query.length <= explorerRows.length);
  assert.ok(query.length > 0, 'a common term should match something');
  // The filter searches title, region, program, PAP, id and both offices, so a
  // match need not be in the title — but it must be in one of those fields.
  for (const row of query) {
    const haystack = [row.title, row.region, row.program, row.pap, row.id,
      row.house_office, row.nep_office].filter(Boolean)
      .map(value => String(value).toLowerCase());
    assert.ok(haystack.some(value => value.includes('road')),
      `${row.id} matched "road" in no searchable field`);
  }
  const titleOnly = filterExplorerRows(explorerRows, {query: 'zzzzqqq'});
  assert.equal(titleOnly.length, 0, 'an absent term must return nothing');
  for (const entry of flagCensus(explorerRows).slice(0, 2)) {
    assert.equal(filterExplorerRows(explorerRows, {flag: entry.flag}).length, entry.count);
  }
  // Filters compose: bucket ∩ flag ⊆ bucket.
  const bucket = filterExplorerRows(explorerRows, {bucket: 'deletions'});
  const both = filterExplorerRows(explorerRows, {bucket: 'deletions', flag: 'nep_only'});
  assert.ok(both.length <= bucket.length);
  assert.ok(both.every(row => row.bucket === 'deletions' && row.flags.includes('nep_only')));
  assert.equal(filterExplorerRows([], {query: 'road'}).length, 0);
});

// ---------------------------------------------------------------------------
// Held-out panels
// ---------------------------------------------------------------------------

test(skip, 'the residual and office-change panels stay phrased as held-out, not claimed', () => {
  const residual = residualPanel(index);
  assert.equal(residual.rows, index.residual.row_ids.length);
  assert.equal(residual.rows, index.reconciliation.row_counts.residual);
  assert.equal(residual.nep.amount_php, 447_727_490_000);
  assert.equal(residual.house.amount_php, 408_582_191_000);
  assert.match(residual.shareText, /78\.1% of the NEP side and 69\.6% of the HGAB3 side/);
  assert.match(residual.note, /no district/i);
  assert.match(residual.note, /never folded into a card/i);
  // The residual must not be offered as a district or a representative.
  assert.equal(residual.kind, 'residual');
  assert.equal(residual.id, 'residual');

  const change = officeChangePanel(index);
  assert.equal(change.rows, index.reconciliation.row_counts.office_change);
  assert.equal(change.rows, 67);
  assert.equal(change.crossDistrict, 10);
  assert.equal(change.oneSideUnattributable, 57);
  assert.equal(change.crossDistrict + change.oneSideUnattributable, change.rows);
  assert.equal(change.nep.count, 67);
  assert.equal(change.house.count, 67);
  assert.match(change.note, /no card books money the other stage did not attribute/i);
  for (const record of change.records) {
    assert.ok(record.id.length && record.title.length);
    assert.equal(record.third_office.length + record.nep_office.length > 0, true);
    assert.equal(typeof record.cross_district, 'boolean');
  }
  assert.equal(change.rowIds.length, change.rows);
  // Every held-out row resolves in the shared payload too.
  for (const id of change.rowIds) assert.ok(rowsById.has(id), id);
});

test(skip, 'datasets explain why only DPWH is attributable', () => {
  const options = datasetOptions(index);
  assert.deepEqual(options.map(o => o.key), ['dpwh', 'hfep', 'fmr', 'nia']);
  assert.equal(options[0].status, 'active');
  assert.equal(options[0].attributable, true);
  assert.ok(options[0].basis.length > 20);
  for (const gated of options.slice(1)) {
    assert.equal(gated.status, 'not_attributable');
    assert.equal(gated.attributable, false);
    assert.equal(gated.basis, null);
    assert.ok(gated.reason.length > 20, `${gated.key} must say why it is gated`);
    assert.doesNotMatch(gated.reason, /approximately|estimated|assumed/i,
      `${gated.key} must not hint at a guessable attribution`);
  }
  assert.ok(DATASETS.every(d => d.label.length));
  assert.equal(DATASETS.filter(d => d.status === 'active').length, 1);
});

test(skip, 'the lens panel carries the limits and provenance a reader needs', () => {
  const lens = lensPanel(index);
  assert.match(lens.authority, /DEO2LEG\/README\.md/);
  assert.match(lens.authority, /authorized project-level use/);
  assert.match(lens.grain, /printed DPWH allocation record/i);
  assert.match(lens.stages, /HGAB3 · 3rd reading/);
  assert.deepEqual(Object.keys(lens.tiers), ['A', 'B']);
  assert.match(lens.tiers.B, /never split/);
  assert.match(lens.not_claimed, /Nothing here establishes that a representative requested/);
  assert.equal(lens.regional_groups_excluded[0].type, 'regional_group');
  assert.equal(lens.regional_groups_excluded[0].name, 'BARMM');
  assert.equal(lens.provenance.crosswalk.path, 'DEO2LEG/outputs/deo_leg_crosswalk.json');
  assert.equal(lens.provenance.detail.path, 'analysis/data/comparison_projects_2027.json');
  for (const entry of Object.values(lens.provenance)) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, 'every input must be pinned by hash');
  }
  assert.equal(lens.reconciliation.row_counts.total, 17613);
  assert.equal(lens.counts.cards, index.cards.length);
  assert.equal(lens.counts.districts, Object.keys(index.districts).length);
});

test(skip, 'the workspace never shows a number the published Overview does not', () => {
  const published = dpwhSummary(overview, detail);
  const sums = {house_c: 0, house_a: 0, nep_c: 0, nep_a: 0, ins_c: 0, ins_a: 0, del_c: 0, del_a: 0};
  const parts = [...index.cards.map(card => card.summary),
    index.residual.summary, index.office_change.summary];
  for (const summary of parts) {
    sums.house_c += summary.sources.house.count;
    sums.house_a += summary.sources.house.amount_php;
    sums.nep_c += summary.sources.nep.count;
    sums.nep_a += summary.sources.nep.amount_php;
    sums.ins_c += summary.insertions.count;
    sums.ins_a += summary.insertions.amount_php;
    sums.del_c += summary.deletions.count;
    sums.del_a += summary.deletions.amount_php;
  }
  assert.equal(sums.house_c, published.sources.house.count);
  assert.equal(sums.house_a, published.sources.house.amount_php);
  assert.equal(sums.nep_c, published.sources.nep.count);
  assert.equal(sums.nep_a, published.sources.nep.amount_php);
  assert.equal(sums.ins_c, published.insertions.count);
  assert.equal(sums.ins_a, published.insertions.amount_php);
  assert.equal(sums.del_c, published.deletions.count);
  assert.equal(sums.del_a, published.deletions.amount_php);
  // And the index's own reconciliation block already recorded the same tie-out.
  assert.equal(index.reconciliation.whole.sources.house.amount_php, published.sources.house.amount_php);
  assert.equal(index.reconciliation.row_counts.cards, index.reconciliation.row_counts.total -
    index.reconciliation.row_counts.residual - index.reconciliation.row_counts.office_change);
});

test(skip, 'every district is covered, and multi-office districts keep their rows disjoint', () => {
  const byDistrict = new Map();
  for (const card of index.cards) {
    for (const district of card.districts) {
      if (!byDistrict.has(district.id)) byDistrict.set(district.id, []);
      byDistrict.get(district.id).push(card);
    }
  }
  // All 254 districts are covered, none dropped.
  assert.equal(byDistrict.size, index.counts.districts);
  for (const [districtId, entry] of Object.entries(index.districts)) {
    const cards = byDistrict.get(districtId);
    assert.ok(cards?.length, `${districtId} is on no card`);
    // The published cardIds must match exactly which cards carry the district.
    assert.deepEqual([...entry.cardIds].sort(), cards.map(c => c.id).sort(),
      `${districtId} cardIds disagree with the cards that list it`);
    assert.equal(entry.tier, cards[0].tier);
    // coServedDistricts is the union across every card the district sits on, so
    // a Manila-6th reader sees all co-served districts even though each card
    // face only names the ones on that card.
    const union = new Set();
    for (const card of cards) {
      for (const district of card.districts) {
        if (district.id !== districtId) union.add(district.id);
      }
    }
    assert.deepEqual([...entry.coServedDistricts].sort(), [...union].sort(),
      `${districtId} co-served list disagrees with the cards that carry it`);
  }

  // A district served by two DEOs (e.g. Manila 6th → North + South Manila DEO)
  // appears on two cards. Those cards must never double-count a row, or the
  // same money would show on two representatives.
  const multi = [...byDistrict.entries()].filter(([, cards]) => cards.length > 1);
  assert.ok(multi.length >= 1, 'expected at least one multi-office district');
  for (const [districtId, cards] of multi) {
    assert.equal(cards.length, 2, `${districtId} on ${cards.length} cards`);
    const [a, b] = cards.map(card => new Set(Object.values(card.row_ids).flat()));
    const overlap = [...a].filter(id => b.has(id));
    assert.equal(overlap.length, 0,
      `${districtId}: two cards share ${overlap.length} rows — money double-counted`);
  }
});
