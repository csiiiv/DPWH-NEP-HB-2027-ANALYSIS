# Analysis tab consistency todo list

Updated: **14 October 2026.** Trackable companion to
[analysis_tabs_rules.md](analysis_tabs_rules.md) (rules R1–R47) and
[analysis_tabs_framework.md](analysis_tabs_framework.md).
One checkbox per actionable unit; check items off and date them as they
land. Deviation IDs (D#) refer to the rules doc §8 backlog.

Convention: every code change batch ends with the validation block at the
bottom; note results inline under the item when non-trivial.

---

## Batch 1 — mechanical fixes (DONE, 14 Oct 2026 audit)

- [x] D15 / R46 — `SortableTable` default locale `en-US` → `en-PH`
- [x] D11 / R33 — `p.42` → `p. 42` spacing: Comparison, Highlights,
      CandidateDetails, HFEP pair view
- [x] R33 — HFEP Adjustments volume labels through `volumeLabel()` helper
- [x] D12 (partial) / R33 — FMR + HFEP `Printed p.` null guards
- [x] D7 / R39 — unify signed-delta palette to `#0b6b3a`/`#a12020`
      (core `.up`/`.down` + hfep-pairs overrides; badge component keeps its
      own palette — distinct visual role)
- [x] D13 / R36 — NIA `page_count` in documents registry (builder +
      payload rebuilt); `NiaApp` validates from registry, no literals
- [x] D4 / R17 — resolved as compliant (sort preset vs filter; both show
      full population by default)
- [x] Validation: 177 unit tests, build, 4 browser suites — all green

## Batch 2 — shared-component convergence — DONE, 14 Oct 2026

- [x] R8 — FMR Analysis tabs renamed to canonical keys/labels
      (`insertions`/`deletions`/`adjustments` replacing
      `house_candidates`/"House-only candidates" and
      `nep_candidates`/"NEP-only candidates"); legacy keys kept as read-only
      aliases; check script, README, FMR_WORKBENCH, UI reference and
      framework doc updated (14 Oct 2026)

- [x] D16 / R44 — merge duplicate percent-change helpers into
      `web/src/pctChange.js` (`pctChange`, `signedPct`); `fmrModel.js`
      re-exports for annex imports; DPWH `Analysis.jsx` imports
      `pctChange as percentChange` and keeps local colored `signedPercent`
      (14 Oct 2026)
- [x] D3 / R42 — roll out stable `tableId` deep links to annex Analysis
      tables and record dialogs; NIA `Table`/`ComparisonTable` wrappers pass
      IDs through. `SortableTable` now owns scroll/focus on mount, including
      lazy targets; FMR mobile cards receive focus when the desktop table
      is hidden. Tab switches clear stale `table=` selections.
      Completed 14 Oct 2026; final validation below.
- [x] D1 / R9 — convert DPWH Analysis subtabs (`.analysis-subtabs` buttons,
      Analysis.jsx:135) to link navigation with `aria-current="page"`,
      keeping the `change('view', …)` param-reset semantics (view switch
      drops degenerate `dim`, `drill`, `axis`, `table`)
      Completed 14 Oct 2026; final validation below.
- [x] D2 / R29 — standardize question banners: add `h2.fmr-question`
      per-view questions to DPWH + NIA Analysis (FMR/HFEP have them), or
      decide hero-copy-only and remove from FMR/HFEP — pick one direction
      and apply to all four
      Completed 14 Oct 2026; final validation below.

## Batch 3 — Overview upgrades (R25 banded skeleton) — DONE, 14 Oct 2026

- [x] D9 / R25 — FMR Analysis Overview: complete the existing printed
      regional stage comparison with the Records/Allocations skeleton
      (NEP/House counts + Δ + % records; NEP/House PHP + Δ + % allocation).
      Reuse Compare's `RegionalTable`; retain the filtered selected-source
      distribution separately to preserve the R26 distribution question.
      Completed 14 Oct 2026; final validation below.
- [x] D9 / R25 — NIA Analysis Overview: same banded skeleton by sub-program
      (population = comparison ledger scoped to selected stage pair; needs
      per-subprogram NEP/House counts + sums, already available from
      `candidateGroupRows`-style aggregation)
      Completed 14 Oct 2026; final validation below.
- [x] D9 / R25 — HFEP Analysis Overview: decide scope — HFEP has no
      stage-pair Overview table today; either add the banded skeleton by
      region (counts + allocations per side) or record HFEP as
      compliant-by-data (Overview presents per-stage distribution only) in
      D9's backlog note
      Completed 14 Oct 2026; final validation below.
- [x] R26 — verify each Overview change still answers a distribution
      question (no cross-document drift beyond the §4.3 table)
      Completed 14 Oct 2026; final validation below.

## Batch 4 — drill-down ladder convergence (R23) — DONE, 14 Oct 2026

- [x] D8 / R23 — FMR candidate views: replace filter-application drills
      (regional ranking buttons that set `region=`) with the URL-keyed
      records modal pattern; membership = aggregate's rows under active
      filters; footer link "Continue in Compare stages →"
      Completed 14 Oct 2026; final validation below.
- [x] D8 / R23 — HFEP `CrossDocAggregate`: group labels currently route to
      Compare `?view=pairs&region=…`; add the records modal (reuse the
      existing `Dialog` + line-item table) with identical membership rules
      Completed 14 Oct 2026; final validation below.
- [x] R23 — both modals must resolve against full unfiltered data and
      carry scope tags (ranking/dimension) in the header, per DPWH's
      `GroupProjectsModal` reference implementation
      Completed 14 Oct 2026; final validation below.

## Batch 5 — evidence and exports — DONE, 14 Oct 2026

- [x] D12 (remainder) / R34 — DPWH tree-evidence plain text: make printed
      page references in tree detail panels open the PDF viewer (they
      already have `pdf_page` in node source data; wire to
      `PdfSourceModal`'s anchor interception or a button)
      Completed 14 Oct 2026; final validation below.
- [x] D14 / R38 — DPWH record-grain exports: when adding/adjusting exports,
      adopt `source_pdf`/`pdf_page` (+ per-side `house_*`/`nep_*` prefixes
      for pair exports); current `comparisonExport.js` lacks them — extend
      headings with evidence columns sourced from `r.nep?.source` etc.
      Completed 14 Oct 2026; final validation below.
- [x] R24 — verify exports cover filtered population (not page slice) after
      any pagination changes
      Completed 14 Oct 2026; final validation below.

## Batch 6 — docs and registry hygiene — DONE, 14 Oct 2026

- [x] Update `analysis_tabs_rules.md` §8 backlog rows as batches land
      (mark fixed + date, like D7/D11/D13/D15 entries)
      Completed 14 Oct 2026; final validation below.
- [x] Update `analysis_tabs_framework.md` code-map line numbers if
      component locations shift during batches 2–4
      Completed 14 Oct 2026; final validation below.
- [x] Re-run full validation block; append results to rules doc §10 audit
      log with date
      Completed 14 Oct 2026; final validation below.

---

## Verification results — 14 October 2026

- Quick pass: previously completed mechanical/helper changes verified in
  code; baseline **177 unit tests** passed.
- Batch 2: shared table targeting, link tabs and question banners passed
  the full validation block, including table-link reload/reset checks.
- Combined Overview/drill/evidence/export pass: **180 unit tests**, production
  build, rebuilt source-verification pages, packaged site, and DPWH/NIA/
  HFEP/FMR browser suites **all passed** at **390px and 1440px**.
- Browser coverage includes banded columns and restored URL sorts, group
  membership/export counts, active-search scopes, reload, Back/Forward,
  Esc/Close, unknown groups, PDF evidence and whole-population exports.
  HFEP deletion exports retain all 203 records beyond the top-150 display.
- Follow-up verification also corrected FMR canonical tab ordering/legacy
  active links, gross adjustment columns, and missing NEP amounts on HFEP
  revised/unchanged records. HFEP's revision bridge remains 180,122,000 PHP.
- HFEP Overview remains per-source, with its scope rationale in the view,
  framework and rules §8 D9; FMR/NIA retain selected-source distributions
  beside the permitted banded stage comparison.

## Validation block (run after every batch)

```bash
npm test --prefix analysis/web          # unit tests (180 expected after this pass)
npm run build --prefix analysis/web     # production build
python3 scripts/build_pages.py --with-react
python3 scripts/check_react_pages.py    # DPWH suite
python3 scripts/check_nia_pages.py
python3 scripts/check_hfep_pages.py
python3 scripts/check_fmr_pages.py
```

Known context: the geolocation workspace (untracked WIP: `GeoApp.jsx`,
`GeoMap.jsx`, `routes.js` geo entry, `check_geo_pages.py`) is in progress
alongside this list; its JSX tag bug was fixed and its workspace-selector
assertion updated during the 14 Oct audit. Coordinate with that work when
touching shared files (`routes.js`, `Workbench.jsx`, `styles.css`).

## Main Overview integration — DONE, 14 October 2026

- [x] Reassessed against completed shared-component/Overview/drill batches.
- [x] Added the default global Overview before DPWH while preserving explicit
      workspace routes and Geolocation.
- [x] Added builder-validated candidate summaries and exact CSV/JSON exports.
- [x] Corrected shared DPWH changed-pair membership to include foreign-assisted
      pairs outside Transparency; fixed HFEP derived-zero record inflation and
      corrected the active national/LGU scope copy.
- [x] Verification: 188 frontend tests, production build, packaging, 4 redirect
      tests, Overview + all five workspace browser suites (390px/1440px), HFEP
      builder freshness and 28 HFEP source tests passed.

See [main Overview plan](main_overview_page_plan.md) for implementation details.
