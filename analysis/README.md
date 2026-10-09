# FY2027 DPWH analysis workbench

Updated: **9 October 2026**. Generated monetary values are integer PHP unless
stated otherwise.

[Open the SPA](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/)
· [Repository guide](../README.md)
· [Frontend commands and routes](web/README.md)

The current presentation is a React + Vite SPA with seven workspaces. Python
builders retain responsibility for extraction, repairs, audits, and candidate
matching. All three sources retain `comparison_ready: false`: arithmetic
passes, while DBM row evidence, House project identity and amendment completeness, and
Transparency release/document coverage remain open.

## Layout

```text
analysis/
  README.md · paths.py
  web/            React shell, hash routes, comparison, PDF viewer, scoped review controllers
    src/          Frontend source and unit tests
    dist/         Generated Vite build (ignored)
  builders/       Source, evidence, candidate, and stage-trace builders
  data/           Retained datasets, audits, manifests, and required inputs
    source_review_evidence/   Retained audit crops; absent from migrated tree UI
  viewers/        Retained templates/scripts/pages used by builders and diagnostics
  docs/           Methods, source findings, migration plan, and architecture decisions
  tests/          Source, accounting, legacy controller, and packaging checks
  archive/        Superseded builders, data, docs, viewers, tests, and external candidates
```

The [archive manifest](archive/manifest.json) records 104 relocations, original
paths, and hashes. Two caches remain ignored local files. Historical provenance
is preserved; two archived helpers still support active House repairs. See the
[archive guide](archive/README.md).

## Current workspaces

| Route | Workspace |
|---|---|
| `#home` | Comparison hero and independent source status |
| `#compare` | Sortable PAP/project/listing-gap comparison and source PDF pane |
| `#house` | House GAB I-B hierarchy, rollups, and embedded I-B PDF |
| `#nep` | DBM NEP hierarchy, expenditure classes, source review, and embedded II-B PDF |
| `#transparency` | DPWH Transparency NEP snapshot hierarchy |
| `#house-nep` | Printed budgets, local/FAP program controls, House extraction gaps, and candidates |
| `#nep-detail` | Detailed expense/program tree and native-text evidence |

The shared header links both READMEs. Hash routes support refresh and history;
former viewer URLs redirect into the corresponding route when packaged.
`#nep?view=review` opens the source queue. Verification routes accept `node`
for a recorded entity ID; `section` preserves former in-page anchors.

Tree selections, entity paths, and source-review flags update the right-side PDF.
PDF reference buttons stay inside the app. Details and review candidates remain
below the tree; narrow screens stack the PDF beneath the active panel. Crop
blocks, links, and markers have been removed from House GAB and DBM NEP views.
House tree references use **I-B**, while House project references use **I-C**.
The Transparency tree has no established PDF mapping.

## Retained baselines and open work

| Source | Artifacts | Coverage and limits |
|---|---|---|
| House GAB, native I-B | [Additive tree](data/hb_dpwh_native_rollup.json) · [rollup audit](docs/hb_native_ib_rollup_checks.md) | ₱654,102,015,000; 660 direct/recursive checks across PS/MOOE/CO/Total; local allocations are at office grain |
| DBM NEP | [Canonical tree](data/nep_2027_tree.json) · [validation](viewers/nep_2027_tree.md) | ₱642,612,015,000; 2,552 additive checks; 3,193 actionable source checks pending |
| DPWH Transparency NEP | [API tree](data/dpwh_transparency_nep_tree.json) · [audit](data/dpwh_transparency_nep_tree_validation.json) | 11,372 projects; ₱445,378,063,000; 2,662 derived grouping checks; release coverage remains open |
| House project detail and candidates | [Native I-C](data/hb_dpwh_native_ic_projects.json) · [audit](docs/hb_native_ic_rollup_checks.md) | MOOE+CO ₱639,179,718,000; 2,477 internal checks and 56 I-B checks pass. Operations comparison: 16,270 allocations, ₱586,941,661,000, 44/44 mapped local PAPs balance. v5 is historical. |

