# DPWH UI/UX review for the FMR workbench

Reviewed **12 October 2026**. Baseline: the DPWH React entry point on `main`
(`95d745b0d742faf284420f69884da6657d9bfe48`) and its retained components, rendered
in an isolated local preview. This review covers the six requested main tabs at
**1440 × 1000** and **390 × 1000**, plus source selection, comparison record paths,
expanded filters, a Highlight evidence dialog, and Analysis Statistics. It is a
review of the repository's app, rather than an assertion about the live deployment.

The FMR first pass already shares the navigation, table primitive, PDF viewer,
share links, and dialog lifecycle. The next pass should carry over the original
page composition and the interactions that connect a finding to its source.

## Shared visual language

| Element | DPWH baseline | FMR implication |
|---|---|---|
| Canvas and text | Cool gray `#f5f7fa`; dark blue text `#203147`; system font, 15px / 1.55 | Keep the established palette and type scale. |
| Shell | Centered, max 1440px; 20px / 28px padding; 16px on small screens | Use the shared shell consistently. |
| Main navigation | Ordinary bordered links; 8px radius; blue `#245fa8` active tab; visible focus | Already shared. Keep the six requested destinations. |
| Page introduction | Pale blue `.hero`, `#edf3fa`, 1px border, 16px radius; eyebrow, title, scope, actions | FMR currently uses a plain title block. Restore the hero composition for Home, Highlights, Compare, and Analysis. Source tabs have their own compact workspace header. |
| Cards and panels | White surface, light border, mostly 9–10px radii; headline then count/amount then scope/action | Give every metric its unit, population, and useful drill-down. |
| Controls | 7px radii; aligned labels; restrained blue buttons; primary actions filled, secondary outlined | Keep filters compact and actions ordered by purpose. |
| Monetary values | Compact M/B values in dense views; exact PHP available in tooltips or evidence; tabular numeric alignment | FMR's full peso values dominate some cards and rows. Use compact display plus exact evidence without changing calculations or exports. |
| Status and change | Green/red signed changes; amber pending review; blue/gray contextual statuses | Separate arithmetic, source evidence, match method, and coordinate interpretation. A coordinate badge must not imply source or location certification. |
| Tables | Tinted header, alternating rows, hover, sortable buttons, numeric alignment; grouped header bands where useful | Preserve the count-versus-allocation distinction and make sorting legible. |
| Disclosures | Context, controls, detailed methods, and advanced filters are expandable | Keep working controls and results prominent while retaining the explanation nearby. |
| Dialogs | Large native dialogs; fixed heading, scrollable body, explicit close; Escape, focus restoration, shared scroll lock | Already partly shared. Highlights need their own evidence dialog structure. |

The baseline has several CSS layers: `styles.css`, shared navigation,
`source_verification.css` scoped by `SourceWorkspace`, and `Highlights.css`.
Matching the main palette alone does not reproduce their different layouts.
Reuse stable components/classes first; consolidate repeated styling as those
components are adapted, rather than adding another overlapping style system.

## House GAB and DBM NEP: source verification workspaces

**User task:** navigate a printed hierarchy and inspect the selected entry's
amount, arithmetic, evidence, and recorded PDF page without losing the branch.

The two DPWH tabs use the same verification controller. House adds reading and
I-B/I-C switches; NEP adds full hierarchy/project views. These switches describe
different source scopes, rather than alternate visual presentations of one sum.

Core behavior:

- Scope/grain text and audit cards establish what the hierarchy contains.
- The tree exposes amount, arithmetic status, and source-evidence status as
  separate fields. Selected rows have a blue fill and a left selection marker.
- On desktop, **tree above selected evidence in the left column; sticky PDF in
  the right column**. Selecting a node updates the inline PDF automatically.
  Recorded page buttons provide an explicit preview/reveal action too.
- Evidence contains clickable parent paths, retained amount, immediate child
  sum, recursive terminal-leaf sum, difference, leaf count, and source reference.
- Search can show matching nodes directly, with full context available on
  selection. Results have a limit and a show-more action for large hierarchies.
- Exact-PHP toggle, reset, collapse, `/` search focus, and tree Right/Left/Enter
  keyboard actions support repeated review.
- The source-review queue has category counts, branch scoping, previous/next
  flagged item, reasons, evidence, and instructions for the next check.
- Mobile provides explicit Tree/results and Selected evidence controls.
  Tree rows rearrange their amount/status/evidence fields. PDF is stacked below
  the workspace with a reveal action, rather than squeezed beside it.

**FMR next pass:** use this same arrangement for both documents. The present
tree-plus-evidence split, with PDF available only through a modal, adds an extra
context change to routine verification. Preserve the modal for secondary/global
PDF links and offer inline preview for the primary selected source page.

Add clickable program/region breadcrumbs, actual printed-versus-child arithmetic,
coordinate category chips, region-scoped review, previous/next flagged project,
exact/compact amounts, and keyboard controls. Keep **8 NEP and 14 House** remaining
coordinate findings; multiple segments alone do not belong in that queue.

