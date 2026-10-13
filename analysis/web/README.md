# FY2027 React workbenches

`Workbench.jsx` selects DPWH, DA farm-to-market roads, DOH health facilities, or NIA irrigation from
the hash route. The shared header uses `routes.js` to render each workspace's
navigation. Annex apps and browser datasets load when their workspace opens.
The FMR workflow is described below; see the
[NIA workbench guide](../../analysis-nia/NIA_WORKBENCH.md) for irrigation views.
NIA Compare follows DPWH's compact table workspace and inline PDF layout.
NIA Analysis includes Insertions (House-only candidates), Deletions (NEP-only
candidates), and Adjustments (paired amount changes), with group rankings and
supporting-record dialogs.

## Development and packaging

From the repository root, using Node 22 and Python 3:

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

`predev` and `prebuild` rebuild the comparison payloads and run
`other-analysis/build_fmr_workbench.py`, `other-analysis/build_hfep_workbench.py`,
and `analysis-nia/build_nia_workbench.py`. Vite's retained
file middleware serves JSON, source PDFs with byte ranges, review images, and
source documentation from the checkout.

```sh
npm run build --prefix analysis/web
python scripts/build_pages.py --with-react
python scripts/serve_pages.py --port 8000
```

Open `http://127.0.0.1:8000/`. Use this complete package for previews with source
evidence. Relative URLs also work under a GitHub Pages project prefix.

## Main tabs

| Route | Content |
|---|---|
| `#home` | Source totals, budget difference, and workspace links |
| `#highlights` | Coverage/change tables and findings with evidence dialogs |
| `#compare` | Regional controls and project candidate comparisons |
| `#analysis` | Overview, candidate rankings, adjustments, coordinates, allocation statistics |
| `#house` | Supplied House GAB source tree, projects, coordinate review |
| `#nep` | DBM NEP source tree, projects, coordinate review |

Source pages accept `view=tree|projects|review`, `node`, `q`, `region`, `status`,
and `category`. The tree sits above selected arithmetic/evidence; the selected
PDF renders in a sticky desktop column and stacks below the workspace on mobile.
Mobile has explicit results/evidence controls. Review categories overlap;
previous/next navigation respects the region, category and search scope.

Compare accepts `view=regions|projects`, `region`, `q`, `status`, `direction`,
`method`, `coordinate`, `pair`, `sort`, `dir`, and `page`. Sorting covers the
whole filtered ledger before 50-row pagination. Copying a link or reloading
preserves the page and sorting. Filters reset pagination. CSV and JSON exports
include every filtered row and retain source-local IDs, titles, exact amounts,
and PDF provenance. Mobile uses labeled cards with its own sort control.

Analysis accepts `stage=nep|house` and
`view=overview|house_candidates|nep_candidates|adjustments|coordinates|stats`.
`records=region:<key>|band:<index>|amount:<pesos>|all` opens a supporting source
record dialog. Earlier `insertions`, `deletions`, `chainage`, and `statistics`
view links resolve to their corresponding FMR views. Candidate populations stay
provisional. Coordinates show endpoint-distance diagnostics, not construction
cost/km: the source supplies no road chainage or constructed road length.

Highlights accepts `story=<finding-id>` and story filters. Coverage and candidate
funding-change tables appear first. Each of the eight findings opens its own
fact panel, supporting records/controls, exports, PDF evidence and onward link.

`readingNote` links the bounded House comparison: extracted text is identical on
all 60 FMR annex pages (PDF 667–726) in the retained 2nd/3rd-reading copies. The
app still uses the normalized working-copy ledger; it does not fabricate a
separately extracted third-reading stage.

Unknown routes and invalid evidence selections show recovery actions. PDF
references use explicit FMR document metadata rather than the DPWH registry.

## Reused and shared components

- `WorkbenchHeader.jsx`: six FMR navigation items supplied by the entry point.
- `SortableTable.jsx`: sorting over all filtered rows, with optional pagination.
- `ShareLink.jsx`, `modalLifecycle.js`: shared links, native dialogs, focus restoration.
- `PdfPreview.jsx`: lazy PDF.js viewer with page, fit, zoom, and original download.
- `FmrApp.jsx`: the same source tree/evidence component for both FMR documents.
- `fmrModel.js`: project filters, allocation statistics, comparison rows, and CSV exports.
- `Fmr.css`, `styles.css`: FMR presentation and the existing workbench styles.

## Validation

```sh
npm test --prefix analysis/web
node analysis/web/src/fmrSmoke.mjs
python -m unittest discover -s other-analysis/tests -v
python scripts/check_fmr_pages.py
```

The browser check runs after build and packaging and requires Python Playwright
and Chrome/Chromium. It exercises all six tabs at mobile and desktop sizes, tree
expansion, deep links, global sorting, pagination, CSV downloads, reviewed images,
stacked dialogs, Highlight evidence, Analysis drill-downs, mobile overflow,
route-backed comparison sorting/paging, JSON exports, and all four source/control
PDFs with byte ranges. To test the development server directly, set
`FMR_WORKBENCH_URL=http://127.0.0.1:5173/`. Screenshots are saved to
`/tmp/fmr-ui-verification/`. The render smoke check exercises loaded data in all
main views and common deep links, rather than rendering only the loading shell.

See [FMR workbench guide](../../other-analysis/FMR_WORKBENCH.md) for source and
matching limitations. This branch has no separately published site.
