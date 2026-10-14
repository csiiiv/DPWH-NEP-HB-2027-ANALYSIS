# Building a source-verification workbench: the FMR implementation as a reference

**Purpose.** This documents how the FMR pages were built using the existing DPWH
workbench as the guide — what was carried over unchanged, what had to be
implemented closely, what was deliberately *not* carried over, and what was
checked at each step. It is written to be reused when building equivalent pages
for the other retained project data (NIA, HFEP, and any future annex).

Companion documents: [DPWH UI/UX baseline review](FMR_DPWH_UI_UX_REVIEW.md)
(what the original app does, tab by tab) · [FMR workbench guide](FMR_WORKBENCH.md)
(data scope and matching limits) · [NIA workbench guide](../analysis-nia/NIA_WORKBENCH.md)
· [app README](../analysis/web/README.md).

---

## 1. The shape of the thing

A workbench is **one derived JSON payload** produced by **one Python builder**,
consumed by **one React workspace** of six-ish tabs. Nothing queries a live API.
The pipeline is:

```text
retained source PDFs
  → extract_<domain>.py            (native text + ruled-cell table geometry)
  → <domain>_tree.json / _audit.json / _projects.csv
  → normalize_<domain>_*.py        (interpretation layer; raw text immutable)
  → *_coordinates_normalized.json / *_normalized.csv / audit
  → build_<domain>_workbench.py    (joins stages, matches rows, enforces invariants)
  → data/<domain>_workbench.json   (git-ignored derived payload)
  → React app                      (pure client-side rendering + route state)
  → scripts/build_<domain>_pages.py → _site/  (packaged static preview)
```

Every arrow is a separate, independently `--check`-able step. That is the single
most transferable decision: **the browser never computes an authoritative
number**, and the builder never trusts the app to be correct.

---

## 2. What was carried over from the DPWH baseline (reuse, don't rewrite)

These components are shared as-is or with a small prop added. Do not fork them
when building the next workspace — extend them.

| Component | Why it carries over | What was added for FMR |
|---|---|---|
| `Workbench.jsx` | 22-line shell that routes between workspaces by hash prefix | nothing — it just gained a second lazy branch |
| `routes.js` | Single source of route keys; `routeHref(key, params, workspace)` keeps links inside the active workspace | `fmrPages` list + `readWorkspace()` recognizing an `#fmr/` prefix |
| `WorkbenchHeader.jsx` | Renders the workspace selector and the tab row | an `items` prop so a workspace can supply its own tabs |
| `SortableTable.jsx` | The table primitive: header buttons with `aria-sort`, client-side re-sort without mutating data, missing values always sink, three-state sort cycle, optional `pageSize`, optional `tableId` deep-link anchor, optional grouped header bands | **controlled mode**: pass `sort`/`page` + change handlers to back them with route state instead of internal state |
| `PdfPreview.jsx` | Lazy PDF.js viewer with page/fit/zoom and original download | nothing |
| `ShareLink.jsx`, `modalLifecycle.js` | Native dialogs, Escape, focus restoration, shared scroll lock | nothing |
| `styles.css` | The visual language: `#f5f7fa` canvas, `#203147` text, 15px/1.55, centered 1440px shell, hero/`.stat`/card radii, tinted table headers | a **scoped** `Fmr.css` layer for new structures — never a competing style system |

### The workspace-prefix pattern (how to add a third workspace)

`routes.js` gives the new app a hash prefix while reusing the *same tab keys*:

