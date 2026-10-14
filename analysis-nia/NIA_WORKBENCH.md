# NIA irrigation workbench

The shared React site registers NIA under `#nia/`. Home, Highlights, Compare
stages, Analysis, House GAB, and DBM NEP use the retained extractions. The
datasets contain 828 House rows (₱17,999,305,000) and 791 NEP rows
(₱17,598,181,000). All six printed sub-program controls reconcile.

## Views and evidence

| Route | Content |
|---|---|
| `#nia/home` | Annex totals, scope, and sub-program controls |
| `#nia/highlights` | Budget coverage and candidate-change tables with the funding bridge, nine findings, and per-story evidence dialogs |
| `#nia/compare?view=subprograms` | Full printed controls, filtered exports, and inline PDF evidence |
| `#nia/compare?view=projects` | Candidate observations with source amounts, PDF references, filters, exports, and evidence dialogs |
| `#nia/analysis?view=overview` | Filtered allocation distribution, allocation shares, and supporting rows |
| `#nia/analysis?view=stats` | Bands, rounding, repeated amounts, top-ten concentration, supporting rows |
| `#nia/analysis?view=ai_monitoring` | AI monitoring related project allocations, title-basis filters, stage totals, source records and CSV |
| `#nia/analysis?view=insertions` | House-only insertion candidates, ranked allocations, group drilldowns |
| `#nia/analysis?view=deletions` | NEP-only deletion candidates, ranked allocations, group drilldowns |
| `#nia/analysis?view=adjustments` | Paired House/NEP amount changes, direction filters, group drilldowns |
| `#nia/analysis?view=candidates` | Filtered candidate observations, funding reconciliation, pairing coverage |
| `#nia/analysis?view=controls` | Independent House agency-table reconciliation |
| `#nia/house` / `#nia/nep` | Printed source tree and selected arithmetic with an inline PDF |

Source pages accept `view=tree|projects|review` and `node=<source-id>`. All
project filters use `q`, `subprogram`, and `status`; source review statuses are
`flagged`, `repeated`, and `numeric`. Review categories overlap. Flags record
extraction history and resolved adjudications as well as label quirks. Selected
NEP records show retained rendered crops where available. Neither extraction
claims every row received rendered review.

Comparison accepts `status=paired|house_only|nep_only|changed|increased|decreased|unchanged|ambiguous`
and `pair=<candidate-id>`. Its layout follows DPWH: compact heading, collapsed
source scopes and downloads, table tabs, filters and exports beside the results,
and an inline source PDF pane. Project rows put source IDs, PDF references and
source-record links beneath each stage's amount. On phones the rows become
labeled cards with a sort control; Table/PDF controls switch the active pane.
`pdf`, `pdfPage`, and `panel=table|pdf` restore selected evidence on reload.

Highlights follows the shared annex pattern (FMR/HFEP): two coverage tables —
budget coverage by stage, and House-vs-NEP candidate changes closing the
funding bridge (paired Δ + House-only − NEP-only = annex Δ) — then nine
numbered findings. Each opens an evidence dialog via `story=<id>` (ids:
`annex-increase`, `subprogram-shift`, `changed-pairs`, `insertions`,
`deletions`, `pairing-coverage`, `ai-monitoring`, `agency-scope`,
`extraction-review`) with a fact panel, workbench cross-links, source-PDF
downloads, and where applicable the supporting comparison rows or printed
controls with their filters and CSV exports. Unknown story ids show a recovery
action. Every figure in the card copy is recomputed from the retained ledgers
by `highlightsCards` in `analysis/web/src/niaAnalysis.js`.

Highlight actions are buttons with finding-specific labels and retain shareable
`story` URLs. Each dialog shows three source-derived figures, its investigation
question and evidence limits. Card counts follow the available questions and
evidence; they are not padded to ten.

Funding stories include the printed controls and the paired/unmatched funding
bridge. Unmatched-row stories add ranked sub-program totals; their wording says
there is no unique title match rather than asserting a new or cancelled project.
AI monitoring opens both complete source populations and the unmatched House
subset via `evidenceStage=nep|house|insertions`, with title-basis filtering,
whole-project allocation totals and CSV exports. `aiBasis` restores the selected
title basis. Extraction review shows an in-dialog source record and retained
crop selected by `evidenceProject=<flagged-NEP-id>`. Agency scope shows
annex + CARP = House Operations; it does not infer a whole-agency change.

See [highlight evidence review](../analysis/docs/highlights_evidence_review.md)
for the assessment of all four funding workspaces and the NIA editorial review
items.

Analysis uses DPWH's hero and view tabs. Its `stage=house|nep` selector (default
NEP) applies to Overview, Statistics and AI monitoring. Insertions always use unmatched House
records, Deletions unmatched NEP records, and Adjustments pairs with an amount
change. The fixed source basis is displayed on those views.

Additional analysis stays within those existing views. Overview adds each
sub-program's share of the filtered allocation. Statistics adds overall and
within-sub-program top-ten concentration, with original source records and CSV
exports via `records=top10` or `records=top10:<sub-program-key>`. Search,
sub-program and extraction-review filters apply to these source statistics.
Candidates adds per-sub-program funding reconciliation and row/peso pairing
coverage using its current search, sub-program and candidate-status filters.
The full population reconciles the annex increase of ₱401,124,000; the 509
provisional pairs cover 53.3% of NEP allocation and 47.5% of House allocation.
The `pairing-coverage` finding opens this reconciliation from Highlights.
Pairing rules are unchanged.

