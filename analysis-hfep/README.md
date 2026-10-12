# HFEP analysis

Extraction and reconciliation of **FY 2027 Health Facilities Enhancement Program (HFEP)** data from two documents: the HB 10858 House bill copy (HGAB, Volume I-B) and the FY 2027 NEP executive proposal annex. Each document has its own extraction and artifacts; cross-document comparison is a separate future pass.

## HGAB HFEP (House bill, Volume I-B)

**Method + results:** [HFEP_EXTRACTION.md](HFEP_EXTRACTION.md) · [513 facility rows](data/hgab_hfep_facilities.csv) · [312 control rows](data/hgab_hfep_controls.csv) · [source hierarchy](data/hgab_hfep_tree.json) · [machine audit](data/hgab_hfep_audit.json). The annex (Volume I-B, PDF 877–893 / printed 857–873) yields **₱10,021,659,000** in capital outlays; all 311 internal controls reconcile recursively on all four funding columns, and the flat facility ledger independently reproduces the grand total. The Volume I-A agency row confirms the annex matches the capital-outlay component of the wider ₱10,088,832,000 HFEP allocation (₱67,173,000 MOOE is outside the annex).

## NEP HFEP (executive proposal, Volume II-A annex)

**Method + results:** [NEP_HFEP_EXTRACTION.md](NEP_HFEP_EXTRACTION.md) · **[worklog](NEP_HFEP_WORKLOG.md)** · [464 items + 348 controls, provenance-rich](data/nep_hfep_data_list.json) · [facility CSV](data/nep_hfep_facilities.csv) · [controls CSV](data/nep_hfep_controls.csv) · [hierarchy](data/nep_hfep_tree.json) · [audit](data/nep_hfep_audit.json) · [listing with page refs](data/nep_hfep_items_with_pages.md). The 13-page annex (standalone `HFEP_2.pdf` = Volume II-A PDF 727–739 = printed 719–731) yields a printed grand total of **₱14,472,659,000** (facility ledger ₱14,472,519,000). 342/347 controls reconcile to the peso; the other 5 carry one documented printed-document defect (`metro_manila_med_overhang_140000`: the published Metro Manila block omits one ₱140,000 row that its controls still count). Extraction is PP-StructureV3-token-based with per-cell amount lineage, OCR interpretation rules, flags (`ocr_suspect_label`, `verified_odd_amount`, `printed_discrepancy`, `page_break_continuation`), VL-1.6 cross-check (382/382 agree), and a Volume II-A agency PAP control. Covers **all** HFEP capital outlays (national + LGU), unlike the HGAB annex (LGU-only).

## Layout

```text
analysis-hfep/
  HFEP_EXTRACTION.md       HGAB method, findings, reconciliation
  NEP_HFEP_EXTRACTION.md   NEP method, findings, reconciliation
  NEP_HFEP_WORKLOG.md      NEP journey: attempts, issues, pivots, lessons
  extract_hgab_hfep.py     HGAB ruled-band native-text extractor (--check)
  build_hgab_data_list.py  Consolidated HGAB JSON with provenance (--check)
  extract_nep_hfep.py      NEP PP-StructureV3 token extractor (--check)
  data/                    Artifacts per document (hgab_*, nep_*)
  tests/                   Source-backed regression and corruption tests
```

## Status and scope

- HGAB source: `HB_BUDGET/2 - HB 10858 VOL IB.pdf` (working copy; legislative stage not independently authenticated). The 17 annex pages are textually identical to the supplied third-reading I-B copy.
- NEP source: `dbm-other-nep-line-data/HFEP_2.pdf` scan + user-supplied PaddleOCR runs (PP-StructureV3 primary, VL-1.6 cross-check); agency control from `dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf`.
- Both annexes are the **capital-outlay** detail of HFEP only. MOOE and other DOH programmes are out of scope.
- Four funding columns: Infrastructure, Medical Equipment, Motor Vehicle, Total. Components sum to Total on every row and recursively on every control (NEP exception: the documented ₱140k defect chain).
- Facility identity has not been matched to any external registry. IDs are source-artifact-local.
- No coordinates are printed in these annexes, so no coordinate review applies.
- **Per-document outputs only.** NEP↔HGAB comparison is deliberately a separate future analysis pass over the `*_data_list.json` artifacts.

## Rebuild

```sh
python3 analysis-hfep/extract_hgab_hfep.py          # rebuild data/ (HGAB)
python3 analysis-hfep/build_hgab_data_list.py       # consolidated HGAB JSON
python3 analysis-hfep/extract_nep_hfep.py           # rebuild data/ (NEP)
python3 analysis-hfep/extract_nep_hfep.py --check   # byte-identical rebuild check
python3 -m pytest analysis-hfep/tests/ -q
```
