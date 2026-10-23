# Remediation: Honest Ambiguity Marking Over Forced Resolution

**Date:** 2026-10-22  
**Status:** Implemented across matcher, readings, stage trace, web layer, and tests

## Philosophy

We do **not** auto-resolve ambiguous project pairs into identity matches. Instead, we **annotate** them in place with explicit flags, reasons, and provenance so that downstream consumers can see exactly what tentatively happened and what still needs human review. When a tentative match is attempted, it carries metadata proving why confidence is partial and what would be needed to certify it.

This prevents phantom adjustments — the primary cause of our ₱56B+ discrepancy vs. Senate data.

---

## Changes

### 1. Segment-Scope Gate (Fix A)

**Problem:** Zero-overlap station-span pairs (two segments of the same road with disjoint chainage ranges) were matched as `chainage_candidate` and their amount deltas were booked as same-project increases/decreases. This manufactured **67 pairs totaling ₱237M gross phantom adjustments**.

**Fix:** Pairs whose measured station spans share **no overlap** (`segment_overlap_ratio == 0.0`) attach as `segment_scope_candidate` instead. Their delta is **never booked** as an adjustment; they appear in a dedicated `scope_review` bucket in the funding bridge.

**Metadata carried:**
```json
{
  "status": "segment_scope_candidate",
  "confidence": 1.0,
  "house": { ... },
  "nep": { ... },
  "delta_php": 37330000,
  "segment_overlap_ratio": 0.0,
  "reason": "Same road title_base but station spans share no segment. Different segment of the same road — attached for scope review only; the amount delta is NOT booked as a same-project adjustment. Possible split, re-segmentation or separate work on the same road."
}
```

**Downstream effects:**
- Web `matchesDifferenceScope()` excludes `segment_scope_candidate` / `segment_scope_review` from adjusted rows
- Funding bridge partitions: `insertions - deletions + adjustments.net + scope_review.net = total_delta`
- `overviewSummary.js`: scope_review cells excluded from `increased` / `reduced` buckets; unchanged too (equal-amount segment pairs must stay visible, not hide as "unchanged")
- `revisionMatrix.js`: scope_review appears as its own revision cell so both NEP and House ledgers rebuild exactly
- `revisionFlow.js`: surplus enters via external stub (like insertions), deficit exits to loss sink — node reconciles without booking the delta
- `analyticsStatusInfo.js`: new statuses `segment_scope_review`, `transparency_gap_then_segment_scope_review`, `outside_api_then_segment_scope_review`

**Test:** `test_current_pages.py::test_zero_overlap_segments_attach_as_scope_review_not_adjustment`, `test_partial_overlap_segments_stay_chainage_candidates`

---

### 2. Twin Cross-Marking (Fix B)

**Problem:** Identical-title + equal-amount rows under different program/PAP sections (cross-PAP transfers, e.g., Quipot Bridge under `p312:r6` vs `p312:r0`) were auto-paired, eliminating the insertion/deletion counts on both sides even though amounts could differ due to amendments.

**Fix:** Remove the auto-pairing transfer tier entirely. Instead, when rows left **unmatched** on both sides share identical normalized title + region + zone + equal amount under different PAPs, each side carries a `twin_review` cross-reference. Both keep their unmatched candidacy until certified by a human.

**Metadata carried:**
```json
{
  "twin_review": {
    "kind": "twin_unmatched_pair",
    "other_side_id": "n",
    "other_side_title": "...",
    "other_side_pap_id": "p312:r0",
    "other_side_program": "...",
    "amount_php": 5000000,
    "note": "Identical normalized title, region, zone and equal amount exist on the unmatched opposite side under a different program/PAP section. Likely a cross-PAP transfer or duplicated printing — left unpaired; both rows stay insertion/deletion candidates until reviewed. Amount alone never certifies identity."
  }
}
```

**Key constraint:** Same-scope duplicate-key rows (which failed the exact tier despite same PAP) are explicitly excluded — amount must never break their tie.

**Test:** `test_current_pages.py::test_cross_pap_twin_stays_unmatched_but_carries_twin_review`, `test_same_pap_twin_without_unique_key_stays_silent`

---

### 3. NEP-Twin Annotation (Fix C)

