# FY2027 project master list

This folder collates the retained project and allocation data for DPWH, DA
farm-to-market roads (FMR), DOH health facilities (HFEP), and NIA irrigation.
It adds **provisional PSGC locations** from titles and usable printed locality
headings. See [coverage and totals](data/REPORT.md).

The [readable processing dataset](docs/PROCESSING_DATASET.md) pre-generates
clean display titles over the existing DPWH/FMR/HFEP/NIA comparison JSONs,
and is now the master builder's input.
Its 20,321 groups include matched, House-only and NEP-only records, while
5,044 House GAS/S2O observations remain explicitly outside comparison scope.
All 64,645 source observations are retained. Generate it with
`python3 master_list/scripts/build_processing_dataset.py`; the webapp's
`predev`/`prebuild` scripts also run this step. The master builder adds
location evidence to these observations; the browser joins them to the same
comparison groups. Run `npm run build:master-list --prefix analysis/web` to
rebuild processing, master enrichment and the browser after its inputs exist.

Documentation is split by purpose: [processing data and browser contract](docs/PROCESSING_DATASET.md),
[scoring factors and weights](docs/SCORING_RULES.md), and
[location methodology, current results and roadmap](docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).
Readable cleanup is versioned as `readable_title_v1`; location evidence still
uses `location_evidence_v6.2`.

Each row is a **source observation**, not a certified unique physical project.
The same project can occur in the NEP PDF, Transparency API, and House readings.
Source IDs, titles, amounts, and budget stages remain separate. **Do not sum
across datasets.** No uncertain cross-source deduplication is performed.

## Table viewer

Open [index.html](index.html) in a recent browser. The complete list is embedded
in the HTML, so it also works directly from disk without a server or internet.
Keep it in `master_list/` so its relative PDF and CSV links continue to resolve.

The default **Comparison groups** view has 20,321 rows. Expand a group to inspect
its source observations and their individual evidence. NEP, each House reading
and the API keep separate amounts. Retained comparison/stage details expose
the existing match status, chainage and normalization annotations. The **All
source observations** view contains all 64,645 rows; **Outside comparison**
shows the 5,044 GAS/S2O allocations separately.

Each source observation shows **readable title, category, value in PHP, PSGC
locations, raw location evidence score, reference PDF, and PDF page**, with
printed page numbers where available. Open its evidence details for the
original title, applied cleanup rules, coordinate summary and district lookup.
Search across titles, categories, places, codes and PDF filenames;
filter by source, category, minimum evidence score or review flag. Click the
title, category, value or evidence-score header to sort observation rows.
In group view, amount sorting requires one source and score sorting is disabled
because scores belong to observations. Pagination keeps the full list responsive.
Allocation rows are included initially and can be hidden using the checkbox.
Filters select a group through an individual matching observation; expanding
still shows all its members. A filtered amount total appears when a single
source is selected. Group view totals cover the comparison scope only.

The [project list CSV](data/project_list.csv.gz) (gzip; deterministic build) contains
all source rows and the same reference fields, plus the verified legislative
district (`leg_district`, `leg_district_label`, `leg_district_derivation`);
decompress it before opening in a
spreadsheet, or run the viewer build for a plain local `project_list.csv` copy.
Import PSGC code columns as text to preserve leading
zeros. Categories use the retained subprogram/program or HFEP category and
subcategory. They are labels from the extraction, not a new project taxonomy.

PDF page links use **1-based file pages**, separately from printed page numbers.
The viewer maps the legacy absolute DPWH NEP path to the local Volume II-B PDF,
and the HFEP OCR JSON reference to `HFEP_2.pdf` with the same page basis. API rows
have no asserted PDF reference and link to their source snapshot instead.

To serve the viewer with PDF byte-range support from the repo root:

```sh
python3 scripts/serve_pages.py --directory . --port 8000
```

Then open `http://127.0.0.1:8000/master_list/`.

