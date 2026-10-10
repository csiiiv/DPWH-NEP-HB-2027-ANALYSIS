# Native House data migration — change report

Date: **9 October 2026**. This report covers the **61 files** committed and
pushed to `origin/main` in
[308e17f — Replace retired House v5 data with audited native I-C detail](https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/commit/308e17fd3345ab529fc23e427c496a63358f0571).
It describes that committed migration, rather than later workspace edits.

## Result

Current House project titles and allocation comparisons now use the native
Volume I-C text layer. Native Volume I-B remains the full agency control
baseline. The OCR-era v5 candidate is historical and is excluded from current
webpage inputs and packaged downloads. Historical artifacts remain available
for provenance and reproduction.

## Before and after

| Area | Earlier behavior | Committed behavior |
|---|---|---|
| House project source | OCR-era v5 leaves and synthesized `v5:row:*` identifiers | Native I-C allocations with `hb:ic:*` identifiers and source-node references |
| Extraction coverage | Four v5 sections left a ₱5,596,312,000 operations shortfall | Native operations allocations reproduce ₱586,941,661,000; extraction gap is zero |
| Wrapped project titles | Some continuations were attached to the following amount row | Continuations belong to the preceding amount row, with constituent source text and page references retained |
| Full agency controls | Native I-B supplies PS/MOOE/CO totals | I-B retained, independently corroborated by I-C where scopes overlap |
| Homepage and House verification | I-B controls were visible; I-C detail was not prominent | Native I-C project counts, MOOE+CO scope, audit status and comparison navigation are visible |
| Current downloads | v5 candidate and OCR repair ledger | Native I-C project JSON and source/rollup audit |
| Documentation | Several current guides still described native I-C extraction as pending | Native I-C is documented as implemented; v5 limitations are marked historical |
| Unused historical statistics | Old House-only OCR reassessment figures copied into the current payload | Current API summary carries only the four source/API coverage fields used by the webpage |

## Extraction, repairs and audit

Added the native I-C extractor, additive rollup builder, shared printed-label
helpers and extraction regression tests. The retained source is DPWH detail on
PDF pages **9–942** of `HB_BUDGET/3 - HB 10858 VOL IC.pdf`; no House OCR input
is required for current extraction.

The extraction handles mirrored page margins, indentation and enumerator
drift, trailing amount tokens, amount/title baseline offsets, family
containers, repeated controls, title wraps and null glyphs. Seven family
containers are folded; rollup echoes are retained as 204 nested second
printed observations (plus 2 FAP funding-summary references). The p490
title is recovered from its continuation lines; three
other titles receive trailing-null cleanup. Funding dash/blank observations
remain explicit instead of becoming title text.

Title continuations attach to the preceding amount row, including across
pages and deeper-indented FAP references. Nodes retain their raw constituent
text, source-row IDs and PDF pages in `source.title_rows`. Regression evidence
covers the p561 titles, p800 school IDs and coordinate tails, and the title
spanning pp936–937. No allocation amount was adjusted or invented.

| Native I-C measure | Committed result |
|---|---:|
| Additive MOOE+CO total | ₱639,179,718,000 |
| All nodes | 21,289 |
| Terminal allocation leaves | 18,812 |
| Named-project leaves | 15,972 |
| FAP project totals | 29 |
| Positive FAP funding leaves | 49 |
| Zero/dash/blank funding observations | 9 |
| Office-node occurrences | 3,380 |
| Region-node occurrences | 1,471 |
| Balanced internal controls | 2,686 / 2,686 |
| Closing controls | 3 / 3 |
| Independent I-B cross-volume checks | 56 / 56 |
| Unexplained amount rows | 0 |
| Unexplained continuation rows | 0 |

Project counts use terminal project-kind nodes. Office and region counts are
repeated hierarchy positions, rather than distinct entities. This corrects
previously reported counts and avoids treating containers or aggregate
allocations as named projects.

The 56 independent I-B comparisons include 45 shared PAP/program controls,
operations/LFP/FAP and expense-class controls. Printed-label/path aliases
establish control identity; equal amounts alone do not. Personnel Services is
compared against the independently printed I-B PS column. Source PDFs, I-B
data and extraction code have SHA-256 provenance in the native audit.