**Problem:** 3rd-reading-only rows whose exact normalized title + region + zone exists in the printed NEP schedule were classified as `third_only` reading drifts, potentially mis-narrated as legislative insertions.

**Fix:** Rows reaching `third_only` state that have an exact NEP twin carry a `nep_twin` annotation noting likely restoration of a 2nd-reading drop rather than a new insertion. The classification remains `third_only`; only the review context changes.

**Metadata carried:**
```json
{
  "nep_twin": {
    "source_id": "p9:r0",
    "pap3": "BIP - Access Roads",
    "pdf_page": 458,
    "amount_php": 25000000,
    "note": "Identical normalized title + region + zone exists in the printed NEP schedule. Likely a restoration of a 2nd-reading drop rather than a new legislative insertion — review against the NEP line before certifying. Annotation only; this row keeps its third_only status."
  }
}
```

**Zone mapping fix:** Source NEP rows use `non_fap`/`fap` vocabulary while reading rows use `local`/`fap` — mapped before comparison.

**Downstream effects:**
- `analyticsStatusInfo.js` updated: `third_only` note mentions `nep_twin` annotation
- `build_stage_trace.py` carries `nep_twin` through the join

**Test:** `test_house_readings.py::test_third_only_row_with_nep_twin_is_annotated_not_reclassified`

---

## Impact Summary

| Category | Before | After | Delta |
|----------|--------|-------|-------|
| `exact_candidate` | 9680 | 9680 | 0 |
| `segment_scope_candidate` | 0 → **37** | New bucket | ₱149M net (excluded from adj.) |
| `chainage_candidate` | 287 + 37 = 324 → **287** | Reverted | ₱37 moved out of adj. |
| `transfer_candidate` (auto-pair) | 0 | **Removed** | — |
| `twin_review` annotations | 0 → **14** (7 H + 7 N) | New cross-ref | — |
| `nep_twin` annotations | 0 → **5** | Restoration markers | — |

**Adjustments:**
- Increased: 203 → 188 (−15)
- Reduced: 206 → 194 (−12; remainder merged into −3 due to scope_net reconciliation)
- Unchanged: 9670 → 9660 (−10 equal-amount segment pairs moved to scope_review)
- Scope_review: 0 → **37**, net_ph = ₱149,434,000

The funding bridge ties:
```
total_delta = insertions(₱X) - deletions(₱Y) + adjustments_net(₱Z) + scope_review_net(₱149M)
```

---

## Files Modified

### Core Matching
- `analysis/builders/build_current_pages.py` — segment gate, twin cross-mark sweep, `_twin_pairs()`, `_twin_review_note()`, METHOD update

### Readings
- `analysis/builders/build_house_readings.py` — `compare_readings(source_rows=...)`, zone-mapped NEP twin annotation

### Stage Trace
- `analysis/builders/build_stage_trace.py` — `segment_scope_review` classify variants, `house_minus_nep` computation, `twin_review` passthrough

### Web Layer
- `analysis/web/src/groupProjects.js` — `matchesDifferenceScope` exclusion
- `analysis/web/src/matchFilters.js` — new statuses, flags, legacy maps, info labels, `rowFlags` segmentation
- `analysis/web/src/analyticsStatusInfo.js` — status descriptions for scope/twin
- `analysis/web/src/mainOverviewModel.js` — scope_review bridge assertion, partition check
- `analysis/web/src/overviewSummary.js` — scope_review bucket, partition, bridge, ledger reconstruction
- `analysis/web/src/revisionFlow.js` — scope_review REVISION_TYPE, gain/loss pattern, totals.scope_net, inflow/outflow reconciliation
- `analysis/web/src/revisionMatrix.js` — scope_review cell label
- `analysis/web/src/overviewFlows.js` — scope_review flow graph node + alias
- `analysis/web/src/budgetFlowModel.js` — scope_review flag mapping, `categoryRecordHref`

### Road Groups
- `analysis/builders/build_road_groups.py` — ATTACHED set includes segment_scope

### Payload Builders
- `analysis/web/buildDpwhFlow.mjs` — `rowClass` carve-out for scope_review

