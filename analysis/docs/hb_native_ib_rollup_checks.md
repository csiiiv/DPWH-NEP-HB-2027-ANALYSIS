# Native I-B DPWH progressive and recursive rollup checks

Date: 8 October 2026. Scope: DPWH summary on PDF page 9 and the peso-denominated detail table on pages 13–110 of `HB_BUDGET/2 - HB 10858 VOL IB.pdf`. This does not claim validation of the other departments in I-B.

The additive [Native I-B JSON](../data/hb_dpwh_native_rollup.json) now sums to **₱654,102,015,000**, exactly the printed grand total. Its 1,746 leaves appear once in the hierarchy. **660/660 internal nodes balance** both against immediate children and against recursively summed leaves in all four printed columns.

The original [raw outline](../data/hb_dpwh_native_tree.json) is retained for existing consumers. Its 647 successful detail checks were correct, but did not prove that its detached roots were an additive budget. Use the new artifact for root-to-leaf rollups.

## Gaps found and fixes

| Gap | Fix | Evidence |
|---|---|---|
| Five program controls were childless roots beside their PAPs | Attach the PAP detail branches beneath their program controls | Printed program banners in the detail table and independent page-9 controls |
| 37 PAP controls appeared twice, as a banner and a detail parent | Collapse the immediately following same-page copy only when heading and all four columns match | Both source row indexes retained in the repair log |
| Local and FAP headings had no printed amount on the heading row | Replace these two markers with the corresponding printed page-9 controls | Closing subtotals on pages 105 and 110 independently agree |
| GAS and S2O were separate activity roots without their section controls | Attach activities using printed closing-row boundaries | GAS closes on page 21; S2O closes on page 26, after the ₱27,150,000 laboratory-equipment activity |
| Regular Programs, Projects, and agency roots were absent | Restore these roots from page 9 | Detail closing controls on pages 102 and 110 agree |
| Sorted distinct `vals` discarded column order and equal-valued cells | Retain separate PS, MOOE, CO, Total cells using normalized column coordinates | Row partition and column-specific rollups agree throughout |
| Unrecognized amount rows could be silently skipped | Account for every amount row as a retained node, repeated control, or closing control | **Zero unexplained amount rows** before the object-expenditure boundary |

No allocation amount was adjusted, and no residual allocation was added. The raw leaf sum of ₱1,709,735,429,000 included **₱1,055,633,414,000 in repeated controls**; rebuilding the parent links and collapsing the evidenced repeats removes that double counting.

## Root rollup

| Branch | Recursive leaf sum (PHP) |
|---|---:|
| General Administration and Support | 18,078,293,000 |
| Support to Operations | 49,082,061,000 |
| Regular Operations | 528,316,707,000 |
| **Regular Programs** | **595,477,061,000** |
| Locally-Funded Projects | 13,875,943,000 |
| Foreign-Assisted Projects | 44,749,011,000 |
| **Projects** | **58,624,954,000** |
| **Total New Appropriations** | **654,102,015,000** |

Only sibling branches are additive: Regular Programs plus Projects reproduces the grand total. The bold intermediate controls are already included in their children above.

| Printed column | Additive leaf sum (PHP) |
|---|---:|
| Personnel Services | 14,922,297,000 |
| Maintenance and Other Operating Expenses | 24,685,746,000 |
| Capital Outlays | 614,493,972,000 |
| Total | 654,102,015,000 |

## Checks and audit trail

The [machine audit](../data/hb_native_ib_rollup_audit.json) contains every check, source coverage findings, repairs, closing controls, and source/code SHA-256 hashes.

- **2,406 row partition checks:** PS + MOOE + CO = Total.
- **2,640 immediate-child column checks:** four columns × 660 internal nodes.
- **2,640 recursive leaf column checks:** four columns × 660 internal nodes. These catch inherited gaps even where printed child controls add up.
- **Eight closing-control observations:** independently match the summary/section controls, in all four columns.
- Every node is reachable once from the agency root, and each retained source leaf is consumed once.
- Every internal node contains a `progressive_rollup`: children in printed order, cumulative recursive pesos, and the amount remaining to reach its control. All final balances are zero. An intermediate remaining amount is a running balance, not a missing allocation.

Nodes retain `printed_amount_php`, `columns_php`, `children_sum_php`, `recursive_leaf_sum_php`, `column_leaf_sums_php`, `difference_php` (leaf sum minus printed), and PDF page/source row provenance. `source_row` indexes extracted visual rows, not the document's printed margin line numbers.

The build exits nonzero on arithmetic discrepancies or unexplained amount rows. Regression checks introduce offsetting leaf errors, expenditure column shifts, out-of-band source rows, and incorrect closing controls to ensure that a balanced agency total cannot mask errors deeper in the tree.

## Remaining gaps

I-B's local leaves are **office allocations**, not named construction projects. Their arithmetic is complete within this scope. The separate [Native I-C layer](hb_native_ic_rollup_checks.md) now closes the four OCR-era extraction gaps and supplies project titles. Project-level overlap with Joebert/NEP still requires identity review. FAP branches retain the 29 named projects and their 49 funding leaves.

The separate object-of-expenditures table begins on page 110 and uses **thousands of pesos**. It is explicitly excluded before hierarchy construction. Other I-B departments also need their own table-family profiles.

## Reproduce

```sh
python3 scripts/hb_native_rollup.py
python3 scripts/hb_native_rollup.py --check
python3 -m unittest discover -s scripts/tests -v
```

The first command rebuilds both artifacts. `--check` reruns source extraction and arithmetic and checks that the committed artifacts exactly match the deterministic output without writing them.

## Inspect the hierarchy — 9 October 2026

The [Native I-B verification viewer](../viewers/hb_native_verification.html)
shows direct, recursive, and progressive sums with PS/MOOE/CO/Total evidence.
Click a parent path to navigate to that entity or a PDF reference to inspect the
retained page. This certifies the retained additive controls at their stated
grain. Native I-C detail is now implemented and supplies the current comparison
pipeline, with 56 cross-volume checks; see [I-C checks](hb_native_ic_rollup_checks.md).
Project identity and amendment completeness remain provisional. See
[source verification](source_hierarchy_verification.md).
