# Analysis tab rules and guidelines across dataset workspaces

Updated: **14 October 2026.** Status: **proposed working standard** — this is
the normative companion to the descriptive
[Analysis tab framework](analysis_tabs_framework.md). Actionable fixes are
tracked in the [todo list](analysis_tabs_todo.md). Where the framework
documents what *is*, this page defines what *should be* from here on, for the
core Analysis tabs (Overview, Insertions, Deletions, Adjustments) across all
main dataset workspaces: DPWH, DA FMR, NIA, DOH HFEP, and any future annex.

How to read this page:

- **MUST** — required for any new or reworked view; deviations need an
  explicit written justification next to the code.
- **SHOULD** — the default choice; deviate only with a workspace-specific
  reason stated in the view's notice or doc.
- **MAY** — optional, dataset-dependent.

Terminology follows the codebase, not external budget vocabulary: a
**workspace** is one agency dataset app (DPWH, FMR, NIA, HFEP); a **stage**
is one source document side (`house`, `nep`, plus DPWH's readings and
Transparency); a **comparison row / candidate pair** is one matched or
unmatched ledger entry; **record** is defined canonically in §1.5.

**Scope.** This standard governs the four core Analysis tabs. Possible
future extensions — noted for awareness, **not in scope now**:

- Highlights page family (bounded claims, supporting-record evidence).
- Compare stages views beyond the drill cross-links already specified.
- Source workspaces (tree/table/evidence layouts).
- Workspace-specific Analysis tabs: Statistics, DPWH Chainage/Groupings,
  FMR Red flags/Coordinates, NIA AI monitoring/Candidates/Agency controls,
  HFEP Categories/Extraction review. Several rules here (record grain,
  PDF referencing, signed colors, number/locale conventions) already apply
  to them by virtue of being shared conventions; only their view-specific
  structure is out of scope.

---

## 1. Data foundations (builder side)

**R1. One workspace = one derived, schema-versioned payload.**
Each workspace MUST ship a single `<domain>_workbench.json` produced by one
Python builder, with a `schema_version` the app validates on load (throw on
mismatch). Views MUST NOT fetch ad-hoc per-tab endpoints. DPWH's split into a
light headline payload plus heavy per-record sidecars is the sanctioned
exception for scale, and each sidecar remains builder-produced and
version-pinned.

**R2. The browser never computes an authoritative number.**
Any total, delta, or reconciliation the page presents as fact MUST come from
the payload (builder-computed, invariant-checked). Client-side computation is
limited to *presentation* filters and group-bys whose inputs and results are
already present in the payload.

**R3. Builder invariants are enforced with `raise`.**
The payload MUST be built under invariants that fail the build, not silently
skew it: (a) exact partition — every source record appears exactly once in
the comparison; (b) money identity — `paired_delta + house_only − nep_only`
reconciles to the printed control difference; (c) child arithmetic — printed
controls equal the sum of children at every node.

