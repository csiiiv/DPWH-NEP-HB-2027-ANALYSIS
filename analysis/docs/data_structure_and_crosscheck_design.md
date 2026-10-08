# DPWH source structures and verification design

Updated: **9 October 2026**. The workbench verifies three independent sources before comparing them. The [source overview](../../site/index.html) and [verification methods](source_hierarchy_verification.md) are the current entry points. Earlier House PAP exports and matching outputs remain candidates/reference material.

## Independent sources

| Source | Canonical artifact | Grain and scope | Retained total (PHP) |
|---|---|---|---:|
| House Native I-B | [hb_dpwh_native_rollup.json](../data/hb_dpwh_native_rollup.json) | DPWH new appropriations; office allocations, FAP projects, and funding partitions | 654,102,015,000 |
| NEP PDF | [nep_2027_tree.json](../data/nep_2027_tree.json) | New appropriations; expense classes, programs, offices, PAP projects, and financing | 642,612,015,000 |
| Transparency NEP API | [dpwh_transparency_nep_tree.json](../data/dpwh_transparency_nep_tree.json) | Retained FY2027 NEP project listings, with derived grouping totals | 445,378,063,000 |

Automatic appropriations are excluded from the printed-source trees. API coverage is independently assessed; its smaller total is not a balancing gap to fill from the PDFs. The API endpoint recorded by the fetchers is `https://api.dpwh.bettergov.ph/nep/projects`. A separate multi-year contract archive is outside this scope.

## House Native I-B

The raw [native outline](../data/hb_dpwh_native_tree.json) has detached/repeated printed controls. It is retained as extraction evidence and must not be summed indiscriminately. [hb_native_rollup.py](../../scripts/hb_native_rollup.py) constructs an additive tree by restoring evidenced parent links and separating repeated controls from allocations.

Each nested node retains an ID, label, kind, printed amount, source reference, children, and `columns_php` for `ps`, `mooe`, `co`, and `total`. Checks require PS + MOOE + CO = Total and validate direct children and recursive leaves for every column. All 660 internal nodes pass; 1,746 leaves reproduce the agency total. Progressive child sums show the remaining balance after each child.

I-B's local allocations are mostly offices. Named local project extraction requires Native I-C. The v5 title layer and [older PAP export](../archive/data/hb_dpwh_pap_hierarchy.json) are supplementary candidates with their own coverage defects; they do not replace native I-B controls.

## NEP PDF and expense basis

The canonical flat node collection uses `id`, `parent`, `children`, `amount_php`, `printed_amount_php`, `additive`, `source`, and `amount_basis`. IDs refer to extraction/source entities, not universal project identifiers. Groupings without a printed amount are explicitly derived; reference controls are reachable but non-additive.

The root partitions into **PS ₱14,922,297,000**, **MOOE ₱24,685,746,000**, and **CO ₱603,003,972,000**. Amounts inside each branch are that class's allocations. They are not necessarily combined item totals.

For 307 printed operating-unit rows, `source_row_columns_php` preserves captured PS/MOOE/CO/Total values. Its full row total is context and is not added to the PS branch. A three-amount continuation layout resolves to PS, MOOE, Total; four-amount layouts resolve to PS, MOOE, CO, Total. Omitted columns remain null. PAP rows print class-specific amounts and do not establish a combined item total.

The [column reassessment](../data/nep_2027_amount_column_reassessment.json) covers all 16,764 nodes and records page-geometry hashes, row partitions, and text-audit classifications. Every comparable printed row is checked within its page-specific amount-column polygon. Multiple amount lines in an extraction area require row-identity review even when one matches.

The [atomic ledger](../data/nep_2027_budget_units.json) has 14,190 units; recursive traversal has 14,210 terminal allocation leaves because project financing can subdivide an atomic project. GOP/loan partitions are not additional projects. Both accounting representations reproduce the root; the 2,552 internal branch checks balance.

Source evidence remains provisional: 3,149 ambiguous row areas, 28 text disagreements, 14 alignment candidates, and two summary controls form 3,193 actionable checks. Two derived groups are informational. Neither arithmetic nor single-line OCR agreement certifies all printed values.

## Transparency NEP API

The original [combined snapshot](../../dpwh-transparency-nep-data/json/fy2027-combined.json) is preserved independently. Source amounts are thousands of pesos; import converts them exactly to integer PHP. Codes and API IDs must be unique, and fiscal year must be 2027.

The hierarchy is `pap1 → pap2 → pap3 → region → office → project code`. Each project retains the original code/ID, source row, title, hierarchy fields, source amount, and document count. Parents are derived groups, not printed controls. The listing does not supply a PS/MOOE/CO split.

The [audit](../data/dpwh_transparency_nep_tree_validation.json) records 2,662 rollup checks and agreement with all 23 retained listing pages. All 11,372 successful detail responses agree on identity, title, hierarchy, year, and amount; 5,155 documents are indexed. Local detail/listing files are ignored by Git; CI consumes their committed audit findings and the combined snapshot. Progress counters may lag the files and are not the audit baseline.

## Verification and presentation

The [verification builder](../builders/build_source_verification.py) independently checks unique paths, reachability, parent links, duplicate/cyclic relationships, immediate-child sums, recursive terminal sums, source identity, and ledger agreement. It also checks House expenditure columns and retained NEP operating-unit partitions. It does no project matching or network queries.

The [manifest](../data/source_verification_manifest.json) binds data, presentation, and review images to hashes. [Evidence provenance](../data/source_review_evidence.json) binds PDF crops to the retained PDF, canonical tree, review queue, and crop hashes. Changing extraction requires rebuilding its evidence and dependent pages. See [rebuild instructions](../README.md).

All viewers separate arithmetic from source evidence and coverage. Clickable paths expand and focus the entity's tree row. Expense selectors and review branches restrict search/queues; reset returns to the full hierarchy. Mobile panels preserve selection. Exact-PHP display changes formatting only.

## Comparison gate and later matching

`comparison_ready` remains false for every source. Resolve printed row identities/amounts, Native I-C coverage, and API release scope before certifying comparisons.

Later matching must preserve source-local entity IDs and evidence rather than replacing one source with another. Align fiscal year, budget stage, appropriation scope, expense class, local/FAP partition, allocation grain, and units first. A printed agency/control comparison and a project-set comparison answer different questions.

Unique normalized titles within region/PAP/zone may identify candidates; duplicate keys and fuzzy suggestions remain unresolved. Missing API records or damaged extraction do not establish insertions/deletions. Funding children must not be matched as separate project totals. Candidate differences require source evidence and manual certification before becoming budget-change claims.

The existing [candidate manifest](../data/comparison_manifest.json) documents the earlier matcher; the [candidate viewer](../viewers/source_comparison_2027.html) remains a reference while the verification gate is closed.
