# FMR workbench

[DPWH UI/UX baseline review and FMR adaptation priorities](FMR_DPWH_UI_UX_REVIEW.md)
documents the original site's core styles and interactions for each main tab.
[UI implementation reference](UI_IMPLEMENTATION_REFERENCE.md) documents how those
were carried over into the FMR pages, and is the port guide for building the
same kind of workspace for the other annexes (NIA, HFEP).

The **FMR branch** reuses the existing React workbench shell, tables, share links,
dialogs, and PDF viewer for the FY2027 DA locally funded FMR annex. Implementation
started with the shared House GAB and DBM NEP source trees, followed by Compare
Stages, Home, Highlights, and Analysis.

## Sources and accounting

| Source | Amount (PHP) | Project rows | Regions | Coordinate review |
|---|---:|---:|---:|---:|
| DBM NEP standalone FMR schedule | 16,000,000,000 | 704 | 16 | 8 |
| Supplied House GAB Volume I-B | 19,628,100,000 | 964 | 16 | 14 |

The retained working House copy is labeled as second reading. The bounded
[House comparison](FMR_HOUSE_PRINTED_TOTALS_COMPARISON.md) finds identical extracted
text on all 60 FMR annex pages in the working and named third-reading copies.
The coverage table represents both readings using the same normalized ledger;
this is not a separately normalized third-reading dataset or authentication of
the entire bill. The workbench includes these two normalized FMR stages. Neither their rows nor their stage totals are
added together as a single budget. Each printed hierarchy is program → region →
project; parents describe the same money as their children. Multi-segment
coordinates never multiply the project allocation.

`build_fmr_workbench.py` checks the retained source PDF hashes, normalization
lineage, project coverage, additive controls, independent control evidence, and
normalization summaries before generating `data/fmr_workbench.json`. That
browser payload is derived and git-ignored; source trees and review artifacts
remain the retained inputs. No live API is queried.

## Main tabs

The navigation order is **Home, Highlights, Compare stages, Analysis, House GAB,
DBM NEP**.

- **House GAB / DBM NEP:** the same expandable tree, project table, and coordinate
  queue. Selecting a control or project displays its title, amount, source ID,
  clickable hierarchy path, PDF/printed pages, immediate-child and terminal-project
  arithmetic, and coordinate evidence. The selected page renders inline beside
  the tree and evidence on desktop, and below them on mobile. Review categories
  and previous/next navigation respect the current scope. Program and regional
  controls link to the independent agency schedule too. NEP reviewed rows retain
  raw OCR, interpreted transcription, review notes, and rendered source images.
- **Compare stages:** regional control differences and provisional project
  candidates, with separate match-method/coordinate/direction filters, removable
  chips, inline PDF buttons, filtered analytics, CSV/JSON exports, mobile cards,
  and URL-backed sorting and pagination.
- **Home:** source totals, candidate counts and amounts with working filter
  links, a workspace directory, and source audit/coordinate status.
- **Highlights:** stage coverage and candidate funding-change tables above the
  existing eight findings. `story=` opens dedicated fact panels and filterable,
  exportable records/control evidence with source PDFs and onward links.
- **Analysis:** Overview, House-only candidates, NEP-only candidates,
  Adjustments, Coordinates, and Allocation statistics. Regional distributions,
  candidate rankings, amount bands, rounding, repeated allocations, and largest
  amounts lead to source record drill-downs. `insertions`, `deletions`,
  `chainage`, and `statistics` links remain supported aliases. Endpoint distances
  are diagnostic checks; they do not establish road length or construction
  cost/km. Flagged coordinate interpretations are excluded from diagnostics.

Filters and selected evidence are stored in the hash URL. Examples:

```text
#house
#nep?node=nep_fmr%3Ap1%3Ar7
#house?view=projects&status=multi
#nep?view=review
#compare?view=projects&status=changed
#compare?view=projects&region=IVA
#analysis?stage=house&region=IVA
#analysis?view=house_candidates&region=IVA
#analysis?view=adjustments
#analysis?view=stats&records=band%3A1
#highlights?story=amount-changes
#compare?view=projects&sort=house_php&dir=desc&page=3
```

Project tables sort the entire filtered result before pagination. CSV exports
include all filtered rows, independent of the displayed page. Unmatched source
amounts remain blank in comparisons; they are not treated as zero appropriations.

## Candidate matching

Pairing is one-to-one within a corresponding printed region, in three passes:

1. Unique canonical title plus exact clean coordinate arrays.
2. Unique canonical title among the remaining rows.
3. Unique exact clean coordinate arrays among the remaining rows.

Canonical titles normalize case, punctuation, whitespace, and `Brgy` to
`Barangay`. They do not remove phases, project numbers, or locations. Coordinate
keys preserve all retained precision, segment order, and endpoint order.
Flagged coordinates cannot support a coordinate match. No fuzzy title matching,
proximity matching, inferred coordinate repairs, or amount-based pairing is used.
Duplicate unresolved keys remain source-only observations. Both original titles
and source-local IDs are preserved in candidate evidence.

The current pass yields **609 candidate pairs** (548 title + coordinates, 8
title, 53 coordinates), **355 House-only rows**, and **95 NEP-only rows**. Four
candidate pairs have an allocation difference. These are provisional
correspondences, not certified project identities or policy insertions/deletions.

Every source row appears exactly once in the comparison. Its funding reconciles:

```text
Paired differences       -45,000,000
+ House-only funding   5,969,005,000
- NEP-only funding     2,295,905,000
= Control difference   3,628,100,000 PHP
```

## Local run and checks

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

Vite serves the retained files and PDF byte ranges from the checkout. For a full
static preview under either a domain root or a project prefix:

```sh
npm run build --prefix analysis/web
python scripts/build_fmr_pages.py
python scripts/serve_pages.py --port 8000
```

The packager rebuilds `_site/` with the SPA, FMR data/docs/images, both detail
PDFs, and both independent control PDFs. The root redirects into `/app/` while
preserving query and hash parameters. Nothing is published by these commands.

```sh
python -m unittest discover -s other-analysis/tests -v
npm test --prefix analysis/web
python other-analysis/build_fmr_workbench.py --check
python other-analysis/validate_fmr_coordinates_psgc.py --check
python other-analysis/build_fmr_final_dataset.py --check
python scripts/check_fmr_pages.py
```

Browser QA requires Python Playwright and Chromium. It checks all six routes at
390px and 1440px, tree expansion, persisted selections, full-result sorting,
pagination, CSV/JSON exports, review images, scoped coordinate queues,
Highlight/Analysis dialogs, mobile cards/overflow, stacked dialog dismissal, and PDF range
rendering for all four documents. Earlier DPWH source modules remain available
in `analysis/`, but the FMR app does not load their workbench datasets.
