import test from "node:test";
import assert from "node:assert/strict";
import {
  STATE_LABELS,
  STATE_ORDER,
  barScale,
  bucketFor,
  censusRows,
  censusSegments,
  decodeStateOverlay,
  filterFindings,
  findingHeadlines,
  findingTags,
  findingsOfType,
  regionOptions,
  shellLedger,
  shellRows,
  spectrumRows,
  stateClass,
  stateLabel,
  tabCounts,
  tabParams,
  unsuppliedRows,
} from "./groupRelations.js";

// Synthetic sidecars shaped exactly like the builder output: compact overlay
// rows, roster entries with member ids, edges stamped with their shell.
const overlay = {
  states: [
    "committed_attached",
    "review_attached",
    "open_candidate",
    "duplicate_key",
    "twin_cross_referenced",
    "unmatched_insertion",
    "unmatched_deletion",
  ],
  sides: ["house", "nep"],
  rows: {
    "h1": [0, 0],
    "h2": [4, 0],
    "h3": [5, 0],
    "n1": [0, 1],
    "n2": [2, 1],
    "n3": [6, 1],
  },
  detail: { h2: { shell: "s#aaaa", matcher_status: "fuzzy_candidate" } },
};

const roster = {
  "s#aaaa": {
    shell: "s#aaaa",
    house_ids: ["h1", "h2", "h3"],
    nep_ids: ["n1", "n2", "n3"],
  },
};

const nodes = {
  h1: { id: "h1", side: "house", amount_php: 100 },
  h2: { id: "h2", side: "house", amount_php: 50 },
  h3: { id: "h3", side: "house", amount_php: 70 },
  n1: { id: "n1", side: "nep", amount_php: 100 },
  n2: { id: "n2", side: "nep", amount_php: 50 },
  n3: { id: "n3", side: "nep", amount_php: 20 },
};

const edges = [
  { house: "h1", nep: "n1", kind: "exact", shell: "s#aaaa" },
  { house: "h2", nep: "n2", kind: "fuzzy", shell: "s#aaaa" },
];

const indexPayload = {
  overlap_spectrum: [
    { bucket: "zero — disjoint segments", pairs: 2, lo: null, hi: null, include_hi: false },
    { bucket: "over 0% up to 5%", pairs: 1, lo: 0.0, hi: 0.05, include_hi: true },
    { bucket: "over 75% below 100%", pairs: 1, lo: 0.75, hi: 1.0, include_hi: false },
    { bucket: "100% — identical span", pairs: 1, lo: 1.0, hi: null, include_hi: false },
  ],
};

const findingsPayload = {
  types: ["competing_candidates", "committed_with_rivals", "cross_pap_twin"],
  counts: { competing_candidates: 2, committed_with_rivals: 1, cross_pap_twin: 1 },
  amount_at_stake_by_type: {
    competing_candidates: 300,
    committed_with_rivals: 1000,
    cross_pap_twin: 500,
  },
  type_definitions: { competing_candidates: "rivals" },
  findings: [
    { type: "committed_with_rivals", amount_at_stake_php: 1000, region: "NCR" },
    { type: "competing_candidates", amount_at_stake_php: 200, region: "NCR" },
    { type: "competing_candidates", amount_at_stake_php: 100, region: "Region VI" },
    { type: "cross_pap_twin", amount_at_stake_php: 500, region: null },
  ],
};

test("decodeStateOverlay decodes every row and merges detail", () => {
  const map = decodeStateOverlay(overlay);
  assert.equal(map.size, 6);
  assert.deepEqual(map.get("h1"), { state: "committed_attached", side: "house" });
  assert.equal(map.get("h2").matcher_status, "fuzzy_candidate");
  assert.equal(map.get("n3").state, "unmatched_deletion");
  assert.equal(map.get("n3").side, "nep");
});

test("decodeStateOverlay handles missing payloads", () => {
  assert.equal(decodeStateOverlay(null).size, 0);
});

test("shellRows lists both sides, ranks states, attaches per-shell edges", () => {
  const rows = shellRows(roster["s#aaaa"], nodes, decodeStateOverlay(overlay), edges);
  assert.equal(rows.length, 6);
  const h1 = rows.find((r) => r.id === "h1");
  assert.equal(h1.state, "committed_attached");
  assert.equal(h1.edges.length, 1);
  // house rows sort before nep rows
  assert.equal(rows[0].side, "house");
  assert.equal(rows[rows.length - 1].side, "nep");
  // edges from other shells never leak in
  const withOther = shellRows(
    roster["s#aaaa"], nodes, decodeStateOverlay(overlay),
    [...edges, { house: "h1", nep: "n1", kind: "exact", shell: "other#bbbb" }],
  );
  assert.equal(withOther.find((r) => r.id === "h1").edges.length, 1);
});

