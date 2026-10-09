# React + Vite budget workbench

The current SPA presentation for FY2027 DPWH **House GAB**, **DBM NEP**, and
**DPWH Transparency NEP**. Source datasets and accounting stay in the Python
workbench; the frontend does not certify candidate matches or repair amounts.

[Hosted app](https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/)
· [Repository README](../../README.md)
· [Analysis README](../README.md)
· [Migration design](../docs/react_vite_migration.md)

## Development

Use Node 22, matching Pages CI. Run from the repository root:

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

Open Vite's printed URL; pass `-- --port 5176 --strictPort` to select a port.
The development middleware serves retained JSON, verification payloads, and PDF
ranges from the checkout. No separate API process is needed. It does not fetch
live Transparency data or regenerate source outputs.

## Routes and components

| Hash route | Workspace |
|---|---|
| `#home` | Overview |
| `#compare` | Stage comparison |
| `#house` | Native I-B controls and native I-C project-detail summary |
| `#nep` | DBM NEP verification |
| `#transparency` | Transparency NEP verification |
| `#resources` | Direct links to the latest workable JSON and audit docs |
| `#house-nep` | Native I-C / NEP allocation candidates |
| `#nep-detail` | Detailed NEP tree |

Use `#nep?view=review` for the source queue, `node` for a verification entity ID,
and `section` for an in-page destination. Unknown routes show a recovery link.

- `main.jsx`, `routes.js`, `WorkbenchHeader.jsx`: shared shell, hash routing, and tabs.
- `Comparison.jsx`, `model.js`: filters, full-result sorting, pagination, and PDF selection.
- `SourceWorkspace.jsx`, `workspaces/`: scoped verification/detail controllers and selection callbacks. These preserve existing tools inside React-owned views; their internals are not all declarative React components.
- `data.js`: data loading, asset URLs, and the source-document registry.
- `PdfPreview.jsx`: shared lazy PDF.js viewer with page/fit/zoom controls and cancellation.
- `vite.config.js`: relative asset base and development-only retained-file/range middleware.

Comparison and House GAB/DBM NEP trees use the same embedded PDF component.
House trees reference Volume I-B; House project comparisons reference I-C;
DBM references use Volume II-B. Source page buttons open the pane. Nodes without
page references clear it. The Transparency tree has no PDF mapping. Crop links
and images are absent from the two migrated verification views; audit artifacts
remain retained separately. The viewer keeps an explicit original-PDF link.

## Production package

```sh
npm run build --prefix analysis/web
python scripts/build_pages.py
python scripts/serve_pages.py --port 8000
```

Vite emits `analysis/web/dist/`. Packaging emits `_site/`, including `/app/`,
canonical JSON, retained PDFs, and compatibility redirects. The root and former
viewer URLs route into the SPA. Open `http://127.0.0.1:8000/` to test the complete
package. Both output directories are ignored by Git and rebuilt in CI.

`npm run preview --prefix analysis/web` serves only the Vite output; it does not
run the development middleware or provide all sibling source assets. Use the
packaged preview for end-to-end checks. Packaging requires the exact retained
`dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf` and checks its canonical SHA-256.

## Tests

```sh
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py
node --test analysis/tests/test_static_navigation.cjs
python scripts/check_react_pages.py
```

For browser checks, install Playwright and Chromium if Chrome is unavailable:

```sh
python -m pip install playwright==1.55.0
python -m playwright install chromium
```

The browser suite mounts the package under a GitHub project prefix and exercises
390px/1440px layouts, all routes, history, source review, expense scopes,
full-result sorting, real PDF rendering/range requests, reference buttons, and
absence of crop links. Set `REACT_WORKBENCH_URL` to test the running Vite server.
The [Pages workflow](../../.github/workflows/pages.yml) also runs Python audit
and freshness checks before deployment.

## Current House data

Native I-B supplies the full PS/MOOE/CO agency controls (₱654,102,015,000).
Native I-C supplies MOOE+CO detail (₱639,179,718,000), including 15,972 named
project leaves and 29 FAP totals. The operations comparison consumes 16,270
allocation records totaling ₱586,941,661,000; office/region allocations and FAP
project totals retain their own grain. These counts are not interchangeable.
The [I-C audit](../docs/hb_native_ic_rollup_checks.md) records 2,477 balanced
internal controls and 56 independent I-B checks. v5 is historical and is not
loaded or packaged by the current app.

After changing source artifacts or presentation templates, rebuild retained
payloads before the Vite/package commands above:

```sh
python analysis/builders/build_current_pages.py
python analysis/builders/build_stage_trace.py
python scripts/validate_current_pages.py
```

## House reading comparison

The **House readings** tab (`#compare?view=readings`) retains both native House
readings, showing both amounts, 3rd-minus-2nd deltas and distinct source PDFs.
It defaults to changed allocations. The operations increase is ₱134,000,000,
with five additional records and an offsetting Support to Operations decrease.
The agency total is unchanged. Repeated keys are grouped without individual
pairing. See [methods and checks](../docs/house_reading_comparison_checks.md).

Rebuild `python analysis/builders/build_house_readings.py` alongside the other
retained payload builders before packaging.

## Project office filters

The stage comparison and House/NEP detail view offer region and engineering
office/DEO selectors. Office options narrow to the selected region; changing
region clears the office selection. Filtering applies to the entire result
before sorting and pagination. Source-labelled office names appear on each
project row, including Central Office and regional offices where recorded.

A record matches an office assigned by any displayed House, NEP or Transparency
source. Suggested fuzzy counterparts do not establish office assignments.
**No recorded office** selects records without an office in any displayed
source; no office is inferred from a project's title or location. These filters
use the shared native hierarchy fields and also support the third-reading
artifacts. The House/NEP detail retains the second reading; the **House readings**
tab compares both native readings. Open `#compare?view=readings` directly.

## Open work

The React PAP table shows 45 non-FAP controls; adding a separate FAP section is
deferred. All 44 mapped non-FAP House PAP controls balance; one NEP PAP remains
unmapped. DBM source checks, project identity, and amendment completeness remain
open. The detailed comparison exposes local/FAP totals with zero House extraction
gap. PDF
box overlays, an accessible PDF text layer, saved review decisions, and further
declarative component conversion remain future work.

PAP totals include a separate FAP control, so local PAPs plus FAP reconcile
to operations. FAP has no Transparency comparison amount because it is
outside that listing scope. Both House reading PAP controls retain FAP.

Source page links name the reading and volume. House hierarchy links use I-B;
PAP/project comparisons use I-C. NEP references use the retained II-B OCR PDF.
See [source page reference checks](../docs/source_page_reference_checks.md).
