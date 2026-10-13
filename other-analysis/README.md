# FMR, NIA, and HFEP analysis

**FMR branch workbench:** [routes, candidate matching, and local run guide](FMR_WORKBENCH.md).
The React app now uses both FMR hierarchies with six main tabs: Home, Highlights,
Compare stages, Analysis, House GAB, and DBM NEP. The supplied House copy's
legislative reading remains unauthenticated; project matches remain candidates.

**House FMR printed-total comparison:** [working copy versus named third-reading copy](FMR_HOUSE_PRINTED_TOTALS_COMPARISON.md).
Both print **₱19,628,100,000**; all 16 regional totals agree, both sets of agency
controls reconcile, and extracted text matches on all 60 FMR annex pages.

**NEP FY 2027 FMR extraction:** [method, results, and checks](NEP_FMR_EXTRACTION.md) · [704 project rows](data/nep_fmr_projects.csv) · [source hierarchy](data/nep_fmr_tree.json) · [machine audit](data/nep_fmr_audit.json). The supplied [NEP FMR PDF](../dbm-other-nep-line-data/FMR.pdf) yields **₱16,000,000,000** under 16 regions; all regional totals and the independent NEP Volume I controls reconcile.

**NEP FMR coordinate normalization:** [rendered review, corrections, and remaining flags](NEP_FMR_COORDINATE_REVIEW_FLAGS.md) · [coordinate arrays by segment](data/nep_fmr_coordinates_normalized.json) · [normalized project CSV](data/nep_fmr_projects_normalized.csv) · [segment CSV](data/nep_fmr_segments.csv) · [image-review audit](data/nep_fmr_coordinate_image_review_audit.json). All 23 initially flagged cells have been reviewed against the PDF: 15 projects are resolved, and 696 of 704 now normalize without remaining flags. Eight retain printed-source anomalies; seven repeat values found in HGAB. Original OCR strings and all allocations remain intact. The review records 19 contextual HGAB row correspondences. The workbench adds deterministic provisional pairings over all source rows; complete project identity certification has not been performed.

## HB 10858 source orientation and HGAB FMR extraction

Initial check: **12 October 2026**. Source: the local PDFs in [`HB_BUDGET/`](../HB_BUDGET/), whose covers identify HB 10858, General Appropriations Bill, FY 2027.

**Subsequent FMR extraction:** [method, results, and checks](FMR_EXTRACTION.md) · [964 project rows](data/hgab_fmr_projects.csv) · [source hierarchy](data/hgab_fmr_tree.json) · [machine audit](data/hgab_fmr_audit.json). The orientation notes below describe the initial check; the linked FMR work adds complete native annex extraction and regional/cross-volume reconciliation.

**FMR coordinate normalization:** [flag explanations and conversion rules](FMR_COORDINATE_REVIEW_FLAGS.md) · [coordinate arrays by segment](data/hgab_fmr_coordinates_normalized.json) · [normalized project CSV](data/hgab_fmr_projects_normalized.csv) · [segment longitude/latitude CSV](data/hgab_fmr_segments.csv). All 964 projects are retained; 950 normalize without remaining flags and 14 still need review. Flagged coordinates carry an additional [PSGC cross-validation](data/fmr_psgc_validation.json): candidate digit repairs are geocoded against PSA 2023 administrative boundaries, and 13 of 14 flagged projects' repairs land in the title municipality (manual-review queue: `ib:p723:r3` only).

**Per-document FMR final datasets:** one JSON release artifact per source document, rebuilt by `build_fmr_final_dataset.py` from the retained normalized layers — [House GAB](data/hgab_fmr_final_dataset.json) (964 projects, ₱19,628,100,000) and [DBM NEP](data/nep_fmr_final_dataset.json) (704 projects, ₱16,000,000,000). Each project entry carries title, amount, region, review flags and normalization rules, raw coordinate text, normalized coordinates by segment, source PDF/page/bbox lineage, the parsed title locality recorded verbatim, and **PSGC geocoding of every point** (PSA 2023, via the `dpwh_coor2psgc_geomapping` submodule) with a per-project location-agreement classification. In the House GAB stage, 510 of 964 projects have every point inside the title's stated locality and 44 show a province-level disagreement; the NEP stage shows 346 of 704 and 32. These are review screens, not verified locations; the two documents are never merged, and comparisons between them belong to a separate analysis pass.

