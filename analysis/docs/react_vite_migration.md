# React + Vite migration and PDF evidence preview

Updated: 9 October 2026. Status: all current workspaces run inside one local SPA;
publication uses the GitHub Pages workflow. See [workbench commands](../README.md)
and [ADR 0011](adr/0011-react-vite-migration.md).

## Purpose and boundary

Move shared page navigation, comparison tables, filters, selection, and source
preview into reusable React components. Python remains responsible for source
extraction, repairs, accounting, matching, and provenance. React reads retained
JSON; it must not manufacture balancing values or certify candidate matches.

The app lives at `/app/`. Root and six historical viewer entry points redirect
into its hash routes when packaged. React owns the shared header, routing,
loading, and workspace lifecycle; the migrated verification/detail controllers
retain their existing DOM rendering inside a scoped React component. There are
no embedded page frames or runtime script evaluation. This completes the route
migration, while conversion of every internal control to declarative React
components remains future work. Canonical audit data and source calculations
remain unchanged.

## Application structure

- `analysis/web/src/main.jsx`, `routes.js`, `WorkbenchHeader.jsx`: shared shell,
  hash routes, active tabs, and lazy-loaded workspaces.
- `SourceWorkspace.jsx` and `workspaces/`: scoped verification, NEP detail,
  House/NEP comparison, sorting, and review controllers. Workspace disposal
  removes observers, handlers, and pending tree search timers.
- `Comparison.jsx`: retained stage totals, PAP/project/gap tables, search,
  program/region/match filters, total/delta/percent sort, pagination, and source
  references. House printed PAP controls take precedence over extraction totals.
- `model.js`: integer-peso formatting and sorting helpers. Missing prior amounts
  produce unknown deltas; zero baselines produce unknown percentages. Unknown
  values remain last in either sort direction. Source JSON is not modified.
- `PdfPreview.jsx`: lazily loaded PDF.js pane; page controls, fit-width/zoom,
  worker parsing, cancellation, document lifecycle cleanup, and PDF fallback link.
- `data.js`: source-document/page mapping and URLs relative to the packaged app.

The app loads overview JSON on the homepage, stage JSON only on the comparison
route, and PDF.js/its worker only when a recorded source reference is opened.
The stage JSON remains approximately 25 MiB uncompressed; moving to React does
not remove that transfer. A later phase should split a manifest/PAP index from
project chunks while preserving globally correct search and sorting.

## PDF loading approach

The existing `paddle_pdf_ocr_v2/viewer-react-v2` reference uses PDF.js with
`disableStream: true`, `disableAutoFetch: true`, and `rangeChunkSize: 65536`.
This implementation carries over those settings and selected-page rendering,
but does not import the reference application's pipeline APIs or server plugins.

Byte ranges are file offsets, not page files. PDF.js can request additional
chunks for page trees, fonts, images, and other shared resources; 64 KiB is not a
promise about total bytes needed per page. Keep the document URL passed directly
to PDF.js; fetching an entire ArrayBuffer first defeats partial loading.

The production host must return `206 Partial Content`, `Content-Range`, a usable
content length, and `Accept-Ranges: bytes`. The published House I-B source was
checked with a real 64 KiB request and returned exactly those bytes. The Vite dev server serves retained JSON/PDF files directly with range support.
The local packaged preview server `scripts/serve_pages.py` also supports ranges,
including suffix and invalid-range handling. Plain `python -m http.server` does not provide this
preview guarantee. External PDF hosts would also need appropriate CORS headers;
this slice packages PDFs on the same origin.

Source mappings:

| Reference | Source document | Page convention |
|---|---|---|
| House PAP/project record | House Volume I-C | Retained `house_pages` / `house.pdf_page`, 1-based PDF page |
| NEP PAP/project/gap record | NEP Volume II-B OCR PDF | Retained `nep_page` / `pdf_page`, 1-based PDF page |
| Transparency API record | No printed PDF association established | Do not invent a PDF reference |

The NEP file at `dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf` has SHA-256
`bfc8282de8e3603f347f82aa2be34c25a38147e30aa34c12b11413766b7e7523`, matching
canonical extraction provenance. Packaging checks this hash before copying the
file to `/pdfs/`. Other downloaded NEP volumes are not required for this slice.

The preview sits to the right of the tables on desktop. On narrow screens,
Table / PDF source buttons switch between the two panels. Its toolbar follows
the reference viewer: previous/next page, a page selector, refresh, Fit W / Fit H,
and numeric zoom controls. Clear preview resets the evidence pane. Cancel prior renders when page/zoom changes; destroy prior document
loading tasks when the document changes or the pane clears. Track document URL
with the loaded PDF to prevent stale pages from appearing after a source switch.

## Build and preview

For local hot-reload development, from the repository root:

```sh
npm ci --prefix analysis/web
npm run dev --prefix analysis/web
```

