# FY2027 DPWH NEP and House Budget Analysis

A React + Vite workbench for exploring FY2027 DPWH budget stages, backed by
Python extraction, audit, and comparison builders. It covers **House GAB**,
**DBM NEP**, and the retained **DPWH Transparency NEP** project snapshot.

[Open the workbench](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/)
· [Analysis guide](analysis/README.md)
· [Frontend guide](analysis/web/README.md)

**Current phase:** [verify each source hierarchy](analysis/docs/source_hierarchy_verification.md)
before certifying comparisons. Arithmetic passes, but source evidence and
coverage checks remain open. Candidate matches and deltas are provisional.
The React PAP totals table currently covers 45 non-FAP controls; its separate
FAP presentation is [documented and deferred](analysis/docs/react_vite_migration.md#deferred-fap-coverage-in-the-react-pap-table).

## Run locally

Use Node 22 (matching CI) and Python 3. From the repository root:

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

Open the URL printed by Vite. One development server serves the app, retained
JSON, and PDF byte ranges. No separate API server is required. The app reads
committed datasets rather than querying the live Transparency API.

For the production build and a preview of the GitHub Pages package:

```sh
npm run build --prefix analysis/web
python scripts/build_pages.py
python scripts/serve_pages.py --port 8000
```

Open `http://127.0.0.1:8000/`. Vite writes `analysis/web/dist/`; packaging writes
`_site/`. Both are generated and git-ignored. CI rebuilds them from committed
sources. `npm run preview --prefix analysis/web` serves only the Vite output;
use the packaged preview above to include source data and PDFs.

## Repository layout

```
├── analysis/           Workbench (web · builders · viewers · data · docs · tests · archive)
├── dpwh-transparency-nep-data/           DPWH Transparency NEP snapshot + fetch scripts
├── dbm-nep-data/       Retained NEP Volume II-B PDF used by the app
├── HB_BUDGET/          House PDFs and OCR markdown inputs
├── scripts/            Packaging, validation, native House extractor
├── site/               Retained standalone index/template for diagnostics
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
| House **control** baseline (native text layer) | [Additive Native I-B tree](analysis/data/hb_dpwh_native_rollup.json), [verification viewer](analysis/viewers/hb_native_verification.html), [audit](analysis/docs/hb_native_ib_rollup_checks.md) | 660/660 internal nodes balance directly and recursively across all four expenditure columns; 1,746 leaves reproduce ₱654.102015B. Office granularity for local programs. |
| DPWH Transparency NEP API hierarchy | [API tree](analysis/data/dpwh_transparency_nep_tree.json), [verification viewer](analysis/viewers/dpwh_nep_api_verification.html), [audit](analysis/data/dpwh_transparency_nep_tree_validation.json) | 11,372 FY2027 projects; ₱445,378,063,000. All 2,662 derived grouping checks pass; release/document coverage still needs confirmation. |
| House **named-project** layer (native text layer) | [Additive Native I-C tree](analysis/data/hb_dpwh_native_ic_projects.json), [audit](analysis/docs/hb_native_ic_rollup_checks.md), [machine audit](analysis/data/hb_dpwh_native_ic_rollup_audit.json) | 15,972 named project leaves plus 29 FAP totals; 3,380 office-node occurrences; 2,477/2,477 internal controls balance; MOOE+CO = ₱639,179,718,000; passes 56 independent Native I-B cross-volume checks. Replaces the OCR-era v5 candidate. |
| Saved BetterGov API snapshot | [FY2027 combined JSON](dpwh-transparency-nep-data/json/fy2027-combined.json) | 11,372 project rows, ₱445,378,063,000. A separate, incomplete coverage baseline; not the full NEP budget. |

House Volume I-B prints **₱654,102,015,000** new appropriations, including
**₱586,941,661,000** operations. The native I-B tree reproduces that total
additively, and the native I-C tree independently reproduces every shared
control. The former v5 shortfall of **₱5,596,312,000** against operations was
**OCR-era extraction damage** on four Convergence sections (Access Roads,
Multi-Purpose, Coastal Roads, Water Supply family) — all four repair
natively in I-C (see the [I-C checks](analysis/docs/hb_native_ic_rollup_checks.md)).

The 29 House FAP projects total ₱44,749,011,000 and their funding splits balance.
The OCR-era v5 candidate (`hb_dpwh_leaves_corrected_v5.json`) is now historical:
the [native I-C tree](analysis/data/hb_dpwh_native_ic_projects.json) is the
named-project source under the [dual-baseline ADR](analysis/docs/adr/0002-separate-controls-and-project-titles.md).
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

The 722-page retained OCR PDF is committed at
[dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf](dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf).
Source extraction originally reads it as `pdfs/NEP-2027-VOLUME-2B_OCR.pdf`
inside the external OCR workspace, alongside PAP and operating-unit OCR trees. The canonical JSON records the input paths and SHA-256 hashes; the local
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
| `HB_BUDGET/3 - HB 10858 VOL IC.pdf` | 942-page DPWH project details; native source for the named-project layer (`hb_dpwh_native_ic_projects.json`). |

Volume I-A and Volume II are also present locally; the current extraction is
DPWH-only. The [native I-C audit](analysis/data/hb_dpwh_native_ic_rollup_audit.json)
records source/code hashes and repairs; titles retain their raw constituent
lines and one-based PDF pages. Certified workbench outputs still use the
second-reading copies under `HB_BUDGET/`. A side-by-side **third-reading**
extract from `HB_BUDGET_3rd_reading/` is also available
([I-B](analysis/data/hb_dpwh_native_rollup_3rd_reading.json),
[I-C](analysis/data/hb_dpwh_native_ic_projects_3rd_reading.json)): same
₱654.102015B new-appropriations total, with a ₱134M reallocation from
Support-to-Operations Right-of-Way into five new Caloocan City projects
under Flood Management (+₱68M) and Convergence BIP (+₱66M).

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

## Current application

All eight workspaces use one React shell and shared navigation. Hash routes
support refresh and browser history under the GitHub Pages project prefix.

| Workspace | App route | Purpose |
|---|---|---|
| Overview | [Home](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#home) | Comparison entry point and independent source status |
| Compare budget stages | [Compare](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#compare) | PAP totals, project candidates, and Transparency listing gaps |
| House GAB | [House tree](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#house) | Native I-B hierarchy, expenditure columns, and recursive rollups |
| DBM NEP | [DBM tree](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#nep) | PS/MOOE/CO hierarchy, progressive rollups, and source review |
| DPWH Transparency NEP | [Transparency tree](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#transparency) | Retained listing hierarchy and snapshot checks |
| Resources | [Resources](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#resources) | Direct links to the latest workable JSON datasets and audit docs |
| House / NEP detail | [Detail comparison](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#house-nep) | Printed controls, local/FAP program totals, extraction gaps, and candidates |
| NEP detail | [Detail tree](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#nep-detail) | Expense/program tree and native-text evidence |

Comparison headers sort the full filtered result before pagination. Amount
headers offer total, delta, and percent sorting; choosing the same mode reverses
direction. Unpaired values remain distinct from zero. Downloads retain exact
pesos; displayed amounts use B/M/K with three decimals.

House GAB and DBM NEP trees synchronize selected nodes and review flags with the
PDF pane on the right. Tree paths, expense scopes, and branch review navigation
remain available. PDF page-reference buttons open the embedded viewer rather
than navigating away. Narrow screens stack the PDF below the active tree or
evidence panel. Cropped-image blocks and links have been removed from these two
views; review reasons and raw-text candidates remain.

PDF controls include previous/next, page selection, refresh, Fit W/H, and zoom.
The viewer loads pages with byte-range requests and cancels obsolete renders.
**House tree pages refer to Volume I-B; House project-comparison pages refer to
Volume I-C.** DBM references use the retained NEP Volume II-B. Page indices are
one-based; they cannot be transferred between these documents. The Transparency
tree has no established PDF mapping.

The root and six former `analysis/*.html` viewer URLs redirect into the app,
including review/section fragments. Checkout-style `analysis/viewers/*.html`
and `site/index.html` aliases are also packaged. Both README links appear in the
shared header. Reports open rendered Markdown on GitHub. Historical analysis
remains in [the archive](analysis/archive/README.md), outside the current app.

React owns routing, loading, shared navigation, and PDF selection. Verification
and detail tools retain scoped DOM controllers inside React-owned views; they
have not all been rewritten as declarative components. Python remains the data
and accounting authority. See the [migration plan](analysis/docs/react_vite_migration.md)
and [codebase reassessment](analysis/docs/codebase_reassessment.md).

## Build validation and deployment

```sh
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py
node --test analysis/tests/test_static_navigation.cjs
python scripts/check_react_pages.py
```

The browser check needs Playwright and Chromium/Chrome; installation instructions
are in the [frontend guide](analysis/web/README.md). It checks desktop/mobile
routes, review queues, expense scopes, sorting, history, real PDF rendering,
reference buttons, and absence of crop links in the migrated tree views.
Packaging rejects stale manifests, mismatched embedded data, invalid accounting,
broken links, and a NEP PDF that does not match the canonical hash.

[Pages CI](.github/workflows/pages.yml) runs source checks, frontend tests,
packaging, and browser checks before deploying pushes to `main` or a manual
workflow run. Pull requests validate without deployment. Packaging does not
rerun source extraction. `--with-react` is a compatibility alias for the default
SPA package; `--static-only` builds retained standalone viewers for diagnostics.

Rebuild source-dependent pages separately using the
[analysis rebuild guide](analysis/README.md#rebuild-source-dependent-outputs).

## Local inputs and rebuilding

This repository includes analysis artifacts, evidence images, the retained House
PDFs/OCR outputs under `HB_BUDGET/`, and `dpwh-transparency-nep-data/json/fy2027-combined.json`.
The reference repository is pinned as a submodule. The DPWH scraper checkout,
raw API downloads, and page-mapping caches are excluded by `.gitignore`;
the external OCR trees and table geometry needed for NEP extraction must be
provided separately. The exact preview PDF is committed under
[dbm-nep-data/](dbm-nep-data/README.md).
The app and package can be built from the retained artifacts without rerunning
OCR extraction.

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
npm run build --prefix analysis/web
python scripts/build_pages.py
```

The evidence renderer reads the PDF path from canonical provenance. It requires
the retained local PDF, PyMuPDF, and Pillow; committed crops support offline CI
and historical audit reproducibility. They are no longer displayed in the
migrated House GAB and DBM NEP views. See [the review workflow](analysis/docs/source_hierarchy_verification.md)
for expenditure-column interpretation and navigable source paths.

The current House extraction requires PyMuPDF and the retained HB 10858 I-B/I-C
PDFs, without OCR inputs. Rebuild controls before project detail, then comparisons:

```sh
python3 scripts/hb_native_rollup.py
python3 scripts/hb_native_ic_rollup.py
python3 analysis/builders/build_current_pages.py
python3 analysis/builders/build_stage_trace.py
python3 scripts/validate_current_pages.py
```

Rebuild the third-reading side-by-side extract (does not replace certified outputs):

```sh
python3 scripts/hb_native_rollup.py \
  --pdf "HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf" \
  --out analysis/data/hb_dpwh_native_rollup_3rd_reading.json \
  --report analysis/data/hb_native_ib_rollup_audit_3rd_reading.json
python3 scripts/hb_native_ic_rollup.py \
  --pdf "HB_BUDGET_3rd_reading/3- HB 10858 FOR 3RD READING VOL I-C .pdf" \
  --ib-rollup analysis/data/hb_dpwh_native_rollup_3rd_reading.json \
  --out analysis/data/hb_dpwh_native_ic_projects_3rd_reading.json \
  --report analysis/data/hb_dpwh_native_ic_rollup_audit_3rd_reading.json
```

The SPA package includes the retained House I-B/I-C PDFs and DBM NEP preview PDF.

To reproduce the historical OCR-era House repairs with retained inputs, use:

```sh
python analysis/builders/repair_hb_known_defects.py
```

This historical command regenerates the v5 candidate and repair reports from v4b, the source PDF,
and the retained audit/control inputs. Its four unresolved PAPs are historical
v5 limitations, now closed by native I-C; this command does not rebuild current
comparison pages.

See [analysis/README.md](analysis/README.md) for current artifacts, source rebuild
order, validation commands, and open coverage/evidence work.

## House reading differences and office filters

The comparison app preserves both House readings. Its **House readings** tab
shows second/third amounts and their differences, with region and engineering
office filters. Five additional printed project records total ₱134 million;
Support to Operations decreases by the same amount and the agency total is
unchanged. See [the reading comparison and checks](analysis/docs/house_reading_comparison_checks.md).