**PSGC validation worklog:** [what was tried, issues, fixes, and pivots](FMR_PSGC_VALIDATION_WORKLOG.md) — the session record for the flagged-coordinate evidence layer and the per-document final datasets, including the reusable checklist and title-parsing heuristics.

**UI implementation reference:** [building a source-verification workbench](UI_IMPLEMENTATION_REFERENCE.md) — how the FMR pages reused the DPWH baseline: the carried-over components, the workspace-prefix routing pattern, the builder/payload data contract and its enforced invariants, the pure model layer, route-backed state, the tab skeleton, the close-review checklist, the verification loop, and a port checklist for the next annex (NIA/HFEP).

**All three detailed schedules are in Volume I-B.** NIA also has named projects in its main agency appropriation section. The locations below distinguish actual project/facility rows from program totals, special provisions, contents entries, and performance indicators.

This is a general source-location and table-layout check. It establishes where to start reading and extracting; it does not constitute a complete line-item dataset, a row-by-row amount audit, or a comparison with NEP, third-reading copies, or an enacted GAA.

## Where the line items are

All page references are **one-based**. “PDF page” means the physical page selected in a PDF viewer; “printed page” means the number on the document itself.

| Subject | Source section in Volume I-B | Printed pages | PDF pages | Detail pages |
|---|---|---:|---:|---:|
| Farm-to-Market Roads (FMR) | Department of Agriculture, locally-funded projects, FMR annex | **651–710** | **667–726** | 60 |
| Health Facilities Enhancement Program (HFEP) | Department of Health, FY 2027 HFEP annex | **857–873** | **877–893** | 17 |
| National Irrigation Administration (NIA) | FY 2027 Irrigation Program annex | **874–919** | **896–941** | 46 |
| NIA, additional named projects and budget context | L.5. NIA agency appropriation, under Budgetary Support to Government Corporations | **559–564** | **567–572** | 6, including shared pages |

Open [`2 - HB 10858 VOL IB.pdf`](../HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf). Its contents list the three annexes on **PDF page 7** and the NIA agency section on **PDF page 6**. These contents references use printed pagination.

The accompanying [`page_index.csv`](page_index.csv) lists each of the **123 annex detail pages** and the **6 NIA agency-section pages**, with its printed-page equivalent and any section starts identified during this check. It is a page index, not a project ledger. A section can begin midway down a page, after rows from the previous section.

### Divider and boundary checks

| Annex | Title/divider PDF page | Adjacent blank PDF page(s) | First detail PDF page | Last detail PDF page | Following section |
|---|---:|---:|---:|---:|---|
| FMR | 665 | 666 | 667 | 726 | Education divider 727; education details 729 |
| HFEP | 875 | 876 | 877 | 893 | Blank 894; NIA divider 895 |
| NIA | 895 | No blank between divider and first detail | 896 | 941 | Blank 942; SBDP divider 943 |

There is **no single Volume I-B page offset**. For these annexes, PDF page = printed page + **16** for FMR, + **20** for HFEP, and + **22** for NIA. For the NIA agency section it is + **8**. Do not extrapolate these offsets across the entire volume.

## FMR: project names, locations, coordinates, and amounts

The first table is headed **“Repair/Rehabilitation and Construction of Farm-to-Market Roads in Designated Key Production Areas”**, with a printed control of **₱19,628,100,000** (I-B printed 651 / PDF 667).