### Tests
- `analysis/tests/test_current_pages.py` — segment, partial overlap, cross-pap twin, same-pap silent
- `analysis/tests/test_house_readings.py` — nep_twin annotation test
- `analysis/tests/test_stage_trace.py` — segment_scope always routes to _review, never increase/decrease
- `analysis/web/src/matchFilters.test.js` — segment scope flag, twin_review flag, parseLegacyStatus
- `analysis/web/src/mainOverview.test.js` — pinned expectations updated for new partition + bridge

### Docs
- `analysis/docs/remediation_honest_ambiguities.md` — this file

---

## Verification

All packaging gates pass:
- `python scripts/validate_current_pages.py` ✅
- `python -m unittest discover -s tests` ✅ (131 passed)
- Node suite: 309 tests, 305 pass, 0 fail (4 skipped as designed) ✅
- `npm run build` bundles `RelationsView` as its own lazy chunk (~17 KB) ✅
- Overview funding bridge validates on all 4 workspaces ✅
- Bar comparison conserves both ledgers exactly on built DPWH data ✅

---

## Relations Sidecars and the Relations View (2026-10-22)

The ambiguity fixes above tell the truth about *pairs*. The **group relations**
layer extends the same honesty to *shells* — road corridors and project shells
(work + municipality + province) that group House and NEP rows — and answers
"where exactly should a reader look?" without re-matching anything.

### Architecture

`analysis/builders/build_group_relations.py` harvests the matcher's own output
(`source_comparison_2027.json`) and emits **seven static JSON sidecars** to
`analysis/data/`:

| Sidecar | Raw | gzip | Contents |
|---|---|---|---|
| `group_relations_index_2027.json` | 0.27 MB | 0.03 MB | summary, state census, overlap spectrum with declared bounds, top-400 shell preview |
| `group_relations_shells_2027.json` | 7.83 MB | 0.61 MB | drillable roster: full node bodies + edges + per-shell member id lists for every shell any view can name |
| `group_relations_ambiguity_2027.json` | 0.19 MB | 0.02 MB | competing shells: nodes with >1 candidate edge, with node bodies |
| `group_relations_twins_2027.json` | 0.01 MB | 0.00 MB | cross-PAP twin pairs (cross-reference of Fix B) |
| `group_relations_overlaps_2027.json` | 0.09 MB | 0.02 MB | every measured span pair with `overlap_ratio` and booked/withheld delta |
| `group_relations_states_2027.json` | 2.20 MB | 0.22 MB | compact overlay `id → [state_index, side_index]` + non-derivable detail |
| `group_relations_findings_2027.json` | 1.31 MB | 0.13 MB | ranked observations (see below), pruned of repeated note text |

Sizes are dominated by `shells` (1,810 rostered shells, 12,554 node bodies,
5,659 edges). Node bodies carry exactly the eleven fields a reader needs to
open a row elsewhere — the allowed set is asserted by
`test_group_relations.py` so no sidecar that embeds bodies can silently
bloat. The roster transfers at **0.61 MB gzipped** (the dev middleware and
GitHub Pages both serve compressed), and it is fetched lazily only on
drill-down — never on first paint of the Relations view, which needs just the
0.03 MB index plus the active sub-view's sidecar.

**Design rules, enforced by 32 python tests** (`analysis/tests/test_group_relations.py`):

1. **Order-independent states.** Every row gets exactly one integer-coded state
   by rank: `committed_attached` > `review_attached` > `duplicate_key` /
   `twin_cross_referenced` > `open_candidate` > `unmatched_insertion` /
   `unmatched_deletion`. Shuffling the source cannot change a state.
2. **No dead ends.** Every shell named by a finding, twin, or overlap is
   rostered in the shells sidecar with full row bodies and member ids on both
   sides — including rows no edge consumed, because `shell_amount_gap` and
   `unsupplied_shell` findings are precisely about those rows.
3. **Stable shell identity.** Labels carry a key hash
   (`road:quirinohway#97e8901197`) so identically named corridors under
   different PAPs/regions never merge (an earlier `kind:base` scheme collapsed
   10,815 keys into 10,372 labels).
4. **Scoped edges.** Every edge stamps its shell, so per-shell competition
   degrees are verifiable client-side.
5. **Bounded size.** Machine payloads use compact separators; `index` holds a
   declared top-400 preview while `shells` holds the complete roster.
