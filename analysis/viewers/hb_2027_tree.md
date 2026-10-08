# FY2027 DPWH House (HB 10858) rollup tree

The printed House total for DPWH new appropriations is **₱654,102,015,000**: GAS ₱18,078,293,000 + S2O ₱49,082,061,000 + Operations ₱586,941,661,000. The tree keeps every printed control separate from extraction. 16,148 v5 allocations (₱581,345,349,000) roll up under them, leaving the documented **net operations gap of ₱5,596,312,000**. It is a reconciliation gap, not an enumerated list of missing projects.

## What balances

Root, Operations, the local zone, FAP, and all six local program controls balance exactly against their children. 38 of 42 printed PAP controls balance. The only control mismatches are the four documented unresolved sections:

| Unresolved PAP control | Printed − extracted (₱) |
|---|---:|
| BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities | +2,241,795,000 |
| BIP - Coastal Roads to augment Resiliency of Coastal Communities | -1,456,800,000 |
| BIP - Multi-Purpose Buildings/ Facilities to support Social Services | +5,115,958,000 |
| Water Supply System | -304,641,000 |

All 29 FAP projects carry GOP/loan partitions that sum exactly to their project amounts (GOP ₱25,190,650,000 + Loan Proceeds ₱19,558,361,000 = ₱44,749,011,000).

## Construction and limits

Run `python analysis/builders/build_hb_tree.py` to rebuild from `hb_dpwh_leaves_corrected_v5.json`, printed controls (`hb_json_usability_audit.json`, `hb_known_defect_repairs.json`), and the canonical mapping (`current_pap_controls.json`). No hierarchy amount is invented. Grouping nodes without printed controls are marked **derived**; printed nodes keep extraction coverage (`coverage_difference_php`) visible at every level. 8 region fields that had absorbed office labels were split back, recorded in `hb_2027_tree_validation.json`.

Extraction balance is not completeness: 10,874 allocations inherit v4b amounts and PAP attribution, and balanced PAP controls do not certify every title, region, or regional subtotal. GAS/S2O detailed allocations are outside the v5 project table. Unmatched rows across sources remain review candidates, never confirmed insertions or removals.

## Artifacts

- [Interactive drilldown](hb_2027_tree.html): programs, PAPs, regions, offices, projects, and FAP funding partitions with page references.
- [Canonical tree](../data/hb_2027_tree.json): hierarchy, validation and coverage status, provenance.
- [Rollup checks, repairs, normalizations](../data/hb_2027_tree_validation.json).
- Regression tests: `python -m unittest discover -s analysis/tests -p 'test_hb_tree.py' -v`.

Next: resolve the four unresolved sections against the source PDF, then rematch House rows against the NEP source tree branches.