The table has two columns: **Name of Projects** and **Amount in Pesos**. Individual rows contain a road project description, barangay/municipality/province information, and START/END coordinates. Regional totals are interspersed with the projects. Amounts are already in pesos.

Examples on printed page **651 / PDF 667**:

| Named line item | Amount (PHP) |
|---|---:|
| Construction of Sitio Rango, Brgy. Tubburan FMR, Brgy. Tubburan, Bacarra, Ilocos Norte | 15,000,000 |
| Construction of San Lorenzo FMR, Brgy. San Lorenzo, Bangui, Ilocos Norte | 15,000,000 |
| Construction of Brgy. Escoda - Brgy. Elizabeth FMR, Brgy. Escoda and Brgy. Elizabeth, Marcos, Ilocos Norte | 30,000,000 |

The first example includes START **18.284622, 120.625421** and END **18.287494, 120.628232**. Coordinates should be retained as source text in a later extraction before normalization; this check does not validate every coordinate.

Regional entry points, in document order:

| Region heading | Printed start page | PDF start page |
|---|---:|---:|
| I – Ilocos | 651 | 667 |
| Cordillera Administrative Region (CAR) | 656 | 672 |
| II – Cagayan Valley | 658 | 674 |
| III – Central Luzon | 664 | 680 |
| IVA – CALABARZON | 674 | 690 |
| IVB – MIMAROPA | 683 | 699 |
| V – Bicol | 686 | 702 |
| VI – Western Visayas | 690 | 706 |
| Negros Island Region (NIR) | 693 | 709 |
| VII – Central Visayas | 696 | 712 |
| VIII – Eastern Visayas | 697 | 713 |
| IX – Zamboanga Peninsula | 700 | 716 |
| X – Northern Mindanao | 702 | 718 |
| XI – Davao | 704 | 720 |
| XII – SOCCSKSARGEN | 705 | 721 |
| XIII – Caraga | 707 | 723 |

The **16 regional controls sum to ₱19,628,100,000**. This is a control-level check only; the individual project rows have not been summed and reconciled.

Volume I-A provides supporting context: special provision 11 on printed **79 / PDF 89** explicitly directs readers to Volume I-B for FMR details, including coordinates. The project appropriation is also visible on printed **127 / PDF 137**. The FMR Network Planning and Monitoring Services allocation on printed **124 / PDF 134** is a separate budget activity and should not be treated as one of the annex road projects.

## HFEP: facility rows with three funding components

The annex is explicitly labelled **“FY 2027 Health Facilities Enhancement Program (HFEP)”**, **“Amount in Pesos.”** Its columns are:

1. Name of Projects and Facilities
2. Infrastructure
3. Medical Equipment
4. Motor Vehicle
5. Total

Line items are named facilities or facility projects under category, region, and local-area headings. A facility can have infrastructure funding, equipment funding, vehicle funding, or a combination. Categories and regional/local-area totals must be distinguished from individual facility rows.

Examples on printed **857 / PDF 877**:

| Facility line item | Infrastructure (PHP) | Medical equipment (PHP) | Total (PHP) |
|---|---:|---:|---:|
| Municipality of Conner Malama Brgy. Health Station (BHS) with Birthing Home | 5,000,000 | — | 5,000,000 |
| Poblacion Barangay Health Center, Sugbongcogon | 3,000,000 | 240,000 | 3,240,000 |
| Municipality of Malibcong, Buanao Barangay Health Station | — | 135,000 | 135,000 |

“—” represents a blank printed cell, not an independently asserted zero. These examples have blank motor-vehicle cells. The DOH Central Office row on printed **873 / PDF 893** has **₱130,700,000** in the motor-vehicle column and the same total.

Category entry points:

| Category | Printed start page | PDF start page |
|---|---:|---:|
| 1. Primary Care Facilities | 857 | 877 |
| 2. LGU Hospitals | 862 | 882 |
| 3. DOH Hospitals | 868 | 888 |
| 4. BUCAS | 870 | 890 |
| 5. Drug Abuse Treatment and Rehabilitation Centers | 870 | 890 |
| 6. Bureau of Quarantine | 871 | 891 |
| 7. Other Health Care Facilities | 872 | 892 |
| 8. State Universities | 873 | 893 |