See [Native I-C checks](hb_native_ic_rollup_checks.md),
[Native I-B checks](hb_native_ib_rollup_checks.md), and the
[machine audit](../data/hb_dpwh_native_ic_rollup_audit.json).

## Pipeline and retained data

Added `analysis/builders/house_native.py` to validate native detail and adapt
its operations allocations for the existing conservative candidate matcher.
FAP project totals are consumed once; their funding leaves are not additional
comparison projects. Office, region and other aggregate allocations preserve
their own record kinds and provenance.

Rebuilt the comparison payload, PAP controls, manifests, stage trace and
source-verification overview. The manifest records `house_version: native_ic_v2`, native inputs and generator dependency hashes. Validation
recomputes native controls and allocation records and rejects changed titles,
stale inputs, inconsistent accounting and provenance drift.

The operations comparison contains **16,270 allocations totaling
₱586,941,661,000**: 15,972 named-project records, 216 office allocations,
52 region allocations, 29 FAP totals and one other aggregate allocation.
Local allocations total ₱542,192,650,000; FAP totals add ₱44,749,011,000.
All **44 mapped non-FAP PAP controls** balance. One of the 45 NEP PAPs,
Replacement of Bridges — Temporary to Permanent, remains unmapped.

The stage trace now contains 18,436 candidate records. Matching remains
provisional: unique normalized title, region and PAP keys produce candidates;
duplicate keys remain ambiguous and fuzzy suggestions do not consume NEP
rows. No project pair has been manually certified.

The current comparison's API summary retains only `api_rows`, `api_php`,
`unpaired_source_rows` and `unpaired_source_php`. NEP/API source pairs and
coverage evidence remain relevant; historical House-only OCR reassessment
statistics are no longer copied into this current summary.

## Webpages and packaging

- **Homepage:** added a data-driven native I-C summary and a direct link to
  House/NEP allocation candidates, while retaining the I-B agency total.
- **House verification:** retained the I-B control hierarchy and added a native
  I-C detail section with project counts, total, internal checks and independent
  I-B checks. Native JSON, audit and method downloads are available.
- **House/NEP comparison:** uses native I-C titles and allocations, shows
  44/44 mapped controls and zero extraction gap, and links native downloads.
- **Stage comparison:** uses the rebuilt native candidate trace and identifies
  Volume I-C as the House allocation/title source.
- **Retained diagnostic HTML:** rebuilt comparison, verification, stage-trace
  and homepage outputs from their templates. NEP/API verification outputs
  share the updated template; the I-C section appears only for House.
- **Published package:** supplies native I-C JSON and audit instead of v5.
  Existing compatibility URLs continue routing into the React app.

The views distinguish the **₱654,102,015,000 I-B agency total including PS**,
the **₱639,179,718,000 I-C MOOE+CO total excluding PS**, and the
**₱586,941,661,000 operations comparison**. These totals have different scopes.
House control PDF references open I-B; project comparisons open I-C. DBM NEP
references continue opening the retained NEP Volume II-B document.

## Documentation

Updated the repository, analysis and frontend guides, native processing and
rollup reports, source-verification and data-structure guides, page assessment,
architecture decisions, and source-directory READMEs. Historical v5 repair and
reconciliation reports now explicitly direct current work to native I-C.
The historical repair report generator preserves that retired status when
someone explicitly reruns it. The earlier House-only NEP/API reassessment is
identified as historical rather than current native results.

## Validation and CI

The migration was checked with native extraction/rollup checks, Python
accounting and matching tests, viewer and budget-formatting tests, React unit
tests, a Vite production build, packaging checks and route/download tests.
The final cleanup refreshed provenance hashes and dependent outputs; packaging
passed again before the commit.

The browser suite passed at **390px and 1440px**, exercising all app routes,
native summaries and downloads, mobile layouts, source review, expense scopes,
sorting, navigation and real PDF rendering. It recorded **192 PDF range
responses**, **zero page errors** and **zero HTTP failures**.

Pages CI now sets up Python 3.12, installs PyMuPDF 1.28.2 and runs the native
I-C freshness check plus native I-C/I-B regression tests before the existing
accounting, frontend and packaging checks. The push is confirmed; deployment
completion was not independently verified as part of this change report.

To rebuild the native-dependent presentation:

```sh
python3 scripts/hb_native_rollup.py
python3 scripts/hb_native_ic_rollup.py
python3 scripts/hb_native_ic_rollup.py --check
python3 analysis/builders/build_current_pages.py
python3 analysis/builders/build_stage_trace.py
python3 scripts/validate_current_pages.py
npm test --prefix analysis/web
npm run build --prefix analysis/web
python3 scripts/build_pages.py
node --test analysis/tests/test_static_navigation.cjs
python3 scripts/check_react_pages.py
```

See [the analysis guide](../README.md) for source prerequisites and the full
validation workflow.

## Remaining limits and excluded work

- Arithmetic and extraction completeness do not certify individual project
  identities, additions/removals or amendment completeness.
- One NEP PAP remains unmapped; that alone does not establish removal.
- NEP retains 3,193 actionable source checks. Transparency NEP release and
  document coverage require separate review.
- Original cross-page hyphenation is retained. Recovered/glyph-cleaned titles
  remain flagged for downstream spot-checks.
- A separate FAP section in the React PAP table remains deferred; the detailed
  House/NEP view exposes local/FAP totals.
- The third-reading source directory and extra NEP Volume 1, 2A and 3 PDFs were
  left untracked and were not promoted into this committed baseline.

## Deployment follow-up — 9 October 2026

The first Pages workflow for `308e17f`
[failed during browser navigation checks](https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/actions/runs/37884418362).
Its source checks and package build passed, but the test could observe the
previous workspace before React committed a hash-route change. Deployment was
skipped, so the hosted comparison manifest still reported `house_version: v5`.
The local Vite server already served `native_ic_v2`.

The browser test now uses retrying assertions for the active navigation tab and
the requested source heading before inspecting tree rows. This preserves the
navigation checks without depending on an arbitrary delay. The corrected
suite passed locally at 390px and 1440px with 192 PDF range responses, no page
errors and no HTTP failures. Deployment completion must be checked against
the follow-up workflow and the live comparison manifest.

## Complete committed file inventory

The following inventory comes from `git show 308e17f --name-only`. Links point
to the corresponding repository files; generated datasets and HTML are included.

### Extraction, builders and validation (10 files)

- [analysis/builders/build_current_pages.py](../../analysis/builders/build_current_pages.py)
- [analysis/builders/build_source_verification.py](../../analysis/builders/build_source_verification.py)
- [analysis/builders/build_stage_trace.py](../../analysis/builders/build_stage_trace.py)
- [analysis/builders/house_native.py](../../analysis/builders/house_native.py)
- [analysis/builders/repair_hb_known_defects.py](../../analysis/builders/repair_hb_known_defects.py)
- [scripts/build_pages.py](../../scripts/build_pages.py)
- [scripts/hb_native_ic_extract.py](../../scripts/hb_native_ic_extract.py)
- [scripts/hb_native_ic_rollup.py](../../scripts/hb_native_ic_rollup.py)
- [scripts/hb_native_labels.py](../../scripts/hb_native_labels.py)
- [scripts/validate_current_pages.py](../../scripts/validate_current_pages.py)

### Retained data and manifests (8 files)

- [analysis/data/comparison_manifest.json](../../analysis/data/comparison_manifest.json)
- [analysis/data/current_pap_controls.json](../../analysis/data/current_pap_controls.json)
- [analysis/data/hb_dpwh_native_ic_projects.json](../../analysis/data/hb_dpwh_native_ic_projects.json)
- [analysis/data/hb_dpwh_native_ic_rollup_audit.json](../../analysis/data/hb_dpwh_native_ic_rollup_audit.json)
- [analysis/data/source_comparison_2027.json](../../analysis/data/source_comparison_2027.json)
- [analysis/data/source_verification_manifest.json](../../analysis/data/source_verification_manifest.json)
- [analysis/data/source_verification_overview.json](../../analysis/data/source_verification_overview.json)
- [analysis/data/stage_trace_2027.json](../../analysis/data/stage_trace_2027.json)

### Webpages, frontend and generated HTML (15 files)

