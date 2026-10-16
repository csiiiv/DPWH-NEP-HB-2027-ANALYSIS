# Plan: Unchanged population and five-group labelling on the main Overview

Written: **17 October 2026**. Status: **planned — nothing implemented yet.**

## Decision record (agreed with the user, 16 October)

1. **Add an Unchanged group** to the main Overview (`#overview`): matched
   House–NEP records with **no change in budget allocations** (same recorded
   allocation on both stages).
2. **Label wording is literal**, exactly as supplied by the user. Each of the
   five groups gets a **title plus subheader**:
   - **Insertions** — *House Only Records*
   - **Deletions** — *NEP Only Records*
   - **Unchanged** — *Same NEP-HGAB Titles, no adjustments*
   - **Increased** — *Same Titles, increased budget*
   - **Decreased** — *Same Titles, decreased budget*
3. **Scope B for links**: deep-link the Unchanged cell only where a workspace
   filter already exists (FMR, HFEP, NIA). **No new DPWH filter** in this
   batch; the DPWH cell shows figures without a link and a deferred item is
   recorded below.
4. Editorial caveat retained: the existing changes-section sentence
   ("A candidate is a matching observation, not a certified policy change")
   stays, because "House Only Records"/"NEP Only Records" are candidate
   populations and part of each matched population pairs after title
   normalization rather than identical raw titles. The subheader wording is
   the user's chosen presentation; the caveat carries the precision.

## Population definition per workspace

Unchanged is derived inside the existing summary adapters — no source
amounts, identities or matching thresholds change.

| Workspace | Unchanged population at its declared grain | Existing filter/URL for the cell link |
|---|---|---|
| DPWH | Paired HGAB3↔NEP comparison rows (incl. region-difference candidates) where House amount equals NEP amount; grouped members counted individually, matching insertions/deletions counting | **None yet** — render as plain figures; `amount_same` compare flag is deferred (see below) |
| DA FMR | Paired project rows with `delta_php === 0` | `#fmr/compare?view=projects&direction=unchanged` (UI-reachable Amount-direction filter; equivalently `status=unchanged` in `filterComparisons`) |
| DOH HFEP | Funding-column records with event `'same'` (printed identically in both annexes) — same basis as the existing "Unchanged records" stat on HFEP Analysis | `#hfep/analysis?view=adjustments&event=same` (pair-grain alternative: `#hfep/compare?view=pairs&changed=same`) |
| NIA | Paired rows with `delta_php === 0` (505 pairs on the current build) | `#nia/compare?status=unchanged` |

Money basis for the Unchanged tile: one allocation figure — the House-side
sum, which equals the NEP-side sum by construction (per-row delta 0).

## Changes by file (implementation map)

### `analysis/web/src/overviewSummary.js`

- `partition()` (DPWH/FMR/NIA): compute `unchanged` with the same
  `population()` helper used for insertions/deletions
  (`count`, `comparison_rows`, `amount_php`), from
  `paired.filter(r => r[house].amount_php === r.nep.amount_php)`.
  - Add `ensure()` invariants: unchanged House sum equals unchanged NEP sum;
    `unchanged.comparison_rows + increased_count + reduced_count` equals the
    paired row count (add a `paired_comparison_rows` field or equivalent to
    make this checkable downstream).
- `hfepSummary()`: `unchanged` = records with `event === 'same'` from the
  existing `recordAggregates` (count + amount; House value equals NEP value
  for these records). Keep adjustments events untouched.
- `links.unchanged` per workspace: FMR/HFEP/NIA as in the table above; DPWH
  omits the key (or sets `null`) so the model can distinguish "no filter yet"
  from a broken link.

### `analysis/web/src/mainOverviewModel.js`

- `validateOverview()`: require `w.unchanged` (count, amount_php,
  comparison_rows) for all four workspaces; require `links.unchanged` for
  fmr/hfep/nia and allow its absence for dpwh; add the paired-row
  reconciliation check; keep the existing funding-bridge check untouched
  (unchanged contributes 0 to paired net movement by construction).
