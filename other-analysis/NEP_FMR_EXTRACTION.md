# NEP FY 2027 FMR extraction

Built on **12 October 2026** from the supplied [`FMR.pdf`](../dbm-other-nep-line-data/FMR.pdf), PDF pages **1–47**, printed pages **1511–1557**. This is the NEP executive proposal for FY 2027. Its matching annex is in the local [`NEP-2027-VOLUME-1_OCR.pdf`](../dbm-nep-data/NEP-2027-VOLUME-1_OCR.pdf), PDF pages **1535–1581**.

The extraction recovers **704 printed project line items** under **16 regional controls**, totalling **₱16,000,000,000**. All 17 internal controls reconcile, including immediate-child and recursive-project sums. Independently read Volume I agency controls on PDF **169–170**, printed **145–146**, agree with the root and all regions in both the capital-outlay and total columns. The 16 Regional Field Unit echoes also agree and remain contextual evidence, rather than additional allocations.

This follows the [HGAB FMR workflow](FMR_EXTRACTION.md), with a separate NEP source profile. It includes the allocation ledger, source hierarchy, raw row evidence, machine audit, and [derived coordinate normalization](NEP_FMR_COORDINATE_REVIEW_FLAGS.md). All 23 initially flagged coordinate cells have subsequently received rendered review: 15 projects are resolved, leaving eight printed-source anomalies. Review of the other OCR cells and geographic validation remain incomplete. The coordinate review records 19 contextual HGAB row correspondences; complete cross-document project matching has not been performed.

## Outputs

| Artifact | Purpose |
|---|---|
| [Project CSV](data/nep_fmr_projects.csv) | One row per printed project, integer PHP, printed region, title, raw coordinates, review flags, hierarchy path, and PDF/printed page references. Sum `amount_php` here for the allocation total. |
| [Region CSV](data/nep_fmr_regions.csv) | Project counts, printed controls, project sums, and differences for all 16 regions. |
| [Source hierarchy](data/nep_fmr_tree.json) | Flat nodes with `parent_id` and `child_ids`: printed program → printed region → printed project. Includes source cell geometry and OCR amount interpretation lineage. |
| [Source rows](data/nep_fmr_source_rows.json) | All 769 rows, including headings; raw OCR lines, word indices, raster table boundaries, outside-table words, and full-volume pagination evidence. |
| [Machine audit](data/nep_fmr_audit.json) | Arithmetic, source ownership, full page-word coverage, agency control observations, amount interpretations, repeated-title groups, and source/code hashes. |
| [Initial coordinate review](data/nep_fmr_coordinate_review.csv) | The 52 projects flagged by the conservative extraction parser, before normalization. |
| [Normalized coordinates](data/nep_fmr_coordinates_normalized.json) | All 704 projects, with longitude/latitude arrays grouped by segment, parsed points, conversion rules, and remaining flags. |
| [Normalized project CSV](data/nep_fmr_projects_normalized.csv) | Same allocation ledger with normalized endpoint columns and segment arrays in `coordinates_json`. |
| [Segment CSV](data/nep_fmr_segments.csv) / [Point CSV](data/nep_fmr_points.csv) | 722 segment rows and 1,444 point observations. Amounts are not repeated at these finer grains. |
| [Normalization audit](data/nep_fmr_coordinate_normalization_audit.json) / [remaining issues](data/nep_fmr_coordinate_issues.csv) | Conversion counts, coverage checks, and the eight-project source-anomaly queue. |
| [Authored image reviews](nep_fmr_coordinate_reviews.json) / [image-review audit](data/nep_fmr_coordinate_image_review_audit.json) | All 23 reviewed cells, exact OCR edits, source-cell images and hashes, contextual HGAB references, and before/after results. |
| [Extractor](extract_nep_fmr.py) / [normalizer](normalize_nep_fmr_coordinates.py) / [tests](tests/test_nep_fmr.py) | Reproducible, source-specific NEP workflow and regression checks. |

IDs such as `nep_fmr:p1:r5` mean standalone **FMR PDF page 1, table row 5**. Row numbering includes the opening annex heading and column headers, and restarts on each page. These are artifact-local source references, not identities shared with HGAB.

The source SHA-256 is `07355c115f45a84771b8a8ac22711992ea695ea28f0c9c1b2c71879d4a6dc4ba`. Metadata also records the full-volume hash, extractor/normalizer hashes, library versions, source units, and page ranges.

## NEP geometry and OCR handling

The standalone PDF has scanned ruled tables and an existing OCR text layer. Its table rules are raster content, so HGAB's vector-rule detector does not apply. The NEP extractor renders each page in grayscale at **144 dpi**, thresholds the ink, and uses OpenCV morphology to recover long horizontal and vertical rules. A small dilation allows minor scan skew. Boundaries are converted back to PDF points; OCR word centres determine cell and column ownership.

The amount divider shifts with page parity. The first page additionally contains a ruled annex heading above the column header. Both are recovered from each page rather than using fixed text-line spacing or one global column cutoff. Wrapped titles, coordinates, numbered sections, and phase numbers remain in their label cells. Amounts are already **pesos**, so the unit multiplier is **1**.

Every project's description fits within its own row. Region ownership follows the printed heading order across pages. The project ledger excludes the program, region, and office controls from allocation sums. Repeated titles remain separate printed rows: one repeated-title group contains `nep_fmr:p17:r10` and `nep_fmr:p17:r12`.

