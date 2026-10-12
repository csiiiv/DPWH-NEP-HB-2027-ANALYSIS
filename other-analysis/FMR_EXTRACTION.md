# First HGAB FMR extraction

Built on **12 October 2026** from the supplied **HB 10858 FY 2027 Volume I-B**, PDF pages **667–726**, printed pages **651–710**. Here “HGAB” refers to that local House bill copy under `HB_BUDGET/`; its legislative stage has not been independently authenticated.

The extraction recovers **964 printed project line items** under **16 regional controls**, totalling **₱19,628,100,000**. Every regional project sum and the program root reconcile. The root and all 16 regions also agree with the independently read Volume I-A FMR capital-outlay and total columns.

The amount/title extraction is complete within this annex, with native cell and coverage checks passing. It remains a first source-based dataset: individual rendered-row review and geographic validation are incomplete. The subsequent [NEP coordinate review](NEP_FMR_COORDINATE_REVIEW_FLAGS.md) records targeted contextual correspondences; a complete NEP/HGAB project comparison has not been performed.

**Subsequent coordinate normalization:** [review-flag explanations, segment arrays, and normalization rules](FMR_COORDINATE_REVIEW_FLAGS.md). This separate derived layer handles the formats below, resolves 74 of the original 83 flagged projects, and supplies longitude/latitude arrays while preserving the initial extraction. Its remaining review queue has 14 projects, including five additional distance-screen findings.

## Outputs

| Artifact | Purpose |
|---|---|
| [Project CSV](data/hgab_fmr_projects.csv) | One row per printed project, integer PHP, printed region, title, raw coordinates, review flags, full path, and PDF/printed page references. This is the disjoint allocation ledger; sum only its `amount_php` column for the program total. |
| [Region CSV](data/hgab_fmr_regions.csv) | Regional project counts, printed controls, project sums, and differences. |
| [Source hierarchy](data/hgab_fmr_tree.json) | Flat nodes with `parent_id` and `child_ids`: printed FMR program → printed region → named project. Includes raw labels, coordinate observations, source geometry, and artifact-local IDs. |
| [Native source rows](data/hgab_fmr_source_rows.json) | All ruled rows, including headers and blank spacers; page-specific column/row boundaries, visual label/amount lines, bounding boxes, and word ownership indices. |
| [Machine audit](data/hgab_fmr_audit.json) | Direct and recursive controls, coverage results, independent I-A observations, repeated-title groups, source/code hashes, and evidence limits. |
| [Coordinate review CSV](data/hgab_fmr_coordinate_review.csv) | The 83 projects requiring coordinate interpretation or checks. These projects also remain in the full ledger. |
| [Extractor](extract_hgab_fmr.py) | A source-specific native-text and ruled-cell profile, with deterministic rebuild/check commands. |
| [Regression tests](tests/test_hgab_fmr.py) | Source-backed checks and deliberate corruptions that must fail validation. |

IDs such as `ib:p667:r5` mean **Volume I-B, PDF page 667, ruled table row 5**. Row numbers restart on each page and include the column-header and spacer rows. They are references inside this source artifact, not universal project IDs.

The JSON metadata records both source PDF hashes, the extractor hash, PyMuPDF version, fiscal year, scope, source units, and page ranges. The I-B SHA-256 is `a82800c4cc2684566a37f7780d8f9131d2e7b2c97444d335d94df012dec065b6`.

## Applying the budget-PDF method

The principles in [pdf_budget_dataset_method.md](../analysis/docs/pdf_budget_dataset_method.md) transfer; its DPWH page coordinates and indentation profiles do not. This annex needs its own geometry profile.

