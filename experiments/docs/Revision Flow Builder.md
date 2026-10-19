# Revision flow builder

The reusable structure is **Total A → Intermediary A → Revision Matrix → Intermediary B → Total B**. Each intermediary repeats the same revision analysis. The DPWH Budget flow tab uses this builder and shared SVG renderer.

| Layer | File | Responsibility |
| --- | --- | --- |
| Model and graph | `analysis/web/src/revisionFlow.js` | Validate cells, aggregate totals, build five columns, addition stubs and per-group reduction sinks. |
| Layout | `analysis/web/src/revisionFlowLayout.js` | Place groups, nodes and bands using one value scale. |
| React renderer | `analysis/web/src/RevisionFlowDiagram.jsx` | Draw the SVG, hover highlights, keyboard selection and export metadata. |

The core uses `before`, `after`, `count` and stable group IDs. DPWH labels, PHP formatting, FAP membership, matching caveats, URL state and comparison links belong to `budgetFlowModel.js` and `BudgetCategoryFlow.jsx`. The three-stage Allocation flows adapter also uses the core's `revisionMatrixGraph` topology.

## Aggregated cells

Amounts must be non-negative safe integers in one base unit. Normalize decimals into integer cents, centavos, etc. first. Counts are integer record counts.

```js
import {buildRevisionFlow} from './revisionFlow.js';
import {layoutRevisionFlow} from './revisionFlowLayout.js';

const model = buildRevisionFlow({
  id: 'proposal-final',
  labels: {
    before: 'Proposal', after: 'Final',
    intermediaryBefore: 'Region · proposal', intermediaryAfter: 'Region · final',
    additions: 'New allocation', reductions: 'Removed allocation', count: 'projects',
  },
  groups: [{
    id: 'north', label: 'North',
    cells: [
      {key: 'insertion', before: 0, after: 50, count: 1},
      {key: 'unchanged', before: 30, after: 30, count: 1},
      {key: 'increased', before: 20, after: 35, count: 1},
      {key: 'reduced', before: 40, after: 15, count: 1},
      {key: 'deletion', before: 10, after: 0, count: 1},
    ],
    expected: {before: 100, after: 130, count: 5},
  }],
  expected: {before: 100, after: 130, count: 5},
});
const layout = layoutRevisionFlow(model);
```

`model` contains `groups`, each group's `matrix` and local `graph`, the aggregate `matrix`, `totals`, `labels`, and a complete five-column `graph` (`nodes`, `links`, `stubs`). Totals retain gross `additions`, gross `reductions`, and `delta` independently. Missing cell types are filled with zeros. Nonzero cells require positive counts.

Groups default to descending `before`, then ID; supply an `order(a, b)` comparator to change the shared B/C/D order. `revisions: {reduced: {label: 'Reduced'}}` customizes revision labels. Duplicate identities, invalid directions, unsafe sums and mismatched expected ledgers throw descriptive errors. Zero-money cells keep their counts in the model and are omitted from the drawing.

## Matched records and grouping

`buildRevisionFlowFromRecords` classifies each record **before** aggregation, preserving offsetting gross changes. The input must already contain the intended pairs. `null` or `undefined` means absent; `0` means present with zero value. Every record needs a unique string ID and one stable group ID.

```js
import {buildRevisionFlowFromRecords} from './revisionFlow.js';

const records = [
  {id: '1', region: 'North', office: 'Office A', old: 40, next: 25},
  {id: '2', region: 'North', office: 'Office B', old: 20, next: 35},
];
const buildFor = dimension => buildRevisionFlowFromRecords(records, {
  id: 'comparison',
  before: record => record.old,
  after: record => record.next,
  group: record => ({id: record[dimension], label: record[dimension]}),
  expected: {before: 60, after: 60, count: 2},
});
const regions = buildFor('region');
const offices = buildFor('office');
// Both preserve 15 added and 15 removed, despite zero net change.
```

Changing Category to Region, DEO or PAP is a grouping-adapter change once those identities are available. The builder does not infer matches or cross-group transfers. Each pair belongs to one intermediary throughout B → C → D; reclassifications between side-specific groups need an explicit upstream mapping policy.

`analysis/web/src/revisionFlowExample.js` provides a runnable inventory example grouped by region or department, including absent and zero-valued records.

## Dataset and intermediary sources

The Budget flow tab provides **Dataset source** and **Intermediary source**
dropdowns. Only fields recorded in each dataset are offered:

| Dataset | Intermediary sources |
| --- | --- |
| DPWH | Category (FAPs separate), PAP, Region, DEO / implementing office |
| DA Farm-to-Market Roads | Region |
| DOH Health Facilities | Facility category, Facility subcategory, Region, Province, Funding component |
| NIA Irrigation | Sub-program, Program group |

`BudgetFlowExplorer.jsx` owns these selections. URLs use `dataset` and
`intermediary` parameters, for example
`#experiments?tab=budget&dataset=hfep&intermediary=column`. Dataset defaults and
unsupported combinations recover to the available default grouping. Changing
either source clears the old group/revision selection and retains alignment
and compact/full presentation preferences.

`buildBudgetFlowSources.mjs` builds `analysis/data/budget_flow_sources_2027.json`
from the existing retained workbenches. The resulting catalog is roughly
200 KB: the browser does not need the large comparison/workbench files to
operate either dropdown. The normalizers live in `src/flowSourcesData.js`.
All groupings must rebuild both source ledgers and every revision population.
The normal build and static packaging commands regenerate and copy this file.
For a frontend-only iteration, regenerate it explicitly before the Vite build:

```sh
node analysis/web/buildBudgetFlowSources.mjs
```

Grouping uses one stable identity per comparison record. DPWH uses retained
PAP/region labels, and the NEP office (House office for an insertion). Unknown
or multiple-office allocations keep an explicit bucket. HFEP uses existing
record scopes; paired records use House facility headings. Recorded category
headings are retained, including distinctions between the two versions.
No title-based geography, office splitting, or new matching is introduced.

HFEP counts funding-column records rather than facility totals. A blank
component on a paired facility supplies a zero base in Increased/Decreased,
matching the existing Overview grammar; unmatched facilities supply
insertion/deletion candidates. FMR, HFEP and NIA use their retained House annex
extractions only after their source audits confirm identical text in the third
reading. Ledger totals retain each dataset's documented scope.

Existing DPWH category links, FMR region links and NIA sub-program links open
exact record populations. Dimensions that their comparison workspace cannot
express link explicitly to the unfiltered comparison workspace. Exports carry
the selected dataset, intermediary, count unit, scope and provenance, and use
source-specific filenames. Long group labels reserve additional heading space;
large PNGs reduce raster scale to stay within canvas dimension limits.

## Top groups plus Others

```js
import {collapseRevisionFlow} from './revisionFlow.js';
const compact = collapseRevisionFlow(model, {top: 3, othersLabel: 'Other regions'});
```

This display variation ranks groups by `before` allocation, retains the top
three individually, and sums the remainder **revision by revision** into an
Others group. Others stays last even when its combined allocation exceeds a
top group. Global totals, record counts, gross additions/reductions and the
common value scale stay unchanged. The original model is untouched. If there
are no remaining groups, no Others group is created. `compact.rollup.members`
and the aggregate group's `members` carry constituent IDs and labels for
inspection or expansion. Supply `othersId` when a source group already uses
the default `others` identity.

The Budget flow tab defaults to **Category detail → Top 3 + Others**. The pilot
retains Convergence and Special Support, FAPs, and Network Development by NEP
allocation; Flood Management, Asset Preservation, Bridge and Local form Others.
This draws 18 revision cells in four groups instead of 33 cells in seven groups,
reducing the diagram height by about 29% without reducing the monetary scale.
The Others detail panel lists its members and their exact comparison links.
**Expand Others** or **Category detail → All categories** restores the complete
view (`#experiments?tab=budget&detail=all`). Existing links to a category hidden
inside Others open that category in full detail. Exports retain the chosen
presentation and record the grouping membership in their metadata.

## Renderer

```jsx
import RevisionFlowDiagram from './RevisionFlowDiagram.jsx';

<RevisionFlowDiagram
  model={model}
  title="Proposal to final allocation"
  formatValue={n => `${n.toLocaleString()} units`}
  metadata={{unit: 'units', source: 'my dataset'}}
  onSelect={({group, revision}) => console.log(group, revision)}
/>
```

The renderer computes layout automatically; pass `layout` to reuse one. Optional props include `caption`, `captionDetail`, `description`, `subtitle`, `footer` (up to five lines), `formatExact`, `formatCount`, `revisionSuffix`, `describedBy` and `svgRef`. Supply `selection={{group, revision}}` and `onSelect` for controlled selection; otherwise the renderer keeps local selection. Callers use the IDs for evidence links and routes. `svgRef` exposes the SVG for caller-owned export controls.

All bands have identical thickness at both endpoints. Insertions enter through full-value rectangular stubs; increased cells receive a base ribbon plus a gross-addition stub. Reduced cells split into the retained value and their own reduction sink; deletions end at C. Label spacing has minimum sizes, value geometry does not. `layoutRevisionFlow(model, {valueHeight: 520})` controls the proportional height budget independently of label spacing. The layout primitive defaults to `alignment: 'top'`. The Budget flow UI explicitly defaults to `midpoint` (**Matched to groups**), which draws one exact A/E ledger segment beside each group so the outer ribbons stay level with B/D. `align=top` restores contiguous top-aligned total ledgers; `align=center` centers those total ledgers. All modes retain the same scale and amounts. Geometry uses custom SVG, with no D3 dependency.

## Budget flow image exports

The Budget flow toolbar keeps SVG and PNG exports for the diagram, and adds
**Download section PNG** for the full section: heading, totals, caveat, legend,
complete diagram, current selection detail, revision table and source notes.
The report uses a fixed 1536px width at 2× resolution, including on mobile.
A detached copy expands the diagram and source disclosure; export controls
and the duplicate sticky stage headings are omitted. Selection, alignment and
number formatting are retained. The live page and its scroll position remain
unchanged. `src/sectionImage.js` performs this capture using browser SVG/canvas
APIs without another dependency.

## Validation

```sh
node --test analysis/web/src/revisionFlow.test.js analysis/web/src/revisionFlowRender.test.js
npm test --prefix analysis/web
python scripts/check_budget_flow_pages.py
python scripts/check_flow_source_pages.py
```

Tests cover non-budget regrouping, graph conservation, band thickness, insertion/deletion-only populations, empty and zero-valued inputs, collision-safe IDs, gross changes and errors. Renderer tests exercise independent figures with non-budget labels. After packaging, the browser check exercises the DPWH adapter at desktop and mobile widths, evidence navigation, route-backed selection, geometry and SVG/PNG exports.