test("unsuppliedRows are exactly the never-consumed rows", () => {
  const rows = shellRows(roster["s#aaaa"], nodes, decodeStateOverlay(overlay), edges);
  const ids = unsuppliedRows(rows).map((r) => r.id).sort();
  // h2 (open_candidate), h3 (unmatched_insertion), n2 (open_candidate), n3 (unmatched_deletion)
  assert.deepEqual(ids, ["h2", "h3", "n2", "n3"]);
});

test("bucketFor replays the declared half-open bounds", () => {
  assert.equal(bucketFor(indexPayload, 0), "zero — disjoint segments");
  assert.equal(bucketFor(indexPayload, 0.05), "over 0% up to 5%");
  assert.equal(bucketFor(indexPayload, 0.04999), "over 0% up to 5%");
  assert.equal(bucketFor(indexPayload, 0.9), "over 75% below 100%");
  assert.equal(bucketFor(indexPayload, 0.75), null); // gap between declared buckets
  assert.equal(bucketFor(indexPayload, 1.0), "100% — identical span");
  assert.equal(bucketFor(indexPayload, 2.0), "100% — identical span");
});

test("spectrumRows pass bounds through for rendering", () => {
  const rows = spectrumRows(indexPayload);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].sampleCount, 0);
  assert.equal(rows[1].hi, 0.05);
});

test("findingHeadlines keep payload type order and totals", () => {
  const headlines = findingHeadlines(findingsPayload);
  assert.deepEqual(
    headlines.map((h) => h.type),
    findingsPayload.types,
  );
  assert.equal(headlines[1].amount, 1000);
  assert.equal(headlines[0].count, 2);
});

test("findingsOfType filters without re-sorting", () => {
  const competing = findingsOfType(findingsPayload, "competing_candidates");
  assert.equal(competing.length, 2);
  assert.equal(competing[0].amount_at_stake_php, 200);
});

test("filterFindings honors type and region, keeps unregioned on region filter", () => {
  const all = filterFindings(findingsPayload.findings, {});
  assert.equal(all.length, 4);
  const ncr = filterFindings(findingsPayload.findings, { region: "NCR" });
  // cross_pap_twin has region null — a "wherever it is" finding — so it stays.
  assert.equal(ncr.length, 3);
  const rivals = filterFindings(findingsPayload.findings, {
    type: "committed_with_rivals",
  });
  assert.equal(rivals.length, 1);
  const none = filterFindings(findingsPayload.findings, {
    type: "committed_with_rivals",
    region: "Region VI",
  });
  assert.equal(none.length, 0);
});

test("regionOptions rank by finding count and exclude empty regions", () => {
  const options = regionOptions(findingsPayload.findings);
  assert.equal(options[0].region, "NCR");
  assert.equal(options[0].count, 2);
  assert.equal(options.find((o) => o.region === "Region VI").count, 1);
  // A region with no findings is never offered: selecting it would render an
  // empty table, which is a dead-end option rather than an honest "none".
  assert.deepEqual(regionOptions([]), []);
  // Unregioned findings (region null) contribute no option.
  assert.deepEqual(
    regionOptions([{ region: null }]).map((o) => o.region),
    [],
  );
});

test("censusRows are in display order with all count fields", () => {
  const rows = censusRows({
    state_census: {
      committed_attached: { rows: 10, house_rows: 5, nep_rows: 5 },
      unmatched_deletion: { rows: 2, house_rows: 0, nep_rows: 2 },
    },
  });
  assert.equal(rows.length, STATE_ORDER.length);
  assert.equal(rows[0].state, "committed_attached");
  assert.equal(rows[0].rows, 10);
  assert.equal(rows[0].house_rows, 5);
  // absent census entries render as undefined cells, not crashes
  assert.equal(rows[3].rows, undefined);
});

test("stateLabel covers every census state plus the overlay-less member state", () => {
  for (const state of STATE_ORDER) {
    assert.equal(stateLabel(state), STATE_LABELS[state]);
  }
  // shellRows assigns "unseen" to a roster member the overlay never covered.
  assert.equal(stateLabel("unseen"), "Not in overlay");
  assert.equal(stateLabel(null), "unknown");
  // An unrecognised state is echoed rather than rendered as blank, so a new
  // builder state degrades visibly instead of disappearing from the UI.
  assert.equal(stateLabel("some_new_state"), "some_new_state");
});

test("stateClass emits a pill class and falls back for unknown states", () => {
  assert.equal(stateClass("committed_attached"), "rv-state rv-state--committed_attached");
  assert.equal(stateClass("unseen"), "rv-state rv-state--unseen");
  // Unknown states must not invent a CSS class that has no rule behind it.
  assert.equal(stateClass("some_new_state"), "rv-state rv-state--unseen");
});

