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
| `#home` | Workbench map, review-candidate headlines, and source status |
| `#compare` | Stage comparison |
| `#analysis` | Headlines, insertions, deletions, adjustments, statistics |
| `#house` | Third-reading native I-B totals and controls; reading and project-view toggles |
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
The [I-C audit](../docs/hb_native_ic_rollup_checks.md) records 2,686 balanced
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

Both **PAP totals** and **Project records** show HGAB2 (second reading), HGAB3
(third reading), and HGAB3-minus-HGAB2 beside Transparency and NEP. HGAB3 is the
latest House reading; the former generic House column was HGAB2. All records are shown by default. **Match status** filters identity quality
(`matched`, `matched_normalized`, `fuzzy`, `chainage`, `ambiguous`, `no_match`).
**Flags** cover presence and coverage (`house_only`, `nep_only`,
`nep_only_suggested`, amount up/down, Transparency gap / outside scope). House
reading change stays on HGAB2↔HGAB3 ledger differences. Share with
`#compare?view=projects&match=fuzzy` or `&flag=house_only`.
The operations increase is ₱134,000,000, offset by Support to Operations.
Agency total is unchanged. Repeated House keys remain grouped; NEP/API candidate
anchors retain their second-reading provenance. See
[methods and checks](../docs/house_reading_comparison_checks.md).

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
artifacts. House/NEP detail retains the second reading; the main comparison
shows both. Open `#compare?view=projects&change=reading_changed` for changes.

## Open work

The React PAP table includes 45 local controls and the separate FAP control. All 44 mapped non-FAP House PAP controls balance; one NEP PAP remains
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

House project browsing: `#house?view=projects&reading=third` and
`#house?view=projects&reading=second` show the native I-C hierarchies separately
from the I-B controls. `#nep?view=projects` filters the NEP tree to project line
items. Project search accepts reordered words and punctuation variations;
`Barangays 34–35` can match `Barangay 34 and 35`. Parent paths and source PDF
previews remain available in each view.

The House workspace defaults to third reading. `#house?view=controls&reading=second`
opens second-reading I-B controls. The reading controls preserve the selected
I-B/I-C view; the view controls preserve the selected reading. Both I-B views
include PS, MOOE and CO, while I-C project totals exclude PS. The changes link
opens the existing second-to-third-reading comparison.

Searches, filters, sort order and pagination now have shareable hash URLs.
Use **Copy link** on comparison and source workspaces. Opening a link restores
its settings after loading the retained data. See
[shareable findings](../docs/shareable_findings.md) for route parameters and examples.

Project titles in the comparison expand full source-tree paths inline. Source
buttons select HGAB3/HGAB2/NEP/Transparency; ancestor links open the corresponding
hierarchy node. Repeated House records retain separate member paths. Expanded
records and selected sources are included in shared URLs.

Project records offer **Region matching → Allow different regions · flag
candidates**. Strict region matching remains the default. Since the retained
Central Office/region echo wrappers attribute every FAP loan, the optional
mode currently merges nothing — all former region-difference pairs now match
strictly — but it remains available for future documents whose listings
genuinely carry different regions; it labels both source assignments and
preserves duplicate records, source assignments, tree paths and totals.
Use `#compare?view=projects&q=4432-PHI` to share a strict-matched finding.

Project records offer **Show analytics** for the entire applied search/filter
result, including all pages. The modal leads with HGAB3 and NEP source totals,
charts House (HGAB3) and DBM NEP amounts side by side per recorded region and
office, and counts House changes, candidate statuses and overlapping review
flags. Missing source amounts remain unavailable. Reading-only entries and provisional
matches do not certify policy insertions; review flags do not establish fraud.
After packaging, run `python3 scripts/check_project_analytics.py` to check
mobile/desktop modal scope, source switching, closing and focus restoration.

Comparison results use the full workspace until a PDF source opens. Source scopes
and canonical downloads are collapsible; advanced filters, active chips and
filtered CSV/JSON exports sit beside the results. Mobile rows use labeled amount
cards with a sorting control. Search and program selections persist across tabs.

`buildComparisonData.mjs` generates a small PAP overview and lazy project payload
from the retained inputs before development/build and during site packaging.
Input hashes prevent mixing builds; unit checks compare compact source amounts,
identities, assignments, page evidence and grouped records with the full ledger.

After packaging, `python3 scripts/check_comparison_workspace.py` checks lazy
loading, desktop/mobile layouts, preserved filters, exact filtered exports and
the analytics modal under the GitHub Pages project prefix.

The main **Analysis** route (`#analysis`) loads build-time headline summaries from
`comparison_overview_2027.json`, without fetching the full project payload on
Overview/Insertions. It reports office categories and mutually exclusive program
buckets per source, counting grouped allocation members once. FAP is a funding
bucket across programs. Overview includes a **NEP → HGAB by region / office / category / PAP**
table (House−NEP amount and percent). House-only rankings separate records without NEP suggestions, unresolved
suggestions and third-reading-only records. The **Deletions** subtab mirrors that
layout for NEP-only rows (no House record), split into no suggestion, possible
replacements (House rows name this NEP item as a counterpart), and HGAB2-only.
Group drill-downs deep-link into Compare with the matching `change=` filter.
Source and ranking selections are shareable as
`#analysis?source=third&ranking=no_suggestion` and
`#analysis?view=deletions&ranking=suggested`.