Open the local URL printed by Vite and choose Compare stages. No second server
is needed: Vite serves retained data and PDFs directly from the repository, with
byte-range handling based on the reference viewer. The older workbench link uses
`/legacy/index.html`, served from `_site/` when a static package is available.
Production uses packaged files rather than this development middleware.

To validate the running dev server (substitute its port if needed):

```sh
REACT_WORKBENCH_URL=http://127.0.0.1:5176/ python scripts/check_react_pages.py
```

For a production build and packaged preview:

```sh
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py --with-react
python scripts/serve_pages.py --port 8000
```

Open `http://127.0.0.1:8000/app/` or `/app/#compare`.

Packaging includes the SPA by default; `--static-only` builds the historical
standalone viewers for diagnostics.

Vite uses a relative asset base because the app is mounted at
`/DPWH-NEP-HB-2027-ANALYSIS/app/`; source JSON/PDF URLs resolve one level above
that directory. Routes use hashes, so refreshing a comparison route requests a
real `/app/` file instead of an unsupported server route. Keep root and project
prefix browser checks when changing URL handling.

Pages CI installs Node 22 dependencies from the committed lockfile, runs model
regressions, builds Vite, and packages with `--with-react` after existing source,
accounting, template freshness, and navigation checks. A successful frontend
build does not replace those Python validation gates.

## Migration stages and acceptance

1. **Preview shell + stage comparison (implemented first slice).** Keep root and
   retained URLs working. Read canonical outputs. Exercise filters, pagination,
   null-safe total/delta/percent sorting, and source preview against real data.
2. **Verification workspace (implemented locally).** Preserve progressive/direct/recursive checks,
   PS/MOOE/CO scopes, branch/path navigation, source queues, expense summaries,
   crops and evidence selection. Preserve every audit category and its count.
3. **Evidence integration.** Synchronise tree selection with PDF page; add box
   overlays only when recorded coordinates and page geometry can be verified.
   Distinguish printed page labels from PDF page indices. Keep crop fallback.
4. **Data loading and performance.** Measure transfer, parsing, filter latency,
   and memory. Partition payloads or move indexing/sorting into a worker where
   justified. Never sort only the visible page of a global result set.
5. **Root cutover (implemented in the local package).** Validate all routes and
   historical entry points before publication.
   Preserve existing `.html` URLs with tested navigation/redirect entry points;
   update packaging/docs, then archive superseded presentation templates.

Outstanding limitations: internal verification/detail rendering still uses the
ported controllers; no crop/coordinate overlays or saved review decisions; project candidate
suggestions and detailed provenance panels have not been fully ported; no
performance improvement claim yet. PDF canvas output is visual evidence, not an
accessible text layer. Keep the original PDF link and add a text layer in the
accessibility phase. Native I-C now feeds the candidate comparison and stage trace; source certification and project identity review remain open.


## Validation of the first slice

`npm test --prefix analysis/web` covers unpaired and zero-base delta semantics,
unknown values in both sort directions, exact full-result sorting before
pagination, House printed-control precedence, and display units.
`test_pdf_range_server.py` checks full, partial, suffix, and invalid requests.

The packaged browser check is reproducible:

```sh
python -m pip install playwright==1.55.0
python -m playwright install chromium  # if a local Chrome is not available
python scripts/check_react_pages.py
```

It mounts the site under a project prefix and checks 390px and 1440px layouts,
homepage lazy loading, all seven SPA routes, source queues, expense scope, embedded PDF reference
buttons, absence of crop links, and browser history,
all three comparison table views, descending full-dataset delta
sorting, pagination/filter reset, direct hash-route reload, real NEP and House
page rendering, page navigation, side-pane layout, clear preview, and 206 range responses.
The first run completed with 68 partial responses and no page/HTTP errors.
This establishes functional preview coverage; it is not a full performance,
text accessibility, or source-certification assessment. Pages CI also runs this
browser check before publication.


## Local layout and sorting revision

The comparison page now uses compact source totals, a contained filter bar,
independently scrollable results with a sticky header, and the PDF pane on the
right. Text headers toggle ascending/descending. Amount headers open a menu for
total, delta, or percent sorting; selecting the same mode reverses direction.
The listing-gap table also sorts by amount, region, and PDF page. Header
`aria-sort` and visible arrows report the active direction. Keyboard menu
navigation supports arrows, Home/End, and Escape.

These revisions are available through `npm run dev` and the production SPA package.

## Deferred FAP coverage in the React PAP table

The React PAP totals table currently reads 45 non-FAP controls. It does not
explain the entire operations total shown above it, which includes FAP. This is
an outstanding presentation gap; retain the existing source data unchanged.
The retained source-comparison viewer already presents local/FAP program totals.

