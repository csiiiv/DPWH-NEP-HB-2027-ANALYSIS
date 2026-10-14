# Analysis tab framework: Overview, Insertions, Deletions, Adjustments

Updated: **13 October 2026.**

**Purpose.** This documents the logical framework, format, content, and styles
of the four core Analysis sub-tabs — **Overview**, **Insertions**,
**Deletions**, and **Adjustments** — as implemented across the four main
dataset workspaces (DPWH, DA FMR, NIA, DOH HFEP). The goal is a reusable
blueprint: when a new annex/workspace is added, or an existing view is reworked,
this is the canonical shape to follow so comparable questions look and behave
comparably everywhere. Workspace-specific tabs and other page families
(Highlights, Compare, source workspaces) appear here only as context;
extending this treatment to them is a possible future extension, not current
scope.

Companion documents:
[Analysis tab rules and guidelines](analysis_tabs_rules.md) (normative) ·
[UI consistency plan](../UI_CONSISTENCY_PLAN.md) ·
[FMR implementation reference](../../other-analysis/UI_IMPLEMENTATION_REFERENCE.md) ·
[Shareable datasets by page](shareable_datasets_by_page.md).

> Note: the `docs/adr/` records are historical and no longer maintained;
> this document and the rules page supersede them as the working reference.

Code map (primary sources):

| Workspace | App file | Tab registry | Core view components |
| --- | --- | --- | --- |
| DPWH | `analysis/web/src/Analysis.jsx` | `views` (line 24) | `Overview`, `Insertions`, `Deletions`, `Adjustments`, `AggregateTable` |
| DA FMR | `analysis/web/src/FmrApp.jsx` | `analysisViews` (line 470) | `Analysis` (inline branches), `ComparisonResults`, `FilteredAnalytics` |
| NIA | `analysis/web/src/NiaApp.jsx` | `views` (line 525) | `Analysis`, `OverviewComparison`, `CandidateAnalysis`, `ComparisonTable` |
| DOH HFEP | `analysis/web/src/HfepApp.jsx` | inline (line 613) | `Analysis`, `Insertions`, `Deletions`, `Adjustments`, `CrossDocAggregate`, `RecordGroupDialog` |

Shared model helpers: `analysis/web/src/niaModel.js`
(`analysisCandidateRows`, `candidateGroupRows`, `candidateAggregates`),
`analysis/web/src/niaAnalysis.js`. Shared primitives:
`SortableTable.jsx`, `ShareLink.jsx`, `modalLifecycle.js`, `PdfPreview.jsx`.

---

## 1. Logical framework (shared across workspaces)

### 1.1 One page, URL-routed sub-views

Every workspace exposes **Analysis** as one registered page whose sub-views
live in a `view` hash parameter (`#analysis?view=insertions`,
`#fmr/analysis?view=adjustments`, …). The tab list is data, not markup:

```js
// DPWH Analysis.jsx:24
const views=[['overview','Overview'],['insertions','Insertions'],['deletions','Deletions'],
             ['adjustments','Adjustments'],['chainage','Chainage'],['roadgroups','Groupings'],
             ['statistics','Statistics']];
// NIA NiaApp.jsx:525
const views = [['overview','Overview'],['insertions','Insertions'],['deletions','Deletions'],
              ['adjustments','Adjustments'],['stats','Statistics'],['ai_monitoring','AI monitoring'],
              ['candidates','Candidates'],['controls','Agency controls']];
// FMR FmrApp.jsx:473 — canonical keys/labels since 14 Oct 2026; legacy keys
// resolve as read-only aliases:
const aliases={house_candidates:'insertions',nep_candidates:'deletions',
               statistics:'stats',chainage:'coordinates'};
```

`overview` is always the first tab and the default when `view` is absent.
Annex apps render an explicit "Unknown view → Open Overview" recovery link
for unknown keys; DPWH currently falls back to Overview.

### 1.2 All state rides the URL

No view-relevant state lives in component state. The full parameter set:

