# FY2027 DPWH NEP and House Budget Analysis

Scripts, source audits, extracted datasets, and offline dashboards for comparing
FY2027 DPWH National Expenditure Program allocations, House budget controls,
and the saved BetterGov API project snapshot.

Start with [the work summary](analysis/FY2027_work_summary.md),
[NEP validation and limits](analysis/nep_2027_tree.md), and
[House JSON usability audit](analysis/hb_json_usability_audit.md).
Open [the NEP drilldown](analysis/nep_2027_tree.html) locally in a browser.

## Latest usable datasets

Status as of **8 October 2026**. Monetary values in the generated datasets are
integer Philippine pesos. The complete NEP baseline covers **new appropriations**;
automatic appropriations are excluded.

| Purpose | Recommended artifact | Coverage and limits |
|---|---|---|
| NEP hierarchy and program/PAP controls | [Canonical NEP tree](analysis/nep_2027_tree.json) and [validation report](analysis/nep_2027_tree.md) | ₱642,612,015,000; 2,552 additive rollups balance exactly. Independent evidence review remains open. |
| NEP totals without counting parents and children twice | [Atomic budget units](analysis/nep_2027_budget_units.json) | 14,190 units reproduce the root. GOP/loan units partition project totals; they are not separate projects. |
| NEP provenance, repairs, and evidence | [Validation and repair ledger](analysis/nep_2027_tree_validation.json), [native amount audit](analysis/nep_2027_native_amount_audit.json), and [review queue](analysis/nep_2027_native_amount_review.json) | 54 repairs; 237 review candidates, not confirmed errors, plus four nodes without comparable printed evidence. Arithmetic balance alone does not certify OCR amounts. |
| NEP source projects and API coverage | [Source projects](analysis/nep_2027_source_projects.json), [source audit](analysis/nep_2027_source_audit.md), and [API reconciliation](analysis/nep_2027_api_reconciliation.md) | Use alongside the canonical tree for project-level comparison and documented API omissions. |
| House project/allocation extract | [House v5](analysis/hb_dpwh_leaves_corrected_v5.json) and [repair report](analysis/hb_known_defect_repairs.md) | Best current repaired candidate: 16,148 positive allocations, ₱581,345,349,000; 38/42 local PAP controls balance. Not a complete certified budget. |
| House printed PAP controls | [PAP drilldown](analysis/crosscheck_2027_pap_drilldown.json) and [usability audit](analysis/hb_json_usability_audit.md) | All 42 saved local PAP controls checked against native PDF headings; this does not certify every extracted project. The audit's historical tables refer to earlier versions; its opening update directs readers to v5. |
| Saved BetterGov API snapshot | [FY2027 combined JSON](nep-data/json/fy2027-combined.json) | 11,372 project rows, ₱445,378,063,000. A separate, incomplete coverage baseline; not the full NEP budget. |