```js
export function readWorkspace(hash) {
  const path = (hash ?? location.hash).replace(/^#\/?/, "").split("?")[0];
  return path.split("/")[0] === "fmr" ? "fmr" : "dpwh";
}
export function routeHref(key, params = {}, workspace = readWorkspace()) {
  const query = new URLSearchParams(params).toString();
  const prefix = workspace === "fmr" ? "fmr/" : "";
  return `#${prefix}${key}${query ? "?" + query : ""}`;
}
```

Consequences worth preserving for NIA/HFEP:

- **Every published DPWH link keeps resolving.** Legacy routes are untouched;
  `legacyRoutes` maps old `.html` filenames to keys and the dev middleware
  redirects them.
- **Workspace switching keeps the reader on the analogous tab.** Because FMR
  reuses keys `home/highlights/compare/analysis/house/nep`, `workspaceHref()`
  maps tab→tab and falls back to `home` only when the target has no analogue.
- **Query params stay behind on switch** — each workspace interprets its own
  filters, so a DPWH `?status=` never leaks into FMR.
- **The new workspace is lazy-loaded** (`React.lazy(() => import("./FmrApp.jsx"))`),
  so the existing app's bundle and behavior are unaffected until its routes open.

Add `nia`/`hfep` the same way: a prefix, a `<domain>Pages` tab list, a branch in
`Workbench.jsx`, and an entry in the header's workspace selector.

---

## 3. The data contract (the part that decides whether the rest is easy)

### One builder, one payload, one version check

`build_fmr_workbench.py` produces `data/fmr_workbench.json`; the app fetches it
once and validates `schema_version !== 1 → throw`. Payload keys:

```text
schema_version, fiscal_year,
stages: { house: {…}, nep: {…} },   // per document: metadata, root, regions, projects,
                                    // summary, audit_summary, control_checks, provenance
comparison: [ {id, status, method, region_key, house_id, nep_id, delta_php, …} ],
regions:   [ {key, label, nep_php, house_php, delta_php, counts, sources} ],
psgc_validation: { …evidence summary + points_by_project },
comparison_summary: { counts, methods, deltas, changed_pairs },
matching_note: "…"                  // provenance of the matching method, in the payload itself
```

For a single-document annex (HFEP, or NIA without a comparison) the shape
collapses to `stages` + `summary` + `audit_summary`; `comparison`/`regions`
simply don't exist. Don't invent a comparison the data can't support.

### Invariants enforced at build time with `raise`

These are the reason `--check` is trustworthy. Port them all:

1. **Exact partition.** Every source row appears exactly once in the comparison:
   `Counter(ids) != Counter(all project ids) → ValueError`. A dropped or
   duplicated row fails the build rather than skewing a total.
2. **Money identity.** `paired_delta + house_only − nep_only == control difference`,
   checked against the printed root amounts, not against recomputed sums.
3. **Child arithmetic.** Printed control == sum of children, per node, plus
   independent cross-volume control checks carried in `control_checks`.
4. **Evidence freshness.** Any attached provenance layer (here: PSGC) is
   re-hashed against the layers it was built from; drift fails the build with an
   explicit "rerun X" message. This is what stops the app from showing stale
   evidence after an upstream rebuild.

### `--check` means byte-identical

```python
if args.check:
    if not OUTPUT.exists() or OUTPUT.read_text() != content:
        raise SystemExit('…missing or stale; run the builder')