| Param | Role | Used by |
| --- | --- | --- |
| `view` | active sub-tab | all |
| `source` / `stage` | budget source for single-source views (`third`, `second`, `nep`, `api` in DPWH; `house`/`nep` in annexes) | Overview, Statistics |
| `ranking` | candidate sub-population (see §4.2) | Insertions, Deletions |
| `dim` | aggregate breakdown dimension | Overview, Insertions, Deletions, Adjustments |
| `direction` | `increased`/`reduced` amount-change filter | Adjustments |
| `q`, filter params (`region`, `subprogram`, `status`, …) | population filters (FMR/NIA/HFEP `Filters` component) | all |
| `sort`, `dir`, `page` | route-backed table sorting/pagination (annexes) | tables |
| `group` + `g` / `pair` / `records` / `drill` + `axis` / `shell`… | **dialog keys** — a modal is open iff its key is present, so Back closes it and links are shareable | group/pair/records drill-downs |
| `table` | deep link that scrolls a specific `tableId` into view and flashes it | Analysis tables in every workspace |

Tab switches reset stale params rather than letting them ride along: DPWH
drops a degenerate `dim=overall` plus `drill/axis/table`
(Analysis.jsx:107–113); NIA's `Tabs` takes a `reset` map clearing
`status/direction/ranking/aiBasis/sort/dir/group/pair/dim/table/pdf/pdfPage`; FMR/HFEP `ViewTabs`
blank `page/sort/dir` and view-specific filters.

### 1.3 Data contract

Each workspace fetches **one derived workbench JSON** built by one Python
builder (schema-versioned; the app throws on mismatch):

```text
{ schema_version, fiscal_year,
  stages: { house: {…projects, regions/controls, metadata…}, nep: {…} },
  comparison: [ { id, status, method, house?, nep?,
                  house_php, nep_php, delta_php,
                  ambiguous_title?, region_key, subprogram_key?, trace? } ],
  comparison_summary / matching_note / agency_controls … }
```

Analysis views are **filters and group-bys over that ledger** — the browser
never computes an authoritative number (the builder/app split is the
governing pattern: builders enforce invariants with `raise`, the app only
renders).
DPWH differs only in scale: a light `comparison_overview_2027.json` (headline
aggregates, loaded always) plus a heavy `comparison_projects_2027.json`
(per-record rows, loaded lazily only for `deletions/adjustments/chainage/
statistics` or a group modal, behind a `LoadingModal` that keeps the modal
contract while the payload lands), plus per-view sidecars
(`chainage_units_2027.json`, `road_group_candidates_2027.json`).

### 1.4 Population derivation (the heart of the framework)

All four workspaces derive the three cross-document populations from
comparison status, never from presence in a single list:

| Tab | Population | DPWH grain | Annex grain (FMR/NIA/HFEP) |
| --- | --- | --- | --- |
| **Insertions** | House-side rows with no NEP counterpart (`status = house_only` / `event = 'unmatched' && side === 'house'`) | comparison rows incl. grouped members | unmatched source rows (HFEP: per funding-column record) |
| **Deletions** | NEP-side rows with no House counterpart (`nep_only` / `side === 'nep'`) | NEP line items, with optional "possible replacement" suggestions | unmatched NEP rows |
| **Adjustments** | paired rows whose amounts differ (`paired && delta_php ≠ 0`, or `revised/added/dropped` events) | unequal-amount candidate pairs **plus** a separate 2nd→3rd reading ledger | changed pairs (HFEP: event ledger per record) |

NIA implements this once, parameterized — the cleanest expression of the
pattern (niaModel.js:133):

```js
export function analysisCandidateRows(rows, {view, q = '', subprogram = '', ranking = 'all', direction = 'all'} = {}) {
  const scoped = filterComparisons(rows, {q, subprogram});
  if (view === 'adjustments') return scoped.filter(r => r.status === 'paired' && r.delta_php !== 0 &&
    (direction === 'increased' ? r.delta_php > 0 : direction === 'decreased' ? r.delta_php < 0 : true));
  const status = {insertions: 'house_only', deletions: 'nep_only'}[view];
  if (!status) return [];
  return scoped.filter(r => r.status === status && (ranking === 'ambiguous' ? r.ambiguous_title
    : ranking === 'unambiguous' ? !r.ambiguous_title : true));
}
```

### 1.5 Two view families per page

The page hero decides its own controls by family:

- **Single-source views** (Overview, Statistics, and workspace-specific tabs):
  a *Budget source* `<select>` in the hero (`source`/`stage` param) +
  the shared `Filters` toolbar + filtered population `Stat` cards.
- **Cross-document views** (Insertions, Deletions, Adjustments): the selector
  is **replaced by a static basis label** —
  `House GAB · unmatched source rows` (Insertions),
  `DBM NEP · unmatched source rows` (Deletions),
  `House GAB ↔ DBM NEP` (Adjustments) — because the population is fixed by
  the comparison itself. All three annexes implement exactly this swap
  (FmrApp.jsx:511–514, NiaApp.jsx:529–531, HfepApp.jsx:608–612); DPWH keeps
  its four-source selector because its comparison has four sources.

`ShareLink` sits beside whichever control is shown.

---

## 2. Canonical page format (section order)

The Analysis page renders, top to bottom:

1. **Hero** — eyebrow (`Agency · FY2027`), `h1` "Analysis", one-line
   description, hero-actions (source selector *or* basis label) + `ShareLink`.
2. **View tabs** — anchor navigation with `aria-current="page"` in every
   workspace (`.analysis-subtabs` in DPWH, `.view-tabs.fmr-view-tabs` in
   annexes). Switching views clears stale table and dialog selections.
3. **Question / scope banner** — every view renders `h2.fmr-question`;
   cross-document views retain their epistemic notice, and Overview
   describes its distribution scope.
4. **View body** — the per-tab framework below (§4–§7).
5. **Recurring footers** — reading notes (`ReadingNote`), scope notes
   (`ScopeNote`), and app-level dialogs (pair evidence, PDF viewer).

Within every cross-document view the body follows one order — memorize this
as **the candidate-view skeleton**:

```text
h2 title
→ .analysis-controls   (ranking select for Insertions/Deletions;
                        direction select for Adjustments)
→ dimension chips      (optional: breakdown axis for the aggregate table)
→ Filters              (optional: search + shared filters)
→ headline stat cards  (3–4 cards: population size, money at stake,
                        one split/quality metric)
→ .notice caveat       (epistemic guardrail — always present, see §8.1)
→ aggregate table      (totals by dimension; group labels open a
                        records dialog)
→ ranked record table  (top-N slice or paginated full ledger)
→ review actions       (per-row: Compare link, source-tree link,
                        search-the-other-annex, PDF evidence)
→ cross-link           ("Continue in Compare stages →")
```

---

## 3. Overview tab

**Question.** "How are this source's allocations distributed across the
workspace's primary breakdown axis?" Single-source view: selector + filters +
stats.

| Workspace | Breakdown axis | Headline cards | Body |
| --- | --- | --- | --- |
| DPWH | `dim` chips: Overall / Region / District office / Category / PAP (defaults **region**) | records, allocated amount, CO vs DEOs | NEP→HGAB comparison table (records + allocation bands with Δ and % columns), per-group drill buttons → `DrilldownModal` (URL `drill`+`axis`), two `Distribution` tables (offices, programs), "Explore further" cross-links into the other tabs |
| FMR | Region (printed controls) | filtered allocation, median, mean, coordinate-review count | banded Records/Allocations regional-controls comparison + filtered per-source distribution (bar rows `.fmr-distribution`) + regional sortable table with `→ records` drills (`records=region:…`) |
| NIA | `dim` chips: Overall / Sub-program / Program (defaults sub-program) | filtered allocation, median, mean, largest | banded two-stage ledger distribution with records drills + selected-source sub-program bars/table with source-record dialogs, "Explore further" cross-links, supporting `ProjectTable` |
| HFEP | Region (per selected stage) | filtered capital outlays, median, mean, extraction findings | regional `ScopeTable` (facility counts, per-component columns, median, findings) with region drill |

**Framework rules.**

- Overview always answers a *distribution* question with the workspace's own
  hierarchy (region → office/PAP for DPWH; region for FMR/HFEP; sub-program
  for NIA). The banded stage comparison defined in rules §4.3 is the permitted
  cross-document distribution; broader matching/change ledgers belong in
  the candidate tabs or Compare.
