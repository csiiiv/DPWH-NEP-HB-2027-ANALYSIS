# FY2027 Budget Workbenches

A React workbench for the FY2027 Philippine budget: the DPWH national pipeline
(House GAB readings × DBM NEP × Transparency API), the Department of
Agriculture's locally funded farm-to-market road annex, DOH health facilities,
NIA irrigation schedules, and a cross-dataset geolocation map — each with its
own routes, data, and source evidence, sharing one header and PDF viewer.

## Workspaces

Switch workspaces in the shared header; every workspace keeps its own routes and
retained datasets. Deep links are explicit (`#fmr/compare`, `#nia/analysis`, …).

| Workspace | Route | What it holds |
|---|---|---|
| **Overview** | `#overview` | Default landing page. Insertion/deletion candidates and paired allocation adjustments per funding workspace, source totals, record-grain labels, and links to the supporting analysis. |
| **Sources** | `#sources` | Catalog of every shareable, normalized dataset: what it contains, where it lives in this repository (or downloads from the site), its documented limits, and an "Open workspace" link per domain. |
| **DPWH** | `#home` … | Home · Highlights · Compare stages · Analysis · House GAB · DBM NEP · DPWH Transparency NEP · Resources · About. Native House I-C/I-B trees, canonical NEP tree, and the retained Transparency snapshot, compared stage by stage. |
| **DA Farm-to-Market Roads** | `#fmr/…` | Home · Highlights · Compare stages · Analysis · Map · House GAB · DBM NEP. Both FMR annexes (program → region → project trees) with normalized coordinates and PSGC geocoding. |
| **DOH Health Facilities** | `#hfep/…` | Same annex tab pattern. HFEP capital-outlay schedules from both documents with per-cell provenance and a documented printed-defect ledger. |
| **NIA Irrigation** | `#nia/…` | Same annex tab pattern plus an AI-monitoring view. The irrigation annex under six sub-programs (printed heading → sub-program → project). |
| **Geolocation** | `#geo/…` | Home · Map. Every GPS-bearing budget record (61,688 scanned → 6,973 with GPS → 9,827 parsed points) on one MapLibre map with grouping-encoded badges, clusters, and per-record source evidence. |

### Headline numbers

| Source | Allocation | Projects | Regions | Remaining coordinate review |
|---|---:|---:|---:|---:|
| FMR · DBM NEP | ₱16,000,000,000 | 704 | 16 | 8 |
| FMR · House GAB supplied copy | ₱19,628,100,000 | 964 | 16 | 14 |

The NIA workspace covers **791 NEP rows (₱17,598,181,000)** and **828 House
rows (₱17,999,305,000)** under six sub-programs; the difference is
**₱401,124,000**. Its 509 unique-title candidate pairs remain provisional;
319 House-only and 282 NEP-only rows are source observations. See the
[NIA workbench guide](analysis-nia/NIA_WORKBENCH.md).

House legislative reading is not independently authenticated. Project pairings
are candidates, with both source IDs and PDF references retained. Multi-segment
projects keep their allocation once. The FMR annex does not represent the full
DA budget or the separate FMR planning and bridges activities.

## Run locally

Use Node 22 and Python 3. From the repository root:

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

Open the URL printed by Vite. The predev step rebuilds the annex browser datasets
from retained JSON. Development serves the source PDFs, images, and datasets
from this checkout; no API server is needed.

To preview the complete static package:

```sh
npm run build --prefix analysis/web
python scripts/build_pages.py --with-react
python scripts/serve_pages.py --port 8000
```

Open `http://127.0.0.1:8000/`. The generated `dist/`, browser payload, and `_site/`
are git-ignored. Vite's standalone preview does not include the retained evidence;
use the packaged preview above. The packager includes all workspaces.

## Guides and validation

- [FMR workbench guide](other-analysis/FMR_WORKBENCH.md): routes, matching, evidence, and checks.
- [Source analysis](other-analysis/README.md): extraction and coordinate review artifacts for FMR, HFEP, and the annex method.
- [NIA irrigation analysis](analysis-nia/README.md): HB 10858 irrigation annex extraction (828 projects, ₱17,999,305,000).
- [DOH health facilities analysis](analysis-hfep/README.md): retained HFEP schedules, source controls, and evidence limits.
- [Geolocation analysis](gps-analysis/README.md): the GPS inventory scanner, dataset registry, and map workspace.
- [Frontend guide](analysis/web/README.md): shared components and local workflow.
- [Earlier DPWH analysis](analysis/README.md): retained source work and modules from the original workbench.
- [Shareable findings](analysis/docs/shareable_findings.md): URL settings for searches, filters, expanded records, and source paths.

```sh
python -m unittest discover -s other-analysis/tests -v
python -m unittest discover -s analysis-nia/tests -v
python -m pytest analysis-hfep/tests -q
npm test --prefix analysis/web
python other-analysis/build_fmr_workbench.py --check
python analysis-nia/build_nia_workbench.py --check
python other-analysis/build_hfep_workbench.py --check
python scripts/check_fmr_pages.py
python scripts/check_nia_pages.py
python scripts/check_hfep_pages.py
```

Browser checks require Playwright and Chromium and run after packaging. CI runs
them desktop-only (`SKIP_MOBILE_CHECKS=1`; unset it to restore 390px passes) and
validates the DPWH, FMR, HFEP, and NIA workbenches; automatic Pages deployment
remains restricted to `main` and runs only after the validation checks pass.