The React PAP totals table contains **45 non-FAP controls**. A separate FAP
section is deferred; the retained `#house-nep` view already shows local/FAP
program totals. DBM has 25 FAP projects totaling ₱117.749011B; House has 29
totaling ₱44.749011B. Transparency FAP coverage is unknown, not a verified zero.
See [the deferred presentation gap](docs/react_vite_migration.md#deferred-fap-coverage-in-the-react-pap-table).

Matching remains provisional. Unmatched rows do not establish insertions,
removals, or policy changes. Expense columns, printed controls, project extracts,
and saved-listing coverage represent different scopes.

## Run and package the app

From the repository root:

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

Use Vite's printed URL. One server serves the app, retained data, and PDFs.
For a production package with all assets and compatibility routes:

```sh
npm run build --prefix analysis/web
python scripts/build_pages.py
python scripts/serve_pages.py --port 8000
```

Open `http://127.0.0.1:8000/`. `analysis/web/dist/` and `_site/` are generated,
git-ignored outputs. Packaging validates retained inputs and copies source data;
it does not rerun OCR or matching. The exact retained DBM PDF is checked by hash.
`--static-only` packages standalone viewers for diagnostics. See
[web/README.md](web/README.md) for frontend tests and browser validation.

## Rebuild source-dependent outputs

For verification presentation changes only:

```sh
python analysis/builders/build_source_verification.py
python scripts/validate_current_pages.py
```

After changing candidate/source inputs, rebuild dependent pages and manifests:

```sh
python analysis/builders/build_current_pages.py
python analysis/builders/build_stage_trace.py
python scripts/validate_current_pages.py
```

These commands generate retained inputs used by SPA packaging. Frontend-only
changes need a Vite rebuild, not source extraction. Verification packaging
extracts its route payloads from the validated retained pages.

House native rebuild order is `python3 scripts/hb_native_rollup.py`, then
`python3 scripts/hb_native_ic_rollup.py`, followed by the dependent builders
above. Native extraction needs the retained PDFs and PyMuPDF; no House OCR
input is required. Third-reading PDFs remain a separate unprocessed source set.

Source extraction uses `build_nep_tree.py`, `build_dpwh_nep_api_tree.py`, and
native House scripts under `scripts/`. External NEP OCR trees and page geometry
are required for extraction; repeating the Transparency coverage audit requires
local listing/detail responses. Crop regeneration remains part of evidence
provenance, even though crops are no longer shown in the migrated trees.
See [source rebuild order](docs/source_hierarchy_verification.md) and
[required NEP inputs](../README.md#local-inputs-and-rebuilding).

```sh
python -m unittest discover -s analysis/tests -p 'test_*.py' -v
node --test analysis/tests/test_budget_display.cjs analysis/tests/test_source_verification_viewer.cjs
```

Some extraction tests require external source inputs. Archived checks run
separately; see [archive commands](archive/README.md).

## Documentation

- [Frontend and PDF migration](docs/react_vite_migration.md)
- [Codebase reassessment](docs/codebase_reassessment.md)
- [Source-verification workflow](docs/source_hierarchy_verification.md)
- [Dataset structure and comparison gate](docs/data_structure_and_crosscheck_design.md)
- [Native I-B processing](docs/hb_native_full_processing.md) and [rollup checks](docs/hb_native_ib_rollup_checks.md)
- [Native I-C detail and title-ownership checks](docs/hb_native_ic_rollup_checks.md)
- [Native/v5 reconciliation](docs/hb_native_v5_reconciliation.md)
- [DBM source audit](docs/nep_2027_source_audit.md) and [API reconciliation](docs/nep_2027_api_reconciliation.md)
- [Architecture decisions](docs/adr/README.md)
- [Archive and historical work](archive/README.md)