test("censusSegments widths total exactly 100 and flag floored states", () => {
  const rows = [
    { state: "committed_attached", label: "Committed", rows: 20084 },
    { state: "review_attached", label: "Review-only", rows: 74 },
    { state: "duplicate_key", label: "Duplicate key", rows: 5 },
    { state: "unmatched_insertion", label: "Unmatched", rows: 5794 },
  ];
  const segs = censusSegments(rows);
  const total = segs.reduce((sum, s) => sum + s.widthPct, 0);
  assert.ok(Math.abs(total - 100) < 1e-9, `widths sum to ${total}, expected 100`);
  // share is the honest ratio; widthPct is the drawn one. A floored state is
  // drawn wider than its true share so it stays visible.
  const reviewed = segs.find((s) => s.state === "review_attached");
  assert.equal(reviewed.floored, true);
  assert.ok(reviewed.widthPct > reviewed.share * 100, "floored state drawn wider");
  assert.equal(segs.find((s) => s.state === "committed_attached").floored, false);
  // shares still total 1 and stay exact even though widths were distorted
  const shareTotal = segs.reduce((sum, s) => sum + s.share, 0);
  assert.ok(Math.abs(shareTotal - 1) < 1e-9);
});

test("censusSegments drops zero-row states and survives an empty census", () => {
  const segs = censusSegments([
    { state: "a", rows: 10 },
    { state: "b", rows: 0 },
    { state: "c", rows: undefined },
  ]);
  assert.deepEqual(segs.map((s) => s.state), ["a"]);
  assert.equal(segs[0].widthPct, 100);
  // An empty or all-zero census yields no segments, so the bar renders as an
  // empty track rather than a row of NaN widths.
  assert.deepEqual(censusSegments([]), []);
  assert.deepEqual(censusSegments([{ state: "a", rows: 0 }]), []);
  assert.deepEqual(censusSegments(null), []);
  assert.deepEqual(censusSegments([{ state: "a", rows: undefined }]), []);
});

test("censusSegments floor can never exceed the available width", () => {
  // Seven states at a 1.2% floor is 8.4%, fine; but a floor of 20% over seven
  // states would be 140%. The helper clamps rather than overflowing the bar.
  const rows = Array.from({ length: 7 }, (_, i) => ({ state: `s${i}`, rows: 1 }));
  const clamped = censusSegments(rows, 20);
  const total = clamped.reduce((sum, s) => sum + s.widthPct, 0);
  assert.ok(Math.abs(total - 100) < 1e-9, `clamped widths sum to ${total}`);
  assert.ok(clamped.every((s) => s.widthPct <= 20 + 1e-9));
});

test("shellLedger splits a shell by side and totals match the roster", () => {
  const rows = shellRows(roster["s#aaaa"], nodes, decodeStateOverlay(overlay), edges);
  const led = shellLedger(rows);
  assert.equal(led.house.count, 3);
  assert.equal(led.nep.count, 3);
  assert.equal(led.house.total, 100 + 50 + 70);
  assert.equal(led.nep.total, 100 + 50 + 20);
  // Unsupplied counts agree with unsuppliedRows applied per side.
  assert.equal(led.house.unsupplied, unsuppliedRows(led.house.rows).length);
  assert.equal(led.house.missingBodies, 0);
});

test("shellLedger reports rows whose body is missing instead of hiding them", () => {
  // A roster can list a member the nodes map never carried. Membership still
  // counts, money cannot, and that must be reported rather than silently
  // understating the side total.
  const rows = shellRows(roster["s#aaaa"], { h1: nodes.h1 }, decodeStateOverlay(overlay), edges);
  const led = shellLedger(rows);
  assert.equal(led.house.count, 3, "membership comes from the roster");
  assert.equal(led.house.missingBodies, 2);
  assert.equal(led.house.total, 100, "only the present body contributes money");
  assert.equal(led.nep.missingBodies, 3);
});

test("shellLedger tolerates an empty shell", () => {
  const led = shellLedger([]);
  assert.deepEqual([led.house.count, led.nep.count], [0, 0]);
  assert.deepEqual([led.house.total, led.nep.total], [0, 0]);
});

test("tabCounts read the index summary and sum finding counts", () => {
  const counts = tabCounts({
    rows_stated: 27690,
    competing_shells: 112,
    twin_pairs: 7,
    measured_pairs: 252,
    finding_counts: { competing_candidates: 93, unsupplied_shell: 795 },
  });
  assert.deepEqual(counts, {
    states: 27690,
    findings: 888,
    ambiguity: 112,
    twins: 7,
    overlaps: 252,
  });
});

