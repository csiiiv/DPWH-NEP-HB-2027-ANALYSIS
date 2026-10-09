# React + Vite migration and PDF evidence preview

Updated: 9 October 2026. Status: first migration slice implemented; current static
viewers remain the published baseline. See [workbench commands](../README.md)
and [ADR 0011](adr/0011-react-vite-migration.md).

## Purpose and boundary

Move shared page navigation, comparison tables, filters, selection, and source
preview into reusable React components. Python remains responsible for source
extraction, repairs, accounting, matching, and provenance. React reads retained
JSON; it must not manufacture balancing values or certify candidate matches.

The first slice lives at `/app/` beside the existing homepage and six viewers.
It includes a React homepage, stage comparison with PAP/project/listing-gap
views, full-result filtering and sorting before pagination, and a source PDF
preview. Existing verification pages remain accessible through navigation tabs.
The root homepage has not been replaced. Migration is incomplete.

## Application structure

- `analysis/web/src/main.jsx`: shared shell, hash navigation, lazy comparison
  route, and overview fetched independently from comparison data.
- `Comparison.jsx`: retained stage totals, PAP/project/gap tables, search,
  program/region/match filters, total/delta/percent sort, pagination, and source
  references. House printed PAP controls take precedence over extraction totals.
- `model.js`: integer-peso formatting and sorting helpers. Missing prior amounts
  produce unknown deltas; zero baselines produce unknown percentages. Unknown
  values remain last in either sort direction. Source JSON is not modified.
- `PdfPreview.jsx`: lazily loaded PDF.js dialog; page controls, fit-width/zoom,
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
checked with a real 64 KiB request and returned exactly those bytes. The local
preview server `scripts/serve_pages.py` supports ranges, including suffix and
invalid-range handling. Plain `python -m http.server` does not provide this
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

The preview is a native modal dialog with keyboard focus containment and Escape
to close. Cancel prior renders when page/zoom changes; destroy prior document
loading tasks when the document changes or the dialog closes. Track document URL
with the loaded PDF to prevent stale pages from appearing after a source switch.

## Build and preview

From the repository root:

```sh
npm ci --prefix analysis/web
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py --with-react
python scripts/serve_pages.py --port 8000
```

Open `http://127.0.0.1:8000/app/` or `/app/#compare`. Use the packaged preview for
PDF and source-link checks. For hot-reload development, keep that preview server running and run
`npm run dev --prefix analysis/web` in another terminal. Vite proxies data and
PDF requests to port 8000; the proxy is development-only.

The original packaging command without `--with-react`
continues to build the existing static site independently.

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
2. **Verification workspace (next).** Port progressive/direct/recursive checks,
   PS/MOOE/CO scopes, branch/path navigation, source queues, expense summaries,
   crops and evidence selection. Preserve every audit category and its count.
3. **Evidence integration.** Synchronise tree selection with PDF page; add box
   overlays only when recorded coordinates and page geometry can be verified.
   Distinguish printed page labels from PDF page indices. Keep crop fallback.
4. **Data loading and performance.** Measure transfer, parsing, filter latency,
   and memory. Partition payloads or move indexing/sorting into a worker where
   justified. Never sort only the visible page of a global result set.
5. **Root cutover.** Replace the current homepage only after parity tests pass.
   Preserve existing `.html` URLs with tested navigation/redirect entry points;
   update packaging/docs, then archive superseded presentation templates.

Outstanding first-slice limitations: verification remains in the current static
viewers; no crop/coordinate overlays or saved review decisions; project candidate
suggestions and detailed provenance panels have not been fully ported; no
performance improvement claim yet. PDF canvas output is visual evidence, not an
accessible text layer. Keep the original PDF link and add a text layer in the
accessibility phase. Source certification and Native I-C extraction remain open.


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
homepage lazy loading, all three table views, descending full-dataset delta
sorting, pagination/filter reset, direct hash-route reload, real NEP and House
page rendering, page navigation, modal close/Escape, and 206 range responses.
The first run completed with 68 partial responses and no page/HTTP errors.
This establishes functional preview coverage; it is not a full performance,
text accessibility, or source-certification assessment. Pages CI also runs this
browser check before publication.