## Data

| File | Use |
|---|---|
| [projects.jsonl.gz](data/projects.jsonl.gz) | Full records, source evidence, inferred locations, candidates, parent hierarchy, verified legislative district, and coordinate observations where available. |
| [projects.csv.gz](data/projects.csv.gz) | Spreadsheet export with one row per source observation, integer PHP and string PSGC codes. Multiple values use `\|`. Decompress before opening in a spreadsheet; import code columns as text. |
| [location_review.csv.gz](data/location_review.csv.gz) | Province-only, ambiguous, multiple-location, unresolved and flagged matches. |
| [applied_suggestions.jsonl.gz](data/applied_suggestions.jsonl.gz) | Derived layer applying decisive, conflict-free review suggestions (gate in `applied_suggestions_audit.json`). The master ledger is never mutated; consumers load this file independently. |
| [audit.json](data/audit.json) | Input/output hashes, dataset totals, coverage, source discrepancies and matching examples. |
| [REPORT.md](data/REPORT.md) | Readable build results. |
| [project_list.csv.gz](data/project_list.csv.gz) | Plain table export including category and canonical PDF file/page references; deterministic gzip. The build also writes an untracked local `project_list.csv` plain copy for direct spreadsheet use. |
| [viewer_manifest.json](data/viewer_manifest.json) | Viewer source/output hashes and reference coverage. |

Compressed outputs keep the complete evidence affordable to retain. Gzip headers
have fixed timestamps, so a rebuild from the same inputs is deterministic.

## Source boundaries

Ten datasets are retained independently:

- DPWH: NEP source-PDF operations ledger; NEP Transparency listing; House second
  and third reading Volume I-C detail. House detail includes GAS/S2O allocations;
  the source-PDF NEP ledger is operations only. These scopes differ.
- FMR, HFEP and NIA: NEP and House working-copy project/facility annexes. The
  annex extraction's original legislative-stage evidence is retained in the
  audit; `house_working_copy` does not authenticate a reading.

House foreign-assisted projects consume their funding children once. Non-additive
references are excluded; direct office, region and other allocation leaves are
retained as `allocation`, with `location.status = allocation_not_site`. NEP
office/region allocations retain their original kinds and receive the same
location treatment. These rows contribute to their source ledger but do not
assert a project site. All ten sums are checked against retained extraction
controls. The known NEP HFEP **PHP 140,000** gap between facility rows and the
printed grand total remains visible in the audit.

The older multi-year DPWH contract archive, archived extraction variants,
comparison/group payloads, and control totals are not extra project inputs.
Transparency details already reconcile to the retained listing and do not add a
separate observation population. Source PDFs are not reparsed. Coordinate-bearing
titles reuse the existing GPS inventory parser, with its source fragments,
orientation rules and issue flags.

## How location matching and evidence scoring work

1. Start from the processing release's conservative `title_clean` (including
   split-ñ cleanup), then normalize accents, case, punctuation and `Sta.`/`Sto.`
   for matching; preserve the original title and the readable-title rules.
   City word-order aliases come from the catalog name.
2. Search complete catalog names at word boundaries. Keep unqualified names in
   rivers, roads, schools and hospitals as candidates. A comma-delimited locality,
   explicit city/municipality introduction, or exact printed locality heading
   provides stronger evidence. No fuzzy spelling correction is applied.
3. Use an explicit province to distinguish repeated municipality names. A bare
   province name such as `Cebu` supplies province precision, without asserting
   Cebu City. Unresolvable homonyms and contradictory province context stay
   flagged. Several named places remain several locations.
4. Resolve an adjacent `Brgy.`/`Barangay` name globally when it is unique, or
   use an explicit town/province suffix to disambiguate it. An unmarked
   barangay requires a complete `barangay, municipality, province` chain whose
   PSGC parent links agree. Sitios and puroks are not PSGC entities.
