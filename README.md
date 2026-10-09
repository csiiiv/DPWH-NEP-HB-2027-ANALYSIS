# FY2027 DPWH NEP and House Budget Analysis

Scripts, source audits, extracted datasets, and offline dashboards for comparing
FY2027 DPWH National Expenditure Program allocations, House budget controls,
and the saved BetterGov API project snapshot.

**Current phase:** [verify the independent source hierarchies first](analysis/docs/source_hierarchy_verification.md).
The [static overview](site/index.html) leads with the sortable stage comparison,
followed by Native House I-B, NEP source, and the retained DPWH Transparency NEP
API tree. Source certification remains open; comparison results are provisional.
Additional retained viewers and historical material are indexed in the workbench README.

Start with [analysis/README.md](analysis/README.md) (folder map + settled baselines),
then [the verification workflow](analysis/docs/source_hierarchy_verification.md),
[ADRs](analysis/docs/adr/README.md),
[native House reconciliation](analysis/docs/hb_native_v5_reconciliation.md),
[NEP validation](analysis/viewers/nep_2027_tree.md), and
[Native I-B rollup audit](analysis/docs/hb_native_ib_rollup_checks.md).
Open [NEP source verification](analysis/viewers/nep_source_verification.html),
[House Native I-B verification](analysis/viewers/hb_native_verification.html), or
[DPWH Transparency NEP verification](analysis/viewers/dpwh_nep_api_verification.html) locally in a browser.

## Repository layout

```
├── analysis/           Workbench (builders · viewers · data · docs · tests · archive)
├── dpwh-transparency-nep-data/           DPWH Transparency NEP snapshot + fetch scripts
├── HB_BUDGET/          House PDFs and OCR markdown inputs
├── scripts/            Packaging, validation, native House extractor
├── site/               Dashboard index (source; packaged into _site/)
└── reference/          Pinned ph-budget-analysis submodule
```

Inside `analysis/`, current code and datasets are split by role — see
[analysis/README.md](analysis/README.md). Superseded extracts live in
[analysis/archive/](analysis/archive/README.md); third-party Ghostscript dumps in
[the exploratory Ghostscript archive](analysis/archive/joebert_data/README.md).

## Latest usable datasets

Status as of **9 October 2026**. Monetary values in the generated datasets are
integer Philippine pesos after converting API values from thousands of pesos. The complete NEP baseline covers **new appropriations**;
automatic appropriations are excluded.

| Purpose | Recommended artifact | Coverage and limits |
|---|---|---|
| NEP hierarchy and program/PAP controls | [Canonical NEP tree](analysis/data/nep_2027_tree.json) and [validation report](analysis/viewers/nep_2027_tree.md) | ₱642,612,015,000; 2,552 additive rollups balance exactly. Independent evidence review remains open. |
| NEP totals without counting parents and children twice | [Atomic budget units](analysis/data/nep_2027_budget_units.json) | 14,190 units reproduce the root. GOP/loan units partition project totals; they are not separate projects. |
| NEP provenance, repairs, and evidence | [Validation and repair ledger](analysis/data/nep_2027_tree_validation.json), [native amount audit](analysis/data/nep_2027_native_amount_audit.json), and [review queue](analysis/data/nep_2027_native_amount_review.json) | 54 historical extraction repairs; 3,193 actionable source checks after the per-item column reassessment, plus two informational derived groups. These are pending checks, not confirmed errors. Arithmetic balance alone does not certify OCR amounts. |
| NEP source projects and API coverage | [Source projects](analysis/data/nep_2027_source_projects.json), [source audit](analysis/docs/nep_2027_source_audit.md), and [API reconciliation](analysis/docs/nep_2027_api_reconciliation.md) | Earlier coverage reconciliation; use alongside the canonical tree as a reference. Per-row PDF verification remains open before certified comparisons. |
| House **control** baseline (native text layer) | [Additive Native I-B tree](analysis/data/hb_dpwh_native_rollup.json), [verification viewer](analysis/viewers/hb_native_verification.html), [audit](analysis/docs/hb_native_ib_rollup_checks.md) | 660/660 internal nodes balance directly and recursively across all four expenditure columns; 1,746 leaves reproduce ₱654.102015B. Office-granularity; Native I-C is still needed for named local projects. |
| DPWH Transparency NEP API hierarchy | [API tree](analysis/data/dpwh_transparency_nep_tree.json), [verification viewer](analysis/viewers/dpwh_nep_api_verification.html), [audit](analysis/data/dpwh_transparency_nep_tree_validation.json) | 11,372 FY2027 projects; ₱445,378,063,000. All 2,662 derived grouping checks pass; release/document coverage still needs confirmation. |
| House project/allocation extract | [House v5](analysis/data/hb_dpwh_leaves_corrected_v5.json) and [repair report](analysis/docs/hb_known_defect_repairs.md) | Best current **project-title** candidate: 16,148 positive allocations, ₱581,345,349,000; 38/42 local PAP controls balance. Pending native I-C re-extract for the four damaged sections. |
| Saved BetterGov API snapshot | [FY2027 combined JSON](dpwh-transparency-nep-data/json/fy2027-combined.json) | 11,372 project rows, ₱445,378,063,000. A separate, incomplete coverage baseline; not the full NEP budget. |