- Every aggregate row is a **drill**: DPWH group names open modals, FMR/HFEP
  region rows set `records=region:…`, NIA sub-program rows open the
  source-record dialog (`records=overview-source:…`). NIA's stage
  distribution uses `group=overview:…`; FMR controls use
  `records=compare-region:…`. Drills preserve the aggregate's scope.
- DPWH adds nested drill-downs (region/office → PAPs and vice versa) through
  URL-keyed modals so a shared link reopens the exact breakdown.

## 4. Insertions tab

**Question.** "Which House-side records have no NEP counterpart?" Population:
`house_only`. Basis label: `House GAB · unmatched source rows`.

### 4.1 Section order (all workspaces)

Hero basis label → tabs → question → `analysis-controls` (candidate-group
select) → dimension chips (all workspaces) → filters (annexes) → stat cards →
notice → aggregate-by-dimension table → ranked top table → per-row review
links → Compare cross-link.

### 4.2 Candidate sub-groups (`ranking` param)

| Workspace | Options |
| --- | --- |
| DPWH | `no_suggestion` (House-only · no NEP suggestion), `unresolved` (Unresolved NEP suggestions), `third_only` (New 3rd-reading records) |
| NIA | `all`, `unambiguous` (without repeated-title ambiguity), `ambiguous` (repeated-title ambiguity) |
| FMR / HFEP | none — ambiguity surfaces as row badges/method labels instead |

DPWH's `Deletions` reuses the same `ranking` param with a **different allowed
set** (`deletionModes`: `no_suggestion`, `suggested`, `second_only`) — one
param name, per-view vocabulary.

### 4.3 Headline cards

- DPWH: Comparison rows · Group allocation (PHP, "ranked by amount") ·
  Showing (Top *N* of *M*).
- NIA: Candidate source rows · House allocation · Repeated-title ambiguity.
- HFEP: Unmatched House records · House-only allocation · Matched pairs ·
  Rest matches (% at ≥0.95 title similarity).

### 4.4 Record grain (the key semantic difference)

See the canonical record definition and rules R5–R7 in
[analysis_tabs_rules.md §1.5](analysis_tabs_rules.md). Summary per workspace:
DPWH / FMR / NIA — one row per **source allocation record / project row**
(DPWH counts include grouped members); HFEP — one row per **funding-column
line item** on a facility (infrastructure / medical equipment / motor
vehicle), with facility totals treated as controls, not records.

### 4.5 Notice (guardrail) examples

- DPWH `no_suggestion`: "House records with no attached NEP/Transparency
  source and no retained NEP suggestion. These are review candidates, not
  confirmed insertions."
- NIA: "House rows without a unique NEP counterpart are insertion
  candidates. Title differences, OCR, and repeated titles can prevent
  pairing. Candidate status does not certify an insertion."
- HFEP: "An unmatched House record usually means the NEP lists the same money
  at a different grain (lumped, split, retitled or under another funding
  column) — not that the House added a facility."

### 4.6 Review actions per row

- "Review comparison" → Compare page scoped to the record (all).
- Source-tree link into the owning stage (DPWH House tree; NIA source
  record; HFEP facility tree).
- HFEP/FMR: "Search NEP annex" with the first 40 title characters.
- Evidence: `SourceButton` → PDF page opening the shared viewer in a modal
  (annexes); DPWH links into its Compare/source pages instead.

## 5. Deletions tab

**Mirror of Insertions.** Population `nep_only`; basis label
`DBM NEP · unmatched source rows`; money column becomes "NEP allocation";
aggregate and record tables rank by NEP amount; review links search the
**House** annex / Compare. Everything else — controls, cards, skeleton,
styles — is identical by construction (NIA literally reuses
`CandidateAnalysis`; DPWH's `Deletions` mirrors `Insertions`'s JSX; HFEP
swaps `side`).

Workspace-specific semantics that must survive the mirroring:

- DPWH adds **"Referring House rows"** for `ranking=suggested` (possible
  replacements: unmatched House rows naming this NEP item as counterpart).
- HFEP counts funding-column records rather than facility totals. Both
  schedules retain national and LGU facilities, with different category
  allocations. Title, grouping and column differences can leave records
  unmatched; source-only status does not establish a facility's removal.

