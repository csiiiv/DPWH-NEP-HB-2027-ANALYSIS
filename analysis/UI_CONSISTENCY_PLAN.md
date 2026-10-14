# Cross-workspace UI consistency pass

Status: in progress. Batches landed (all browser suites and unit tests green at
each step): Compare tab label standardized to sentence case across registries,
model tab lists and cross-links; NIA Analysis and Compare view tabs converted
to link navigation with `aria-current`; hfepTabs aligned with the registry and
driving document titles; FMR/HFEP filter chips humanized to share the select
labels; NIA chips resolve sub-program/candidate-status labels; the three annex
Analysis heroes share one source-selector/basis-label/Share pattern; docs
updated. Remaining phases (exports/mobile parity audit, record/evidence
displays, page-specific gaps) are still unstarted.

NIA additions preserve the existing FMR/DPWH page format and Analysis views:
Overview adds allocation shares; Candidates adds funding reconciliation and
pairing coverage; Statistics adds top-ten concentration with source evidence.
Home, Compare and source-page layouts retain their established structure.
AI monitoring is an additional NIA Analysis tab using the same source selector,
filters, tables, CSV and PDF evidence, with whole-project allocation scope.

## Outcome

A citizen can move between DPWH, FMR, NIA and HFEP without relearning how to
choose a budget source, filter projects, compare allocations, inspect evidence
or share a finding. Comparable actions look and behave consistently; agency
hierarchies and source-specific limitations remain explicit.

The citizen questions guide every project/facility display:

1. What is funded, where, and in which source/stage?
2. How much is allocated, and what changed between candidate counterparts?
3. What scope or scale does the source actually establish?
4. Which specific observations deserve review, and why?
5. Where is the printed evidence, and what remains unknown about delivery/value?

Do not infer actual spending, completion, beneficiaries or construction unit
costs from budget allocations. Do not label a candidate match as established
identity, or turn an absence of flags into a positive project assessment.

## Scope and observed starting points

Cover every registered page, its subviews, selected records, dialogs, exports,
loading/error/empty states and historical links. DPWH's additional source/detail
routes and packaged annex entry points are part of the navigation audit.

| Workspace | Registered pages |
| --- | --- |
| DPWH | Home, Highlights, Compare stages, Analysis, House GAB, DBM NEP, Transparency NEP, Resources, About |
| FMR | Home, Highlights, Compare stages, Analysis, Map, House GAB, DBM NEP |
| NIA | Home, Highlights, Compare stages, Analysis, House GAB, DBM NEP |
| HFEP | Home, Highlights, Compare stages, Analysis, House GAB, DBM NEP |

Confirmed in source (starting inventory; several items below are already fixed
in the landed batches):

- `routes.js` and `WorkbenchHeader.jsx` share the workspace/page shell; Compare
  stages is now sentence case across registries.
- `SortableTable.jsx`, `PdfPreview.jsx`, `ShareLink.jsx` and `modalLifecycle.js`
  already provide shared behavior. Use these before creating alternatives.
- Annex Analysis/Compare view tabs use link navigation with `aria-current`.
- Share actions occupy different locations. The three annex Analysis heroes now
  share one source-selector/basis-label/Share pattern; other pages still vary.
- HFEP and NIA Compare expose active-filter chips; FMR's general filter toolbar
  has a different presentation. Audit equivalent behavior, not just appearance.
- Source buttons, heroes, statistics and dialogs are implemented in multiple
  apps. Extract common UI only where semantics and behavior truly agree.
- NIA retains Overview / Insertions / Deletions / Adjustments / Statistics /
  Candidates / Agency controls and adds AI monitoring; additional analysis uses
  the existing tables and evidence dialogs. Irrigation has no coordinate diagnostics.
- Separate browser suites exist for DPWH, FMR, NIA and HFEP. A shared acceptance
  matrix should cover equivalent journeys and the merged workspace shell.

These observations are not a full rendered-page audit. Missing functionality,
contrast, clipping and mobile parity must be verified before being called bugs.

## Implementation order

### 1. Establish the baseline and page matrix

Build/package the merged branch and run the current suites. Inventory every
page/subview from the registry and app view lists, including URL parameters.
Capture desktop/mobile examples and record each issue with workspace, route,
state, screenshot, expected behavior and priority.

Use priorities: P0 broken evidence/navigation or misleading values; P1 missing
context or inconsistent core interaction; P2 visual polish. Fix P0 items first.

Deliverable: a route/state matrix and evidence-backed issue list. Preserve the
current data accounting baseline before changing UI.

### 2. Align the shared shell and language

Standardize workspace selection, page labels, page title/description hierarchy,
source selector placement, Share link placement, content width, spacing and
button hierarchy. Use one primary action per task, with secondary actions nearby.
Keep search/dropdown/checkbox rows readable and labels consistent on mobile.

Define common terms: allocation, candidate pair, unmatched source record,
review finding, printed/source total and filtered total. Preserve agency-specific
source labels and distinctions between House readings. Show currency/units at
point of use; do not change source units or numeric accounting to match styling.