Do not copy House reading toggles or PS/MOOE/CO selectors into FMR until their
required source coverage exists. The supplied FMR House copy has unauthenticated
reading status; both FMR schedules currently have the same three-level hierarchy.

## Compare Stages: the working investigation table

**User task:** narrow a comparison, understand why records are paired/unpaired,
inspect a specific source, and export or share the whole finding.

DPWH composition and logic:

- Compact hero, collapsed source-scope/control/download context, then table
  views. Default PAP controls and project records serve different questions.
- Primary filters are visible; advanced filters sit behind **More filters**.
  Active filter chips remove individual constraints, with a clear-all action.
- Match identity, reading change, presence/amount flags, and optional region
  matching are distinct controls. Status definitions are available in place.
- Amount cells stack the stage amount, signed difference, and percentage.
  Header menus sort by total, difference, or percent where meaningful.
- Sorting/filtering runs over the full result before 50-row pagination. Results
  report filtered versus total counts and distinguish rows from source records.
- A source page button opens the PDF alongside the table. Clicking a project
  expands its source-tree paths and any counterpart evidence within the result.
- **Show analytics** summarizes every filtered page, including independent
  stage totals, distributions, changes/matches, and overlapping review flags.
- Copy link, CSV, and JSON preserve a finding's filters and source provenance.
  Comparison filter/sort/page state is represented in the route.
- On mobile, comparison rows become labeled cards. Sorting remains available
  through a dedicated control because table headers are hidden. Table/PDF panel
  controls support switching between results and evidence.

**FMR next pass:** retain Regional controls / Project candidates as the two views.
Add inline source buttons/PDF, count and allocation changes with percentages,
active filter chips, separate match-method and coordinate filters, filtered-result
analytics, JSON export, route-backed sort/page state, and labeled mobile cards.
Retain source-local IDs and each side's title, amount, region, and page references.

FMR already sorts all filtered rows before paging and exports all filtered rows
to CSV. Its sort/page state is currently component-local, so a copied finding
does not preserve those settings. PDF evidence for comparison rows also requires
opening the candidate dialog first.

At 390px, the FMR Project candidates search starts around **819px** down the
viewport, compared with approximately **569px** in the DPWH Project records
view; FMR's results toolbar starts around **1034px**. The always-visible metric
cards, introduction, and actions precede the working controls. Apply the original
compact Compare hero and collapsed context; verify the controls' position again
after that change. The row-card mobile layout needs explicit implementation;
importing `SortableTable` does not inherit `Comparison.jsx`'s responsive markup.

The FMR comparison has 609 candidate pairs, 355 House-only rows, and 95 NEP-only
rows. These labels remain provisional. Region-crossing matches, fuzzy suggestions,
manual identity certification, and additional House readings are separate data
work; an interface change must not fabricate them.

## Home: orient the reader and route them to useful work

**User task:** understand the budget scope and select the next investigation.

The DPWH Home has a substantial hero with Compare/Analysis actions, candidate
cards combining **counts + amounts + explanations + links**, a row-based workspace
directory, and a source-verification section with audit counts and review links.
It introduces the workbench's tasks rather than repeating every detailed table.

**FMR next pass:** restore that hierarchy. Keep the two stage totals, then add
candidate buckets tied to real filters: paired amount changes, House-only rows,
NEP-only rows, and coordinate-review queues. Show both count and relevant funding
where applicable. Keep candidate allocations distinct from paired differences.
Use the directory rows for navigation and source cards for audit/coverage status.
Keep the full agency budget outside the FMR annex totals.

## Highlights: evidence-backed stories

**User task:** understand a finding, inspect its basis, and continue investigating.

DPWH Highlights contains three layers:

1. Stage coverage and candidate change tables: counts, allocations, scope, held
   unresolved rows, and a funding reconciliation.
2. A numbered, two-column story list. Each story has a basis label, meaningful
   headline, factual evidence, an investigation prompt, and an explicit action.
3. A dedicated evidence dialog: themed key-figure panel, basis explanation,
   sortable/exportable control and record tables, group drill-downs, source PDF
   links, shareable story route, and a link into the full workbench.

**FMR next pass:** the current eight metric links can become findings with their
own evidence views. Start with the control increase, regional gains/reductions,
the four candidate allocation changes, source-only observations, remaining
coordinate anomalies, and multi-segment representation. Add a two-stage coverage
table and the existing exact funding bridge. Do not require ten stories merely
because the DPWH page has ten; each story needs a useful question and evidence.

An FMR story should open locally through `story=...`, list its supporting regions
or projects, offer CSV/PDF evidence, and link to the same filtered Compare or
source queue. Preserve the distinction between an allocation difference and a
claim about sponsorship, procurement, or implemented work.

## Analysis: questions, populations, and drill-downs

**User task:** choose an analytical question, inspect its population, and follow
an aggregate to its underlying comparison records.

DPWH Analysis uses a source selector in the hero and seven question-oriented
views: Overview, Insertions, Deletions, Adjustments, Chainage, Groupings, Statistics.
Overview defaults to region. It separates record counts from allocations in
banded table columns, includes differences and percentages, and supports nested
breakdowns. Other views rank candidate buckets, expose unresolved counterparts,
compare adjustments, or examine measured chainage and descriptive amount patterns.

