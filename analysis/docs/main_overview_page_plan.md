# Main Overview landing page plan

Updated: **14 October 2026**. Status: **implemented and verified locally**.

## Purpose and agreed direction

Add **Overview** as the first tab in the shared workspace navigation, before
**DPWH**, and make it the default landing page when the site opens without a
specific destination.

The common analytical question is: **What allocations appear only in the House,
appear only in NEP, or change between candidate counterparts?** Insertions,
deletions and adjustments are the main summaries. Source totals and coverage
provide the context needed to interpret them.

The page introduces the datasets and leads readers into the existing Analysis,
Compare, Highlights, source evidence and download pages. It uses the established
DPWH/FMR cards, tables, spacing and link patterns. Detailed analysis stays in
each workspace.

This is the **main site Overview**, distinct from the existing **Overview
sub-view inside each workspace's Analysis page**.

Related documents:

- [Analysis tab rules](analysis_tabs_rules.md)
- [Analysis tab framework](analysis_tabs_framework.md)
- [UI consistency plan](../UI_CONSISTENCY_PLAN.md)
- [Shareable datasets by page](shareable_datasets_by_page.md)
- [UI implementation reference](../../other-analysis/UI_IMPLEMENTATION_REFERENCE.md)

The Analysis rules govern the supporting populations, counting units, evidence
and exports. Their distribution-focused Analysis Overview rules apply to those
workspace sub-views; the main landing page summarizes all four workspaces.

## Reassessment after the 14 October Analysis revisions

The shared Analysis batches are complete: canonical tabs, question banners,
record drills, table deep links, evidence columns and banded stage tables are
available. The main Overview therefore links into those views and preserves
the existing workspace layouts.

Implementation adds `MainOverview.jsx`, a lightweight summary adapter and
`buildMainOverview.mjs`. The Node build step reuses the pure Analysis models
against validated Python-builder payloads; it checks source partitions and
funding identities before writing `main_overview_2027.json`. The browser only
renders this summary. It is generated for development, production builds and
packaging, with input hashes and a build timestamp.

Reassessment identified and addressed two accounting issues required for a
correct landing-page summary:

- DPWH's changed-pair predicate omitted 17 paired foreign-assisted reductions
  outside the Transparency listing. Adjustments, its record drills and the
  build-time headlines now use attached House/NEP amounts consistently: 409
  changed pairs, with gross increases/reductions kept separate.
- HFEP retained 79 derived zero cells that represent blanks. Those cells stay
  in the retained source amounts but no longer create printed funding records
  in the comparison model. Explicit printed zeros remain records. The summary
  has 184 House-only and 163 NEP-only component records, and 118 changed
  component events. Its paired net is −₱180,122,000 in House-minus-NEP direction;
  the existing HFEP view uses the opposite direction and says so on Overview.

HFEP copy now reflects national and LGU facilities in both schedules. The
₱140,000 printed-control overhang remains explicit. DPWH shows operations
ledger totals separately from broader agency controls. Geolocation remains
an exploration tool with overlapping per-artifact counts.

## Navigation and default route

Proposed shared navigation order:

```text
Overview | DPWH | DA Farm-to-Market Roads | DOH Health Facilities | NIA Irrigation | Geolocation
```

- Use `#overview` as the explicit landing-page destination.
- An empty hash opens the main Overview.
- Overview remains available from every workspace through the first tab.
- DPWH's existing `#home`, `#analysis`, `#compare` and source links retain their
  destinations. Other workspace prefixes and historical deep links continue
  to resolve.
- The DPWH tab opens DPWH Home when clicked from Overview. Existing analogous
  page switching between dataset workspaces remains available.
- Main Overview has no duplicated Home/Highlights/Analysis sub-tab row in v1.
  Its sections use ordinary headings and links.
- Keep workspace Analysis Overview URLs, such as `#nia/analysis?view=overview`,
  separate from `#overview`.
- Audit packaged root redirects as well as SPA routing so first visits land
  on Overview while explicit source/workspace entry points stay intact.

Geolocation is already registered in the working tree. Preserve that navigation
entry; present it as a companion exploration tool rather than a fifth funding
dataset with insertion/deletion totals.

## Page content, in reading order

### 1. Introduction

Suggested title: **FY2027 budget allocation overview**.

Suggested introduction:

> Explore public works, farm-to-market roads, health facilities and irrigation
> allocations. Compare the retained NEP and House schedules, inspect candidate
> additions and removals, and follow amount changes to their source records.

A short visible notice explains that allocations are budget figures and
candidate matches remain provisional. Fiscal year and the dataset build date
appear beside the introduction. Detailed methods can use a collapsed disclosure.

### 2. Main summaries: insertions, deletions and adjustments

Use one consistently structured summary card per funding workspace. Each card
contains:

