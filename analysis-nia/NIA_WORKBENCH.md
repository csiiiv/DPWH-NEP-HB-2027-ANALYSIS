# NIA irrigation workbench

The shared React site registers NIA under `#nia/`. Home, Highlights, Compare
Stages, Analysis, House GAB, and DBM NEP use the retained extractions. The
datasets contain 828 House rows (₱17,999,305,000) and 791 NEP rows
(₱17,598,181,000). All six printed sub-program controls reconcile.

## Views and evidence

| Route | Content |
|---|---|
| `#nia/home` | Annex totals, scope, and sub-program controls |
| `#nia/highlights` | Funding difference, changed candidates, agency scope, extraction review |
| `#nia/compare?view=subprograms` | Full printed controls, filtered exports, and inline PDF evidence |
| `#nia/compare?view=projects` | Candidate observations with source amounts, PDF references, filters, exports, and evidence dialogs |
| `#nia/analysis?view=overview` | Filtered allocation distribution and supporting rows |
| `#nia/analysis?view=stats` | Bands, rounding, repeated amounts, supporting rows |
| `#nia/analysis?view=insertions` | House-only insertion candidates, ranked allocations, group drilldowns |
| `#nia/analysis?view=deletions` | NEP-only deletion candidates, ranked allocations, group drilldowns |
| `#nia/analysis?view=adjustments` | Paired House/NEP amount changes, direction filters, group drilldowns |
| `#nia/analysis?view=candidates` | Filtered candidate observations |
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

Analysis uses DPWH's hero and view tabs. Its `stage=house|nep` selector (default
NEP) applies to Overview and Statistics. Insertions always use unmatched House
records, Deletions unmatched NEP records, and Adjustments pairs with an amount
change. The fixed source basis is displayed on those views.

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
