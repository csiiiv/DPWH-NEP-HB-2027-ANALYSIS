# HGAB HFEP extraction

Built on **12 October 2026** from the supplied **HB 10858 FY 2027 Volume I-B**, PDF pages **877–893**, printed pages **857–873**. Here "HGAB" refers to that local House bill copy under `HB_BUDGET/`; its legislative stage has not been independently authenticated.

The extraction recovers **513 printed facility line items** inside a **five-level printed hierarchy** — 8 categories, 14 subcategories, 91 regions, 198 provinces — with four funding columns each. Every one of the **311 printed controls** reconciles recursively on every column, and the flat facility ledger independently reproduces the printed **₱10,021,659,000** grand total on all four columns.

The amount/title extraction is complete within this annex, with native cell and coverage checks passing. It remains a first source-based dataset: individual rendered-row review beyond the six documented spot checks is incomplete, no geographic validation applies (HFEP prints no coordinates), and no NEP/companion comparison has been performed.

## Outputs

| Artifact | Purpose |
|---|---|
| [Facility CSV](data/hgab_hfep_facilities.csv) | One row per printed facility: integer PHP per funding column, full category→province path, raw multiline label, and PDF/printed page references. This is the disjoint allocation ledger; sum only its `total_php` column for the annex total. |
| [Controls CSV](data/hgab_hfep_controls.csv) | All 312 control rows (categories, subcategories, regions, provinces, grand total) with printed amounts, child counts, recursive sums, and page references. |
| [Source hierarchy](data/hgab_hfep_tree.json) | Flat nodes with `parent_id` and `child_ids`: annex → category → subcategory → region → province → facility, plus the grand-total control. Includes raw labels, printed amounts per column, source geometry, and artifact-local IDs. |
| [Native source rows](data/hgab_hfep_source_rows.json) | All ruled bands, including headers and blank spacers; page-specific column/row boundaries, label lines, amount cells, and word-ownership indices. |
| [Machine audit](data/hgab_hfep_audit.json) | Recursive control checks on all columns, word/row coverage results, the Volume I-A agency observation, working-vs-third-reading page comparison, and evidence limits. |
| [Extractor](extract_hgab_hfep.py) | A source-specific ruled-band profile with deterministic rebuild/check commands. |
| [Regression tests](tests/test_hgab_hfep.py) | Source-backed checks and deliberate corruptions that must fail validation. |

IDs such as `ib:p877:r12` mean **Volume I-B, PDF page 877, ruled band 12**. Band numbers restart on each page and include heading/header/spacer bands. They are references inside this source artifact, not universal facility IDs.

The JSON metadata records the source PDF hash, extractor hash, PyMuPDF version, fiscal year, scope, source units, and page ranges. The I-B SHA-256 is recorded in the audit metadata.

## Applying the budget-PDF method

The principles in the FMR extraction and [pdf_budget_dataset_method.md](../analysis/docs/pdf_budget_dataset_method.md) transfer; the HFEP annex adds a wider ruled grid and a deeper printed hierarchy.

| Lesson | Application to HFEP |
|---|---|
| Establish source scope and units first | The root is the **DOH FY 2027 HFEP annex**. The table prints **"(Amount in Pesos)"**; no multiplier applies. The annex is the **capital-outlay** component only — the wider I-A HFEP allocation of **₱10,088,832,000** additionally includes **₱67,173,000 MOOE** (I-A printed 1057 / PDF 1067), which this annex must not be summed into. |
| Prefer the original digital layer | Read the native I-B PDF words and vector table rules through PyMuPDF. No OCR is used. |
| Recover visual rows and columns before parenting | Detect each page's horizontal band rules and the five long vertical rules (label + four amount dividers, plus the right border on odd pages). Assign every word to one ruled band and one column by centre position. This handles wrapped facility labels and vertically centred amounts without guessing. |
| Give each table family a geometry profile | Odd and even PDF pages carry grids shifted by ~30.4 pt horizontally. Control/province/facility indents are constant within a parity: label starts at x≈79.4/99.8/115.4 (odd) and ≈49.0/69.4/84.9 (even). Bold spans distinguish controls from facilities on every row. |
| Keep numeric label content distinct from money | Facility names can contain digits (e.g. "Pikit 1 Cluser Rural Health Unit", "San Andres 1 BHS"). They stay in the label cell; only comma-grouped tokens inside ruled amount cells become amounts. No comma-grouped token appears outside the grid; printed page numbers like "857" are plain furniture and never match an amount pattern. |
| Retain hierarchy at the printed grain | The annex prints categories ("1. Primary Care Facilities"), subcategories ("1.a …"), regions ("CAR", "Region II", "NCR", "BARMM"), provinces ("Apayao", "Metro Manila"), and facility rows. No unprinted administrative attribution is invented. |
| Make the hierarchy additive | Facility rows enter the ledger once. All 311 controls (categories through provinces) are checked recursively on **each** funding column: infrastructure, medical equipment, motor vehicle, and total. Controls do not enter the facility ledger as allocations. |
| Validate accounting separately from source accuracy | Check immediate and recursive sums per column, independently sum the flat facility ledger per column, account for every source band and word, and compare the I-A agency row. Rendered spot checks remain a separate, partial status. |
| Preserve missing values | Blank funding cells stay blank (`None` in JSON, empty in CSV). A blank is the printed state; it is not asserted as a legislated zero. |
| Preserve repeated observations | No repeated facility label within one parent was found (0 groups). Identical labels under different parents remain separate rows with their own sources. |