1. Workspace name and the scope of its ledger.
2. The exact comparison basis, including the selected House reading where
   relevant.
3. NEP and House totals for that scope, with the source allocation-record
   counts labeled separately.
4. Insertion-candidate count and House allocation.
5. Deletion-candidate count and NEP allocation.
6. Adjustment counts, gross increases, gross reductions and signed net movement.
7. A link from each population into its existing Analysis or Compare view.

Two cards per row on desktop and one per row on mobile keep these summaries
readable. Inside each card, use concise labeled rows for the three populations;
large figures should emphasize pesos without hiding the counts or their units.

| Main summary | Population | Count | Money basis |
| --- | --- | --- | --- |
| Insertion candidates | House-only source allocation records | Unmatched House record count | Sum of their House allocations |
| Deletion candidates | NEP-only source allocation records | Unmatched NEP record count | Sum of their NEP allocations |
| Adjustments: increased | Positive movement within the paired population; component events disclosed where needed | Increased record/event count | Gross increase, House minus NEP |
| Adjustments: reduced | Negative movement within the paired population; component events disclosed where needed | Reduced record/event count | Gross reduction, shown as a magnitude |
| Adjustments: net | Movement within the paired population | Changed record count, with event types disclosed where needed | Gross increases minus gross reductions |

Gross increases and reductions remain visible alongside the net figure.
Unchanged allocation records are excluded from changed-record counts; an
unchanged facility total does not exclude changes between its component columns.
The value beside an adjustment is a **difference**, not the entire allocation
of the paired project.

The primary summary represents the full retained comparison population. It
does not silently inherit filters from a previously visited workspace. Population
links set the required basis and filters explicitly.

### 3. Source funding snapshot

Below the main summaries, provide a compact table:

```text
Workspace | Coverage | NEP allocation | House allocation | House − NEP | Evidence
```

This table gives readers a way to compare stage totals with the candidate
decomposition. Distinguish printed controls from source-ledger totals when they
do not agree, and show the documented residual beside the affected workspace.

Do not add the four workspaces into a purported national budget total or add
House and NEP together. These cover different scopes and stages. Candidate
counts also remain separate because their record grains differ.

### 4. Selected findings

Show at most one featured finding per funding workspace in v1. Each includes
its counting unit, comparison basis, amount and a direct evidence/analysis link.
Figures come from the same validated build as the summaries.

### 4a. Cross-workspace coverage and candidate-change tables (added 15 October)

Between Selected findings and the investigation directory, Overview now carries
the two tables the DPWH Highlights page pioneered, filled with every funding
workspace:

- **Budget coverage by stage** — one row per workspace with DBM NEP, HGAB 2nd
  and HGAB 3rd counts and ledger totals. DPWH retains both readings
  (`readings.second` headline in the summary payload). Each annex workspace's
  House ledger *is* its 2nd-reading extraction, so the HGAB 2nd cell shows its
  own figures and the HGAB 3rd cell reads "Unchanged from HGAB 2nd" — the
  extractors diff the annex text between the retained 2nd-reading copy and the
  3rd-reading printing (FMR 60, HFEP 17, NIA 46 identical pages) and the
  summary refuses to build if any page differs.
- **House vs. NEP: candidate changes** — insertion and deletion candidates with
  their source allocations, gross paired increases/reductions, and the House
  ledger, each cell linking into the workspace's own filtered population view
  (per-workspace `links.increases`/`links.decreases`).

Every cell states its workspace's counting unit; counts and pesos are never
added across workspaces. The DPWH Highlights tables keep only the DPWH row and
link to Overview for the cross-workspace view.

Possible findings:

- **DPWH:** a documented House-reading allocation change, clearly separated
  from the NEP-to-House comparison.
- **FMR:** funding movement between the retained road schedules or a regional
  concentration finding.
- **HFEP:** the funding-column mix, such as medical equipment's contribution
  to the annex difference.
- **NIA:** AI monitoring related allocations and their insertion candidates.

Use existing supporting views for these links. New landing-page evidence
modals are not required for the first version.

### 5. Guided exploration and downloads

Provide a small directory of tasks:

- **Compare allocations:** open the appropriate workspace's Compare page.
- **Find a project or facility:** open its searchable source-record table.
- **Inspect geographic evidence:** link to FMR Map and Geolocation, with each
  tool's coverage stated.
- **Verify an amount:** open a source hierarchy or supporting-record view.
- **Download datasets:** link to existing resources and the shareable-dataset
  guide, keeping source-ledger downloads distinct from comparison exports.

Geolocation counts are per source artifact and its DPWH corpora overlap. They
must not become unique-project counts, extra allocations, or a location-verified
coverage claim on Overview.

### 6. Sources, coverage and build information