```

Serialize deterministically (`separators=(',', ':')`, `ensure_ascii=False`,
trailing newline, no timestamps in the compared content — put
`generated_date` only where a rebuild is expected to be compared as text, and
keep it out of anything hashed for freshness). Same pattern for the normalizers,
the validator, and the final datasets.

### Keep the payload lean; reconstruct in the model

Project records carry **labels and IDs, not duplicated tree nodes**. The
hierarchy path is rebuilt on demand:

```js
export function sourcePath(stage, id) { /* root → region → project from stage.regions[].project_ids */ }
export function sourceArithmetic(stage, id) { /* printed, child_sum, leaf_sum, leaf_count, difference */ }
```

FMR's payload is ~3.9 MB, so it loads whole. DPWH's per-record payload is
~50 MB and therefore lazy-loads. **Decision rule:** stay single-payload until
the file is genuinely too large, then split *and preserve the same provenance
and `--check` discipline*. Don't pre-split. Watch what you attach, though: the
FMR payload grew from ~2.85 MB to ~3.9 MB purely by embedding the per-point PSGC
evidence, and the baseline review's sizing advice predates that. Attach evidence
for the rows that need it rather than for every row when the volume is large.

### Cross-workspace summary without the full payload

`fmr_summary()` emits a tiny JSON (counts + printed controls + a workspace href)
so the *other* workspace can show a coverage row without fetching megabytes.
Only build-time aggregates travel across; the source workspace stays the
authority for pairing and evidence. Use this for the Home/Highlights coverage
tables of the next annex.

---

## 4. The model layer: pure functions, fully unit-tested

`fmrModel.js` (282 lines) holds every computation the UI needs. No React, no
fetch, no DOM. This is what makes `npm test` meaningful (105 tests) and what
makes the views thin. Port these categories:

**Formatting.** `money`, `compactMoney` (M/B in dense views), `signedMoney`,
`pctChange`, `signedPct`, `formatKm`. Compact for display, exact in tooltips and
exports — never round a stored value.

**One comparator contract.** `sortRows(rows, getValue, sort)` deliberately
mirrors `SortableTable`'s internal comparator (missing values sink, numbers
compare numerically, else `localeCompare` with `{numeric: true}`) so route-backed
mobile cards and the desktop table always agree on order.

**Filtering.** Pure predicates that compose: `filterProjects(projects, {q,
region, status, category, extraction, rule, review_flag, text_basis, amount…})`
and `filterComparisons(rows, {…})`. Note the guard pattern for side-scoped
filters: `hasSideFilter` is computed once so an absent filter never accidentally
empties the result.

**Aggregates that re-prove the money.** `candidateAggregates(rows)` recomputes
counts, per-direction moves, and the identity `paired Δ + house_only − nep_only`
in the browser, so a filtered view can't contradict the builder.

**Statistics.** `allocationStats`, `bandRows` + `AMOUNT_BANDS`, `roundingLadder`
(classifies each amount to its *coarsest* matching granularity so shares sum to
1), `repeatedAmounts`, `regionAllocationRows`, `overviewRegionRows`.

**Provenance surfacing.** `projectMatchesProvenance`, `projectTextBasis`,
`hadCoordinateInterpretation`, `provenanceOptionLists(projects)` — builds select
options **from the population currently in view**, with counts, sorted by
frequency. This is why a filter dropdown never offers a value with zero matches.

**Exports.** `csvText(headers, rows)` with a BOM, CRLF, doubled quotes, and
**formula-injection protection**:

```js
if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
```

Extracted titles come from OCR'd budget documents; a title starting with `=` or
`-` would otherwise execute in Excel. Carry this into every exporter.

---

## 5. Route state: the feature that makes findings shareable

Every filter, sort, page, selection, and PDF position lives in the hash. A
copied link reproduces the exact view.

| Route | Params |
|---|---|
| `#fmr/home` | — |
| `#fmr/highlights` | `story=<finding-id>`, story filters |
| `#nia/highlights` | `story=<finding-id>` (`annex-increase`, `subprogram-shift`, `changed-pairs`, `insertions`, `deletions`, `pairing-coverage`, `ai-monitoring`, `agency-scope`, `extraction-review`), story filters (`q`, `subprogram`) |
| `#fmr/compare` | `view=regions\|projects`, `region`, `q`, `status`, `direction`, `method`, `coordinate`, `coord_side`, `pair`, `sort`, `dir`, `page`, `extraction`, `rule`, `review_flag`, `text_basis` |
| `#fmr/analysis` | `stage`, `view=overview\|insertions\|deletions\|adjustments\|coordinates\|stats` (legacy `house_candidates`\|`nep_candidates`\|`statistics`\|`chainage` still resolve), `records=region:<key>\|band:<i>\|amount:<pesos>\|all` |
| `#fmr/house`, `#fmr/nep` | `view=tree\|projects\|review`, `node`, `q`, `region`, `status`, `category`, provenance filters |
| `#nia/analysis` | `view=overview\|insertions\|deletions\|adjustments\|stats\|ai_monitoring\|candidates\|controls`; Overview/Statistics/AI monitoring: `stage=house\|nep`; AI monitoring: `aiBasis=all\|explicit\|ocr_variant`; candidate views: `dim`, `ranking`, `direction`, `group`; supporting records: `records=top10`, `top10:<sub-program-key>` or `ai_insertions`; shared `q`, `subprogram`, `status`, sort/dir/page |
| `#nia/house`, `#nia/nep` | `view=tree\|projects\|review`, `node`, `q`, `subprogram`, `status` |
| any | `pdf`, `pdfPage` |