The last page, printed **873 / PDF 893**, prints the grand total:

| Infrastructure (PHP) | Medical equipment (PHP) | Motor vehicle (PHP) | Total (PHP) |
|---:|---:|---:|---:|
| 5,990,046,000 | 3,900,913,000 | 130,700,000 | **10,021,659,000** |

The three component controls sum to the printed total. This does not verify every facility row.

Volume I-A special provision 5 on printed **1029 / PDF 1039** explicitly points to Volume I-B for HFEP details. Its allocation table on printed **1057 / PDF 1067** shows **₱10,088,832,000**, comprising **₱67,173,000 MOOE** and **₱10,021,659,000 capital outlays**. Thus the annex total matches the capital-outlay component, while the wider HFEP allocation includes MOOE. Do not label the annex total as the entire HFEP budget across expenditure classes.

## NIA: read both the agency section and the irrigation annex

### Main agency section: printed 559–564 / PDF 567–572

The **L.5. National Irrigation Administration** heading begins on printed **559 / PDF 567**, below the end of the Cultural Center of the Philippines section. Printed **560 / PDF 568** shows **₱45,172,024,000 total new appropriations** and the main budget controls and special provisions. The more detailed Programs/Activities/Projects table begins on printed **561 / PDF 569**.

This section contains actual named major projects as well as subsidy, support, and program rows. Named locally-funded projects start on printed **562 / PDF 570**, continue through **563 / PDF 571**, and end on **564 / PDF 572**, which also contains the foreign-assisted project. Examples:

| Named project | Amount (PHP) | Printed page | PDF page |
|---|---:|---:|---:|
| Tumauini River Multipurpose Project, Isabela | 1,000,000,000 | 562 | 570 |
| Panay River Basin Integrated Development Project, Iloilo & Capiz | 100,000,000 | 562 | 570 |
| Cabiao Water Impounding Project, Nueva Ecija | 500,000,000 | 563 | 571 |
| Pantingan Small Reservoir Irrigation Project (SRIP), Bataan | 500,000,000 | 564 | 572 |
| Jalaur River Multi Purpose Project, Stage II, Iloilo Korea EDCF Loan No. PHL-15 | 961,321,000 | 564 | 572 |

The last page also begins **L.6. Philippine Center for Economic Development**. Any later extraction must respect both shared-page boundaries. The Jalaur project total and its GOP Counterpart row are related observations, not two separate projects to add together.

### Detailed irrigation annex: printed 874–919 / PDF 896–941

The annex has two columns: **Programs / Activities / Projects** and **Amount**. Individual rows name irrigation systems and interventions such as service-road concreting, canal works, rehabilitation, and solar-powered pump installation. Titles can span multiple lines and include station limits. Regional/location information is often embedded in the title rather than provided as a separate column.

The six sub-program controls and entry points are:

| Sub-program | Printed start page | PDF start page | Control amount (PHP) |
|---|---:|---:|---:|
| National Irrigation System | 874 | 896 | 5,471,255,000 |
| Communal Irrigation System | 886 | 908 | 3,243,000,000 |
| Other Irrigation System | 896 | 918 | 460,000,000 |
| Establishment of Pump Irrigation | 897 | 919 | 8,466,950,000 |
| Special Irrigation | 917 | 939 | 158,100,000 |
| Extension/Expansion of Existing Irrigation System | 918 | 940 | 200,000,000 |

Examples of named annex rows:

| Named line item | Amount (PHP) | Printed page | PDF page |
|---|---:|---:|---:|
| Abra River Irrigation System: Construction of Service Road w/ Protection Works and Appurtenant Structures; Drainage Crossing | 3,000,000 | 874 | 896 |
| West Apayao Abulug Irrigation System: Concreting of Existing Service Road | 3,700,000 | 874 | 896 |
| Dicamay CIS: Rehabilitation of Dam and Construction of Slope Protection | 25,000,000 | 886 | 908 |
| Dilan Neighborhood SPIP: Establishment of Solar-Powered Pump Irrigation Project with AI Monitoring System | 10,000,000 | 897 | 919 |

These six annex controls sum to **₱17,999,305,000**. They match six sub-program amounts in the main agency table on printed **562 / PDF 570**. That main table separately includes another **Other Irrigation Systems Sub-program, ₱698,067,000**, which special provision 3 on printed **560 / PDF 568** associates with CARP. Adding that amount gives the agency's **₱18,697,372,000 operations** control. This is a useful scope check: the annex is not the whole **₱45,172,024,000** NIA appropriation. The agency's separately listed major locally-funded and foreign-assisted projects also need to be captured in a future complete NIA inventory.

The annex does not explicitly state an amount unit beside “Amount” on its opening page. Peso interpretation is supported by its six controls matching the agency table's peso amounts; its amounts should not be multiplied by 1,000. The agency's separate **Object of Expenditures** table on printed **564 / PDF 572** is explicitly **in thousand pesos**, so unit handling must be table-specific.

## Other volumes and source limits

| PDF in `HB_BUDGET/` | Physical pages | Result of this orientation check |
|---|---:|---|
| `1 - HB 10858 VOL IA.pdf` | 1,339 | DA/DOH appropriations and special provisions; directs readers to I-B for FMR/HFEP details. |
| `1 - HB 10858 VOL IA - Part 1 (pp 001-866).pdf` | 866 | Split I-A copy; the cited FMR PDF pages are in this part. |
| `1 - HB 10858 VOL IA - Part 2 (pp 867-1339).pdf` | 473 | Split I-A copy; full-volume HFEP PDF 1039 corresponds to part-2 PDF 173; full-volume PDF 1067 corresponds to part-2 PDF 201. |
| `2 - HB 10858 VOL IB.pdf` | 982 | Primary source for the three annexes and NIA agency details above. |
| `3 - HB 10858 VOL IC.pdf` | 942 | DPWH project-detail volume. No matches for the searched full FMR/NIA/HFEP names; no separately headed schedule for these three was identified. This is not a finding that every health-, agriculture-, or irrigation-related DPWH project is absent. |
| `4 - HB 10858 VOL II.pdf` | 610 | Performance information, including FMR on printed 10 / PDF 26, HFEP on printed 226 / PDF 242, and NIA on printed 386 / PDF 402. These are indicators/targets, not the requested appropriation line items. |

The Volume II text includes **“3RD READING”** production imprints even though this copy is in `HB_BUDGET/`. Folder placement alone does not establish a uniform legislative version. This check records the supplied local documents; it does not authenticate their versions or compare them against `HB_BUDGET_3rd_reading/`.

Method: searched the supplied OCR Markdown for likely locations, then searched the native PDF text across all six PDFs using PyMuPDF. Inspected the table contents, section transitions, and printed pagination in I-B; visually checked rendered first/last annex pages (PDF 667, 726, 877, 893, 896, and 941). All 129 printed-page mappings in the CSV were checked against numbers in the PDF header/footer areas. The page index comes from the PDFs rather than OCR Markdown line numbers. The sample titles retain source wording; line wrapping is collapsed for readability.

The Volume I-B PDF used here has SHA-256 `a82800c4cc2684566a37f7780d8f9131d2e7b2c97444d335d94df012dec065b6`.

For a later extraction, start with these bounded page ranges and retain source file, PDF page, printed page, parent headings, raw title, amount columns, and blank cells. Keep program/region/facility controls separate from named rows, join wrapped descriptions carefully, and check boundary pages before attempting project counts or additive reconciliation. No individual project/facility counts are asserted in this initial check.
