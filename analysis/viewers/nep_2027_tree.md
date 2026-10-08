# FY2027 DPWH NEP source tree

The complete **new-appropriations** tree totals **₱642,612,015,000**. All 2,552 additive rollups balance exactly; 14,190 atomic budget units reproduce the root without double counting. Automatic appropriations are outside this scope.

| Program | Allocation |
|---|---:|
| General Administration and Support | ₱18,078,293,000 |
| Support to Operations | ₱51,609,648,000 |
| Asset Preservation Program | ₱76,500,584,000 |
| Network Development Program | ₱176,637,644,000 |
| Bridge Program | ₱44,410,122,000 |
| Flood Management Program | ₱103,450,431,000 |
| Convergence and Special Support Program | ₱157,308,648,000 |
| Local Program | ₱14,616,645,000 |

## Source and construction

Run `python analysis/builders/build_nep_tree.py` to rebuild. Inputs are the retained PAP tree, operating-unit tree (Personnel Services), and `NEP-2027-VOLUME-2B_OCR.pdf`. The tree records input SHA-256 hashes, page references, full OCR titles, original parents, and a repair ledger. No API or House rows determine this tree.

The expense-class root is PS ₱14,922,297,000 + MOOE ₱24,685,746,000 + CO ₱603,003,972,000. The program view links disjoint branches across expense classes and is independently checked against printed section/program controls. Two PREXC groupings have no printed PS total and are explicitly derived. Project GOP/loan details partition project totals; the two overall financing reference rows are non-additive.

There are 54 documented repairs, primarily hierarchy corrections. One merged Bentigan/Bertese row omitted a separately printed ₱5,000,000 Bertese project on PDF page 494; native text and the rendered page confirm the split. Four titles on page 286 and five merged funding labels were also restored. No balancing amount was invented.

## Recursive validation and OCR limits

Each printed control is compared with its immediate additive children, bottom-up, at zero-peso tolerance. A mismatching branch is localized below that control; an ancestor can balance even when two lower errors offset. `validate(nodes, strict=False)` returns every branch check for diagnosis; the production build refuses any mismatch. Structural checks reject cycles, orphan nodes, repeated paths, and inconsistent parent links. The atomic-unit ledger provides an independent counting check.

Arithmetic balance does **not** prove every OCR amount is correct: equal and opposite errors among siblings can cancel. The independent native-text audit checked 16,760 source rows: 16,523 have the expected amount within their recorded bounding box, 23 have a nearby match suggesting coordinate drift, and 214 need further text/image review. The remaining 4 nodes lack a comparable printed row/bounding box. Native text is another OCR layer; agreement is supporting evidence, not definitive image verification. Bounding boxes can span multiple amounts, so even within-box agreements are not a guarantee of row identity.

All 237 non-direct agreements remain in `nep_2027_native_amount_review.json`. They are review candidates, **not confirmed amount errors**. Sample image checks on pages 205, 228, and 347 show correct amounts on adjacent rows despite shifted native coordinates. No native-audit discrepancy silently changes a budget amount.

This is an arithmetically validated comparison baseline with explicit source-review limits. Complete the image review queue before claiming every amount is independently verified.

## Artifacts

- [Interactive drilldown](nep_2027_tree.html): expense or program view, search, page references, printed/child totals.
- [Canonical tree](../data/nep_2027_tree.json): hierarchy, validation status, provenance, native-audit status.
- [Rollup checks and repairs](../data/nep_2027_tree_validation.json).
- [Atomic budget units](../data/nep_2027_budget_units.json): paths and funding partitions.
- [Native amount audit](../data/nep_2027_native_amount_audit.json): all checked rows and candidate amounts.
- [Source-image review queue](../data/nep_2027_native_amount_review.json).

Next, inspect the review queue against rendered PDF pages, then compare API and House rows against these source branches. Preserve unverified labels and ambiguous row matches as explicit uncertainties.
