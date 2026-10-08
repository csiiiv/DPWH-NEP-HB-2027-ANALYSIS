# analysis/ — current FY2027 DPWH workbench

Updated: **9 October 2026**. Amounts in generated datasets are integer PHP unless stated otherwise.

Start with [independent source verification](docs/source_hierarchy_verification.md)
and the [static overview](../site/index.html). All three sources retain
`comparison_ready: false`: arithmetic passes, while NEP row evidence, Native I-C
project coverage, and Transparency NEP release/document coverage remain open.

## Layout

```text
analysis/
  README.md · paths.py
  builders/       Current source, evidence, candidate and stage-trace builders
  data/           Retained current datasets, audits, manifests and required inputs
    source_review_evidence/   Current NEP review crops
  viewers/        Three verification viewers, detailed NEP, candidates and stage trace
  docs/           Current methods, source findings and architecture decisions
  tests/          Current workflow checks
  archive/
    README.md · manifest.json
    builders/     Superseded parsers, audits and exploratory matchers
    data/         Earlier extracts, hierarchy outputs and local page-map caches
    docs/         Historical work log, reports and exploratory assessments
    viewers/      OCR-era House trees, old crosscheck and taxonomy viewers
    tests/        Tests for archived builders/viewers
    evidence/     Historical PDF spot-check images
    joebert_data/ External Ghostscript candidates
```

The [archive index](archive/README.md) explains the boundary and remaining rebuild
dependencies. [manifest.json](archive/manifest.json) records the 104 moved files,
their original paths and hashes. Historical JSON provenance remains unchanged.

## Retained sources and viewers

| Source | Current data and verification | Scope |
|---|---|---|
| House Native I-B | [Additive tree](data/hb_dpwh_native_rollup.json) · [viewer](viewers/hb_native_verification.html) · [audit](docs/hb_native_ib_rollup_checks.md) | ₱654,102,015,000; 660 direct/recursive checks across four expenditure columns; named local projects require I-C |
| NEP PDF | [Canonical tree](data/nep_2027_tree.json) · [viewer](viewers/nep_source_verification.html) · [method](viewers/nep_2027_tree.md) | ₱642,612,015,000; 2,552 additive checks; 3,193 actionable source checks pending |
| DPWH Transparency NEP | [API tree](data/dpwh_transparency_nep_tree.json) · [viewer](viewers/dpwh_nep_api_verification.html) | 11,372 projects; ₱445,378,063,000; 2,662 derived grouping checks |

[Detailed NEP](viewers/nep_2027_tree.html), [candidate comparison](viewers/source_comparison_2027.html),
and [candidate stage trace](viewers/stage_trace_2027.html) remain active for inspection.
Candidate matching is provisional and does not certify policy changes. House v5,
its repair ledger, the earlier source/API reconciliation, and the official
compilation input remain here because these workflows still consume them.

## Rebuild and check

From the repository root, refresh the independent verification pages only:

```sh
python analysis/builders/build_source_verification.py
python -m unittest discover -s analysis/tests -p test_source_verification.py -v
node --test analysis/tests/test_source_verification_viewer.cjs
```

Refresh candidate pages and the stage trace after relevant source changes:

```sh
python analysis/builders/build_current_pages.py
python analysis/builders/build_stage_trace.py
python scripts/validate_current_pages.py
python -m unittest discover -s analysis/tests -p test_current_pages.py -v
python -m unittest discover -s analysis/tests -p test_stage_trace.py -v
node --test analysis/tests/test_budget_display.cjs
python scripts/build_pages.py
python -m http.server 8000 --directory _site
```

The package serves six retained viewers. Archived pages and outputs are available
in the checkout and repository archive rather than the current published viewer list.

Source rebuilds use `build_nep_tree.py`, `build_dpwh_nep_api_tree.py`, and the
native House scripts under `scripts/`. NEP extraction needs the retained PDF,
PAP and operating-unit OCR trees, and table-structure page geometry. Regenerate
source crops with `build_source_review_evidence.py` before rebuilding dependent
pages. See [source rebuild order](docs/source_hierarchy_verification.md) and
[local input filenames](../README.md).

The current full Python suite may require external NEP inputs:

```sh
python -m unittest discover -s analysis/tests -p 'test_*.py' -v
```

Archived House checks run separately; see [archive commands](archive/README.md).
Current imports use `paths.py`; active repair imports of archived helpers are
explicit, and retired builders are not added to the current import search path.

## Documentation

- [Source-verification workflow](docs/source_hierarchy_verification.md)
- [Dataset structure and comparison gate](docs/data_structure_and_crosscheck_design.md)
- [Implemented UI and packaging](docs/pages_update_assessment.md)
- [Native I-B processing](docs/hb_native_full_processing.md) and [rollup checks](docs/hb_native_ib_rollup_checks.md)
- [Native/v5 reconciliation](docs/hb_native_v5_reconciliation.md) and [v5 repair ledger](docs/hb_known_defect_repairs.md)
- [NEP source operations audit](docs/nep_2027_source_audit.md) and [earlier API reconciliation](docs/nep_2027_api_reconciliation.md)
- [Architecture decisions](docs/adr/README.md)
- [Archive index and historical work log](archive/README.md)

The overview and all six retained static viewers link to both the repository
README and the analysis workbench README. Hosted links open rendered Markdown
on GitHub; local links follow the checkout layout. Packaging checks that both
README links are present on every published page.

See [the current codebase reassessment](docs/codebase_reassessment.md) for implemented capabilities, dependency flow, concrete gaps, and verification priorities.
