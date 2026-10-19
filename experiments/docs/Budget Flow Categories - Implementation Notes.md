# Five-stage budget flow with Category grouping

The **Budget flow** tab at `#experiments?tab=budget` implements the concept's five-stage structure using Category as the initial grouping dimension:

| Stage | Content |
| --- | --- |
| A | One total NEP allocation node |
| B | One NEP allocation node per category |
| C | Five distinct revision cells **within each category** |
| D | One HGAB allocation node per category |
| E | One total HGAB allocation node |

Category separates **Foreign-assisted projects (FAPs)** using the retained source FAP zone. Other groups are Asset Preservation, Network Development, Bridge, Flood Management, Convergence and Special Support, and Local Program, excluding FAP rows. These seven groups partition every comparison row exactly once. FAPs contain 29 comparison rows: ₱117,749,011,000 NEP → ₱44,749,011,000 HGAB. Grouping does not infer transfers.

This is recursive revision-matrix analysis: the existing Allocation flows matrix is the outer calculation, and the same calculation is repeated on each intermediary population. `revisionMatrix.js` supplies the shared rules, side amounts, gross changes and reconciliation for both views. The parent matrix carries its scoped child matrices.

The grouping contract is separate from revision classification: `groupings.category.groups[]` carries group identity and revision-class amounts/counts. Regions, DEOs and PAPs can later emit the same contract. Each C cell has both a group id and revision type, so the five revisions never collapse into shared global nodes.

The five-stage renderer instantiates **the existing `flowGraph` topology for each intermediary**, with namespaced node ids. There is one graph implementation for the workspace flow and scoped matrices. The layout is custom SVG (`columnFlow.js` primitives); D3 is not a dependency.

- Categories follow descending NEP allocation in B, C and D.
- C cells use the workspace order: deletion → insertion → increased → unchanged → reduced. Zero-valued nodes are omitted; ranks stay fixed.
- Insertion cells receive a **floating rectangular stub** equal to the entire HGAB-only allocation, with no NEP connection.
- Increased cells receive their NEP base plus a separate floating stub for the gross increase; their node and outgoing ribbon carry the combined HGAB value.
- Reduced cells receive the NEP value and split into the HGAB value plus a gross-cut ribbon ending in **House Reductions · category**, directly below that category’s HGAB node.
- Deletions terminate at C. Reduction sinks terminate at D and never connect to E.

Every ribbon has constant thickness at both ends. Every monetary rectangle, stub and sink uses the same px/PHP scale, with no minimum money-height clamp. Labels reserve separate space. Changes are represented by explicit entries and exits, not by tapering nodes or bands. Bézier curves only route connections between their allocated extents.

The view reuses `dpwh_flow_2027.json`, built from retained comparison rows by `buildDpwhFlow.mjs`; no full project payload or additional drawing dependency loads in the browser. Both source ledgers, every group's two sides, row coverage, revision totals and the gross-to-net bridge reconcile with zero-peso tolerance. Export provenance includes the comparison input SHA-256.

Current FY2027 source amounts:

| Measure | PHP |
| --- | ---: |
| NEP | 572,924,074,000 |
| HGAB 3rd reading | 587,075,661,000 |
| Gross additions, including insertion candidates | 177,170,632,000 |
| Gross reductions, including deletion candidates | 163,019,045,000 |
| Net change | +14,151,587,000 |

Matching is provisional. Inserted and Deleted are labeled unmatched candidates, not confirmed edits. Counts are comparison rows, which can contain grouped source records. Observed decreases do not establish how additions were funded.

Click a B/D group, focus a category through the selector, or activate a C cell with Enter/Space. The legend highlights a revision across all groups. Selection persists through `group=` and `revision=` in the URL, and the detail panel links to the exact group/revision population in Compare with both versions, source identifiers and PDF evidence. FAP links use the existing FAP program filter; ordinary group links also carry `exclude_fap=1`, exposed as a removable filter in Compare. Headline totals always describe the full displayed ledger; focus dims other paths without filtering out money. Compact/exact amounts follow the Experiments checkbox.

The canvas scrolls within the figure on desktop and mobile, with persistent stage headers. SVG and 2× PNG downloads include all five stages, grouping, selection, scope, units, source versions, date in Asia/Manila, source hash and the interpretation caveat.

Files: `BudgetCategoryFlow.jsx`, `BudgetCategoryFlow.css`, `budgetFlowModel.js`, `revisionMatrix.js`, `overviewFlows.js`, `ExperimentsApp.jsx`, and `buildDpwhFlow.mjs`.

Validation:

```sh
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py --with-react
python scripts/check_budget_flow_pages.py
```
