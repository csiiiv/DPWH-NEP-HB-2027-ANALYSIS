# FY2027 FMR Budget Workbench

The **FMR branch** adapts the existing React workbench to the Department of
Agriculture's locally funded farm-to-market road annex. It reuses the navigation,
sortable tables, share links, modal behavior, and PDF viewer.

The main tabs are **Home · Highlights · Compare Stages · Analysis · House GAB ·
DBM NEP**. House GAB and DBM NEP share a program → region → project tree view.

| Source | Allocation | Projects | Regions | Remaining coordinate review |
|---|---:|---:|---:|---:|
| DBM NEP | ₱16,000,000,000 | 704 | 16 | 8 |
| House GAB supplied copy | ₱19,628,100,000 | 964 | 16 | 14 |

House legislative reading is not independently authenticated. Project pairings
are candidates, with both source IDs and PDF references retained. Multi-segment
projects keep their allocation once. This annex does not represent the full DA
budget or the separate FMR planning and bridges activities.

## Run locally

Use Node 22 and Python 3. From the repository root:

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

Open the URL printed by Vite. The predev step rebuilds the FMR browser dataset
from retained JSON. Development serves the source PDFs, images, and datasets
from this checkout; no API server is needed.

To preview the complete static package:

```sh
npm run build --prefix analysis/web
python scripts/build_fmr_pages.py
python scripts/serve_pages.py --port 8000
```

Open `http://127.0.0.1:8000/`. The generated `dist/`, browser payload, and `_site/`
are git-ignored. Vite's standalone preview does not include the retained evidence;
use the packaged preview above. The packager rebuilds `_site/` with FMR assets.

## Guides and validation

- [FMR workbench guide](other-analysis/FMR_WORKBENCH.md): routes, matching, evidence, and checks.
- [Source analysis](other-analysis/README.md): extraction and coordinate review artifacts.
- [NIA irrigation analysis](analysis-nia/README.md): HB 10858 irrigation annex extraction (828 projects, ₱17,999,305,000).
- [Frontend guide](analysis/web/README.md): shared components and local workflow.
- [Earlier DPWH analysis](analysis/README.md): retained source work and modules from the original workbench.

```sh
python -m unittest discover -s other-analysis/tests -v
python -m unittest discover -s analysis-nia/tests -v
npm test --prefix analysis/web
python other-analysis/build_fmr_workbench.py --check
python scripts/check_fmr_pages.py
```

Browser checks require Playwright and Chromium and run after packaging. The
branch workflow validates the FMR app; automatic Pages deployment remains
restricted to `main`. This branch has not been published.
