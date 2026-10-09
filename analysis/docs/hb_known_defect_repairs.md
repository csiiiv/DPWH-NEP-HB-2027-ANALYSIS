# House known-defect repairs — v5

**Retired v5 report — 9 October 2026:** the figures below describe the historical OCR candidate. Current House controls use [Native I-B](../data/hb_dpwh_native_rollup.json); project titles and comparisons use [Native I-C](../data/hb_dpwh_native_ic_projects.json). The [I-C audit](hb_native_ic_rollup_checks.md) closes the four historical extraction gaps. v5 is retained for reproduction and is excluded from current webpage inputs and downloads.

Original v4b and historical artifacts are preserved. v5 is a repaired candidate, not a complete certified budget.

## Results

- old_rows: 15487
- new_rows: 16148
- old_php: 520651663000
- new_php: 581345349000
- delta_php: 60693686000
- zones_php: {'pap': 536596338000, 'fap': 44749011000}
- zones_rows: {'pap': 16119, 'fap': 29}
- missing_regions: 0
- operations_printed_php: 586941661000
- operations_net_shortfall_php: 5596312000
- replaced_sections: 15
- native_added_rows: 5274
- removed_old_rows: 4613
- balanced_pap_controls: 38
- local_programs_php: {'Network Development Program': 92435879000, 'Flood Management Program': 87187778000, 'Convergence and Special Support Program': 225785975000, 'Asset Preservation Program': 79720290000, 'Bridge Program': 37590473000, 'Local Program': 13875943000}
- blocked_source_sections: []

## Source-verified repairs

- Re-extract all three maintenance PAPs; native controls and family sum agree exactly. PDF pages [111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148]; 618 → 737 rows; ₱25.826541B → ₱36.094823B.
- Restore damaged-paved-road subtype boundaries from native headings; all three PAPs and their family balance. PDF pages [148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172]; 344 → 416 rows; ₱12.032810B → ₱28.084988B.
- Restore wrapped slope/landslide and drainage PAP headings using native page/amount anchors; all six PAPs balance. PDF pages [173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196]; 330 → 400 rows; ₱20.389192B → ₱15.540479B.
- Recover bypass-road projects from native rows; the complete section balances the printed control. PDF pages [213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233]; 279 → 374 rows; ₱29.421484B → ₱44.786384B.
- Recover missing-link/new-road projects from native rows; the section balances the printed control. PDF pages [233, 234, 235, 236, 237, 238, 239, 240, 241, 242]; 162 → 165 rows; ₱22.366099B → ₱22.661099B.
- Re-extract road-widening subtypes and remove misclassified region subtotals; each PAP balances. PDF pages [197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213]; 303 → 322 rows; ₱16.240942B → ₱18.113243B.
- Rebuild all five printed local Bridge PAPs; they sum exactly to the program control without adding parent buckets. PDF pages [257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295]; 805 → 836 rows; ₱32.604420B → ₱37.590473B.
- Rebuild all Off-Carriageway subtypes using printed source controls. PDF pages [243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255]; 174 → 172 rows; ₱5.758132B → ₱5.764132B.
- Recover flood-mitigation structures and drainage rows; exclude Nationwide/office containers and balance the native control. PDF pages [296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364]; 1246 → 1298 rows; ₱63.923824B → ₱70.964897B.
- Keep underlying paving projects once; exclude family/PAP subtotals. PDF pages [255, 256]; 21 → 17 rows; ₱1.788063B → ₱0.596021B.
- Restore 217 terminal rainwater allocations and correctly attribute Septage. PDF pages [401, 402, 403, 404, 405, 406, 407, 408, 409]; 18 → 218 rows; ₱0.364400B → ₱1.127200B.
- Replace regional-facility rollups with all 51 printed regional allocations. PDF pages [410, 411, 412]; 2 → 51 rows; ₱0.425000B → ₱0.510000B.
- Rebuild Local Ports allocations from their complete printed section; exclude the PAP subtotal. PDF pages [924, 925, 926]; 27 → 29 rows; ₱1.378000B → ₱0.700000B.
- Local projects are not FAP: drop repeated PPP controls, retain the one printed allocation and all building projects. PDF pages [927, 928, 929, 930, 931, 932, 933, 934, 935, 936, 937, 938, 939]; 215 → 210 rows; ₱16.902443B → ₱13.875943B.
- Rebuild the true FAP section: 29 projects, control and every funding split balanced. PDF pages [939, 940, 941, 942]; 19 → 29 rows; ₱31.043657B → ₱44.749011B.

## PAP control crosscheck