- [analysis/viewers/current_dashboard.template.html](../../analysis/viewers/current_dashboard.template.html)
- [analysis/viewers/dpwh_nep_api_verification.html](../../analysis/viewers/dpwh_nep_api_verification.html)
- [analysis/viewers/hb_native_verification.html](../../analysis/viewers/hb_native_verification.html)
- [analysis/viewers/nep_source_verification.html](../../analysis/viewers/nep_source_verification.html)
- [analysis/viewers/source_comparison_2027.html](../../analysis/viewers/source_comparison_2027.html)
- [analysis/viewers/source_verification.js](../../analysis/viewers/source_verification.js)
- [analysis/viewers/source_verification.template.html](../../analysis/viewers/source_verification.template.html)
- [analysis/viewers/stage_trace.template.html](../../analysis/viewers/stage_trace.template.html)
- [analysis/viewers/stage_trace_2027.html](../../analysis/viewers/stage_trace_2027.html)
- [analysis/web/src/Comparison.jsx](../../analysis/web/src/Comparison.jsx)
- [analysis/web/src/main.jsx](../../analysis/web/src/main.jsx)
- [analysis/web/src/workspaces/houseComparison.js](../../analysis/web/src/workspaces/houseComparison.js)
- [analysis/web/src/workspaces/verification.js](../../analysis/web/src/workspaces/verification.js)
- [site/index.html](../../site/index.html)
- [site/index.template.html](../../site/index.template.html)

### Documentation (21 files)

- [README.md](../../README.md)
- [analysis/README.md](../../analysis/README.md)
- [analysis/archive/README.md](../../analysis/archive/README.md)
- [analysis/docs/adr/0001-native-text-layer-house-controls.md](../../analysis/docs/adr/0001-native-text-layer-house-controls.md)
- [analysis/docs/adr/0002-separate-controls-and-project-titles.md](../../analysis/docs/adr/0002-separate-controls-and-project-titles.md)
- [analysis/docs/adr/0007-verify-source-hierarchies-before-comparison.md](../../analysis/docs/adr/0007-verify-source-hierarchies-before-comparison.md)
- [analysis/docs/adr/README.md](../../analysis/docs/adr/README.md)
- [analysis/docs/codebase_reassessment.md](../../analysis/docs/codebase_reassessment.md)
- [analysis/docs/data_structure_and_crosscheck_design.md](../../analysis/docs/data_structure_and_crosscheck_design.md)
- [analysis/docs/hb_known_defect_repairs.md](../../analysis/docs/hb_known_defect_repairs.md)
- [analysis/docs/hb_native_full_processing.md](../../analysis/docs/hb_native_full_processing.md)
- [analysis/docs/hb_native_ib_rollup_checks.md](../../analysis/docs/hb_native_ib_rollup_checks.md)
- [analysis/docs/hb_native_ic_rollup_checks.md](../../analysis/docs/hb_native_ic_rollup_checks.md)
- [analysis/docs/hb_native_v5_reconciliation.md](../../analysis/docs/hb_native_v5_reconciliation.md)
- [analysis/docs/nep_2027_api_reconciliation.md](../../analysis/docs/nep_2027_api_reconciliation.md)
- [analysis/docs/pages_update_assessment.md](../../analysis/docs/pages_update_assessment.md)
- [analysis/docs/react_vite_migration.md](../../analysis/docs/react_vite_migration.md)
- [analysis/docs/source_hierarchy_verification.md](../../analysis/docs/source_hierarchy_verification.md)
- [analysis/web/README.md](../../analysis/web/README.md)
- [dbm-nep-data/README.md](../../dbm-nep-data/README.md)
- [dpwh-transparency-nep-data/README.md](../../dpwh-transparency-nep-data/README.md)

### Tests and CI (7 files)

- [.github/workflows/pages.yml](../../.github/workflows/pages.yml)
- [analysis/tests/test_current_pages.py](../../analysis/tests/test_current_pages.py)
- [analysis/tests/test_source_verification.py](../../analysis/tests/test_source_verification.py)
- [analysis/tests/test_source_verification_viewer.cjs](../../analysis/tests/test_source_verification_viewer.cjs)
- [analysis/tests/test_static_navigation.cjs](../../analysis/tests/test_static_navigation.cjs)
- [scripts/check_react_pages.py](../../scripts/check_react_pages.py)
- [scripts/tests/test_hb_native_ic_rollup.py](../../scripts/tests/test_hb_native_ic_rollup.py)
