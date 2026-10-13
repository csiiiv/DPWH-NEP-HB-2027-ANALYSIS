# FY2027 Budget Workbenches

The React workbench includes DPWH, the Department of Agriculture's locally funded
farm-to-market road annex, DOH health facilities, and the NIA irrigation schedules. Switch workspaces
in the shared header; each retains its own routes, data, and source evidence.

The annex tabs are **Home · Highlights · Compare Stages · Analysis · House GAB ·
DBM NEP**; FMR also has a Map. FMR sources use program → region → project trees;
NIA uses the printed heading → sub-program → project hierarchy.

| Source | Allocation | Projects | Regions | Remaining coordinate review |
|---|---:|---:|---:|---:|
| DBM NEP | ₱16,000,000,000 | 704 | 16 | 8 |
| House GAB supplied copy | ₱19,628,100,000 | 964 | 16 | 14 |

The NIA workspace (`#nia/home`) covers **791 NEP rows (₱17,598,181,000)** and
**828 House rows (₱17,999,305,000)** under six sub-programs. The difference is
**₱401,124,000**. Its 509 unique-title candidate pairs remain provisional;
319 House-only and 282 NEP-only rows are source observations. See the
[NIA workbench guide](analysis-nia/NIA_WORKBENCH.md).

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
use the packaged preview above. The packager includes all four workspaces.

## Guides and validation

- [FMR workbench guide](other-analysis/FMR_WORKBENCH.md): routes, matching, evidence, and checks.
- [Source analysis](other-analysis/README.md): extraction and coordinate review artifacts.
- [NIA irrigation analysis](analysis-nia/README.md): HB 10858 irrigation annex extraction (828 projects, ₱17,999,305,000).
- [DOH health facilities analysis](analysis-hfep/README.md): retained HFEP schedules, source controls, and evidence limits; open `#hfep/home` in the workbench.
- [Frontend guide](analysis/web/README.md): shared components and local workflow.
- [Earlier DPWH analysis](analysis/README.md): retained source work and modules from the original workbench.

```sh
python -m unittest discover -s other-analysis/tests -v
python -m unittest discover -s analysis-nia/tests -v
python -m unittest discover -s analysis-hfep/tests -v
npm test --prefix analysis/web
python other-analysis/build_fmr_workbench.py --check
python analysis-nia/build_nia_workbench.py --check
python other-analysis/build_hfep_workbench.py --check
python scripts/check_fmr_pages.py
python scripts/check_nia_pages.py
python scripts/check_hfep_pages.py
```

Browser checks require Playwright and Chromium and run after packaging. The
branch workflow validates the DPWH, FMR, HFEP, and NIA workbenches; automatic Pages deployment remains
restricted to `main`. This branch has not been published.