| PAP | Printed ₱B | v5 ₱B | v5 − printed ₱B |
|---|---:|---:|---:|
| BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities | 134.927811 | 132.686016 | -2.241795 |
| BIP - Multi-Purpose Buildings/ Facilities to support Social Services | 83.706551 | 78.590593 | -5.115958 |
| Construction/ Maintenance of Flood Mitigation Structures and Drainage Systems | 70.964897 | 70.964897 | +0.000000 |
| Construction of By-Pass and Diversion Roads | 44.786384 | 44.786384 | +0.000000 |
| Construction of Missing Links/ New Roads | 22.661099 | 22.661099 | +0.000000 |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Primary Roads | 18.611152 | 18.611152 | +0.000000 |
| Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers | 16.222881 | 16.222881 | +0.000000 |
| Preventive Maintenance - Secondary Roads | 14.433303 | 14.433303 | +0.000000 |
| Preventive Maintenance - Primary Roads | 14.395583 | 14.395583 | +0.000000 |
| Widening of Permanent Bridges | 13.493005 | 13.493005 | +0.000000 |
| Buildings And Other Structures | 12.875943 | 12.875943 | +0.000000 |
| Replacement of Permanent Weak Bridges | 11.690636 | 11.690636 | +0.000000 |
| Road Widening - Secondary Roads | 10.900467 | 10.900467 | +0.000000 |
| Water Supply System | 7.740725 | 8.045366 | +0.304641 |
| Preventive Maintenance - Tertiary Roads | 7.265937 | 7.265937 | +0.000000 |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Secondary Roads | 6.587927 | 6.587927 | +0.000000 |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Secondary Roads | 5.736126 | 5.736126 | +0.000000 |
| Construction of New Bridges | 5.719293 | 5.719293 | +0.000000 |
| Road Widening - Primary Roads | 4.836582 | 4.836582 | +0.000000 |
| Rehabilitation/ Major Repair of Permanent Bridges | 3.845294 | 3.845294 | +0.000000 |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Tertiary Roads | 3.575480 | 3.575480 | +0.000000 |
| Off-Carriageway Improvement - Secondary Roads | 3.030074 | 3.030074 | +0.000000 |
| Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Tertiary Roads | 2.885909 | 2.885909 | +0.000000 |
| Retrofitting/ Strengthening of Permanent Bridges | 2.842245 | 2.842245 | +0.000000 |
| Road Widening - Tertiary Roads | 2.376194 | 2.376194 | +0.000000 |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Secondary Roads | 2.226501 | 2.226501 | +0.000000 |
| BIP - Coastal Roads to augment Resiliency of Coastal Communities | 1.670000 | 3.126800 | +1.456800 |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Primary Roads | 1.668650 | 1.668650 | +0.000000 |
| Off-Carriageway Improvement - Primary Roads | 1.656179 | 1.656179 | +0.000000 |
| Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Primary Roads | 1.604318 | 1.604318 | +0.000000 |
| Off-Carriageway Improvement - Tertiary Roads | 1.077879 | 1.077879 | +0.000000 |
| Rainwater Collector System | 1.027200 | 1.027200 | +0.000000 |
| Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Tertiary Roads | 0.729404 | 0.729404 | +0.000000 |
| BIP - Local Ports and Boat Landings | 0.700000 | 0.700000 | +0.000000 |
| Paving of Unpaved Roads - Tertiary Roads | 0.569029 | 0.569029 | +0.000000 |
| Construction of Flyovers/ Interchanges/ Underpasses/ Long Span Bridges | 0.515000 | 0.515000 | +0.000000 |
| Facilities for Elderlies/ Senior Citizen | 0.340000 | 0.340000 | +0.000000 |
| Septage and Sewerage | 0.100000 | 0.100000 | +0.000000 |
| Facilities for Persons with Disabilities (PWD) | 0.085000 | 0.085000 | +0.000000 |
| Gender-Responsive Facilities | 0.085000 | 0.085000 | +0.000000 |
| Paving of Unpaved Roads - Secondary Roads | 0.021992 | 0.021992 | +0.000000 |
| Paving of Unpaved Roads - Primary Roads | 0.005000 | 0.005000 | +0.000000 |

## Historical v5 limitations

- The overall operations residual is explicitly retained; no invented balancing projects were added.
- Unrepaired PAP boundary attribution, missing project rows, and possible subtotal contamination still require source-section reconstruction.
- Earlier API matching and historical dashboards remain version-specific. Use this source-control crosscheck to assess v5; no earlier matcher claims were relabeled as verified.
- The prior House grand upper-bound claim is invalid. Volume I-B prints ₱654.102015B, comprising ₱586.941661B operations and ₱67.160354B GAS/S2O across expense classes.