Planned revision: separate non-FAP and Foreign-Assisted Projects sections,
with program/project rollups and recorded PDF references. DBM NEP has
25 FAP projects totaling PHP 117,749,011,000 (PDF pages 688–690). House has
29 projects totaling PHP 44,749,011,000. The saved Transparency listing has no
established FAP coverage: represent that as unknown coverage rather than zero,
and do not infer individual project changes from these aggregate totals.
See [NEP reconciliation](nep_2027_api_reconciliation.md) and
[House rollups](hb_native_ib_rollup_checks.md). Implementation is deferred.

## Shared navigation and remaining SPA migration

Use the same primary tabs, in this order, across current pages: Home, Compare
stages, House GAB, DBM NEP, DPWH Transparency NEP, Repository README,
and Workbench README. React routes use `WorkbenchHeader.jsx`; React and retained
viewers share `page_navigation.css`. Retained page-specific section and detail
links sit in a separate navigation row. Active destinations use `aria-current`.
These are navigation links rather than ARIA tabs, since some still load another
page. Existing static URLs remain valid during migration.

Implemented locally: all three verification workspaces, detailed House/NEP
comparison, and NEP detail are now routes under the shared React shell. Evidence
queues, hierarchy navigation, expense classes, source references, review counts,
and detail-table sorting remain available. Source payloads load on demand. The
comparison retains its lazy PDF side pane. House GAB and DBM NEP verification
now reuse that component alongside the trees; cropped-image blocks and links
are removed from these migrated views.
Use hash routes while hosted on GitHub Pages so direct refresh does not need
server rewrites. Keep downloadable outputs and Markdown outside the SPA.

Packaging now redirects the root and all six old `.html` entry points into
the SPA and preserves review/section fragments. The Pages workflow publishes this package after validation.


## Current route map and packaging

| Workspace | Route | Historical URL |
| --- | --- | --- |
| Overview | `#home` | `index.html` |
| Stage comparison | `#compare` | `analysis/stage_trace_2027.html` |
| House verification | `#house` | `analysis/hb_native_verification.html` |
| DBM NEP verification | `#nep` | `analysis/nep_source_verification.html` |
| Transparency NEP verification | `#transparency` | `analysis/dpwh_nep_api_verification.html` |
| House / NEP detail | `#house-nep` | `analysis/source_comparison_2027.html` |
| NEP detail | `#nep-detail` | `analysis/nep_2027_tree.html` |

`#nep?view=review` opens the source queue. Verification routes accept `node`
for a recorded entity ID; `section` preserves old in-page anchors. Unknown routes
show a recovery link. Back/Forward and refresh work without server rewrites.

Run `npm run dev --prefix analysis/web` for one local server. It serves canonical
JSON, verification payloads extracted from validated retained pages, crop images,
and range-enabled PDFs. No separate backend is needed. Build with
`npm run build --prefix analysis/web`, then `python scripts/build_pages.py`.
The SPA is now the default package; `--with-react` remains a compatible alias.
`--static-only` is available for historical viewer diagnostics. Packaging emits
verification JSON from the same validated embedded data; it does not rerun PDF
extraction. Compatibility pages include direct app and README links.

## Source-tree PDF panes

House GAB (`#house`) and DBM NEP (`#nep`) use the same lazy `PdfPreview` component
as stage comparisons. A controller selection callback passes the selected
node's recorded one-based PDF page to React. House trees reference **Volume I-B**,
while House project comparisons reference **Volume I-C**; these page indices
must not be interchanged. DBM uses the retained **NEP Volume II-B** PDF.

On desktop, the tree and rollup/evidence details occupy the left column, with a
sticky PDF pane on the right. On narrow screens the pane stacks below the active
tree/evidence panel. Root selection, branch/path navigation, expense scopes,
deep entity links, and review-queue selection update the PDF. A node without a
recorded PDF page clears the preview. Clear preview leaves tree selection intact;
selecting another referenced node opens the viewer again. The same page selector,
previous/next, refresh, fit, zoom, cancellation, and range-loading controls apply.
The Transparency tree has no established PDF mapping and does not gain a pane.


## Source-reference cleanup

House GAB and DBM NEP verification controllers now receive selection, download,
viewport, and initial-route callbacks/values rather than legacy `SITE_CONFIG`.
They do not construct PDF URLs or `#page=` links. Row and detail page references
are keyboard-accessible buttons: they select the corresponding node and open
its page in the embedded viewer. Explicit preview clicks reveal the PDF pane;
normal tree selection synchronizes it without forcing a scroll.

`data.js` owns the document registry and asset resolution. Tree references map
House to Volume I-B; comparison/project references map House to Volume I-C.
Both NEP views use the retained Volume II-B. Invalid or absent page indices do
not create a reference. The shared PDF viewer retains its original-document
link as an explicit way to open the full PDF.

Crop images, crop links, row-area markers, and the crop-provenance download link
are removed from the two migrated verification views. Review reasons, raw PDF
text candidates, expenditure columns, progressive sums, and review navigation
remain. Instructions now refer to the PDF preview. Retained crop artifacts and
provenance remain available to historical audits and standalone diagnostics;
this UI cleanup does not delete or alter source evidence.
