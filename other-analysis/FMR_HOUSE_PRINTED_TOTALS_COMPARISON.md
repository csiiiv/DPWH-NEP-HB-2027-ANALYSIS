# FMR printed totals: supplied House copy versus named third-reading copy

Quick comparison on **12 October 2026**: **no FMR program or regional allocation
differences found** between these retained House PDFs.

| FMR scope | Second-reading working copy | Named third-reading copy | Third minus working copy |
|---|---:|---:|---:|
| Printed program allocation | ₱19,628,100,000 | ₱19,628,100,000 | **₱0** |
| Sum of 16 printed regional controls | ₱19,628,100,000 | ₱19,628,100,000 | **₱0** |

All **17 annex controls** agree across copies. In each copy, the separate I-A
schedule provides **17 matching program/regional controls and 16 matching office
echoes**. The office echoes repeat regional money and are not added again.

## Regional results

The PDF pages below are the same in both I-B copies; printed page = PDF page − 16.

| Region | Working copy (PHP) | Third-reading copy (PHP) | Difference (PHP) | PDF page |
|---|---:|---:|---:|---:|
| I – Ilocos | 1,590,000,000 | 1,590,000,000 | 0 | 667 |
| CAR | 1,565,000,000 | 1,565,000,000 | 0 | 672 |
| II – Cagayan Valley | 2,133,200,000 | 2,133,200,000 | 0 | 674 |
| III – Central Luzon | 3,418,800,000 | 3,418,800,000 | 0 | 680 |
| IVA – CALABARZON | 2,403,400,000 | 2,403,400,000 | 0 | 690 |
| IVB – MIMAROPA | 1,005,350,000 | 1,005,350,000 | 0 | 699 |
| V – Bicol | 1,391,200,000 | 1,391,200,000 | 0 | 702 |
| VI – Western Visayas | 1,042,750,000 | 1,042,750,000 | 0 | 706 |
| Negros Island Region | 665,000,000 | 665,000,000 | 0 | 709 |
| VII – Central Visayas | 315,000,000 | 315,000,000 | 0 | 712 |
| VIII – Eastern Visayas | 996,800,000 | 996,800,000 | 0 | 713 |
| IX – Zamboanga Peninsula | 580,000,000 | 580,000,000 | 0 | 716 |
| X – Northern Mindanao | 683,400,000 | 683,400,000 | 0 | 718 |
| XI – Davao | 475,000,000 | 475,000,000 | 0 | 720 |
| XII – SOCCSKSARGEN | 425,000,000 | 425,000,000 | 0 | 721 |
| XIII – Caraga | 938,200,000 | 938,200,000 | 0 | 723 |

## Sources and checks

- Working annex: [`HB_BUDGET/2 - HB 10858 VOL IB.pdf`](../HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf#page=667).
- Named third-reading annex: [`HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf`](../HB_BUDGET_3rd_reading/2-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-B.pdf#page=667).
- Annex coverage: PDF **667–726**, printed **651–710**, in each copy.
- Supporting I-A controls: PDF **137–138**, printed **127–128**, in each copy's corresponding Volume I-A.
- Both first annex pages were rendered and visually checked: [working copy](data/hgab_fmr_printed_control_images/working-copy-page667.png), [named third-reading copy](data/hgab_fmr_printed_control_images/third-reading-page667.png).
- Both schedules contain **964 project rows** in this in-memory table pass.
- **Extracted page text is identical on all 60 annex pages**, including the
  project descriptions, coordinate text, and amounts. No page-text differences
  were found within the bounded FMR annex. This is stronger corroboration than
  equal program totals alone, which could otherwise hide offsetting changes.
- The complete PDFs have different hashes. The finding concerns their FMR
  sections, rather than the entire bill or all other agency allocations.

The comparison reuses the native ruled-cell profile only after checking its
expected geometry and printed-page mapping on both annexes. Printed controls
also equal their child allocations. Exact source hashes, page/cell references,
regional comparisons, and all independent control observations are retained in
the [machine comparison](data/hgab_fmr_printed_control_comparison.json).

Reproduce without changing existing FMR source extracts:

```sh
python other-analysis/compare_house_fmr_controls.py
python other-analysis/compare_house_fmr_controls.py --check
```

`HB_BUDGET/` remains the **second-reading working copy**, rather than an
independently authenticated legislative version. The comparison does not
publish a separately normalized third-reading project dataset, clear coordinate
flags, or certify cross-reading project identities. Existing FMR app/data stage
labels are unchanged by this quick pass.