## 6. Adjustments tab

**Question.** "Which paired records changed amount between the two
documents?" Population: paired rows with `delta_php ≠ 0` (or HFEP's
revised/added/dropped events). Basis label: `House GAB ↔ DBM NEP`. This is
the only core tab that requires **both** sides attached, so it is the first
tab that needs the heavy per-record payload (DPWH lazy-loads it on entering
the view).

### 6.1 Direction control

`analysis-controls` holds a Direction select:

- DPWH: `increased` (Most increased · House above NEP) / `reduced`
  (Most reduced · House below NEP); default `increased`; presets the table's
  initial sort.
- NIA: adds `all` (All amount changes) as the default.
- FMR/HFEP: direction is a shared filter (`direction` param) surfaced in the
  `Filters` bar rather than a dedicated select.

### 6.2 Headline cards

- DPWH (4): House vs NEP pairs · Cross-doc net (increased/decreased split) ·
  Reading adjustments count · Reading net Δ.
- NIA (3): Changed candidate pairs · Net paired difference (signed, colored) ·
  Increased/reduced pairs (gross amounts).
- HFEP (4): Revised / Added / Dropped / Unchanged records, each with its net
  amount and a one-line definition.
- FMR: `FilteredAnalytics` collapsible carries the same numbers (increased /
  decreased, unchanged, house-only / nep-only) plus the funding bridge.

### 6.3 Two ledgers: cross-document vs reading changes

DPWH renders **two sections** and insists on the distinction in copy:

1. *House vs NEP differences · provisional identity* — cross-document gaps on
   candidate pairs ("This is a cross-document comparison, not a House reading
   change. % change is House relative to NEP."). Includes per-dimension
   `DifferenceAggregate` (increased / decreased / net kept separate so a cut
   cannot hide an add) and the top-100 direction-sorted table with
   House / NEP / gap / % columns.
2. *Reading adjustments · HGAB3 vs HGAB2* — the recorded 2nd→3rd reading
   ledger from `revisionSets` ("reading edits only, not House-versus-NEP
   changes"; "new in HGAB3" replaces a missing Δ).

NIA mirrors the guardrail from the other side ("NIA has one retained House
schedule; this view does not establish changes between House readings").
FMR's annex text is identical across readings (`ReadingNote`).

### 6.4 HFEP event ledger (record-grain bridge)

HFEP's Adjustments is the fullest arithmetical treatment — worth reusing when
a source prints components in columns:

```text
Revised (both annexes print differing amounts)
+ Added   (NEP prints, House blank)
− Dropped (House prints, NEP blank)
= total-column movement on matched pairs        ("revision bridge")
```

Rules encoded in the notice: a *record* is one funding-column line item on
one facility row; column switches (House infrastructure ↔ NEP medical
equipment) are **not** revisions — they are one dropped + one added record.
The view ships: by-funding-column aggregate table, a filterable +
CSV-exportable full record table (event / column / search filters,
route-backed sort, pageSize 25), and per-row **both-side** PDF evidence
buttons (House Vol I-B p. *n* / NEP Vol II-A p. *n*).

### 6.5 Aggregation with signed integrity

Aggregate tables for adjustments never fold increases and decreases into one
number silently: DPWH's `differenceByDimension` keeps
`increased / decreased / net` per group; NIA's groups carry net paired
difference ranked by `|amount|`; HFEP keeps per-event counts and nets. This
is a hard rule — a large cut must not be able to hide a large add.

## 7. Aggregate (group) tables and drill-down modals

Every candidate view may render a "Totals by *dimension*" table between the
cards and the record table. Contract:

- Columns: Group (link/button) · Rows · Allocation (or net difference) ·
  a "Show *N* rows" action.
- Group label opens a **records dialog keyed in the URL**:
  - DPWH: `group` + `g` params → `GroupProjectsModal` (lazy chunk + heavy
    payload, `LoadingModal` placeholder keeps backdrop/Esc contract;
    membership rules identical to the aggregate; footer links into a
    matching filtered Compare view).
  - NIA: `group` param → in-page `Dialog` reusing the shared
    `ComparisonTable`.
  - FMR: candidate regions use `records=candidate-region:…`; the dialog
    reuses `ComparisonResults` over the full ledger under the active filters.
  - HFEP: candidate dimensions use `group` plus `dim`; `RecordGroupDialog`
    reuses the funding-column `LineItemTable`. Funding-column movement
    aggregates also offer a dialog for their revised/added/dropped records.
- Dimension chips (`.dimension-chips`, `aria-pressed`) choose the axis:
  DPWH Overall/Region/Office/Category/PAP; NIA Overall/Sub-program/Program;
  FMR Overall/Region; HFEP Overall/Region/Province/Category/Subcategory/Funding column.
  The aggregate table is hidden when `dim=overall` (the cards already carry
  the overall totals).

## 8. Content rules

### 8.1 Epistemic guardrails (non-negotiable)

Every cross-document tab carries a `.notice`/`.fmr-notice` paragraph stating,
in workspace-appropriate words: **these are review candidates produced by
provisional title/scope matching, not certified insertions/deletions;
identity is not manually certified; grain/scope differences and OCR can
prevent pairing.** Adjustments additionally disclaims the
comparison basis (GAA-like vs full-project-cost; cross-document vs reading
change). Overview/Statistics notices disclaim descriptive-lens interpretation
("round values are expected… deviation is not evidence of wrongdoing").

### 8.2 Numbers and money

- Integer Philippine pesos of printed allocation; units shown at point of
  use (`PHP`, `Allocation (PHP)`).
- Signed deltas colored: positive `.up`/`.fmr-up`, negative `.down`/
  `.fmr-down`, with explicit `+` sign and `%` change beside the gap where
  relevant.
- **Missing never renders as zero** — em dash `—` with an explanatory
  secondary line ("No paired amount difference", "n/a").
- Tooltips carry the exact grouped-thousands value where the cell shows a
  compact form.
- Counts always state their grain ("source allocation records, including
  grouped members, rather than unique projects").

### 8.3 Evidence and exports

- Per-row source evidence: annexes put a `SourceButton` (PDF document +
  page) in the row; NIA/HFEP record both sides of a pair; DPWH routes
  through Compare/source-tree links. PDF page referencing follows the
  standard in [analysis_tabs_rules.md §6.1](analysis_tabs_rules.md):
  `pdf_page` is the single page vocabulary, and every visible page
  reference MUST open the shared `PdfPreview` in a modal at the referenced
  page (inline pane only on layouts that already host one).
- Record tables expose exports covering the filtered population, not the
  displayed page (HFEP "Export all records CSV"; NIA toolbar CSV; FMR CSV +
  JSON on comparison tables), with `source_pdf` / `pdf_page` columns
  (per-side prefixes for pairs; optional `printed_page` after it).
- Group/pair dialogs are shareable URLs and Back closes them.

### 8.4 Recovery states

- Unknown `view` → explicit "Unknown view. Open Overview" link.
- Unknown dialog key / group id → in-dialog "not found" message with a clear
  recovery action (DPWH `GroupingMembersModal`, NIA group dialog).
- Loading heavy payloads → `role="status"` text or a modal-shaped
  `LoadingModal` (DPWH), never a silent blank.

## 9. Style reference

### 9.1 Class vocabulary

| Concern | DPWH (`styles.css`) | Annexes (`Fmr.css` + shared) |
| --- | --- | --- |
| Page canvas | `.headline-analysis`, `.hero`, `.eyebrow`, `.hero-actions`, `.hero-source` | `.fmr-page-title`, `.fmr-eyebrow`, `.hero-actions`, `.hero-source` / `.nia-analysis-basis` |
| Tab strip | `.analysis-subtabs` (links, `aria-current`) | `.view-tabs.fmr-view-tabs` (links, `aria-current`) |
| Question banner | `h2.fmr-question` + `.notice` | `h2.fmr-question` + `.fmr-notice` / `.notice` |
| Stat cards | `.cards.analysis-headlines > article > h3/strong/p` | `.fmr-stats > .fmr-stat` (`Stat` component) |
| Controls row | `.analysis-controls` (label+select, max-width 380px) | same class reused by NIA; FMR uses `.fmr-result-bar` |
| Dimension chips | `.dimension-chips button.active` (pill, `aria-pressed`) | reused by NIA as-is |
| Section card | `.analysis-section` (white card, 1rem pad, 10px radius) | `.fmr-section` |
| Aggregate block | `.aggregate-table > h3 + SortableTable` | same class reused (NIA) |
| Table | `SortableTable` (`.sortable-table`, sticky banded headers, `aria-sort`, three-state sort, `tableId` deep link) | same component, controlled `sort`/`page` from route; `.fmr-pagination` |
| Cell patterns | `.cell-main` + `small` (title + context), `.cell-sub`, tooltip spans | `<Amount>` / `money()` / `signedMoney()` helpers |
| Signed colors | `.up` / `.down` | `.fmr-up` / `.fmr-down` (via `Amount signed`) |
| Group opener | `button.group-open` (blue underline link-button) | `.fmr-text-button` |
| Cross-links | `.analysis-crosslinks` grid | inline "Continue in Compare stages →" |
| Dialogs | `.analytics-dialog.group-projects-dialog` + `modalLifecycle.js` | `.fmr-dialog` + `modalLifecycle.js` |

### 9.2 Behavioral styles

- Tables sort client-side without mutating source arrays; missing values
  always sink regardless of direction; header cells are buttons with
  `aria-sort`.
- Analysis tables carry `tableId` → `#` anchor creates a `table=<id>` URL
  preserving the active params. The mounted `SortableTable` scrolls and
  focuses the target (`table-target` highlight), including lazy/dialog
  tables. FMR mobile cards receive focus when their desktop table is hidden.
- Modals: native `<dialog>`, Esc cancels, focus restored, one-layer
  dismissal, backdrop-click closes only outside the dialog box.
- Mobile: stat-card grids collapse to one column; wide tables scroll inside
  `.sortable-table` regions; FMR provides card layouts + mobile sort selects
  for comparison ledgers.

## 10. Reuse checklist for the next dataset workspace

1. Register the workspace (hash prefix + tab list) per the
   [FMR implementation reference](../../other-analysis/UI_IMPLEMENTATION_REFERENCE.md);
   give Analysis the standard `views` array starting with `overview`.
2. Produce one schema-versioned workbench JSON with `stages` + `comparison`
   (status vocabulary: `paired` / `house_only` / `nep_only`, `delta_php`,
   ambiguity flags). Enforce builder-side invariants (exact partition; money
   identity `paired_delta + house_only − nep_only == control difference`).
3. Implement `analysisCandidateRows` / `candidateGroupRows` /
   `candidateAggregates` against that ledger (port from `niaModel.js`).
4. Build Overview around the workspace's printed hierarchy with row drills;
   do not invent a comparison Overview the data can't support.
5. Build Insertions/Deletions as mirrors (basis label, NEP-vs-House money
   column, review links search the *other* annex), choose the record grain
   deliberately (project row vs funding-column record), and write the
   grain/scope caveat into the notice.
6. Build Adjustments only if both sides attach; keep direction control,
   increased/decreased/net separation in aggregates, and — where the source
   prints component columns — the HFEP event ledger with its revision bridge.
7. Use `SortableTable`, `Stat`/cards, `.analysis-controls`,
   `.dimension-chips`, `.aggregate-table`, `group-open`, `modalLifecycle`
   as-is; route-back sort/page/group keys; add per-row PDF evidence and
   whole-population CSV export.
8. Add the epistemic notice to every cross-document view before shipping.

## 11. Alignment status (14 October 2026)

- All core tab strips use links; all views have per-view question banners.
- Table deep links are shared across the four Analysis workspaces.
- FMR and HFEP candidate aggregates use records modals with scope tags,
  whole-population exports and Compare footers; NIA has the same scope cues.
- FMR/NIA Overview stage distributions use the Records/Allocations bands.
  HFEP retains per-source distribution because its annex coverage differs.
- Ranking vocabularies remain dataset-specific and labeled in the controls.
- DPWH Adjustments direction is a sort preset over the full population;
  NIA's direction is a filter defaulting to all rows. Both show the full
  changed-pair population by default (rules §8 D4).
- Annex Overview source defaults remain NEP for their established
  proposal-first distribution lens; candidate views fix their side by status.
