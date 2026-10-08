# FY2027 DPWH NEP and House Budget Analysis

Scripts, source audits, extracted datasets, and offline dashboards for comparing
FY2027 DPWH National Expenditure Program allocations, House budget controls,
and the saved BetterGov API project snapshot.

Start with [the work summary](analysis/FY2027_work_summary.md),
[NEP validation and limits](analysis/nep_2027_tree.md), and
[House JSON usability audit](analysis/hb_json_usability_audit.md).
Open [the NEP drilldown](analysis/nep_2027_tree.html) locally in a browser.

## Shared dashboards

[Open the dashboard index](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/)
for the NEP tree, historical three-way crosscheck, and taxonomy viewer.
`.github/workflows/pages.yml` builds and publishes the committed viewers on
relevant pushes to `main` or manual dispatch. Pull requests validate the static
build without deployment. This does not rerun source-PDF extraction.

To preview the same deployment locally:

```sh
python scripts/build_pages.py
python -m http.server 8000 --directory _site
```

Open `http://localhost:8000`. Hosted viewers preserve PDF page references but
do not link to unavailable local PDFs. Report links open rendered Markdown on
GitHub; viewer-specific caveats distinguish the current NEP baseline from
historical comparisons.

The NEP new-appropriations tree totals ₱642,612,015,000 and balances all 2,552
additive branch checks. Arithmetic balance does not independently certify each
OCR amount; unresolved PDF-text review candidates are retained with the audit.
House candidate datasets and historical matcher results have the limitations
documented in the reports; unmatched rows alone do not establish budget changes.

## Local inputs and rebuilding

This repository includes analysis artifacts, evidence images, and
`nep-data/json/fy2027-combined.json`. Bulky source PDFs/OCR downloads, cloned
upstream repositories, and page-mapping caches are excluded by `.gitignore`.
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

Upstream repositories used in this workspace:

- [DPWH transparency API scraper](https://github.com/csiiiv/dpwh-transparency-data-api-scraper),
  checked out at `de96ab393a069792964b086a7d155e7801909c2a`.
- [Philippine budget analysis](https://github.com/ajamontesa/ph-budget-analysis),
  checked out at `558a56311dc510b513af2b18b13a49d55d501c02`.

These upstream checkouts are separate repositories and are not embedded here.