test("tabCounts omit a badge rather than showing zero", () => {
  // A zero or missing count means the sub-view has nothing to show; rendering
  // "0" would invite a click into an empty table.
  const counts = tabCounts({
    rows_stated: 10,
    twin_pairs: 0,
    finding_counts: {},
  });
  assert.equal(counts.states, 10);
  assert.equal(counts.twins, null);
  assert.equal(counts.findings, null);
  assert.equal(counts.ambiguity, null);
  assert.deepEqual(tabCounts({}), {
    states: null, findings: null, ambiguity: null, twins: null, overlaps: null,
  });
  assert.deepEqual(tabCounts(null).states, null);
});

test("findingTags produce at least one chip for every real finding type", () => {
  const rivals = findingTags({
    type: "competing_candidates",
    rival_nodes: ["a", "b"],
    rival_degrees: { a: 3 },
    edge_kinds: { exact: 1, fuzzy: 2 },
    house_rows: 7,
    nep_rows: 2,
  });
  assert.deepEqual(rivals.map((t) => t.key), ["rivals", "rows", "kinds", "degree"]);
  assert.equal(rivals.find((t) => t.key === "rivals").label, "2 rivals");
  assert.equal(rivals.find((t) => t.key === "rivals").tone, "warn");

  const withheld = findingTags({
    type: "zero_overlap_attached",
    house: "h", nep: "n", overlap_ratio: 0, delta_php: 92e6, delta_booked: false,
  });
  assert.deepEqual(withheld.map((t) => t.key), ["pair", "overlap", "withheld"]);
  assert.equal(withheld.find((t) => t.key === "overlap").label, "0.0% overlap");
  assert.equal(withheld.find((t) => t.key === "overlap").tone, "withheld");

  // shell_amount_gap carries side totals, not a pair: the tag states the
  // direction and leaves money formatting to the view.
  const gap = findingTags({ house_amount_php: 719916000, nep_amount_php: 200000000 });
  assert.deepEqual(gap.map((t) => t.key), ["gap"]);
  assert.equal(gap[0].label, "HGAB above NEP");
  assert.equal(gap[0].tone, "warn");
  assert.equal(findingTags({ house_amount_php: 5, nep_amount_php: 50 })[0].label, "NEP above HGAB");
  assert.equal(findingTags({ house_amount_php: 5, nep_amount_php: 5 })[0].tone, "");

  const unsupplied = findingTags({ unsupplied_ids: ["x"], unsupplied_side: "nep" });
  assert.equal(unsupplied[0].label, "1 unsupplied · NEP");
  assert.equal(unsupplied[0].tone, "warn");

  assert.deepEqual(findingTags({ type: "bare" }), []);
  assert.deepEqual(findingTags(null), []);
});

test("barScale shares one maximum and accepts a natural ceiling", () => {
  const scaled = barScale([0, 50, 100]);
  assert.deepEqual([...scaled.values()], [0, 50, 100]);
  // Overlap ratios are bounded by 1, so the caller passes the ceiling; scaling
  // against the largest value in view would exaggerate an all-small set.
  const ratios = barScale([0, 0, 0.5], 1);
  assert.deepEqual([...ratios.values()], [0, 0, 50]);
  assert.equal(barScale([0, 0], 1).size, 2, "a known ceiling still scales zeros");
  assert.equal(barScale([0, 0]).size, 0, "no ceiling and all-zero draws nothing");
  assert.equal(barScale([]).size, 0);
  assert.equal(barScale(null).size, 0);
  // A value above the ceiling clamps rather than overflowing its track.
  assert.deepEqual([...barScale([2], 1).values()], [100]);
  assert.deepEqual([...barScale([NaN, 4]).values()], [0, 100]);
});

test("tabParams drops the default tab and any open shell drilldown", () => {
  const base = new URLSearchParams("view=relations");
  // `states` is the default, so no ?tab=states in the shared link.
  assert.deepEqual(tabParams(base, "states"), { view: "relations", tab: null });
  assert.deepEqual(tabParams(base, "twins"), { view: "relations", tab: "twins" });

  // An open shell belongs to the tab it was opened from; a switch must not
  // carry it across and re-open the same modal on the new tab.
  const open = new URLSearchParams("view=relations&tab=twins&rshell=road%3A9");
  assert.deepEqual(tabParams(open, "findings"), { view: "relations", tab: "findings" });
  assert.deepEqual(tabParams(open, "twins"), { view: "relations", tab: "twins" });

  // Unrelated params (source selector, benchmark) survive the switch.
  const carried = tabParams(new URLSearchParams("view=relations&source=third"), "ambiguity");
  assert.equal(carried.source, "third");

  assert.deepEqual(tabParams(undefined, "states"), { tab: null });
});