**R4. Comparison status vocabulary is fixed.**
The ledger MUST classify every record as `paired`, `house_only`, or `nep_only`,
carry per-side amounts (`house_php`, `nep_php`) and a signed paired
difference (`delta_php`), and flag ambiguity (`ambiguous_title`) where the
matching method can be confounded. Extra statuses (DPWH's suggestion modes,
HFEP's record events) MUST be additive layers on these three, never
replacements.

### 1.5 The record — canonical definition

> **A *record* is the most granular printed money line of one source annex
> that the workspace's ledger retains. It is the atomic unit of pairing,
> insertion/deletion candidacy, adjustment events, counting, and summation.**

Per-workspace record grains (current):

| Workspace | Record = | Notes |
| --- | --- | --- |
| DPWH | One **source allocation record** (a money line under one office/program/PAP in one stage) | A comparison row may bundle several records ("allocation_records", grouped members stay grouped) |
| DA FMR | One **printed project row** in one stage | Title + coordinates + one amount per row |
| NIA | One **printed annex project row** | One amount per row inside a sub-program |
| DOH HFEP | One **funding-column line item** on a facility row (infrastructure / medical equipment / motor vehicle) | Facility row totals are *controls*, not records |

Rules that follow from the definition:

**R5. Record grain is declared in the payload, and everything counts records.**
The payload MUST document its record grain (a `grain` note or equivalent).
Insertions, Deletions, and Adjustments operate on records; every count in
those views MUST be a record count, and every money total MUST be a sum of
record amounts. Anything coarser (facility, project, group) MUST be labeled
as an aggregate of records (e.g. "513 facility rows · one record per printed
funding column").

**R6. Coarser displays never masquerade as records.**
Where a source prints compound rows (HFEP facility with three component
columns; DPWH grouped allocation), the view MUST keep the record as the
paired/counted unit and present the compound row only as display context.
Row-level totals that the source prints as controls MUST NOT be counted or
summed as records (double-counting guard).

**R7. Finer grains require a ledger change, not a view change.**
If analysis needs a grain finer than the current record (e.g. HFEP moving
from funding-column records to something finer), that is a builder + payload
change with new invariants — never a client-side reinterpretation.

---

## 2. Page and navigation structure

**R8. Tab registry and order.**
The Analysis page MUST expose its sub-views through a data-driven registry
(`views` array), starting with `overview` as key `overview` and label
"Overview". The core cross-document tabs MUST use the shared keys
`insertions`, `deletions`, `adjustments` with labels "Insertions",
"Deletions", "Adjustments" — the rendered tab strip shows these canonical
labels in every workspace; side-descriptive names ("House-only candidates",
"NEP-only candidates") MUST NOT appear as tab labels (they may appear in
body copy where the side is the point). Workspace-specific tabs append
after them. Legacy key aliases (FMR's `house_candidates` etc.) MAY be kept
as read-only URL aliases but MUST map to the canonical key internally.

**R9. Tabs are links.**
Tab strips MUST be anchor navigation with `aria-current="page"` on the
active tab (the FMR/NIA/HFEP pattern). Button-based strips (DPWH's
`.analysis-subtabs`) SHOULD be converted when the view is next reworked.
Tab links MUST reset stale params (page, sort, modal keys, view-specific
filters) rather than carrying them across.

**R10. All view state rides the URL.**
Every state that changes what the user sees — view, source/stage, ranking,
dim, direction, filters, sort, page, open dialog — MUST live in the hash
query so links restore the exact view and Back/Forward works. Component
state is allowed only for transient UI (hover, disclosure animations) that a
reload may safely lose.

**R11. Dialogs are URL keys.**
A modal is open if and only if its key(s) are present (`group`+`g`, `pair`,
`records`, `drill`+`axis`, `shell`…). Closing MUST be possible via Back,
Esc, and an explicit Close button; reopening a shared link MUST restore the
dialog against the *full* (unfiltered) dataset, not just the visible rows.

**R12. Recovery states.**
Unknown `view` MUST render an "Unknown view → Open Overview" link. Unknown
dialog/group keys MUST render an in-dialog not-found message with a clear
recovery action. Long loads MUST show `role="status"` text or a modal-shaped
loading placeholder — never a silent blank.

---

## 3. Population semantics (the three candidate tabs)

**R13. Populations derive from comparison status.**
- Insertions MUST show `house_only` records.
- Deletions MUST show `nep_only` records.
- Adjustments MUST show `paired` records with `delta_php ≠ 0` (plus, where
  the source supports it, per-record events: revised / added / dropped).

No view MAY derive these populations from presence in a single stage list.

**R14. Insertions and Deletions are structural mirrors.**
Deletions MUST repeat the Insertions skeleton — controls, cards, aggregate
table, ranked table — with side swapped: basis label (`DBM NEP · unmatched
source rows`), money column ("NEP allocation"), and review links that search
the *other* annex. Workspace-specific columns (DPWH's "Referring House
rows") are additive.

**R15. Basis labels are fixed vocabulary.**
Cross-document tabs MUST replace the budget-source selector with a static
basis label: `House GAB · unmatched source rows` (Insertions),
`DBM NEP · unmatched source rows` (Deletions), `House GAB ↔ DBM NEP`
(Adjustments). DPWH's multi-source selector is the sanctioned exception
while its comparison spans four sources. `ShareLink` stays beside whichever
control is shown.

**R16. Candidate sub-groups are labeled, not implied.**
Ranking selects MUST enumerate their vocabulary in human words (DPWH's
"House-only · no NEP suggestion"; NIA's "Without repeated-title
ambiguity"). One param name (`ranking`) MAY carry a different option set per
view, but the options MUST be discoverable in the UI next to the tab, and
the notice MUST explain what each selected group does and does not claim.

**R17. Adjustments require both sides.**
A workspace whose matching never attaches both sides MUST NOT ship an
Adjustments tab. Where it exists, the view MUST keep the population to
changed pairs only, keep increased / decreased / net **separate** in every
aggregate (a cut must not be able to hide an add), and label the comparison
basis explicitly. Cross-document gaps and reading-to-reading changes MUST
remain separate ledgers, each with its own section and caveat; never merge
them into one "changes" list.

**R18. Scope asymmetry is content, not noise.**
Where the two annexes differ structurally in coverage (HFEP: both retain
national and LGU facilities with different category allocations), the view MUST say
so in the notice and, where possible, separate the unpairable-by-scope rows
from review candidates within the population.

---

## 4. Dimensions and drill-downs

### 4.1 The dimension contract

**R19. Dimensions come from the printed source, never derived in the browser.**
Every breakdown axis a view offers MUST correspond to a field the source
annex actually prints (or a builder-derived classification with a documented
method in the payload). The browser MUST NOT invent dimensions (e.g.
extracting regions from titles).

**R20. The common dimension spine.**
Every workspace MUST offer at minimum: `overall` plus its **primary program
axis** — the source's own classification of the money:

| Workspace | Program axis | Region axis | Additional dims |
| --- | --- | --- | --- |
| DPWH | Category (program) + PAP | Region | District office |
| DA FMR | — (single-program annex) | Region | — |
| NIA | Sub-program + Program group | — (annex prints no regions) | — |
| DOH HFEP | Category + Subcategory | Region (+ Province below) | — |

Region is part of the spine **where the source prints it** — it is not
guaranteed for every dataset (NIA's irrigation schedules have no regional
grouping). Future workspaces SHOULD adopt the same rule: region when
printed, the program axis always, extra axes (office, province, zone) as the
source provides.

**R21. Dimension chips are the single control.**
Where more than one dimension exists, breakdown MUST be selected through
`.dimension-chips` (URL param `dim`, `aria-pressed`, pill styling) — not a
select, not separate tables per dimension. The aggregate table MUST hide at
`dim=overall` because the headline cards already carry overall totals.
Chips MUST appear in every view that has a dimension-bearing aggregate
(Overview comparison, Insertions, Deletions, Adjustments aggregates alike).

**R22. Cross-dimension nesting is a drill, not a tab.**
Nested breakdowns (DPWH: region/office rows drill into their PAPs, PAP rows
into regions/offices — `drill`+`axis` URL keys) MAY be offered where the
payload carries the cross-lists. They MUST use the same URL-key dialog
mechanism as record drills and MUST state that each source counts under its
own recorded label for the nested axis.

### 4.2 The drill-down ladder (generalized DPWH pattern)

**R23. Three rungs: chips → aggregate → records.**
Wherever a dimension aggregate exists, the view MUST implement the full
ladder:

1. **Dimension chips** choose the axis (`dim`).
2. **Aggregate table** ("Totals by *axis*"): Group · Rows · Amount (or
   increased/decreased/net for adjustments), sorted by amount, group label
   clickable.
3. **Records drill**: clicking a group opens the supporting records —
   a URL-keyed modal (`group`+`g` or equivalent) whose membership rules are
   *identical* to the aggregate's, resolvable against the full unfiltered
   dataset, with a footer link into the closest filtered Compare view.

DPWH's `GroupProjectsModal` (lazy chunk + heavy payload + `LoadingModal`
placeholder preserving the backdrop/Esc contract while loading) is the
reference implementation; NIA's group `Dialog` reusing the shared comparison
table is the lightweight equivalent. FMR candidate regions and HFEP candidate dimensions now use records modals.
Link/filter variants are acceptable only where a future payload cannot
support a records modal, with that exception documented.

**R24. Drills preserve scope.**
A drill opened from a filtered/ranked view MUST reflect that scope in its
membership, and the modal MUST say so (DPWH renders the active ranking and
dimension as filter tags inside the modal header).

### 4.3 Overview comparison table (banded columns)

**R25. The NEP→House comparison table uses the banded column skeleton.**
Wherever an Overview compares two stages at a dimension, the table MUST use
`SortableTable`'s band props to group columns into a **Records band** and an
**Allocations band**, in this column order:

```text
<Group label>
│ Records band (blue)                      │ Allocations band (green) │
│ NEP records │ House records │ Δ records │ % records │ NEP alloc │ House alloc │ Δ alloc │ % alloc │
```

- The first Allocations column carries `divider:true` (the 2px rule
  separating the bands).
- Δ columns are signed cells (R39); % columns are signed percents guarding
  null/zero denominators.
- Default sort: allocation change descending.
- Band tinting comes from the shared classes (`.band-records`,
  `.band-allocations`); no view-local band styling.

This skeleton — already proven in DPWH Overview and its drill-down modal —
is directly generalizable: any two-stage workspace renders the same eight
numeric columns with its own stage labels (NEP/House, HGAB2/HGAB3).

---

## 5. Overview semantics

**R26. Overview answers a distribution question.**
Overview MUST present the selected source's allocation distributed across
the workspace's dimension spine (§4.1) and MUST NOT present cross-document
comparisons beyond the §4.3 stage table. A workspace without a printed
hierarchy SHOULD present its coarsest printed control level.

**R27. Every aggregate row drills.**
Each group row in an Overview table MUST offer a drill into its supporting
records per R23. Nested drills use R22.

**R28. Overview defaults.**
The default breakdown SHOULD be the hierarchy level that makes the source's
headline change most legible (DPWH defaults to region). The default source
is the workspace's primary House reading unless documented otherwise.

---

## 6. Content and copy rules

**R29. The epistemic notice is mandatory.**
Every cross-document tab MUST carry a `.notice`/`.fmr-notice` paragraph
stating, in dataset-appropriate words: rows are **review candidates** from
provisional title/scope matching; candidate status is **not** certified
insertion/deletion; grain, scope, and OCR differences can prevent pairing.
Adjustments MUST additionally state the comparison basis and that identity
is proposed, not certified. Overview/Statistics notices MUST disclaim
descriptive-lens interpretation (rounding is expected; deviation is not
evidence of wrongdoing).

**R30. Counts state their grain.**
Anywhere a count appears, the label or its detail line MUST say what was
counted, per the §1.5 record definition ("source allocation records,
including grouped members", "one record per printed funding column").

**R31. Missing never renders as zero.**
Absent amounts MUST render as an em dash `—` with an explanatory secondary
line where the column is semantic ("No paired amount difference", "n/a").
Money cells MUST show integer Philippine pesos with units at point of use.

**R32. Evidence per row, exports per population.**
Annex workspaces MUST provide per-record source evidence (`SourceButton` →
PDF document + page; both sides for paired records). Exports MUST cover the
full filtered population, not the displayed page, and MUST include source
IDs and PDF pages. Each candidate tab SHOULD end with a link into the
corresponding Compare view carrying the active filters; Overview SHOULD
cross-link the sibling analysis tabs.

### 6.1 PDF page referencing (standard)

The page number is the PDF file position, full stop:

- **`pdf_page`** — the 1-based position in the retained PDF file. This is
  the only page number the standard requires. Where a payload also records
  a printed folio (`printed_page`), it MAY appear as a secondary line, but
  nothing depends on it and views MUST NOT fabricate one when absent.

**The core contract: every page reference is a working viewer link.**
A page reference that the user can see MUST be clickable and MUST open the
shared PDF viewer in a modal, positioned at the referenced page of the
correct PDF file. A page number rendered as plain text is a bug.

**R33. One page vocabulary: `pdf_page`.**
All labels, sorts, and references use `pdf_page`. Evidence labels follow
`<document> p. <n>` (`Vol I-B p. 42` when the workspace spans volumes;
`House p. 42` / `NEP p. 42` / `HGAB3 p. 42` by stage otherwise), with
normal spacing (`p. `, not `p.42`). Table column headers read `Source` with
sort key `pdf_page`, or `PDF page` standalone — never bare `Page`.

**R34. Every reference opens the viewer in a modal.**
Any rendered page reference — record rows, aggregates, controls, dialog
headers, highlight stories — MUST be an interactive control (or link) that
opens the shared `PdfPreview` **in a modal dialog** (`modalLifecycle.js`:
native `<dialog>`, Esc, focus restoration, one-layer dismissal) with
`source = {url, document, page}` resolved from the workspace's documents
registry. Exceptions are ONLY the workspace layouts that host a persistent
inline evidence pane (FMR/HFEP source workspaces, NIA/HFEP Compare), where
the same reference routes to the inline `PdfPane` instead — a modal opened
on top of an already-visible viewer would duplicate it. Every other page —
Analysis tabs included — uses the modal.

**R35. The viewer contract is uniform.**
The modal MUST receive the same `source` shape everywhere
(`{url, document, title, page}`), MUST title itself with the document name
(and page where applicable), and MUST offer the original-file download.
`PdfPreview` is a shared component: per-workspace wrappers MAY add layout
(dialog class, download flag) but MUST NOT fork viewer behavior
(navigation, zoom, page fit). Deep-linked evidence (`pdf` + `pdfPage`
params) MUST survive reload, be clearable with one action, and show a
recovery message — never a blank viewer — for unknown documents or invalid
pages.

**R36. Page validation comes from registry metadata, not literals.**
Validation of a referenced page (`page > 0 && page <= documentPages`) MUST
read the document's page count from the payload/documents registry — never
hardcoded literals (NIA's `30`/`982` are the anti-pattern, D13).

**R37. Multi-page records.**
Where a record's evidence spans several pages (DPWH `pdf_pages` arrays),
the reference MUST present them as a list (`pp. 12, 14`) or open the first
page with the rest reachable in the viewer; a single scalar `pdf_page`
SHOULD be used only when the record genuinely prints on one page. Exports
emit all pages (comma-joined) per R32.

**R38. Export column vocabulary is fixed.**
CSV/JSON exports MUST name evidence columns `source_pdf` and `pdf_page`
(prefix per side for pair exports: `house_source_pdf`,
`house_pdf_page`, …; `nep_*` likewise). `printed_page` MAY be included
where the payload records it, after `pdf_page`. New exports MUST NOT
invent synonyms (`page_num`, `pdfpage`, `source_page`).

---

## 7. Presentation and styles

**R39. Signed-delta color contract (all workspaces).**
Deltas, delta counts, and percent changes MUST be colored by sign:

- **Positive (increase) = green**, class `.up` (annexes: `.fmr-up` via
  `Amount signed`).
- **Negative (decrease) = red**, class `.down` (annexes: `.fmr-down`).
- **Zero / null = neutral** — no color, `—` or `n/a` per R31.

Color MUST always be redundant with an explicit sign (`+` prefix on
positive money; `+`/`−` on percents) and never the sole carrier of meaning
(colorblind accessibility; the UI plan's "status text does not depend on
color"). The exact-value tooltip accompanies compact signed cells. The
palette SHOULD be unified to one green/red pair (see D7).

**R40. Shared primitives are mandatory.**
Views MUST use the shared components — `SortableTable`, `ShareLink`,
`modalLifecycle.js`/`openModalDialog`, `PdfPreview` — rather than local
re-implementations. New table-like UI MUST start from `SortableTable`
(extend it with props: controlled `sort`/`page`, `tableId` anchors, header
bands) instead of a fork.

**R41. Class vocabulary map.**
Views MUST use the established classes for the established concerns:

| Concern | Class |
| --- | --- |
| Stat cards | `.cards.analysis-headlines > article` or `.fmr-stats > .fmr-stat` |
| Controls row | `.analysis-controls` |
| Dimension chips | `.dimension-chips` (`aria-pressed`, `.active`) |
| Section card | `.analysis-section` / `.fmr-section` |
| Aggregate block | `.aggregate-table` |
| Group opener | `button.group-open` / `.fmr-text-button` |
| Question/caveat banners | `.notice` / `.fmr-notice`, `h2.fmr-question` |
| Cell pattern | `.cell-main` + `small` context line; `.cell-sub` |
| Signed colors | `.up`/`.down` (DPWH) or `fmr-up`/`fmr-down` via `Amount signed` |
| Column bands | `.band-records` / `.band-allocations` + `divider` column prop |

New structural styles SHOULD live in a scoped layer (`Fmr.css`-style), never
a competing system.

**R42. Table behavior.**
All data tables MUST sort client-side without mutating source arrays; header
cells are buttons with `aria-sort`; missing values always sink regardless of
direction; the sort cycle is three-state (initial → opposite → cleared).
Heavy tables SHOULD set a `pageSize` and SHOULD adopt `tableId` deep links
(currently DPWH-only — see D3).

**R43. Money and numbers formatting.**
Amounts use the workspace's `money`/`amount`/`Amount` helper — grouped
thousands, exact value in the tooltip where the cell is compact, PHP stated
at point of use. Percentages render one decimal. Percent-change guards
against zero/null denominators (render `n/a`, never `Infinity`/`NaN`).
**The peso sign `₱` is reserved for narrative copy** (sentences, notices,
method notes); tabular money cells use digits + explicit `PHP` unit labels,
never a mixed `₱`-prefixed table.

**R44. Percent-change is one shared formula.**
Percent changes MUST be computed by the shared helper in
`analysis/web/src/pctChange.js` (`pctChange`):
`(current − prior) / |prior| × 100`, returning `null` for null/non-finite
inputs or `prior === 0`. Plain-string display uses `signedPct`
(`—` / `+x.x%` / `−x.x%`); DPWH Analysis may wrap the same number in a
colored `signedPercent` span (`n/a` when null). `fmrModel.js` re-exports
both helpers for existing annex imports. Views MUST NOT inline their own
division.

**R45. Loading, empty, and count states are uniform.**
Loading states MUST use `role="status"` text (or the modal-shaped
`LoadingModal` per R12); errors MUST use `role="alert"` with a recovery
action; empty tables MUST pass a specific `empty` message naming the
population ("No records in this group.", never a bare "No rows.");
filtered-vs-total counts MUST render as "*n* of *m* <grain>" with
`aria-live="polite"` where the count updates on filtering.

**R46. Locale is `en-PH` everywhere.**
All user-facing `toLocaleString` calls MUST use `'en-PH'` (the established
convention across the apps) — including shared components.
`SortableTable`'s former `en-US` fallback was aligned on 14 Oct 2026 (D15).

**R47. Document titles follow the page registry.**
`document.title` MUST be set per route from the workspace's tab registry as
`<Page label> · <Agency> FY2027` (e.g. `Analysis · DA FMR FY2027`), with a
defined fallback for unknown routes — never left stale from a previous
page. View-level refinements (e.g. DPWH hfepTabs driving sub-view titles)
MAY append detail after the page label.

---

## 8. Alignment backlog (documented deviations)

Current code deviations from the rules above — tracked here until fixed, so
"known inconsistency" never silently becomes precedent:

| # | Deviation | Rule | Fix direction |
| --- | --- | --- | --- |
| D1 | DPWH Analysis uses button tabs (`.analysis-subtabs`) without `aria-current` | R9 | **fixed 14 Oct 2026**: DPWH subtabs use anchors with `aria-current="page"`; view switches clear stale modal, table, sort, pagination and candidate controls while preserving source and non-degenerate dimensions |
| D2 | Question banner (`h2.fmr-question`) exists only in FMR/HFEP | R29-adjacent | **fixed 14 Oct 2026**: all four workspaces render per-view `h2.fmr-question` banners alongside their scope/epistemic notices; question styling is shared |
| D3 | `tableId`/`table=` deep links implemented only in DPWH `SortableTable` usage | R42 | **fixed 14 Oct 2026**: annex Analysis tables and record dialogs expose stable `tableId` links; `SortableTable` scrolls/focuses its mounted target, including lazy views; FMR mobile card layouts receive the target when the desktop table is hidden |
| D4 | Adjustments direction control semantics differ: DPWH = sort preset over full population (`increased` default sorts largest gaps first, no rows hidden); NIA = filter (`all` default). Both show the full population by default — compliant with R17; vocabulary difference documented in audit of 14 Oct 2026 | R17 | resolved as compliant; revisit only if one changes default behavior |
| D5 | Ranking vocabularies differ in kind (suggestions vs title ambiguity) | R16 | fine as data differs; keep labels self-explanatory |
| D6 | DPWH hero keeps four-source selector on candidate tabs | R15 | sanctioned exception; revisit if comparison narrows |
| D7 | Two green/red palettes coexist: `#126c48`/`#b33b36` (core `.up`/`.down`) vs `#0b6b3a`/`#a12020` (`.fmr-up`/`.fmr-down`, chainage cells) | R39 | **fixed 14 Oct 2026**: core `.up`/`.down` and hfep-pairs overrides unified to `#0b6b3a`/`#a12020` (`workspaces/budgetDisplay.js` badges still use `#126c48`/`#a42a36` — separate badge component, acceptable) |
| D8 | Records drill modal (R23 ladder) only fully implemented in DPWH; NIA lightweight; FMR/HFEP use links/filters | R23 | **fixed 14 Oct 2026**: FMR candidate regions and HFEP candidate dimensions open URL-keyed records dialogs with the aggregate membership, scope tags, full-population exports and a supported Compare footer; NIA group dialogs also carry scope tags and Compare links |
| D9 | Banded Records/Allocations columns (R25) only in DPWH Overview + drill modal | R25 | **fixed 14 Oct 2026**: FMR printed regional comparisons and NIA filtered ledger distributions use all eight banded numeric columns, signed deltas, shared percentages and record drills. Selected-source distributions remain separate. HFEP is compliant-by-data: Overview deliberately presents one source at a time because the retained category allocations and facility populations differ; both include national and LGU facilities; R25 applies if a stage-pair Overview is introduced |
| D10 | FMR has no program-axis dimension (single-program annex); NIA has no region axis (not printed) | R20 | compliant-by-data, not deviations — recorded so the "every dataset has region+category" assumption is not applied blindly |
| D11 | Evidence label grammar drift: HFEP pair view renders `House p.42` (missing space); volume labels used only in some HFEP contexts | R33 | **fixed 14 Oct 2026**: `p.42` → `p. 42` in HFEP pair view, DPWH Comparison source buttons, Highlights and CandidateDetails; HFEP adjustments buttons now route through the `volumeLabel` helper |
| D12 | Some page references render without opening the viewer (DPWH tree-evidence text, table plain-text page columns); FMR renders an empty `Printed p.` line when folio absent | R34 | **fixed 14 Oct 2026**: FMR/HFEP printed-folio null guards retained; DPWH retained NEP tree row/detail references now use PDF anchors intercepted by `PdfSourceModal`; source workspaces with an existing inline pane continue using their source buttons; standalone NEP evidence references also link to the retained PDF |
| D13 | NIA hardcodes PDF page bounds (`30` / `982`) when validating deep links instead of reading document registry metadata | R36 | **fixed 14 Oct 2026**: builder emits `page_count`; `NiaApp` validates from the registry (fallback `Infinity` for old payloads) |
| D14 | Export evidence headers already agree (`source_pdf`/`pdf_page`, per-side prefixes in FMR/HFEP) but DPWH exports lack the pair convention | R38 | **fixed 14 Oct 2026**: DPWH CSV and JSON add `nep_*`/`house_*` source IDs, `source_pdf` and `pdf_page`, plus `house_second_*`/`house_third_*` for both readings; grouped pages are comma-joined, absent counterparts stay null/blank; CSV reading amounts align with their headers |
| D15 | `SortableTable` default number formatting uses `en-US` while all apps use `en-PH` | R46 | **fixed 14 Oct 2026**: default fallback switched to `en-PH` |
| D16 | `percentChange`/`signedPercent` (Analysis.jsx) and `pctChange`/`signedPct` (fmrModel.js) are duplicate identical implementations | R44 | **fixed 14 Oct 2026**: calc + `signedPct` live in `pctChange.js`; `fmrModel.js` re-exports; DPWH imports `pctChange as percentChange` and keeps local colored `signedPercent` |
| D17 | FMR Analysis tabs used legacy keys/labels (`house_candidates`/"House-only candidates", `nep_candidates`/"NEP-only candidates") in the rendered tab strip | R8 | **fixed 14 Oct 2026**: canonical keys/labels in the registry; legacy keys demoted to read-only URL aliases; docs and browser check updated |

---

## 9. Review checklist (use before shipping any Analysis change)

1. Tab keys, labels, and order match R8; links reset stale params (R9).
2. Reload, Back/Forward, and shared links restore the exact view, including
   open dialogs resolved against full data (R10, R11).
3. Populations match R13; Deletions mirrors Insertions (R14); basis labels
   correct (R15).
4. Adjustments separates increased/decreased/net, and cross-document vs
   reading ledgers (R17).
5. Record grain honored: counts are record counts, compounds labeled as
   aggregates, controls never summed as records (R5–R7).
6. Dimensions are printed-source axes; chips govern; drill ladder complete
   and scope-preserving (R19–R24).
7. Overview comparison table uses the banded Records/Allocations skeleton
   where applicable (R25).
8. Every cross-document view carries the epistemic notice (R29); counts
   state grain (R30); missing values never zero (R31).
9. Deltas colored green/red by sign with explicit signs; neutral nulls
   (R39).
10. Rows carry evidence; exports cover the filtered population (R32);
    every visible page reference opens the shared PDF viewer in a modal
    (inline pane only where one already exists), labels use `<document>
    p. <n>`, page validation from registry metadata (R33–R38).
11. Shared components and class vocabulary used; tables behave per R42.
12. Numbers: `en-PH` locale, one percent-change helper, `₱` only in
    narrative copy, PHP units in tables (R43, R44, R46); loading/empty/
    count states uniform (R45); document title from the registry (R47).
13. Relevant checks pass: `npm test --prefix analysis/web`,
    `npm run build --prefix analysis/web`, and the workspace's
    `scripts/check_*_pages.py` browser suite.
14. If a rule was knowingly broken, the deviation is written into §8 or next
    to the code with a reason.

---

## 10. Compliance audit log

### Audit of 14 October 2026 (initial assessment)

Verified the rules against code across all four workspaces and fixed the
safe, mechanical deviations in the same pass.

**Verified compliant without changes** (spot-checked in code):
populations derive from comparison status in all workspaces (R13);
Deletions mirrors Insertions (R14); basis-label swap on cross-document tabs
(R15); epistemic notices present in every candidate view (R29); missing
values render `—` not zero (R31); headline cards, dimension chips, controls
and section classes per R41; adjustments keep increased/decreased/net
separate (R17); loading/empty/count states follow R45; document titles
follow the registry (R47); comparison "PDF page" columns render clickable
viewer buttons (R34).

**Fixed in this audit:**

| Change | Rule |
| --- | --- |
| `SortableTable` default number locale `en-US` → `en-PH` | R46 / D15 |
| `p.42` → `p. 42` spacing in DPWH Comparison source buttons, Highlights, CandidateDetails, HFEP pair view | R33 / D11 |
| HFEP Adjustments buttons hardcoding `Vol I-B`/`Vol II-A` now use the `volumeLabel` helper | R33 |
| FMR + HFEP `SourceButton` null-guard the `Printed p.` secondary line | R33 / D12 |
| Core `.up`/`.down` and hfep-pairs overrides unified to `#0b6b3a`/`#a12020` (badge component in `workspaces/budgetDisplay.js` keeps its distinct badge palette — separate visual role) | R39 / D7 |
| NIA builder emits `page_count` in the documents registry; `NiaApp` validates deep-linked pages from the registry instead of hardcoded `30`/`982` literals; payload rebuilt | R36 / D13 |
| DPWH direction default vs NIA `all` (D4) resolved as compliant: DPWH's control is a sort preset over the full population, NIA's is a filter defaulting to all rows — both show every changed pair by default | R17 |

**Unrelated WIP repaired to unblock validation** (not rule items): a JSX
tag mismatch in the in-progress `GeoMap.jsx` (stray `</div>`) broke the
production build; `check_hfep_pages.py` workspace-selector assertion
pre-dated the fifth "Geolocation" workspace in the user's WIP `routes.js`
and was updated to match.

**Validation:** `npm test --prefix analysis/web` (177 pass),
`npm run build --prefix analysis/web` (green),
`scripts/build_pages.py --with-react`, and browser suites
`check_nia_pages.py`, `check_hfep_pages.py`, `check_fmr_pages.py`,
`check_react_pages.py` — all passing.

**Open at the initial audit** (subsequently resolved below; tracked in §8): D1 button tabs in DPWH Analysis; D2
question banner coverage; D3 `tableId` deep links annex-side; D8 records
drill modal convergence for FMR/HFEP; D9 banded columns in annex Overviews;
D12 remainder — DPWH tree-evidence plain-text page numbers; D14 DPWH export
column adoption; D16 percent-change helper merge.

### Audit of 14 October 2026 (verification and completion)

Re-verified the completed todo items against the working code: locale,
PDF label spacing/folio guards, signed palettes, NIA registry bounds,
canonical FMR keys and the shared percent-change helper. The baseline had
177 passing unit tests; the shared-component batch passed the production
build, packaging and all four browser suites.

Completed D1–D3, D8–D9 and the D12/D14 remainder. Tables own their target
scroll/focus behavior; DPWH tabs use links; every Analysis view has a
question banner. FMR and NIA use the full Records/Allocations skeleton,
with record drills. HFEP retains per-source Overview distributions because
its annex coverage differs; this is the documented R25 scope decision.
FMR/HFEP candidate dialogs resolve the aggregate's full scoped membership,
show dimension/population/filter tags, export the whole group and link into
a supported Compare view. NIA dialogs gained the same scope cues and footers.
DPWH retained tree PDF references now open the shared viewer; CSV/JSON
exports carry per-side source IDs/PDF paths/all pages, with both House
readings preserved. Regenerated source-verification pages and their manifest.

The deeper checks also caught FMR's non-core tab preceding the canonical
candidate tabs and missing active state on legacy URLs, plus net-only
adjustment aggregates. These now keep gross increases/decreases visible.
HFEP's revised/unchanged records previously omitted the NEP value despite
having a printed counterpart; both source-cell values now survive into the
view and exports. Record/event counts and the 180,122,000 PHP revision bridge
are unchanged. HFEP explicitly labels its existing NEP-minus-House ledger.
The mobile banded table retains readable headers/group names inside its
horizontal scroller, so sticky headers do not cover record drill buttons.

**Final validation:** `npm test --prefix analysis/web` (**180 pass**),
`npm run build --prefix analysis/web` (pass), source-verification regeneration,
`scripts/build_pages.py --with-react` (pass), and browser suites
`check_react_pages.py`, `check_nia_pages.py`, `check_hfep_pages.py`,
`check_fmr_pages.py` (**all pass at 390px and 1440px**, no page errors or HTTP
failures). New checks cover table link reload/reset, restored Overview sorts,
Records/Allocations bands, group export counts under search filters,
reload/Back/Forward/Esc/Close, unknown groups and retained-tree PDF modals.
HFEP's complete deletion export includes all 203 records beyond the ranked
150-record display. Unit checks conserve source counts/pesos across Overview
groups and dialogs and preserve grouped PDF pages/missing counterparts.