| Lesson from the method | Application to FMR |
|---|---|
| Establish source scope and units first | The root is the **DA locally-funded FMR annex**, with a printed ₱19.6281B control. It is not the entire DA appropriation. The table explicitly says **Amount in Pesos**; multiplication by 1,000 is unnecessary. FMR planning/monitoring and the farm-to-market bridges activity are outside this root. |
| Prefer the original digital layer when usable | Read the native I-B PDF words and vector table rules through PyMuPDF. The retained PaddleOCR Markdown/JSON is discovery material, not the extraction input. |
| Recover visual rows and columns before parenting | Detect the three vertical rules and full-width horizontal row rules on each page. Assign word centres to one ruled row and either the label or amount column. This handles wrapped titles and vertically centred amounts without guessing which text line owns the money. |
| Give each table family a geometry profile | The first page's table starts lower, while continuation pages start near the top. The amount divider shifts about **13.5 points** between page parities. Boundaries come from each page's vector rules rather than a global amount-x cutoff. |
| Keep numeric title content distinct from money | START/END coordinates, station limits, section numbers, and phase numbers stay in the label cell. Only the sole comma-grouped integer token in the amount cell becomes `printed_amount_php`. |
| Retain hierarchy at the printed grain | The annex prints a program control, regional controls, and named project rows. Municipality/province information stays in source titles; no unprinted province or operating-office tree is invented. |
| Make the hierarchy additive | Region/project relationships follow the printed heading order across pages. Projects enter the ledger once. Program and region controls do not enter that project ledger as additional allocations. |
| Validate accounting separately from source accuracy | Check immediate and recursive sums for every control, independently sum the flat project ledger, account for every source row/word, and compare the I-A controls. Individual image review and geographic interpretation remain separate statuses. |
| Retain repeated observations and repeated names | I-A regional-field-unit echoes are evidence attached to the relevant region, not extra money. Repeated project titles remain separate printed rows, with their own amounts, coordinates, and source IDs. |
| Preserve missing/unusual values and repair lineage | All coordinate text survives verbatim apart from ordinary word/line reconstruction. Uncertain formats become review flags; no decimal, endpoint order, region assignment, or amount is silently repaired. |

All labels and coordinates belonging to a project fit inside its ruled row in this annex. The profile therefore does not need DPWH-style title stitching between pages. Region ownership does continue across page boundaries.

## Regional reconciliation

| Printed region | Project rows | Printed control / project sum (PHP) | Difference (PHP) |
|---|---:|---:|---:|
| I – Ilocos | 96 | 1,590,000,000 | 0 |
| Cordillera Administrative Region | 22 | 1,565,000,000 | 0 |
| II – Cagayan Valley | 99 | 2,133,200,000 | 0 |
| III – Central Luzon | 173 | 3,418,800,000 | 0 |
| IVA – CALABARZON | 133 | 2,403,400,000 | 0 |
| IVB – MIMAROPA | 44 | 1,005,350,000 | 0 |
| V – Bicol | 77 | 1,391,200,000 | 0 |
| VI – Western Visayas | 50 | 1,042,750,000 | 0 |
| Negros Island Region | 35 | 665,000,000 | 0 |
| VII – Central Visayas | 19 | 315,000,000 | 0 |
| VIII – Eastern Visayas | 52 | 996,800,000 | 0 |
| IX – Zamboanga Peninsula | 32 | 580,000,000 | 0 |
| X – Northern Mindanao | 33 | 683,400,000 | 0 |
| XI – Davao | 20 | 475,000,000 | 0 |
| XII – SOCCSKSARGEN | 28 | 425,000,000 | 0 |
| XIII – Caraga | 51 | 938,200,000 | 0 |
| **Total** | **964** | **19,628,100,000** | **0** |

Validation accounts for **1,057 source table rows**: 964 projects, 16 regional controls, one program control, 60 repeated column headers, and 16 blank spacers. All **19,545 in-table words** are assigned exactly once, including those in excluded header/spacer rows. No unexplained comma-grouped amount tokens were found outside the tables on these 60 pages.

There are **17 internal controls**: the program and 16 regions. Both immediate-child and recursive-project sums pass for each. The flat project ledger independently reproduces the same root.