5. Recognize compact locality suffixes such as `Claver Surigao del Norte` only
   when catalog names cover the complete comma component.
6. Follow actual `parent_code` links for region/province/town ancestry. HUCs do
   not acquire an administrative province just because a title names a nearby
   province. NCR sub-municipality codes stay distinct.

`location.status` is `name_matched`, `multiple_locations`, `province_only`,
`ambiguous`, `unresolved`, `registry_matched`, or `allocation_not_site`.
Name inference records `verification_status = provisional_name_match`;
adopting a unique retained bridge-registry chain records
`provisional_registry_match`. Allocation rows assert no site.
**Name matching does not verify the actual construction site.**
`needs_review = false` can describe an unflagged name match, a unique adopted
registry chain, or an allocation without a site assertion. It is not human
certification; inspect status, flags and score factors together.

`location.score` is an uncapped integer produced by the versioned
`location_evidence_v6.2` rules. It is the sum of documented evidence and penalty
factors, not a probability or normalized confidence value. Resolution depth,
explicit barangay syntax, valid parent chains, compact locality components, and
agreement with source headings or regions add points. Ambiguity, unmatched
barangays, and geographic contradictions subtract points. Scores may be
negative. Each record retains the exact `score_factors` used to reach its total.

No quality thresholds or score bands are asserted yet. The audit and report
publish the observed raw-score distribution so a reviewed sample can later
support normalization, calibration, and operational thresholds.

The complete rationale, work log, current state, and next steps are in
[Location evidence scoring and roadmap](docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).

The catalog is [PSGC2LEG's retained catalog](../PSGC2LEG/data/psgc_summary.json),
currently based on a community mirror marked provisional by that module. Codes
are ten-character strings. Neither historical nine-digit geocodes nor current
codes are converted by padding/slicing.

`source_region` and `implementing_office` remain source context. Office name
matches are separate weak candidates and never assigned as a project site.
`source_region_psgc_hint` records a recognizable region heading; disagreement
with inferred locations triggers review rather than changing the title match.
This matters for centrally implemented work and changing regional boundaries.

FMR records include the original coordinate text/observations and the retained
normalized geometry, its repair rules and review flags. Coordinates use
`[longitude, latitude]`. They can be incorrect even when parseable. Their
normalization layer's source-tree hash is checked before inclusion. This build
does not run spatial validation, create point estimates, assign centroids, or
mix older shapefile PSGC codes into the current catalog.

Other datasets retain any parsed title coordinate pairs and their issues in
`title_coordinate_evidence`. `coordinate_summary` provides a uniform view,
preferring the retained normalized layer for FMR. A parsed coordinate pair is
evidence to review, not a spatially verified site or PSGC match.

## Rebuild and verify

Run from the repository root; Python's standard library is sufficient:

```sh
python3 master_list/scripts/build_processing_dataset.py
python3 master_list/scripts/build_master_list.py
python3 master_list/scripts/build_master_list.py --check
python3 master_list/scripts/build_viewer.py
python3 master_list/scripts/build_viewer.py --check
python3 -m unittest discover -s master_list/tests -v
```

Rebuild the viewer after regenerating the master list. Optional browser checks
use the repo's existing Playwright/Chrome setup:

```sh
python3 master_list/tests/check_viewer_browser.py
```

`--check` rebuilds into temporary files and fails if inputs, code, records or
retained exports differ. Review the source audit and original page before
overriding a location. Start with unresolved records that have candidate names,
then ambiguous homonyms and source-region disagreements. Many chainage-only
road titles and irrigation-system names need an independent road/system
location reference to progress beyond title inference.

Example read:

```python
import gzip, json

with gzip.open('master_list/data/projects.jsonl.gz', 'rt') as stream:
    for line in stream:
        project = json.loads(line)
        if project['dataset'] == 'dpwh_nep_pdf':
            print(project['title'], project['location']['locations'])
```