NIA follows the FMR/DPWH Analysis pattern: source-specific Overview and
Statistics, separate Insertions/Deletions/Adjustments, Candidates and Agency
controls. Additional analysis uses the existing tables and evidence dialogs:
Overview adds allocation shares; Candidates adds per-sub-program funding
reconciliation and row/peso pairing coverage; Statistics adds overall and
within-sub-program top-ten concentration with original source records. An
additional AI monitoring tab follows the same pattern for related whole-project
allocations, retaining raw titles and labeling NEP OCR variants separately.

Implementation notes worth repeating:

- `navigate(route, patch)` merges params and **deletes empty/null keys**, so the
  URL never accumulates cruft.
- **Sorting/filtering runs over the entire filtered ledger before pagination**
  (50-row pages). Results report filtered-vs-total counts. Exports include every
  filtered row regardless of the displayed page.
- **Filters reset pagination; sort/page survive reload and copy.** The earlier
  component-local sort/page state was the specific defect that motivated
  `SortableTable`'s controlled mode.
- Unsupported/invalid selections render a recovery action ("Open FMR Home",
  "Clear PDF selection", "Select program control") rather than a blank screen.
- Earlier DPWH view names (`insertions`, `deletions`, `chainage`, `statistics`)
  resolve as aliases so old links keep working.

---

## 6. The tab set, and what each tab is for

The tab set is the reusable skeleton — FMR ships seven entries (`home`,
`highlights`, `compare`, `analysis`, `map`, `house`, `nep`), where the two
source tabs are one component rendered against two documents. Each tab has one
job; keep them distinct.

1. **Source verification (`#house`, `#nep`) — one component for both documents.**
   `SourceWorkspace` renders tree above selected evidence in the left column and
   a **sticky inline PDF** in the right column; selecting a node updates the PDF
   automatically. Evidence shows clickable parent breadcrumbs, printed amount,
   immediate-child sum, recursive terminal-leaf sum, difference, leaf count, and
   source reference. Three views: `tree`, `projects`, `review`. The review queue
   has category chips with counts, region scoping, previous/next navigation that
   respects the current scope, and an explicit "next check" instruction.
   Desktop/mobile split via `mobile-panels` buttons (Tree/results · Selected
   evidence · Show source PDF); on mobile the PDF stacks below with a reveal
   action instead of being squeezed beside the tree.
2. **Compare (`#compare`)** — two views (regional controls, project candidates).
   Compact hero, collapsed method/context disclosure, visible primary filters,
   advanced filters behind a disclosure, removable chips, inline source buttons,
   filtered-result analytics, CSV **and** JSON export, route-backed sort/page,
   labeled mobile cards.
3. **Home** — orients and routes: stage totals, candidate buckets (count **and**
   funding) each linking to its real filtered view, a workspace directory, source
   audit/coverage status. It introduces tasks; it doesn't repeat tables.
4. **Highlights** — coverage/change tables, then a numbered story list, each
   opening a dedicated evidence dialog (`story=<id>`) with key figures, basis
   explanation, sortable/exportable supporting records, PDF links, and an onward
   link into the filtered workbench. Don't manufacture a fixed number of stories;
   each needs a real question and real evidence.
5. **Analysis** — question-oriented views. FMR uses a source selector with
   overview, per-stage candidate rankings, adjustments, coordinates, and
   allocation statistics; every aggregate can open its underlying record
   population (`records=…`). NIA keeps the same format with Overview,
   Insertions, Deletions, Adjustments, Statistics, Candidates and Agency
   controls (see route table above and `NIA_WORKBENCH.md`). Additional
   analyses fit inside those views; irrigation has no coordinate diagnostics.