The independent Volume I-A checks read PDF pages **137–138**, printed **127–128**, within the FMR activity boundaries. They capture **17 program/region observations** and **16 Regional Field Unit echoes**, preserving the **CO and Total** columns separately. All 33 observations agree with the corresponding I-B controls. The I-A regional/office detail is contextual evidence; those offices are not asserted to be printed parents of the I-B project rows.

## Coordinates and repeated titles

**881 projects** have one START and one END observation that this conservative parser can express as decimal latitude/longitude candidates without review flags. This means syntactic interpretation and a broad Philippines orientation check passed; it does not certify that either point is correct or that it belongs to the named road.

**83 projects** require review. Flags overlap:

| Flag | Projects | Meaning |
|---|---:|---|
| `coordinate_format_needs_review` | 63 | Includes valid but unsupported DMS/multi-section formats, unusual punctuation, and malformed source values. |
| `out_of_range_or_reversed_decimal_pair` | 13 | Pair cannot be used as latitude, longitude in that order; original order is retained. |
| `endpoint_count_or_section_structure_needs_review` | 10 | More/fewer than one explicitly marked start and end, including section-specific endpoints. |
| `section_specific_endpoints` | 1 | Explicit parenthesized section markers are present. Other section styles remain in raw text under the broader format/structure flags. |
| `outside_philippines_orientation_bounds` | 2 | A syntactically valid pair falls outside latitude 4–22 / longitude 116–127. This is a review heuristic, not a geographic boundary certification. |
| `no_explicit_start_end_markers` | 3 | Station/latitude/longitude notation is preserved without inventing START/END roles. |
| `nonstandard_endpoint_marker` | 2 | Source uses `STAR:` or `STARTt:`. The interpretation is flagged and the literal marker is retained. |

Rendered spot checks of six project cells confirmed their titles, amounts, and coordinate text: `ib:p667:r5`, `ib:p678:r10`, `ib:p669:r17`, `ib:p703:r11`, `ib:p689:r18`, and `ib:p726:r15`. These cover an ordinary row, section-specific endpoints, a reversed pair, a malformed decimal, station notation, and the last annex row. In particular:

- `ib:p678:r10` has **₱39,000,000** and four endpoint observations for two sections. It remains **one project line item**.
- `ib:p669:r17` prints START **120.58051, 18.20349** and END **120.58199, 18.20462**. The parser flags the order rather than swapping it.
- `ib:p703:r11` prints END **12.528813, 123.691.92**. The malformed longitude is visible in the rendered source and remains unchanged.
- `ib:p689:r18` uses station limits and a LAT/LONG pair. It is retained without claiming two endpoints.

The audit also identifies **four repeated-title groups**, each with two printed rows. These are potential identity-review cases, not established duplicate allocations. No rows are removed or consolidated based on title equality.

The native layer contains overlapping/repeated text in the column heading, producing odd header text in extraction. That header is retained as source evidence and excluded from budget nodes. It does not enter project titles or amounts.

## Rebuild and checks

From the repository root, with PyMuPDF available:

```sh
python3 other-analysis/extract_hgab_fmr.py
python3 other-analysis/extract_hgab_fmr.py --check
python3 -m unittest discover -s other-analysis/tests -v
```

The default command rebuilds the six data artifacts. `--check` re-extracts from the PDFs and compares every generated file without writing. The build fails on unexpected table layouts, ambiguous/missing amount cells, unsupported printed-page mappings, arithmetic discrepancies, source-coverage errors, or failed cross-volume controls. Coordinate-review flags are retained findings and do not block a successful accounting build.

**Eleven regression tests pass.** They cover the live source, CSV ledger totals and multiline evidence, and deliberately introduce dropped projects, missing/double-owned words, offsetting regional amount errors, altered coordinates, a changed cross-volume CO value, and equal-amount projects swapped between regions. Those corruptions are rejected, including cases where the overall program total still balances.

This extractor is specific to the supplied I-B FMR annex and I-A controls. It should not be reused for NEP, HFEP, NIA, or another reading without inspecting those tables and establishing their own scope, page ranges, units, and geometry.