## Funding columns and reconciliation

Every facility row prints at least a Total; Infrastructure, Medical Equipment, and Motor Vehicle are printed only when funded. On **every** structural row the printed components sum exactly to the printed Total — this is checked row-by-row at extraction time, and recursively for every control.

| Column | Facility ledger (PHP) | Printed grand total (PHP) | Difference |
|---|---:|---:|---:|
| Infrastructure | 5,990,046,000 | 5,990,046,000 | 0 |
| Medical Equipment | 3,900,913,000 | 3,900,913,000 | 0 |
| Motor Vehicle | 130,700,000 | 130,700,000 | 0 |
| **Total** | **10,021,659,000** | **10,021,659,000** | **0** |

The Motor Vehicle column has exactly **one** funded line: the DOH Central Office row (printed 873 / PDF 893), ₱130,700,000. 51 facilities combine infrastructure and equipment funding.

## Category reconciliation

| Printed category | Facilities | Total (PHP) |
|---|---:|---:|
| 1. Primary Care Facilities | 216 | 525,190,000 |
| 2. LGU Hospitals | 214 | 5,558,546,000 |
| 3. DOH Hospitals | 40 | 3,131,703,000 |
| 4. BUCAS | 3 | 4,400,000 |
| 5. Drug Abuse Treatment and Rehabilitation Centers | 19 | 296,000,000 |
| 6. Bureau of Quarantine | 7 | 1,120,000 |
| 7. Other Health Care Facilities | 12 | 302,700,000 |
| 8. State Universities | 2 | 202,000,000 |
| **Total** | **513** | **10,021,659,000** |

Validation accounts for **1,157 ruled bands**: 513 facilities, 198 provinces, 91 regions, 14 subcategories, 8 categories, 1 grand total, 17 column headers, 3 annex-heading bands, and 312 blank spacers. All **5,009 in-table words** are assigned exactly once. No comma-grouped amount tokens were found outside the grid.

## Independent Volume I-A control

The DOH programmes table on I-A printed **1057 / PDF 1067** prints one HFEP row: MOOE **₱67,173,000**, capital outlays **₱10,021,659,000**, total **₱10,088,832,000**. The annex grand total matches the capital-outlay component exactly. The audit records this as the agency-level control; the MOOE remains outside this annex's scope, as [the orientation notes](../other-analysis/README.md) anticipated.

Special provision 5 on I-A printed **1029 / PDF 1039** directs readers to Volume I-B for HFEP details.

## Working copy versus third-reading copy

The 17 annex pages are **textually identical** between `HB_BUDGET/2 - HB 10858 VOL IB.pdf` and `HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf` (native `get_text()` equality per page, both directions). Additionally, a full differential re-run of the extractor against the third-reading copy produced **0/826 node differences** (labels, printed amounts, hierarchy) and an identical audit summary and ledger (₱10,021,659,000); only `source_pdf`/`source_sha256` provenance fields differed. This is evidence of identical text layers and identical extraction results only; it does not authenticate the legislative stage of either copy, and graphical differences were not compared.

## Rendered spot checks

Six bands were rendered to images and reviewed against the extraction: `ib:p877:r12` (first facility, wrapped label), `ib:p878:r31` (wrapped label across two visual lines), `ib:p882:r54` ("Pikit 1 Cluser Rural Health Unit" under the "Special Geographic Area" province grouping, with the source's spelling retained), `ib:p890:r42` (subcategory label wrapped over two lines), `ib:p893:r10` (DOH Central Office motor-vehicle row), and `ib:p893:r26` (grand total). Titles, indents, bold state, and all four amount columns matched the printed source.

Notable source observations retained verbatim:

- The three "Pikit N Cluser Rural Health Unit" rows carry the source spelling **"Cluser"**; no repair is applied.
- The "Special Geographic Area" province grouping under BARMM is retained as printed.
- Blank funding cells are preserved as blanks, not zeros.

## Rebuild and checks

From the repository root, with PyMuPDF available:

```sh
python3 analysis-hfep/extract_hgab_hfep.py
python3 analysis-hfep/extract_hgab_hfep.py --check
python3 -m unittest analysis-hfep/tests/test_hgab_hfep.py -v
```

The default command rebuilds the five data artifacts. `--check` re-extracts from the PDFs and compares every generated file byte-for-byte without writing. The build fails on unexpected grid layouts, ambiguous/missing amount cells, component/total mismatches, non-bold controls, bold facilities, unsupported printed-page mappings, arithmetic discrepancies, or source-coverage errors.

**Thirteen regression tests pass.** They cover the live source (counts, controls, ledger totals, hierarchy paths, I-A control, reading comparison, grid parity), CSV round-trip, and deliberately introduce offsetting facility errors that preserve the grand total, a dropped facility, an altered agency capital-outlay value, and a missing word-ownership index — all rejected.

This extractor is specific to the supplied I-B HFEP annex and I-A controls. It should not be reused for FMR, NIA, NEP, or another reading without inspecting those tables and establishing their own scope, page ranges, units, and geometry.