A compact final section links methodology, source documents and downloads. It
states the fiscal year, dataset build date and any known reconciliation limits.
Use the actual build date, not the current browser date or the date this plan
was written.

## Dataset-specific accounting

| Workspace | Coverage and record grain | Overview treatment |
| --- | --- | --- |
| DPWH | Agency controls and detailed source allocation records; some comparison rows bundle several records | Separate agency controls from the detailed comparison ledger. Count retained allocation records, including grouped members, rather than treating each displayed comparison row as one record. |
| DA FMR | Locally funded FMR annex; one printed project row with one allocation | Count each project allocation once, regardless of the number of coordinate segments. |
| NIA | Six detailed irrigation sub-programs; one printed project row with one allocation | Keep parent controls, agency-only CARP and broader agency appropriations outside the project-ledger candidate totals. |
| DOH HFEP | HFEP capital-outlay annex; one printed infrastructure, medical-equipment or motor-vehicle component record | Facility totals are controls, not extra records. Show component-record counts and optional facility-row context separately. |
| Geolocation | Coordinate-text inventory over overlapping retained artifacts | Exploration link only; no separate budget-change summary. |

### DPWH comparison basis

Use a clearly labeled NEP-to-House comparison as the primary card basis. The
preferred House reading is the latest retained reading supported by the validated
comparison payload; name it explicitly. Do not mix HGAB2→HGAB3 changes or the
Transparency snapshot into that primary population. Link those separate
comparisons as additional exploration.

### HFEP component events

Unmatched-facility funding records belong to insertion/deletion candidate
populations. Within a paired facility, component records can be revised, added
or dropped. Those events belong to the adjustments decomposition, with their
types visible; a column switch is not automatically a new or removed facility.

Gross and net adjustment movement must include the disclosed paired-facility
component events so it reconciles to paired funding movement. Do not show only
revised cells as though they account for the entire paired difference, or count
paired-facility added/dropped components again as unmatched-facility candidates.

Before publishing record counts, validate the treatment of printed zeros,
missing cells and derived zeros against retained amount lineage. A synthesized
zero must not manufacture a printed funding record. Missing amounts display
as `—`; a measured empty population displays as zero.

The NEP printed control exceeds the facility ledger by the documented
**₱140,000** overhang. Show that residual explicitly when bridging ledger
movement to printed controls.

**Scope correction required:** existing HFEP copy describes House as LGU-only.
The retained House annex also has DOH Hospitals, State Universities and
central-office rows. Overview must use the actual printed categories, and
dependent scope statements need review before publication. Source-only status
does not establish that House removed national facilities.

## Money identity and worked example

For a fully partitioned comparison on the same ledger basis:

```text
House ledger − NEP ledger
  = House-only allocation − NEP-only allocation + paired net movement

Paired net movement
  = gross increases − gross reductions
```

For HFEP, paired movement includes the component events described above. A
separate control-versus-ledger residual explains any difference between this
identity and printed stage controls. Do not force ledger figures to match
controls by changing or inventing records.

Illustrative current **full NIA annex** snapshot, to be refreshed from the
builder during implementation:

| Metric | Count | Amount |
| --- | ---: | ---: |
| House-only insertion candidates | 319 project records | ₱9,452,650,000 House allocation |
| NEP-only deletion candidates | 282 project records | ₱8,221,526,000 NEP allocation |
| Increased paired adjustments | 0 pairs | ₱0 gross increase |
| Reduced paired adjustments | 4 pairs | ₱830,000,000 gross reduction |
| Net paired movement | 4 changed pairs | −₱830,000,000 |
| Net annex movement | — | +₱401,124,000 |

```text
₱9,452,650,000 − ₱8,221,526,000 − ₱830,000,000 = +₱401,124,000
```

The separate NIA AI monitoring finding has **123 House-only candidates and
₱2,626,950,000** in whole-project allocations. It is a subset of the NIA
summary, not additional money. Monitoring-component costs are not itemized.

## Build-time summary contract

Generate a small, schema-versioned landing-page payload, provisionally
`analysis/data/main_overview_2027.json`, from the authoritative workspace
builders and their retained comparison ledgers.

The browser loads that compact summary instead of fetching every full
project/facility payload merely to display the landing page. Builders own the
counts, money identities, lineage and validation; the browser renders and links.

Each workspace summary should carry:

- Workspace key, label, fiscal year, build date and source/payload provenance.
- Coverage, comparison basis, record-grain label and displayed count units.
- Per-stage ledger allocation and record count; printed controls and residuals
  as separate fields where applicable.
- Insertion/deletion record counts and their respective source allocations.
- Adjustment event counts, gross increase, gross reduction and signed net
  movement, with the workspace-specific event vocabulary disclosed.
- Supporting-route keys/parameters, methodology links and featured findings.
- Explicit availability/validation status for each population.