House Volume I-B prints **₱654,102,015,000** new appropriations, including
**₱586,941,661,000** operations. House v5 covers operations allocations and is
short of that printed control by a net **₱5,596,312,000**. Four local PAPs remain
unresolved: BIP access roads/bridges to public facilities, BIP multi-purpose
buildings, Water Supply System, and BIP coastal roads. Their deficits and excesses
offset; the net gap does not measure all missing or misattributed rows.

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
pages 13 and 28 for personnel-services controls, and pages 115–690 for PAP details.
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
DPWH allocation table. The [v5 JSON provenance](analysis/hb_dpwh_leaves_corrected_v5.json)
records the Volume I-C filename and SHA-256; repaired rows carry PDF page/source
identifiers. The [repair ledger](analysis/hb_known_defect_repairs.json) records
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
  is used by the [pagination script](nep-data/fetch_nep_projects_paginated.py);
  [project details](https://api.dpwh.bettergov.ph/nep/projects/2027DPWH-Proposal-00001)
  are fetched by the [detail script](nep-data/fetch_nep_projects_details.py).
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
  the BetterGov NEP snapshot is fetched by this repository's `nep-data` scripts.

The Philippine budget analysis reference is a pinned Git submodule. Initialize it
with `git submodule update --init reference/ph-budget-analysis` after cloning.
The DPWH scraper checkout and NEP source PDF/OCR inputs remain separate local
inputs. Public reference pages and API contents can change; retained
commits, snapshots, and provenance identify the material actually used.

## Shared dashboards

[Open the dashboard index](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/)
for the NEP tree and the current [source comparison](analysis/source_comparison_2027.html),
including printed controls, House v5 coverage, PAP mappings, and project candidates.
Earlier three-way and title-taxonomy viewers remain labeled historical.
`.github/workflows/pages.yml` builds and publishes the committed viewers on
relevant pushes to `main` or manual dispatch. Pull requests validate the static
build without deployment. This does not rerun source-PDF extraction.

To preview the same deployment locally:

```sh
python scripts/build_pages.py
python -m http.server 8000 --directory _site
```

Open `http://localhost:8000`. Hosted viewers preserve NEP PDF page references
and provide working House PDF links. Report links open rendered Markdown on GitHub; viewer-specific caveats distinguish the current NEP baseline from
historical comparisons.

The current static source comparison uses House v5 and the canonical NEP tree.
It maps the 42 audited House PAP controls to NEP source IDs, retains three NEP
PAPs without a mapped House control, and separates printed budget differences
from extracted regional totals and project candidates. The matcher treats
unique normalized titles within region/PAP/zone as candidate pairs; duplicate
keys and fuzzy suggestions remain unresolved. No pair is manually certified.
Search covers all embedded records with pagination rather than a capped subset.
Displayed amounts use three decimals with B (billion), M (million), and T
(thousands); downloads retain exact pesos. Click any table header to sort.
Project sorting covers the full filtered result before pagination. Positive
deltas are green, negative deltas red, and zero neutral.

To regenerate pages from the retained JSON inputs (no PDF extraction needed):

```sh
python analysis/build_current_pages.py
python -m unittest discover -s analysis -p test_current_pages.py -v
python scripts/build_pages.py
```

The builder records input hashes and the matching method in
[the comparison manifest](analysis/comparison_manifest.json). Packaging rejects
stale inputs, mismatched embedded data, and invalid accounting. House summary
and detail PDFs are packaged for working page citations; the NEP PDF remains
local. The earlier viewers still use House v4b/v3 and the saved API; their
accounting and insertion/removal labels are superseded by the current page.

The NEP new-appropriations tree totals ₱642,612,015,000 and balances all 2,552
additive branch checks. Arithmetic balance does not independently certify each
OCR amount; unresolved PDF-text review candidates are retained with the audit.
House candidate datasets and historical matcher results have the limitations
documented in the reports; unmatched rows alone do not establish budget changes.

## Local inputs and rebuilding

This repository includes analysis artifacts, evidence images, the retained House
PDFs/OCR outputs under `HB_BUDGET/`, and `nep-data/json/fy2027-combined.json`.
The reference repository is pinned as a submodule. The DPWH scraper checkout,
raw API downloads, and page-mapping caches are excluded by `.gitignore`;
the NEP PDF/OCR build inputs must be provided separately.
Existing generated results can be inspected without those local inputs.

To rebuild the NEP tree, install PyMuPDF in your Python environment and provide
the retained `paddle_pdf_ocr_v2` source directory:

```sh
python -m pip install PyMuPDF
python analysis/build_nep_tree.py --source-dir /path/to/paddle_pdf_ocr_v2
```

Required files relative to that directory:

- `pdfs/NEP-2027-VOLUME-2B_OCR.pdf`
- `output/NEP-2027-VOLUME-2B_OCR/002.40-pap-tree/tree.json`
- `output/NEP-2027-VOLUME-2B_OCR/002.30-by-ou-tree/tree.json`

The build writes source paths and SHA-256 hashes into the generated provenance.
After rebuilding against your local inputs, run the regression checks:

```sh
python -m unittest discover -s analysis -p test_nep_tree.py -v
```

House extraction scripts additionally require the HB 10858 source PDFs and
PaddleOCR outputs under `HB_BUDGET/`; see each script and the audit reports for
its input requirements. Generated dashboards retain local PDF links, which
require the source files on your machine.

To rerun the targeted House repairs with the retained inputs, use:

```sh
python analysis/repair_hb_known_defects.py
```

This regenerates the v5 candidate and repair reports from v4b, the source PDF,
and the retained audit/control inputs; it does not repair the four unresolved
PAPs or rebuild historical matching/dashboard results.