House Volume I-B prints **₱654,102,015,000** new appropriations, including
**₱586,941,661,000** operations. The native I-B tree reproduces that total
additively. House v5’s net **₱5,596,312,000** shortfall against operations is
**OCR-era extraction damage** on four Convergence sections (Access Roads,
Multi-Purpose, Coastal Roads, Water Supply family) — both volumes print
balancing controls; see the native reconciliation.

The 29 House FAP projects total ₱44,749,011,000 and their funding splits balance.
GAS/S2O and personnel-services allocations are outside the v5 project table.
Older v3/v4/v4b extracts, hierarchy totals, and matcher outputs remain historical.
Unmatched rows alone do not establish insertions, removals, or changes in policy.

## Primary source documents

The budget PDFs are the primary evidence. OCR trees, extracted JSONs, API records,
and third-party workbooks are derived or supplementary sources.

### Executive proposal: DBM FY2027 NEP

The [official DBM FY2027 NEP index](https://www.dbm.gov.ph/index.php/2027/national-expenditure-program-fy-2027)
links the full volumes and department extracts:

- [NEP Volume II-B publication page](https://www.dbm.gov.ph/index.php?view=article&id=4139:national-expenditure-program-volume-ii-b-fy-2027&catid=446)
  and [full Volume II-B PDF](https://www.dbm.gov.ph/wp-content/uploads/NEP2027/NEP-2027-VOLUME-2B.pdf).
- [DPWH department summary PDF](https://www.dbm.gov.ph/wp-content/uploads/NEP2027/DPWH/DPWH.pdf).
- [Details of DPWH programs/projects PDF](https://www.dbm.gov.ph/wp-content/uploads/NEP2027/DPWH/Details-of-DPWH.pdf).

The actual retained input used here is the 722-page
`pdfs/NEP-2027-VOLUME-2B_OCR.pdf`, together with its PAP and operating-unit OCR
trees. The canonical JSON records the input paths and SHA-256 hashes; the local
OCR copy has not been asserted byte-identical to the downloadable DBM PDF.
Its SHA-256 is `bfc8282de8e3603f347f82aa2be34c25a38147e30aa34c12b11413766b7e7523`.
References use **one-based PDF file pages**: page 8 for new appropriations,
pages 13–28 for personnel-services rows and controls, and pages 115–690 for PAP details.
The separate DPWH detail extract has different pagination.

### House proposal: HB 10858

The [House of Representatives CSO/budget-document portal](https://www.congress.gov.ph/cso)
is the official reference entry point. The supplied local copies used for this
analysis are:

| Local PDF | Role in this analysis |
|---|---|
| `HB_BUDGET/2 - HB 10858 VOL IB.pdf` | DPWH summary controls; PDF page 9 prints the ₱654.102015B new-appropriations total. |
| `HB_BUDGET/3 - HB 10858 VOL IC.pdf` | 942-page DPWH allocation details; primary source for v5 repairs and PAP checks. |

Volume I-A and Volume II are also present locally, but do not determine the v5
DPWH allocation table. The [v5 JSON provenance](analysis/data/hb_dpwh_leaves_corrected_v5.json)
records the Volume I-C filename and SHA-256; repaired rows carry PDF page/source
identifiers. The [repair ledger](analysis/data/hb_known_defect_repairs.json) records
section replacements and unresolved control differences.

These House PDFs were supplied locally and are included in Git with the retained
House OCR outputs. An exact
public download URL for those copies has not been verified, so the portal link
is a discovery link, not a verified direct PDF download. The
[House second-reading announcement](https://www.congress.gov.ph/media/press-releases/10301)
provides legislative context; it does not establish that the retained PDFs
include every plenary amendment. Do not treat these copies as an enacted GAA.

## Supplementary and reference sources

- **BetterGov NEP API:** the [FY2027 project-list endpoint](https://api.dpwh.bettergov.ph/nep/projects?fiscalYear=2027&page=1&limit=100)
  is used by the [pagination script](dpwh-transparency-nep-data/fetch_nep_projects_paginated.py);
  [project details](https://api.dpwh.bettergov.ph/nep/projects/2027DPWH-Proposal-00001)
  are fetched by the [detail script](dpwh-transparency-nep-data/fetch_nep_projects_details.py).
  Comparisons use the committed snapshot, not a live API query. Its omissions
  are documented in the NEP/API reconciliation above.
- **Philippine budget analysis:** [repository](https://github.com/ajamontesa/ph-budget-analysis)
  and [reference site](https://ajamontesa.github.io/ph-budget-analysis/index.html).
  The retained checkout is pinned to
  [558a56311dc510b513af2b18b13a49d55d501c02](https://github.com/ajamontesa/ph-budget-analysis/tree/558a56311dc510b513af2b18b13a49d55d501c02).
  Reference workbooks include [Compiled DPWH](https://github.com/ajamontesa/ph-budget-analysis/blob/558a56311dc510b513af2b18b13a49d55d501c02/data/Compiled_-_DPWH.xlsx)
  and [Compiled PAPs](https://github.com/ajamontesa/ph-budget-analysis/blob/558a56311dc510b513af2b18b13a49d55d501c02/data/Compiled_-_PAPs.xlsx).
  Contextual reports: [DPWH](https://ajamontesa.github.io/ph-budget-analysis/dpwh.html),
  [FY2027 NEP assessment](https://ajamontesa.github.io/ph-budget-analysis/nep-2027-assessment.html),
  and [FY2027 House assessment](https://ajamontesa.github.io/ph-budget-analysis/hgab-2027-assessment.html).
  The retained House assessment identifies a 6 October committee-report basis.
  Check budget stage, new/automatic scope, and peso/thousand-peso units before
  comparing reference figures. These materials do not determine the canonical
  NEP tree or certify House extraction coverage.
- **DPWH transparency API scraper:** [repository](https://github.com/csiiiv/dpwh-transparency-data-api-scraper),
  retained at [de96ab393a069792964b086a7d155e7801909c2a](https://github.com/csiiiv/dpwh-transparency-data-api-scraper/tree/de96ab393a069792964b086a7d155e7801909c2a).
  This is a supplementary extraction reference for the DPWH transparency API;
  the BetterGov NEP snapshot is fetched by this repository's `dpwh-transparency-nep-data` scripts.

The Philippine budget analysis reference is a pinned Git submodule. Initialize it
with `git submodule update --init reference/ph-budget-analysis` after cloning.
The DPWH scraper checkout and NEP source PDF/OCR inputs remain separate local
inputs. Public reference pages and API contents can change; retained
commits, snapshots, and provenance identify the material actually used.

## Shared dashboards

[Open the dashboard index](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/)
for three independent source-verification viewers. The
[candidate stage trace](analysis/viewers/stage_trace_2027.html)
(DPWH Transparency NEP → Official NEP → House),
[earlier House ↔ NEP comparison](analysis/viewers/source_comparison_2027.html),
and [candidate stage trace](analysis/viewers/stage_trace_2027.html) remain available for inspection.
OCR-era House viewers, old crosschecks, exploratory scripts, and historical
outputs now live in [the archive](analysis/archive/README.md), with a relocation manifest.
The local package serves one SPA with seven workspaces and redirects six
historical viewer URLs into it. The Pages workflow publishes this SPA package.
`.github/workflows/pages.yml` builds and publishes the committed viewers on
relevant pushes to `main` or manual dispatch. Pull requests validate the static
build without deployment. This does not rerun source-PDF extraction.

To preview the same deployment locally:

```sh
npm ci --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py
python scripts/serve_pages.py --port 8000
```

Open `http://localhost:8000`. Hosted viewers include the shared verification styles
and all 3,193 actionable NEP source crops. Tree paths navigate to the selected
entity; review queues can be scoped by branch and expense class. Hosted viewers preserve NEP PDF page references
and provide working House PDF links. Report links open rendered Markdown on GitHub; viewer-specific caveats distinguish the current NEP baseline from
historical comparisons.

Rebuild the stage trace after regenerating upstream comparison inputs:

```sh
python analysis/builders/build_stage_trace.py
python -m unittest discover -s analysis/tests -p test_stage_trace.py -v
```

The earlier static candidate comparison uses House v5 and the canonical NEP tree.
It maps the 42 audited House PAP controls to NEP source IDs, retains three NEP
PAPs without a mapped House control, and separates printed budget differences
from extracted regional totals and project candidates. The matcher treats
unique normalized titles within region/PAP/zone as candidate pairs; duplicate
keys and fuzzy suggestions remain unresolved. No pair is manually certified.
Search covers all embedded records with pagination rather than a capped subset.
Displayed amounts use three decimals with B (billion), M (million), and K
(thousands); downloads retain exact pesos. Click any table header to sort.
Project sorting covers the full filtered result before pagination. Positive
deltas are green, negative deltas red, and zero neutral.

To regenerate the verification pages from retained artifacts (no matching or PDF extraction):

```sh
python analysis/builders/build_source_verification.py
python -m unittest discover -s analysis/tests -p test_source_verification.py -v
node --test analysis/tests/test_source_verification_viewer.cjs
python scripts/build_pages.py
```

The verification builder records source, evidence, and presentation hashes in
[the verification manifest](analysis/data/source_verification_manifest.json).
The earlier candidate builder separately records its inputs and matching method in
[the comparison manifest](analysis/data/comparison_manifest.json). Packaging rejects
stale inputs, mismatched embedded data, and invalid accounting. House summary
and detail PDFs are packaged for working page citations; the NEP PDF remains
local. The archived viewers use House v4b/v3 or OCR-era v5 and the saved API; their
accounting and insertion/removal labels are superseded by retained source controls and candidate pages.

The NEP new-appropriations tree totals ₱642,612,015,000 and balances all 2,552
additive branch checks. Arithmetic balance does not independently certify each
OCR amount; unresolved PDF-text review candidates are retained with the audit.
House candidate datasets and historical matcher results have the limitations
documented in the reports; unmatched rows alone do not establish budget changes.

## Local inputs and rebuilding

This repository includes analysis artifacts, evidence images, the retained House
PDFs/OCR outputs under `HB_BUDGET/`, and `dpwh-transparency-nep-data/json/fy2027-combined.json`.
The reference repository is pinned as a submodule. The DPWH scraper checkout,
raw API downloads, and page-mapping caches are excluded by `.gitignore`;
the NEP PDF/OCR build inputs must be provided separately.
Existing generated results can be inspected without those local inputs.

To rebuild the NEP tree, install PyMuPDF in your Python environment and provide
the retained `paddle_pdf_ocr_v2` source directory:

```sh
python -m pip install PyMuPDF Pillow
python analysis/builders/build_nep_tree.py --source-dir /path/to/paddle_pdf_ocr_v2
```

Required files relative to that directory:

- `pdfs/NEP-2027-VOLUME-2B_OCR.pdf`
- `output/NEP-2027-VOLUME-2B_OCR/002.40-pap-tree/tree.json`
- `output/NEP-2027-VOLUME-2B_OCR/002.30-by-ou-tree/tree.json`
- `output/NEP-2027-VOLUME-2B_OCR/002.20-table-structure/pages/page-*.json`

The build writes source paths and SHA-256 hashes into the generated provenance.
After rebuilding against your local inputs, run the regression checks:

```sh
python -m unittest discover -s analysis/tests -p test_nep_tree.py -v
# Refresh evidence first, then dependent viewers and their manifests.
python analysis/builders/build_source_review_evidence.py
python analysis/builders/build_current_pages.py
python analysis/builders/build_stage_trace.py
python scripts/validate_current_pages.py
python scripts/build_pages.py
```

The evidence renderer reads the PDF path from canonical provenance. It requires
the retained local PDF, PyMuPDF, and Pillow; committed crops support offline CI
and hosted review. See [the review workflow](analysis/docs/source_hierarchy_verification.md)
for expenditure-column interpretation and navigable source paths.

House extraction scripts additionally require the HB 10858 source PDFs and
PaddleOCR outputs under `HB_BUDGET/`; see each script and the audit reports for
its input requirements. Generated dashboards retain local PDF links, which
require the source files on your machine.

To rerun the targeted House repairs with the retained inputs, use:

```sh
python analysis/builders/repair_hb_known_defects.py
```

This regenerates the v5 candidate and repair reports from v4b, the source PDF,
and the retained audit/control inputs; it does not repair the four unresolved
PAPs or rebuild historical matching/dashboard results.

The overview and all six retained static viewers link to both the repository
README and the analysis workbench README. Hosted links open rendered Markdown
on GitHub; local links follow the checkout layout. Packaging checks that both
README links are present on every published page.

See [the current codebase reassessment](analysis/docs/codebase_reassessment.md) for implemented capabilities, dependency flow, concrete gaps, and verification priorities.


The [React + Vite migration plan](analysis/docs/react_vite_migration.md) documents the local single-page
workbench, all seven routes, PDF evidence loading, and compatibility redirects.
Run `npm run dev --prefix analysis/web` from the repository root. The Pages workflow builds and publishes the SPA from committed sources. Build React before running
`python scripts/build_pages.py`; the SPA is now the default package.
