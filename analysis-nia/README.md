# NIA FY 2027 irrigation analysis

Built on **12 October 2026** from the supplied **HB 10858 FY 2027 Volume I-B** irrigation annex, PDF pages **896–941**, printed pages **874–919**. Here "HGAB" refers to that local House bill copy under `HB_BUDGET/`; its legislative stage has not been independently authenticated. This directory follows the extraction method established in [`other-analysis/`](../other-analysis/README.md) and [analysis/](../analysis/README.md).

**Engineering worklog:** [issues encountered during extraction and how each was resolved](HGAB_NIA_EXTRACTION_WORKLOG.md).

**Interactive workbench:** [NIA routes, comparison rules, evidence, and checks](NIA_WORKBENCH.md).
Open `#nia/home` in the shared React app to explore both retained schedules.

The extraction recovers **828 printed project line items** under **six sub-program controls** and one printed program heading, totalling **₱17,999,305,000**. Every sub-program project sum reconciles. All six sub-program amounts and both program-level totals also agree with the independently read NIA agency table on Volume I-B printed 559–564 (PDF 567–572), including the agency-only CARP-linked row of **₱698,067,000** that the annex does not print.

## Outputs

| Artifact | Purpose |
|---|---|
| [Project CSV](data/hgab_nia_projects.csv) | One row per printed project, integer PHP, printed sub-program, joined title, full path, and PDF/printed page references. This is the disjoint allocation ledger; sum only its `amount_php` column for the annex total. |
| [Sub-program CSV](data/hgab_nia_subprograms.csv) | Project counts, printed controls, project sums, and differences per sub-program. |
| [Source hierarchy](data/hgab_nia_tree.json) | Flat nodes with `parent_id` and `child_ids`: annex title → (sub-program ∣ Development heading → sub-program) → named project. Includes raw labels, source geometry, and artifact-local IDs. |
| [Native source rows](data/hgab_nia_source_rows.json) | Every layout row with title/continuation lines, amount token bboxes, bold status, per-page content/furniture word ownership indices. |
| [Machine audit](data/hgab_nia_audit.json) | Sub-program rollups, agency control comparisons, repeated-title groups, numeric title tokens, source/code hashes, and evidence limits. |
| [Evidence crops](data/evidence_crops/) | Rendered pages for the annex first page, Development heading page, last page, and agency PAP controls. |
| [Extractor](extract_hgab_nia.py) | A source-specific native-layout profile, with deterministic rebuild/check commands. |
| [Regression tests](tests/test_hgab_nia.py) | Source-backed checks and deliberate corruptions that must fail validation. |

IDs such as `ib:p896:r2` mean **Volume I-B, PDF page 896, layout row 2** (rows numbered within each page in document order, excluding furniture). `ib:p919:h1` is the printed program heading. They are references inside this source artifact, not universal project IDs.

The JSON metadata records the source PDF hash, extractor hash, PyMuPDF version, fiscal year, scope, source units, and page ranges. The I-B SHA-256 is `a82800c4cc2684566a37f7780d8f9131d2e7b2c97444d335d94df012dec065b6` — the same file already pinned by the FMR extraction.

## Annex structure

Unlike the FMR annex, the NIA annex prints **no ruled grid**. Rows are recovered from the native text layer by three layout signals:

1. **Indent**: sub-program controls start at x≈50.4/63.9 (mirrored odd/even pages); projects at x≈114.3/127.8.
2. **Bold font**: control rows and their amounts are Tahoma-Bold; project rows are Tahoma regular.
3. **Right-aligned amount column**: the single comma-grouped integer token at x≥523 is the row amount; the label cell ends by x≈502.

Amounts sit on the **first title line**; subsequent lines are continuations of the same row. Wrapped titles never break across page boundaries — every page after the first opens with a complete row start. The first page carries the annex title furniture above the table.

The printed hierarchy is:

```text
FY 2027 IRRIGATION PROGRAM (annex title)
├─ National Irrigation System Sub-Program           5,471,255,000   217 projects
├─ Communal Irrigation System Sub-Program           3,243,000,000   215 projects
├─ Other Irrigation System Sub-Program                460,000,000     5 projects
└─ IRRIGATION SYSTEMS DEVELOPMENT PROGRAM (printed heading on PDF 919)
   ├─ Establishment of Pump Irrigation Sub-Program  8,466,950,000   354 projects
   ├─ Special Irrigation Sub-Program                  158,100,000    26 projects
   └─ Extension/Expansion of Existing Irrigation
      System Sub-Program                              200,000,000    11 projects
                                                  ───────────────
                                    Annex total    17,999,305,000    828 projects
```

The annex itself never prints a "Restoration" heading over the first three sub-programs; that grouping exists only in the agency table.

## Agency-table reconciliation

The NIA agency section (L.5., Budgetary Support to Government Corporations, printed 559–564 / PDF 567–572) independently prints the same sub-programs within its New Appropriations PAP table (PDF 570) plus the agency total (PDF 568). The audit reads the MOOE and Total columns separately for 11 control rows:

| Agency-table row | Agency amount (PHP) | Annex sum (PHP) | Difference |
|---|---:|---:|---:|
| IRRIGATION SYSTEMS RESTORATION PROGRAM | 9,174,255,000 | 9,174,255,000 (3 sub-programs) | 0 |
| National Irrigation System Sub-program | 5,471,255,000 | 5,471,255,000 | 0 |
| Communal Irrigation System Sub-program | 3,243,000,000 | 3,243,000,000 | 0 |
| Other Irrigation Systems Sub-program | 460,000,000 | 460,000,000 | 0 |
| IRRIGATION SYSTEMS DEVELOPMENT PROGRAM | 9,523,117,000 | 8,825,050,000 (3 sub-programs) + 698,067,000 agency-only | 0 |
| Establishment of Pump Irrigation Sub-Program | 8,466,950,000 | 8,466,950,000 | 0 |
| Special Irrigation Sub-program | 158,100,000 | 158,100,000 | 0 |
| Extension/Expansion of Existing Irrigation System Sub-program | 200,000,000 | 200,000,000 | 0 |
| Other Irrigation Systems Sub-program (agency-only, CARP-linked) | 698,067,000 | not printed in annex | — |
| Sub-total, Operations | 18,697,372,000 | annex total + 698,067,000 | 0 |
| TOTAL NEW APPROPRIATIONS | 45,172,024,000 | scope context only | — |

Key scope notes:

- The **annex is not the whole NIA appropriation** (₱45,172,024,000). It is the detailed Irrigation Program schedule, whose six sub-programs correspond to the agency table's Operations rows excluding the agency-only CARP row.
- The agency table prints **"Other Irrigation SystemS Sub-program"** (plural) where the annex prints **"Other Irrigation System Sub-Program"** (singular). The audit maps them explicitly; both agency rows carrying the plural label are matched by amount (₱460,000,000 annex control; ₱698,067,000 agency-only CARP row).
- Special provision 3 on printed 560 / PDF 568 links the agency-only Other Irrigation Systems Sub-program to **CARP** (Comprehensive Agrarian Reform Program).
- The agency's separately listed **major locally-funded and foreign-assisted projects** (Tumauini ₱1.0B, Panay River Basin ₱100M, Cabiao ₱500M, Pantingan SRIP ₱500M, Jalaur Stage II ₱961.3M, etc.) are **not** part of this annex and remain future extraction scope.

## Title content that is not money

Two project titles contain comma-grouped numbers inside the label cell ("1,000 hectares" on PDF 906; "1,210 meters" on PDF 915). The layout profile keeps them in the title by column position, records them as `title_numeric_tokens` in the audit, and they never enter any amount column.

## Repeated titles

Four repeated-title groups (two printed rows each) are retained as separate rows: TASMORIS (O'donnell Side) lateral works, Balingasag RIS slope protection, and two SPIP pairs (San Juan, Bakod Bayan). These are potential identity-review cases, not established duplicate allocations. No rows are removed or consolidated based on title equality.

## What this is not

- Not a complete NIA inventory: the agency section's named major projects, subsidy rows, and object-of-expenditures table (in thousands) are outside scope.
- Not geospatial: unlike FMR, the NIA annex prints no coordinates.
- Not row-by-row image-reviewed: every row is a native-layout match with word-level ownership, but no individual rendered-row review has been performed (`comparison_ready: false`).
- Not a certified project-identity comparison: the DBM NEP standalone NIA PDF (`dbm-other-nep-line-data/NIA.pdf`, 30 pages, OCR text layer) has a different structure, including a printed Restoration heading and NIS control of ₱4,662,231,000. Its extraction exists: see [NEP_NIA_EXTRACTION_FINDINGS.md](NEP_NIA_EXTRACTION_FINDINGS.md) (791 rows, ₱17,598,181,000, all six controls exact) and [NEP_NIA_METHODOLOGY_AND_LESSONS.md](NEP_NIA_METHODOLOGY_AND_LESSONS.md). The final dataset is [data/nep_nia_dataset.json](data/nep_nia_dataset.json); the [workbench](NIA_WORKBENCH.md) compares controls and provisional title candidates.

## Rebuild and checks

From the repository root, with PyMuPDF available:

```sh
python3 analysis-nia/extract_hgab_nia.py
python3 analysis-nia/extract_hgab_nia.py --check
python3 -m unittest discover -s analysis-nia/tests -v
```

The default command rebuilds the five data artifacts. `--check` re-extracts from the PDF and compares every generated file without writing. The build fails on unexpected layouts (bold/indent conflicts, multiple amount tokens, non-bold control rows, unexplained furniture text, unsupported printed-page mappings), arithmetic discrepancies, coverage errors, or failed agency controls.

**Twelve regression tests pass.** They cover the live source, CSV ledger roundtrips, the Development-heading grouping, cross-page title continuation, numeric title tokens, repeated titles, the agency-only CARP row, and deliberately introduced corruptions: dropped projects, missing/double-owned words, offsetting sub-program errors, swapped equal-amount projects, and changed agency control amounts. Those corruptions are rejected, including cases where the overall annex total still balances.

This extractor is specific to the supplied I-B NIA annex and agency controls. It should not be reused for NEP, FMR, HFEP, or another reading without inspecting those tables and establishing their own scope, page ranges, units, and geometry.