Four amount cells have non-numeric OCR decorations. Rendered checks confirmed the following readings, with no digit replacement:

| Source row | Raw OCR amount | Interpreted PHP |
|---|---|---:|
| `nep_fmr:p19:r12` | `11,000,000}` | 11,000,000 |
| `nep_fmr:p20:r5` | `15,125,000(` | 15,125,000 |
| `nep_fmr:p26:r8` | `15,000,000(` | 15,000,000 |
| `nep_fmr:p40:r14` | `10,000,000\|` | 10,000,000 |

Each raw token remains in `amount_raw`; `amount_interpretation` records the exact raw/interpreted values and rendered-cell evidence. The profile rejects a changed raw token instead of applying a general punctuation-removal rule. Agency-table OCR amounts sometimes split comma-grouped numbers with whitespace; their raw strings and token boxes are also retained.

**Page 28 has an open final row.** Its last project, `nep_fmr:p28:r16`, is Construction of Sitio Cuta to Sitio Lucbanan, with **₱45,000,000**. The horizontal bottom rule is absent in the rendered page; the extractor uses the common lower extent of the three vertical rules and records `vertical_rule_extent_open_bottom_image_reviewed` as the boundary basis. The amount and all endpoint text are present. This boundary treatment recovers the printed row without inventing an allocation or coordinate.

The standalone OCR omits most printed page numbers. The extractor verifies all 47 printed-page mappings against the full-volume running page numbers and records the supporting token boxes. All page references are **one-based**: standalone PDF page = printed page − **1510**, and full-volume PDF page = printed page + **24**, within this annex only.

## Regional reconciliation

| Printed region | Projects | Printed control / project sum (PHP) | Difference (PHP) |
|---|---:|---:|---:|
| I – Ilocos | 90 | 1,630,000,000 | 0 |
| Cordillera Administrative Region | 21 | 1,540,000,000 | 0 |
| II – Cagayan Valley | 77 | 1,865,000,000 | 0 |
| III – Central Luzon | 131 | 3,025,000,000 | 0 |
| IVA – CALABARZON | 79 | 1,627,000,000 | 0 |
| IVB – MIMAROPA | 34 | 795,000,000 | 0 |
| V – Bicol | 51 | 915,000,000 | 0 |
| VI – Western Visayas | 28 | 500,000,000 | 0 |
| Negros Island Region | 24 | 460,000,000 | 0 |
| VII – Central Visayas | 14 | 225,000,000 | 0 |
| VIII – Eastern Visayas | 28 | 535,000,000 | 0 |
| IX – Zamboanga Peninsula | 26 | 445,000,000 | 0 |
| X – Northern Mindanao | 21 | 455,000,000 | 0 |
| XI – Davao | 14 | 535,000,000 | 0 |
| XII – SOCCSKSARGEN | 16 | 240,000,000 | 0 |
| XIII – Caraga | 50 | 1,208,000,000 | 0 |
| **Total** | **704** | **16,000,000,000** | **0** |

Coverage accounts for **769 table rows**: 704 projects, 16 regions, one program control, 47 column headers, and one opening annex heading. All **14,155 in-table OCR words** have exactly one owner. Outside-table OCR words are retained separately, and there are no unexplained amount tokens outside the recovered tables. All 33 independent agency/office observations pass.

Extraction spot checks covered pages **1, 19, 20, 26, 28, 40, and 47**, including the first/last pages, decorated amount cells, and open final row. The subsequent coordinate review inspected all 23 initially flagged cells at 216 dpi and retained their images. Sixteen cells have supported OCR edits; 15 projects become normalized and one gains correct section pairing while retaining printed latitude anomalies. Passing arithmetic and coverage checks does not establish that every other OCR title or coordinate matches the image. The extraction's source rows and coordinate strings remain unchanged; reviewed readings live in the derived normalization outputs.

## Rebuild and checks

From the repository root, with **PyMuPDF, NumPy, and OpenCV** installed:

```sh
python3 other-analysis/extract_nep_fmr.py
python3 other-analysis/normalize_nep_fmr_coordinates.py
python3 other-analysis/extract_nep_fmr.py --check
python3 other-analysis/normalize_nep_fmr_coordinates.py --check
python3 other-analysis/normalize_nep_fmr_coordinates.py --render-review-images --check
python3 -m unittest discover -s other-analysis/tests -v
```

The extraction writes six artifacts; normalization writes seven more, including the image-review audit. `--check` reconstructs the outputs and compares them without writing. `--render-review-images` can rebuild the 23 retained cell images; combined with `--check`, it verifies their reproducibility. Extraction fails on changed table layouts, missing/ambiguous amounts, changed reviewed OCR tokens, unsupported pagination, accounting differences, coverage errors, or agency-control disagreements. Normalization also rejects stale review transcriptions, source/image hashes, or HGAB contextual evidence. Coordinate flags remain review findings and do not block the accounting build.

All **39 tests** pass, including **15 NEP regressions**. NEP tests check the live source, open-bottom row, OCR interpretation lineage, coordinate/ledger preservation, reviewed DMS/decimal/section readings, original/interpreted fragment offsets, and reproducible image evidence. Deliberate corruptions include dropped rows/words, offsetting regional errors, equal-amount parent swaps, altered coordinates/page mappings, changed CO values, duplicate agency-control ownership, and stale review transcriptions/images/contextual references.