Shared logical features include source-specific counting, group/record dialogs,
links back to Compare, table deep links, definition/help controls, and visible
loading states when per-record evidence is fetched. Statistics covers amount
bands, rounding, digit distributions, clusters, and repeated allocations, with
explicit descriptive limits.

**FMR next pass:** start with Overview, House-only candidates, NEP-only candidates,
Paired adjustments, Coordinates, and Allocation statistics. Use source and region
as supported dimensions; add per-group records and links to the corresponding
comparison or source tree. Extend statistics with allocation bands, top amounts,
rounding, repeated values, and share/concentration before adding more elaborate
lenses.

Coordinates can show review-category counts, reviewed/resolved/remaining
transcriptions, segment/point counts, and raw-versus-interpreted evidence. The
datasets do not establish road chainage or actual road length: **endpoint distance
cannot substitute for constructed road length or a valid PHP/km denominator**.
Office/PAP/corridor dimensions from DPWH also require their own FMR source fields
or a documented extraction before they become selectable analytical dimensions.

## Cross-tab behavior and data contracts

- A finding should move from summary → supporting records → source hierarchy →
  printed evidence, with its filters and selected record preserved in the URL.
- Counts must identify their grain: source project, comparison row, segment,
  point, control, or flag category. Overlapping flag counts need an explanation.
- Source totals are independent; parent controls and coordinate segments do not
  add money. Missing counterparts are unavailable, rather than zero allocations.
- Arithmetic balance, source review, matching method, and coordinate status
  remain distinct. No UI action silently clears a flag or certifies a project.
- Retain keyboard/focus behavior, skip-to-content, explicit empty/error states,
  reduced-motion support, and mobile sort/panel controls.
- Use summary/detail boundaries as the evidence grows. DPWH's per-record payload
  is about 50MB, so it uses lazy loading; the FMR payload is about 2.85MB and does
  not need the same split immediately. Preserve provenance/build consistency if
  the FMR payload is split later.

## Recommended next implementation order

| Order | Work | Completion check |
|---|---|---|
| 1 | Shared source workspace: tree + evidence + inline PDF, breadcrumb navigation, arithmetic fields, scoped coordinate queue, keyboard and mobile panels | Either source can be reviewed without repeatedly opening/closing a PDF modal; the two trees use the same component. |
| 2 | Compare: compact context, direct source evidence, richer differences, independent filters, chips, JSON, filtered analytics, mobile cards, route state | A shared filtered finding restores its view/filter/sort/page/selection; all exported and analyzed rows match the full filtered ledger. |
| 3 | Home: original hero/actions, candidate counts + amounts, directory and source status | Every headline routes to the exact supporting population. |
| 4 | Highlights: coverage/change tables and dedicated story evidence dialogs | Every headline has its own basis, records, source links, and shared story URL. |
| 5 | Analysis: question-based views, source/region rollups, candidate rankings, coordinates, amount distributions and record drill-downs | Every aggregate reproduces its record population and opens those records for review. |

Recheck desktop/mobile after each workspace change. Behavior matters alongside
visual similarity: do not stop at borrowing colors, cards, and tab labels.

## Retained visual references and source components

Representative captures from the local review:

- [DPWH Home](data/ui_review/dpwh-home-desktop.png)
- [DPWH House: tree/evidence beside PDF](data/ui_review/dpwh-house-evidence-desktop.png)
- [DPWH NEP: tree/evidence beside PDF](data/ui_review/dpwh-nep-evidence-desktop.png)
- [DPWH Compare with advanced filters](data/ui_review/dpwh-compare-projects-desktop.png)
- [DPWH Compare mobile row cards](data/ui_review/dpwh-compare-mobile.png)
- [DPWH Highlight evidence dialog](data/ui_review/dpwh-highlight-detail-desktop.png)
- [DPWH Analysis overview](data/ui_review/dpwh-analysis-desktop.png)
- [FMR first-pass Compare on mobile](data/ui_review/fmr-compare-mobile.png)
- [FMR first-pass Highlights](data/ui_review/fmr-highlights-desktop.png)

Relevant baseline code: `analysis/web/src/main.jsx` on `main`;
`WorkbenchHeader.jsx`, `styles.css`, `SourceWorkspace.jsx`,
`workspaces/verification.js`, `Comparison.jsx`, `ProjectPaths.jsx`,
`ProjectAnalytics.jsx`, `Highlights.jsx`, `HighlightModal.jsx`, `Highlights.css`,
`Analysis.jsx`, `GroupProjectsModal.jsx`, `SortableTable.jsx`, `ShareLink.jsx`,
`PdfPreview.jsx`, `modalLifecycle.js`, and `findingRoutes.js`.

All 12 core route/viewport observations rendered without page errors, failed
HTTP responses, or document-level horizontal overflow. This was a focused UX
review, not a replacement for the full DPWH regression suite. Existing FMR app
code and data were left unchanged during this review.