6. **Map** *(FMR-specific addition)* — plots normalized coordinates. Worth
   noting but **not** part of the generalizable skeleton: it only exists because
   FMR rows carry coordinates. NIA/HFEP have no comparable geometry, so don't
   expect an equivalent tab; substitute whatever spatial or categorical lens the
   data actually supports, or omit it.

---

## 7. What had to be implemented closely (the easy-to-get-wrong list)

These are the review points that caught real problems, or that would silently
mislead a reader if done loosely. Treat them as a checklist.

**Counts must name their grain.** Source project vs comparison row vs segment vs
point vs control vs flag category are different populations. Overlapping flag
counts need a visible "categories overlap" note. FMR states this in-place:
"Categories overlap. Multiple segments alone are excluded from the review queue."

**Money never multiplies.** A multi-segment project expands into several segment
and point records; segment/point tables and CSVs therefore **omit amounts**. In
JSON, `points`, `segments`, and project `coordinates` are three views of the same
observations and must not be concatenated or counted as extra locations. Parents
describe the same money as their children — never summed together.

**Missing ≠ zero.** An unmatched counterpart renders blank/`null`, never `0`.
`money(null) → '—'`. This keeps a one-sided row from looking like a cut.

**Statuses stay separate axes.** Arithmetic balance, source-review status,
matching method, and coordinate interpretation are four independent fields with
four independent badges. A coordinate badge must never imply source or location
certification, and **no UI action silently clears a flag or certifies a
project**. Provisional matches stay labelled provisional in the UI, the exports,
and the payload's `matching_note`.

**Don't copy controls until the data exists.** The DPWH baseline has House
reading toggles and PS/MOOE/CO expenditure-class selectors. FMR deliberately
did **not** carry them over, because the supplied FMR copy has unauthenticated
reading status and both schedules share one three-level hierarchy. Same for
**chainage**: DPWH measures road chainage; FMR's source supplies none, so the
chainage views were not ported and endpoint distance is labelled a *diagnostic*
that "cannot substitute for constructed road length or a valid PHP/km
denominator." Rule: a control implies a data field; no field, no control.

**PDF provenance is per-document and explicit.** Sources resolve against each
stage's own `metadata.source_pdf` / `cross_volume_source_pdf`, not a shared
registry. An unknown `pdf` param or non-positive page renders an alert with a
clear action. Large PDFs need **byte-range** support end to end (dev middleware
`Accept-Ranges`/206, packaging that preserves original paths, QA that counts
range responses).

**Inline PDF beats a modal for routine verification.** The baseline review found
FMR's modal-only PDF added a context change to every inspection. The final
implementation: sticky inline pane beside the tree on desktop, stacked below on
mobile, modal retained for secondary/global links. `inlineSource` is computed per
route so `house`/`nep`/`compare` get the pane and other tabs get the dialog.

**Mobile markup is not inherited.** Importing `SortableTable` does **not** bring
`Comparison.jsx`'s responsive row-card layout. Cards, the dedicated mobile sort
control (table headers are hidden), and the panel switcher are explicit work.
Re-measure after layout changes: the baseline review recorded FMR's project
search starting ~819px down the viewport vs ~569px in DPWH, because always-visible
metric cards and intro text preceded the working controls — fixed with a compact
hero and collapsed context.

**Accessibility is behavior, not decoration.** Skip-to-content link, `tabIndex={-1}`
target, `aria-sort` on sortable headers, `aria-pressed` on toggle chips,
`aria-live="polite"` on pagination, focus restoration and scroll lock in
`modalLifecycle.js`, `/` to focus search (guarded against firing inside inputs),
tree Right/Left/Enter keyboard navigation, visible focus rings, empty and error
states with recovery actions, reduced-motion support.

**Payload/schema drift fails loudly.** `schema_version` check on load, builder
`raise`s on invariant violation, evidence layers hash-anchored. The app shows
"FMR data could not load — build the FMR dataset, then reload" rather than
rendering an empty shell.