- `overviewCsv()`: add columns `unchanged_records`, `unchanged_php`,
  `unchanged_comparison_rows`, `unchanged_href` (empty for DPWH) beside the
  insertion/deletion columns.

### `analysis/web/src/MainOverview.jsx`

- `Population` component: support `kind="unchanged"`; small-label mapping
  extended ("Same allocation · both stages"); render a non-link block when
  `workspace.links.unchanged` is absent (DPWH).
- Summary card: populations grid becomes three tiles — Insertions, Deletions,
  Unchanged — each with title + subheader (literal wording above).
- Adjustments `<dl>`: rows relabelled to **Increased** / **Decreased** with
  the literal subheaders; "Net paired movement" row unchanged.
- Changes table (`House vs. NEP: candidate changes`): headers become the five
  literal title+subheader pairs; new **Unchanged** column between Deletion
  candidates and Paired increases (count + allocation; linked where
  `links.unchanged` exists). Keep the House ledger column last.
- Table footnote/muted copy: add one sentence defining Unchanged (matched
  records, no allocation change) and noting the DPWH cell is not yet
  filterable in Compare.

### `analysis/web/src/MainOverview.css`

- Subheader styling for tile titles and `<dt>` labels (e.g.
  `.overview-population .overview-subhead`, `.overview-adjustments dt small`);
  two-line table headers for the changes table; keep mobile 1-column rules
  working with three population tiles.

### `analysis/web/src/mainOverview.test.js`

- All four workspaces carry `unchanged` with House sum == NEP sum and the
  paired-row reconciliation; stable value assertions (exact counts/pesos
  captured from the first verified build, e.g. NIA 505 pairs).
- Link assertions: FMR `direction=unchanged`, HFEP `event=same`, NIA
  `status=unchanged`, DPWH no `links.unchanged`.
- `validateOverview` rejects a tampered unchanged amount/bridge.
- CSV includes the new columns and keeps 5 lines (header + 4 rows).

### `analysis/docs/main_overview_page_plan.md`

- Section 2 (main summaries): add the Unchanged row to the summary table and
  the five-group title/subheader vocabulary.
- Section 4a (candidate-change tables): document the new column and the
  per-workspace link basis.
- Build-time summary contract: add the `unchanged` fields, link optionality
  for DPWH, and the two new invariants.
- Acceptance checks: add unchanged-figure equality with destination filtered
  populations (FMR/HFEP/NIA).

## What deliberately does not change

- Matching, pairing thresholds, source amounts, and every existing figure
  (insertions, deletions, adjustments, bridge, controls).
- The funding bridge identity: `insertions − deletions + net = House − NEP`
  is untouched; unchanged rows contribute zero by definition.
- Workspace Analysis/Compare views themselves — Overview only links into
  existing filters (scope B).

## Verification plan (when implemented)

1. `npm test --prefix analysis/web` (model + adapter tests).
2. `npm run build --prefix analysis/web`, then
   `python scripts/build_pages.py --with-react` and
   `python scripts/check_overview_pages.py`.
3. Manual/browser check at 390px and 1440px: three-tile cards readable,
   two-line table headers, DPWH non-linked cell visibly distinct from links,
   deep links land on the expected filtered populations, Back/Forward and
   reload restore `#overview`.
4. Cross-check the three linked workspaces' filtered counts equal the
   Overview figures on the full (unfiltered) basis.

## Deferred

- **DPWH `amount_same` compare flag** (`matchFilters.js` option +
  `#compare?view=projects&region_match=ignore&flag=amount_same` note copy) so
  the DPWH Unchanged cell can deep-link like its siblings. Requires the new
  flag in `FLAG_OPTIONS`/`REVIEW_FLAG_INFO` and a muted explanation line in
  `Comparison.jsx`; deliberately out of scope for this batch per scope B.
- CSV/exports inside the destination workspaces already export their filtered
  rows; no new export surface is added on Overview.