Deliverable: a small documented set of shared styles/components applied first
to one representative page in each workspace, then to the remaining pages.

### 3. Align filters, tables and sharing

Agree on search + key filters + advanced filters, active-filter chips, Clear
filters behavior, matching-record counts and filtered allocation summaries.
Changing filters resets pagination; document whether sorting persists. Source
changes clear incompatible record selections. Define which filters survive
subview changes and keep that behavior consistent where meanings agree.

All shareable pages restore meaningful filters, source/stage, subview, sorting,
pagination and selected evidence on reload and Back/Forward. Workspace switches
keep an analogous page when available and discard incompatible agency state.

Tables use consistent money alignment, signs, missing-value display, sortable
headings, pagination and empty states. Mobile cards preserve decision-relevant
columns and evidence actions. CSV/JSON exports cover all matching records, not
just the displayed page, with source IDs/pages and clear units/provisional status.

### 4. Align project/facility review and evidence

Use a common information order: identity/location → source allocations/change
→ applicable scope/scale → specific findings → source actions. Show substantive
reasons and figures without requiring a modal for every useful fact.

Keep critical findings visible. Put exhaustive flags, matching/repair history,
raw coordinates and long source excerpts in dialogs or expandable sections.
Provide direct printed-source verification. PDF/provenance dialogs must dismiss
one layer at a time, restore focus and preserve the originating record/filters.

Apply a shared display pattern, not one forced data schema:

- DPWH: retain PAP/program/office and source/reading distinctions.
- FMR: retain sections, endpoint-distance/proxy limitations, flags, map selection
  and Zoom to project. Keep map links conditional on available geometry.
- NIA: retain sub-program/control hierarchy and printed-versus-derived totals.
- HFEP: retain facility identity, funding components and retained source fields.

Do not add map links, per-meter metrics or FMR flag rules to other agencies
without corresponding evidence. Pairing and flag definitions stay in their
workspace model layers.

### 5. Apply page-specific consistency rules

| Page family | Required review |
| --- | --- |
| Home | Clear agency/source coverage; totals with units; routes into records; shared directory conventions |
| Highlights | Bounded claim, source/population context, supporting records, Share link and PDF actions |
| Compare | Source/stage basis, hierarchy totals versus project candidates, change signs, match uncertainty, filters/export/mobile parity |
| Analysis | Visible analytical question/population, source context, transparent denominators, drill-downs preserving scope, method access |
| Source workspaces | Tree/table/review selection, breadcrumbs, printed controls versus filtered totals, PDF location and mobile panels |
| FMR Map | Legend/object parity, shared filter URLs, useful selected-project card, project bounds zoom, unmappable-record explanation |
| Resources/About | Source/method links, clear coverage and update context, accessible navigation into the apps |
| Errors and empty states | Explain current scope or failure and provide a relevant recovery action |

### 6. Validate and ship in reviewable batches

Suggested batches: shared shell/language; filters/table/sharing behavior;
record/evidence displays; page-specific gaps and visual polish. Run relevant
checks for each batch and the complete suite before publishing the final result.
Avoid a large generic-app rewrite during this pass.

## Acceptance matrix

- All registered pages and each subview load directly under the project prefix;
  historical redirects preserve hashes and supported query parameters.
- Test 390 px and 1440 px throughout; spot-check 320 px, 768 px and 200% zoom on
  shared controls, long titles, wide tables and stacked dialogs.
- Keyboard access covers navigation, filters, sort controls, record selection,
  tree expansion and dialogs. Visible focus, accessible labels, correct tab/link
  semantics and status text do not depend on color or hover.
- No page-level overflow; intentional table scrolling is contained. Mobile
  records retain amounts, source context, findings and verification actions.
- Shared links restore state; Back/Forward works; source/workspace changes do
  not open stale or unrelated evidence.
- Filtered totals and exports reconcile with their matching populations. Printed
  controls remain labeled as controls. Missing values never display as zero.
- PDF tests render real retained pages via range requests; nested dismissal
  restores focus and scrolling. Unknown IDs/pages produce useful recovery states.
- Existing accounting/matching/model tests pass with unchanged semantic results.
- Browser suites report no unexpected page errors or failed site-owned requests.

Validation entry points: `npm test --prefix analysis/web`,
`npm run build --prefix analysis/web`, `scripts/build_pages.py --with-react`,
`scripts/check_react_pages.py`, `scripts/check_comparison_workspace.py`,
`scripts/check_analysis_page.py`, `scripts/check_fmr_pages.py`,
`scripts/check_nia_pages.py`, `scripts/check_hfep_pages.py`, and relevant agency
Python data/accounting checks from `.github/workflows/pages.yml`.

Completion means all P0/P1 findings are fixed and verified; any deferred P2 item
has a concrete explanation. Update the UI reference and source docs, then report
what changed, validation results and remaining limits before the next publish.