6. **No contradiction by construction.** The builder only harvests; it never
   re-scores. If a sidecar disagrees with the dashboard, the sidecar is stale.
7. **The index paints its own census.** The States tab renders from the index
   alone — counts, per-side splits, amounts, state prose and the ranking note
   all ship there — so the default first paint needs the 0.03 MB index and
   nothing else. The 2.2 MB per-row overlay loads only on drill-down. One
   `STATES_NOTE` constant feeds both payloads, and a test asserts they match,
   so the two wordings cannot drift.

### The Relations view

`analysis/web/src/RelationsView.jsx` (lazy-loaded from `Analysis.jsx` via
`view=relations`, chunk ~17 KB) renders five sub-views over the sidecars:

- **States** — census strip: how many rows sit in each explicit state.
- **Findings** — ranked observations with type/region filters and an *Open
  shell* drill-down. Types: `committed_with_rivals`, `competing_candidates`,
  `shell_amount_gap`, `unsupplied_shell`, `zero_overlap_attached`,
  `cross_pap_twin`.
- **Ambiguity** — shells containing nodes with several plausible counterparts.
- **Twins** — the cross-PAP twin pairs, surfaced from Fix B.
- **Overlaps** — the measured overlap spectrum (bounds shipped per bucket, so
  the UI replays rather than re-derives them) plus the zero/low-overlap pair
  list with withheld deltas.

The drill-down modal (`rshell=` route param) lists every member row of the
shell with its state, amount, matcher status, and per-shell edges, and is
shareable by URL. Pure helpers live in `analysis/web/src/groupRelations.js`
(12 node tests in `groupRelations.test.js`).

### Related web-layer fixes made while wiring the view

Wiring the view surfaced stale expectations from the scope_review work that
had never been reconciled with the test suites:

- `revisionFlowLayout.js` — the new `scopeLoss` sink node had no position, so
  real-data flows crashed on link ordering; it is now laid out below the
  reduction sink with its own reserved slot.
- `buildRevisionFlowFromRecords` — optional `revise(record)` hook so the DPWH
  flow source flags segment-scope rows exactly where the matcher did;
  `flowSourcesData.js` passes it for `dpwh` only.
- `highlightsData.js` — segment-scope pairs previously fell into
  increased/decreased/unchanged here while `matchesFlag` excluded them
  (188 vs 203 mismatch); they now land in a `scope_review` bucket included in
  the bridge: `net = insertions − deletions + increased − decreased + scope_net`.
- `barComparison.js` — **conservation bug, found by the `revise` hook above.**
  `SEGMENTS` hard-coded the five original revision classes, so once the DPWH
  flow began emitting `scope_review` cells the bar chart drew them nowhere
  while its row totals still carried the money: the drawn segments summed to
  ₱1,155,195,687,000 against bar totals of ₱1,159,999,735,000 — **₱4.804 B
  silently absent from every bar**. `scope_review` is two-sided (the pair
  exists on both ledgers; only its delta is unbooked), so it now joins the
  shared classes ahead of the one-sided pair, preserving the cross-bar
  alignment the ordering exists to guarantee. Verified on built data: drawn
  segments rebuild both ledgers exactly. A new guard test asserts every
  `REVISIONS` class is drawable, so no future class can vanish this way.
- `budgetFlowModel.js` — `budgetFlowRecordLink` for FMR/NIA no longer promises
  a scoped filter for `scope_review` (those workspaces cannot express it).
- Test pins updated to the six-cell revision grammar (cells/ribbons/stubs/
  sinks counts, sink totals incl. 17,640,000 unbooked scope deficit, height
  ratios) across `budgetFlow`, `flowSources`, `flowFromGrouping`,
  `highlightsData`, `revisionFlow` suites.

### Build integration

`build_group_relations.py` runs at the end of both `prebuild` and `predev`
in `analysis/web/package.json`, so the sidecars regenerate from
`source_comparison_2027.json` before every build/dev session. The dev server
already serves `/analysis/data/` via the retained-files middleware in
`vite.config.js` — no config change needed.

---

## What Remains

1. **Human certification** of segment_scope pairs and twin_review pairs — these remain uncategorized until reviewed.
2. **Documentation updates** to `data_pipeline.md` and `data_user_guide.md` reflecting the new vocabulary and the Relations view.