Amounts use exact integer PHP. Formatting to millions/billions is presentation
only; exact values remain accessible. An unavailable or unvalidated metric
has a missing value and an explanation, not a fabricated zero.

Each adapter must use the same population membership and amount basis as its
destination Analysis view. Verify DPWH grouped-record expansion, HFEP component
events and source-lineage exceptions before enabling those summaries. Examples
in this document are not values to hard-code into the frontend.

## Interaction, accessibility and failure states

- Use the existing shared header and visual language. Active Overview navigation
  is a link with `aria-current="page"`.
- Summary links state workspace, population and comparison basis and open
  supporting views with compatible URL parameters.
- Share links restore `#overview` or the selected supporting destination.
- Main Overview does not use one global region/program filter: printed axes
  differ between the datasets. Filtering occurs in the destination workspace.
- Mobile cards preserve the labels, counts, amounts and evidence links. Tables
  use the existing scrollable shared component where necessary.
- Loading is announced with `role="status"`; failed data loads have a useful
  explanation and recovery link. Missing metrics do not block other usable
  summaries or appear as zero allocations.
- Candidate meaning, counting units and source scopes remain visible rather
  than being available only through a tooltip.

## Implementation sequence

1. Inventory current comparison bases, record grains, existing routes and
   authority fields for the four funding datasets. Record any discrepancy
   between the proposed Analysis rules and implemented populations.
2. Build the compact summary adapters and enforce partitions, source counts,
   gross/net movement and ledger/control reconciliation, including documented
   exceptions. Resolve the HFEP scope/zero-lineage issues relevant to the summary.
3. Add Overview navigation and default-route handling while preserving existing
   explicit workspace routes and packaged redirects.
4. Render the four common summary cards and funding snapshot using existing
   styles and primitives.
5. Wire the population links, selected findings, exploration directory and
   source/download information.
6. Validate the packaged app and update the relevant navigation/data guides.

This sequence adds the landing page and any accounting fixes it actually needs;
it does not require rebuilding all workspace page layouts.

## Acceptance checks for the eventual implementation

- Opening the site with no hash lands on Overview; `#overview` reloads correctly.
- Overview is the first shared tab in every workspace, including Geolocation.
- Existing DPWH, annex and source deep links still resolve; Back/Forward and
  packaged project-path deployments preserve their destinations.
- All four funding workspaces show insertion/deletion counts and allocations
  and separate increased/reduced/net adjustment figures with explicit units
  and comparison bases.
- Headline values equal the full supporting populations and exported amounts,
  regardless of pagination. DPWH grouped members and HFEP component records
  are counted at their declared grains.
- Paired component additions/drops and unmatched populations are disjoint;
  controls, facility totals and repeated coordinate segments do not duplicate
  allocations.
- Ledger movement reconciles, and printed-control residuals are explained.
  Missing and measured-zero values remain distinct.
- Every summary and featured finding opens the intended existing evidence
  population. NIA's AI monitoring subset is clearly labeled.
- Mobile/desktop and keyboard checks cover navigation, loading/error states,
  readable counts/money, evidence links and horizontal overflow.
- Packaged previews contain the summary payload, linked datasets and documents;
  no unsupported live-data dependency is introduced.

## Deferred from v1

- Combined national-budget totals or unique-project counts across workspaces.
- A universal project search or shared region filter over incompatible fields.
- A new cross-dataset matching engine or certification of candidate identities.
- New standalone landing-page evidence modals when existing views provide the
  required records and exports.
- Spending, delivery, beneficiaries, adequacy or unit-cost claims beyond what
  the retained source documents establish.

## Implementation verification — 14 October 2026

- **188 frontend unit tests passed**, including full-ledger summary adapters,
  grouped-record counts, HFEP direction/zero-lineage handling, duplicate/missing
  record rejection and exact summary exports.
- Production build and static packaging passed; root/historical redirect tests
  passed (4 tests).
- Overview, DPWH, FMR, HFEP, NIA and Geolocation browser suites passed at
  **390px and 1440px**. Overview checks cover default routing, primary-tab order,
  lazy data loading, exact-peso and sort restoration, summary CSV, supporting
  destinations, Back/Forward, unknown views and schema-error recovery.
- HFEP builder freshness check passed and **28 HFEP source tests passed**.
- Default-display and exact-peso screenshots were reviewed; the mobile exact
  display uses one column for long amounts.
- Changes remain in the local working tree; this page does not record a new
  deployment or publication.

Primary implementation: `MainOverview.jsx`, `MainOverview.css`,
`mainOverviewModel.js`, `overviewSummary.js`, `buildMainOverview.mjs` and
`scripts/check_overview_pages.py`. The import reported during development was
resolved by creating the referenced component and its supporting modules.