---

## 8. Verification loop (run all of these; they catch different classes of bug)

```sh
npm ci --prefix analysis/web
npm test --prefix analysis/web                     # pure model functions (105 tests)
node analysis/web/src/fmrSmoke.mjs                 # render smoke: exercises loaded data in all views
python -m unittest discover -s other-analysis/tests -v   # extraction + normalization + evidence (63)
python other-analysis/build_fmr_workbench.py --check     # payload byte-identical
python other-analysis/validate_fmr_coordinates_psgc.py --check
python other-analysis/build_fmr_final_dataset.py --check
npm run build --prefix analysis/web
python scripts/build_fmr_pages.py && python scripts/serve_pages.py --port 8000
python scripts/check_fmr_pages.py                  # Playwright browser QA
```

`predev`/`prebuild` run the workbench builder, so the dev server can't serve a
stale payload by accident.

**What the browser QA covers** (`check_fmr_pages.py`, ~63 s): all routes at
**390px and 1440px** with a `no_overflow()` assertion after each navigation
(`document.documentElement.scrollWidth <= innerWidth`), tree expansion,
persisted selections, full-result sorting, pagination, CSV/JSON downloads,
review images, region/category-scoped queues, Highlight and Analysis dialogs,
stacked-dialog dismissal (asserting `body.style.overflow !== 'hidden'` after
close so a dismissed dialog can't leave the page unscrollable), mobile cards and
overflow, and PDF range rendering for all four source documents. It also fails
on any console error or failed HTTP response, and writes screenshots to
`/tmp/fmr-ui-verification/`.

**Division of labor:** Python tests own extraction/normalization/evidence truth;
Node tests own model arithmetic and route/filter logic; the smoke check owns
"the views render with real data, not just a loading shell"; Playwright owns
layout, interaction, overflow, and document loading. Don't try to make one layer
cover another's job.

---

## 9. Serving and packaging

**Dev (`vite.config.js`)** — a `retainedFiles()` middleware serves files
straight from the checkout so nothing has to be copied to develop:

- `base: "./"` so the build works under a domain root *or* a project prefix.
- A prefix→directories route table (`/other-analysis/`, `/HB_BUDGET/`,
  `/dbm-other-nep-line-data/`, `/analysis/` …) with several candidate roots per
  prefix.
- **Path-traversal guard**: a candidate is accepted only if
  `file.startsWith(dir + path.sep)` and it's an existing file.
- Correct `Content-Type` per extension (including `.md` as `text/plain` so docs
  render, and `.png` for review evidence), `Accept-Ranges: bytes`, and real
  206 partial responses with `Content-Range`, `HEAD` support, and stream
  cleanup on `close`/`error`.
- Legacy `.html` routes redirect into the hash router, preserving the fragment
  (and mapping `#review` → `?view=review`).
- An adapter that extracts the embedded `<script id="sourceData">` JSON from the
  old standalone verification HTML pages, so legacy datasets stay readable
  without duplicating them.

**Package (`build_fmr_pages.py`)** — rebuild `_site/` from scratch: `dist` →
`_site/app`; **copy each source PDF to its original relative path** so evidence
links and byte ranges agree with the checkout; copy the data directory and the
`.md`/`.csv`/`.json` docs; write `.nojekyll`; write a root `index.html` that
redirects into `/app/` **preserving `location.search` and `location.hash`**.
Nothing is published by these commands.

---

## 10. Checklist for the next annex (NIA / HFEP landed; keep for future schedules)

NIA and HFEP workspaces are live under `#nia/` and `#hfep/`. Keep this checklist
for any future annex. NIA Analysis intentionally diverged from FMR's
house_candidates/coordinates shape — see `#nia/analysis` in the route table and
[NIA_WORKBENCH.md](../analysis-nia/NIA_WORKBENCH.md).

**Data**
- [x] Extraction produces a tree + audit + per-row CSV, with source PDF hash,
      PDF page, printed page, table row, and bbox on every row.
- [x] Distinguish control/total rows from named item rows; record both. Verify
      page offsets per annex — FMR is printed+16, HFEP +20, NIA +22, and these
      do **not** extrapolate.
- [x] Normalization layer keeps raw text immutable, records applied rules, and
      keeps flags for anything it can't prove.
- [x] Builder enforces exact partition, printed-vs-child arithmetic, and the
      money identity; all with `raise`, all re-verifiable via `--check`.
- [x] Any attached evidence layer is hash-anchored and its freshness re-checked
      at build time.
- [x] Derived payload git-ignored; source trees and audits retained.

**App**
- [x] Add a workspace prefix and `<domain>Pages` tab list in `routes.js`; a lazy
      branch in `Workbench.jsx`; a header entry. Reuse tab keys where an analogy
      exists so workspace switching stays sensible.
- [x] One builder → one payload → `schema_version` check → explicit load/error
      states.
- [x] All computation in a pure `<domain>Model.js`; unit-test every formatter,
      filter, aggregate, and exporter. Mirror `SortableTable`'s comparator.
- [x] Port `SourceWorkspace` (or the equivalent single-document view) before
      building comparison/analysis tabs — verification is the core task.
- [x] Route-back every filter, sort, page, and selection; sort the full filtered
      result before paginating; export all filtered rows; reset page on filter
      change.
- [x] Label every count with its grain; keep the four status axes separate;
      render missing counterparts as unavailable.
- [x] Add only the controls the data supports. No chainage without chainage; no
      reading toggle without an authenticated reading; no map without geometry.
- [x] CSV injection guard + BOM in every exporter.
- [x] Mobile: explicit panel switcher, row cards, dedicated sort control,
      stacked PDF with a reveal action. Re-measure control position after layout
      changes.
- [x] A11y: skip link, `aria-sort`/`aria-current`/`aria-live`, focus restoration,
      `/` search, tree keyboard nav, empty/error states with recovery actions.

**Verify & ship**
- [x] Node tests, render smoke, Python tests, every `--check`, then build.
- [x] Playwright QA at 390px and 1440px: no overflow, no console errors, no
      failed requests, exports, dialogs (including stacked dismissal), and PDF
      range rendering for every referenced document.
- [x] Package with original document paths preserved and a query/hash-preserving
      root redirect; preview locally under both a domain root and a project
      prefix.
- [x] Document scope and limits in the annex README — what was checked, what was
      not, and which labels remain provisional.

---

## 11. Source map

| Path | Role |
|---|---|
| `analysis/web/src/Workbench.jsx` | Workspace shell / lazy switch |
| `analysis/web/src/routes.js` | Route keys, workspace prefix, `routeHref`, legacy map |
| `analysis/web/src/WorkbenchHeader.jsx` | Shared header + workspace selector |
| `analysis/web/src/DpwhApp.jsx` | Baseline workspace (reference implementation) |
| `analysis/web/src/FmrApp.jsx` | FMR workspace: all tabs |
| `analysis/web/src/fmrModel.js` | Pure FMR model layer |
| `analysis/web/src/NiaApp.jsx` | NIA workspace: Home/Highlights/Compare/Analysis/sources |
| `analysis/web/src/niaModel.js` | Pure NIA model: filters, comparison rows, exports |
| `analysis/web/src/niaAnalysis.js` | Additional NIA analysis: funding reconciliation, pairing coverage, concentration, AI monitoring classification |
| `analysis/web/src/SortableTable.jsx` | Shared table primitive, internal + controlled modes |
| `analysis/web/src/PdfPreview.jsx`, `ShareLink.jsx`, `modalLifecycle.js` | Shared PDF/link/dialog behavior |
| `analysis/web/src/styles.css`, `Fmr.css`, `Nia.css` | Shared visual language + scoped layers |
| `analysis/web/src/fmrSmoke.mjs` | Render smoke check |
| `analysis/web/vite.config.js` | Dev middleware: retained files, ranges, legacy redirects |
| `other-analysis/build_fmr_workbench.py` | Builder: stages, matching, invariants, `--check` |
| `analysis-nia/build_nia_workbench.py` | NIA builder: stages, unique-title pairs, money identity, `--check` |
| `other-analysis/extract_*.py`, `normalize_*.py`, `validate_*.py`, `build_fmr_final_dataset.py` | Data pipeline stages |
| `other-analysis/tests/`, `analysis-nia/tests/` | Python regressions |
| `scripts/build_pages.py`, `serve_pages.py`, `check_fmr_pages.py`, `check_nia_pages.py`, `check_hfep_pages.py` | Packaging, local preview, browser QA |
| `analysis/web/src/Analysis.jsx`, `Comparison.jsx`, `Highlights.jsx`, `HighlightModal.jsx`, `SourceWorkspace.jsx` | DPWH baseline components worth reading before porting |


## 12. FMR analytical review flags

`#fmr/analysis?view=red_flags&stage=house` opens the source-level review table.
The pure model in `analysis/web/src/fmrRedFlags.js` derives annotations without
changing retained records. `FmrRedFlags.jsx` supplies editable URL-persisted
thresholds, overlapping category counts, evidence dialogs and filtered CSV/JSON.

Initial screens: positive section spans below 100 m, collapsed endpoints, spans
above 10 km, high allocation per endpoint meter, incomplete/unresolved geometry,
printed-point PSGC versus parsed-title province disagreements, exact shared
footprints within one source, repeated sections within one project, and candidate
allocation increases of at least 25% on unchanged coordinate footprints. These
are review leads, not determinations of impropriety or engineering standards.

Endpoint distance is not measured road length. The allocation proxy divides the
project allocation once by the sum of complete positive spans; partial, repeated,
zero-length and unresolved geometry cannot supply a proxy denominator. High
proxies must exceed both 3 times the peer median and Q3 + 3 IQR. Regional peer
cohorts need at least 20 eligible projects, otherwise the full selected source
is used (also minimum 20). Display filters never recalculate peer baselines.
Cross-document footprint repetition is excluded from duplicate screening.
Candidate increases still require project identity and scope verification.

Analysis project tables, review evidence and Compare project rows/cards offer
“View on map” links using exact source or candidate IDs. Linked map views fit
the retained geometry and select its evidence; red-flag links carry the editable
Analysis thresholds. Map analytical markers use the same full-source calculations
as Analysis (coordinate_review is displayed separately). Literal red flags and
blue magnifying glasses identify analytical leads and unresolved coordinate
reviews respectively, with independent Objects toggles. Neither layer invents
geometry for unmappable records; those remain in the source review tables.

Map filters are URL state: search, region, candidate/coordinate status, advanced
comparison/provenance filters, coordinate basis, focused source/candidate IDs,
review thresholds, Objects visibility and basemap restore on reload and browser
navigation. `fmrMapRoute.js` parses/serializes these settings. Default settings
are omitted; `objects=none` explicitly hides all objects. The shared Copy link
control copies the current URL. Panning and zooming remain local camera actions.


The selected map project is a compact, nonmodal region: title, source/region,
section context, allocation (both budgets and candidate change for pairs),
review counts, overlap navigation, source/Compare link and Details & evidence.
The evidence dialog groups source records, analytical/coordinate findings and
Analysis links; geometry is collapsed initially. Source PDFs and provenance
open in stacked dialogs with Escape dismissal and focus restoration. Titles
remain readable in full; duplicate PDF actions and raw coordinates are removed
from the summary card. Mobile cards sit below the map rather than covering it.

Citizen review balance: the selection card also exposes parsed title locality,
whole-project endpoint span and section count, shortest section, allocation per
endpoint-meter proxy, peer-median multiple/cohort, and the first three specific
analytical findings plus unresolved-coordinate explanations. Additional findings
remain accessible through the evidence dialog. Direct PDF buttons verify the
printed allocation without navigating away. Missing denominators are explained;
no-flags messaging does not certify value or completion. These budget annexes do
not establish actual spending, contractor, delivered road scope or beneficiaries.
