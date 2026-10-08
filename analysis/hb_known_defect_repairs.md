# House known-defect repairs — v5

Original v4b and historical artifacts are preserved. v5 is a repaired candidate, not a complete certified budget.

## Results

- old_rows: 15487
- new_rows: 15791
- old_php: 520651663000
- new_php: 540427274000
- delta_php: 19775611000
- zones_php: {'pap': 495678263000, 'fap': 44749011000}
- zones_rows: {'pap': 15762, 'fap': 29}
- missing_regions: 0
- operations_printed_php: 586941661000
- operations_net_shortfall_php: 46514387000
- replaced_sections: 6
- native_added_rows: 1262
- removed_old_rows: 958
- balanced_pap_controls: 16

## Source-verified repairs

- Re-extract all three maintenance PAPs; native controls and family sum agree exactly. PDF pages [111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148]; 618 → 737 rows; ₱25.826541B → ₱36.094823B.
- Keep underlying paving projects once; exclude family/PAP subtotals. PDF pages [255, 256]; 21 → 17 rows; ₱1.788063B → ₱0.596021B.
- Restore 217 terminal rainwater allocations and correctly attribute Septage. PDF pages [401, 402, 403, 404, 405, 406, 407, 408, 409]; 18 → 218 rows; ₱0.364400B → ₱1.127200B.
- Replace regional-facility rollups with all 51 printed regional allocations. PDF pages [410, 411, 412]; 2 → 51 rows; ₱0.425000B → ₱0.510000B.
- Local projects are not FAP: drop repeated PPP controls, retain the one printed allocation and all building projects. PDF pages [927, 928, 929, 930, 931, 932, 933, 934, 935, 936, 937, 938, 939]; 215 → 210 rows; ₱16.902443B → ₱13.875943B.
- Rebuild the true FAP section: 29 projects, control and every funding split balanced. PDF pages [939, 940, 941, 942]; 19 → 29 rows; ₱31.043657B → ₱44.749011B.

## PAP control crosscheck

| PAP | Printed ₱B | v5 ₱B | v5 − printed ₱B |
|---|---:|---:|---:|
| BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities | 134.927811 | 132.686016 | -2.241795 |
| BIP - Multi-Purpose Buildings/ Facilities to support Social Services | 83.706551 | 78.585593 | -5.120958 |
| Construction/ Maintenance of Flood Mitigation Structures and Drainage Systems | 70.964897 | 64.053040 | -6.911857 |
| Construction of By-Pass and Diversion Roads | 44.786384 | 29.421484 | -15.364900 |
| Construction of Missing Links/ New Roads | 22.661099 | 22.366099 | -0.295000 |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Primary Roads | 18.611152 | 4.207570 | -14.403582 |
| Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers | 16.222881 | 16.371025 | +0.148144 |
| Preventive Maintenance - Secondary Roads | 14.433303 | 14.433303 | +0.000000 |
| Preventive Maintenance - Primary Roads | 14.395583 | 14.395583 | +0.000000 |
| Widening of Permanent Bridges | 13.493005 | 15.557270 | +2.064265 |
| Buildings And Other Structures | 12.875943 | 12.875943 | +0.000000 |
| Replacement of Permanent Weak Bridges | 11.690636 | 0.000000 | -11.690636 |
| Road Widening - Secondary Roads | 10.900467 | 10.936599 | +0.036132 |
| Water Supply System | 7.740725 | 8.045366 | +0.304641 |
| Preventive Maintenance - Tertiary Roads | 7.265937 | 7.265937 | +0.000000 |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Secondary Roads | 6.587927 | 4.939331 | -1.648596 |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Secondary Roads | 5.736126 | 15.032909 | +9.296783 |
| Construction of New Bridges | 5.719293 | 0.000000 | -5.719293 |
| Road Widening - Primary Roads | 4.836582 | 2.800866 | -2.035716 |
| Rehabilitation/ Major Repair of Permanent Bridges | 3.845294 | 3.844294 | -0.001000 |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Tertiary Roads | 3.575480 | 1.649867 | -1.925613 |
| Off-Carriageway Improvement - Secondary Roads | 3.030074 | 3.569460 | +0.539386 |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Tertiary Roads | 2.885909 | 2.885909 | +0.000000 |
| Retrofitting/ Strengthening of Permanent Bridges | 2.842245 | 2.842245 | +0.000000 |
| Road Widening - Tertiary Roads | 2.376194 | 2.376194 | +0.000000 |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Secondary Roads | 2.226501 | 2.955575 | +0.729074 |
| BIP - Coastal Roads to augment Resiliency of Coastal Communities | 1.670000 | 3.126800 | +1.456800 |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Primary Roads | 1.668650 | 0.000000 | -1.668650 |
| Off-Carriageway Improvement - Primary Roads | 1.656179 | 2.188672 | +0.532493 |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Primary Roads | 1.604318 | 0.731728 | -0.872590 |
| Off-Carriageway Improvement - Tertiary Roads | 1.077879 | 0.000000 | -1.077879 |
| Rainwater Collector System | 1.027200 | 1.027200 | +0.000000 |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Tertiary Roads | 0.729404 | 0.000000 | -0.729404 |
| BIP - Local Ports and Boat Landings | 0.700000 | 0.683000 | -0.017000 |
| Paving of Unpaved Roads - Tertiary Roads | 0.569029 | 0.569029 | +0.000000 |
| Construction of Flyovers/ Interchanges/ Underpasses/ Long Span Bridges | 0.515000 | 0.515000 | +0.000000 |
| Facilities for Elderlies/ Senior Citizen | 0.340000 | 0.340000 | +0.000000 |
| Septage and Sewerage | 0.100000 | 0.100000 | +0.000000 |
| Facilities for Persons with Disabilities (PWD) | 0.085000 | 0.085000 | +0.000000 |
| Gender-Responsive Facilities | 0.085000 | 0.085000 | +0.000000 |
| Paving of Unpaved Roads - Secondary Roads | 0.021992 | 0.021992 | +0.000000 |
| Paving of Unpaved Roads - Primary Roads | 0.005000 | 0.005000 | +0.000000 |

## Remaining work

- The overall operations residual is explicitly retained; no invented balancing projects were added.
- Unrepaired PAP boundary attribution, missing project rows, and possible subtotal contamination still require source-section reconstruction.
- Earlier API matching and historical dashboards remain version-specific. Use this source-control crosscheck to assess v5; no earlier matcher claims were relabeled as verified.
- The prior House grand upper-bound claim is invalid. Volume I-B prints ₱654.102015B, comprising ₱586.941661B operations and ₱67.160354B GAS/S2O across expense classes.
