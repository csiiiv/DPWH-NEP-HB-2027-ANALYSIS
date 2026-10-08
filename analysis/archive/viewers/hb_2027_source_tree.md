# FY2027 DPWH House (HB 10858) document-native tree

**Earlier v5 project-candidate viewer:** use [Native I-B verification](../../viewers/hb_native_verification.html) for the current additive control hierarchy. The extraction gaps below remain explicit; named local projects still need Native I-C. See [current verification workflow](../../docs/source_hierarchy_verification.md).

The tree drills the printed **₱654,102,015,000** House total down the document's own hierarchy: Operations (OCR row 2444) → Organizational Outcomes, Locally-Funded Projects, Foreign-Assisted Projects, and Convergence → programs → PAPs → regions → offices → projects, with GOP/loan partitions inside every FAP project. **476 printed controls balance exactly** (44 PAPs, 399 office subtotals, 15 region subtotals, plus programs, outcomes, and sections). The only mismatches are the four documented unresolved PAPs.

| Unresolved PAP control | Printed − extracted (₱) |
|---|---:|
| BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities | +2,241,795,000 |
| BIP - Coastal Roads to augment Resiliency of Coastal Communities | -1,456,800,000 |
| BIP - Multi-Purpose Buildings/ Facilities to support Social Services | +5,115,958,000 |
| Water Supply System | -304,641,000 |

## Document structure and anchors

VOL I-C prints the DPWH operations section as **OO1 ₱209,746,642,000 = APP + Network Development + Bridge** program controls exactly; **OO2 = Flood Management Program**; **Locally-Funded Projects ₱13,875,943,000 = PPP fund ₱1B + National Building Program ₱12,875,943,000**; and the **FAP tail (rows 20962–21042): FAP-OO1 ₱35,712,554,000 + FAP-OO2 ₱8,853,487,000 + FAP-NBP ₱182,970,000**, each with printed sub-PAP controls that v5 reproduces exactly. The Convergence total never prints in VOL I-C; it is the exact residual of the Operations control minus the four printed sections (₱231,382,287,000) and is marked derived.

## Construction

Run `python analysis/archive/builders/build_hb_source_tree.py`. Inputs: House v5 allocations, the audited printed controls, the canonical PAP mapping, the old strict hierarchy (printed office/region subtotals), and the OCR row→page map. Document anchor rows (2444, 2445, 2446, 5811, 6979, 6980, 20662–20670, 20962–21016) are asserted at build time — if the OCR changes, the build fails. Region/office groupings use v5 attribution; printed office subtotals are attached only when the old block's row set exactly equals the v5 group and the sum matches (399 offices, 15 regions). No subtotal or hierarchy amount is invented.

## Limits

This is a recursive *extraction* baseline, not a certification. 10,874 of 16,148 allocations inherit v4b amounts and attribution; the four unresolved sections remain open; balanced office subtotals validate arithmetic, not title or attribution correctness; regional groupings without printed subtotals are v5-derived. GAS/S2O details are outside the VOL I-C project table. Unmatched rows across sources are review candidates, never confirmed insertions or removals.

## Artifacts

- [Interactive drilldown](hb_2027_source_tree.html): document view with row/page references, printed vs extracted amounts, funding partitions.
- [Canonical tree](../data/hb_2027_source_tree.json): hierarchy, validation status, provenance, anchors.
- [Validation ledger](../data/hb_2027_source_tree_validation.json): every printed control check, attachments, anchor rows.
- Regression tests: `python -m unittest discover -s analysis/tests -p 'test_hb_source_tree.py' -v`.

Next: resolve the four unresolved sections against the source PDF; extend office-subtotal attachment to the replaced sections' native subtotals.