AI monitoring is an additional Analysis tab using the same source selector,
filters, sortable tables, pagination, CSV exports and PDF evidence. It includes
explicit AI monitoring and AI satellite-assisted monitoring titles. All 59
retained NEP `Al`/`AL`/`AT Monitoring` variants (54 Al/AL and 5 AT) were checked
against rendered PDF rows and read AI. Original titles, amounts and provisional
pairings remain intact. `aiBasis=all|explicit|ocr_variant` exposes that distinction
in the filtered table and its CSV `ai_monitoring_basis` column. Other project
filters continue to apply; the two-source summary uses the same filters.

The full related population is 327 NEP projects (₱7,015,950,000; 268 explicit
and 59 OCR variants) and 299 House projects (₱6,341,950,000, including ten
satellite-assisted rows). All belong to Establishment of Pump Irrigation.
These are whole project allocations: the schedules do not itemize AI monitoring
costs. Generic remote/intermediate monitoring, gauges, sensors and CCTV without
AI wording are excluded.

The tab also reports House-only AI monitoring insertion candidates under the
current filters, independently of the selected source stage. The full population
has 123 candidates totaling ₱2,626,950,000: 41.1% of the 299 House AI monitoring
projects and 41.4% of their allocation. Four have repeated-title ambiguity.
`records=ai_insertions` opens the supporting comparison rows and their CSV
export, including candidate status, both source IDs/titles/amounts and PDFs.
Search, sub-program, review category and title-basis filters apply to the House
rows used for these figures. OCR variants selected in the NEP title-basis filter
have no House rows, so that scope yields zero insertion candidates. Source-only
status remains provisional; OCR/title differences can prevent an existing NEP
counterpart from pairing. The monitoring component cost is not itemized.

A reading note reconciles the AI ledgers on the full population: paired AI
titles print identical amounts (₱3,715,000,000 on both sides), so the whole
NEP → House movement of −₱674,000,000 (₱7,015,950,000 → ₱6,341,950,000) comes
from unmatched rows — ₱2,626,950,000 House-only against ₱3,300,950,000
NEP-only. A one-to-one maximum matching pairs 120 of the 123 candidates
(₱2,501,950,000) with an unpaired same-sub-program, same-amount NEP AI row,
marking reworded or OCR-variant titles rather than certified new works. The
Highlights card states the same reconciliation; both figures are recomputed
from the retained ledgers, never restated.

Candidate views accept `dim=overall|subprogram|program`, `ranking=all|unambiguous|ambiguous`
for source-only candidates, and `direction=all|increased|decreased` for adjustments.
`unambiguous` means no repeated canonical-title ambiguity in the counterpart
key; it does not certify an identity or absence. Group totals open shareable
supporting-record dialogs with `group=<group-key>`. These respect search,
sub-program and candidate filters and export their full supporting population.
Adjustments compare the single retained House schedule with NEP; no separate
House-reading change ledger is inferred.

Tables sort the full filtered population before 50-row pagination; `sort`,
`dir`, and `page` restore the view after sharing or reloading. Filters and
sorting reset pagination. CSV/JSON exports include all filtered rows, exact
integer PHP, source IDs, both candidate titles, and PDF references.

The House tree preserves its printed Development heading and leaves the first
three sub-programs directly under the annex title: it does not invent a
Restoration heading there. The NEP schedule prints both program headings.
Root totals are derived from controls; sub-program amounts are printed controls.
The House agency table's CARP row and broader agency appropriation remain scope
context, outside the detailed annex project ledger.

## Matching and accounting

Candidates require a canonical title that occurs exactly once on each side
within the same sub-program. Canonicalization case-folds Unicode-normalized
text and joins alphanumeric tokens; no fuzzy matching is applied. Repeated
keys on either side stay unmatched, even when their amounts agree. This yields
509 candidate pairs, 319 House-only observations, and 282 NEP-only observations.
Four pairs have different amounts. Source-only rows are not certified
insertions/deletions; OCR and title differences can prevent pairing.

Every source row occurs once in the comparison partition. The money identity is:

```
paired Δ −₱830,000,000
+ House-only ₱9,452,650,000
− NEP-only ₱8,221,526,000
= annex Δ ₱401,124,000
```

`build_nia_workbench.py` validates stage membership, unique IDs, each sub-program
count and total, and the comparison partition before writing the regenerable,
git-ignored `data/nia_workbench.json`. It retains OCR word ownership, raw amount
tokens, flags, source paths, page references, and evidence-crop names.

## Build and verify

From the repository root:

```sh
python analysis-nia/build_nia_workbench.py
python analysis-nia/build_nia_workbench.py --check
python -m unittest discover -s analysis-nia/tests -v
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py --with-react
python scripts/check_nia_pages.py
python scripts/serve_pages.py --port 8000
```

Development (`npm run dev --prefix analysis/web`) rebuilds the payload and
serves retained evidence directly. The static packager includes NIA JSON,
documentation, crops, and source PDFs under their original paths. `/nia/`
redirects to the workspace and preserves short source links and query strings.
The browser check uses a project base path at 390px and 1440px, covering filters,
pagination, exports, reloads, source arithmetic, rendered crops, real PDF range
responses, invalid-selection recovery, and workspace switching. Screenshots
are written under `/tmp/nia-ui-verification/`.
