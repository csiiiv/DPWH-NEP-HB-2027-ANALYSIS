# NEP FY 2027 HFEP Extraction

Extraction of the DOH **Health Facilities Enhancement Program (HFEP)** detail
annex from the FY 2027 National Expenditure Program executive proposal, using
the PaddleOCR **PP-StructureV3** supplementary run as primary source.

## Sources

| Source | Role | File |
|---|---|---|
| PP-StructureV3 pipeline output (13 pages, tokens with pixel boxes) | **Primary** | `dbm-other-nep-line-data/HFEP.pdf_by_PP-StructrueV3.json` |
| Standalone scanned annex (renamed by user) | Page geometry, visual audit | `dbm-other-nep-line-data/HFEP_2.pdf` |
| PaddleOCR-VL-1.6 markdown (6 pages carry tables) | Independent cross-check | `dbm-other-nep-line-data/HFEP.pdf_by_PaddleOCR-VL-1.6.json` |
| Volume II-A agency PAP table | External control | `dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf` p. 282 (printed 274) |

The annex spans 13 pages (standalone 1–13 = Volume II-A PDF 727–739 = printed
719–731). Native PDF text of the standalone scan misreads thousands separators
(periods), decorates dashes, and drops digits; PP-StructureV3's independent OCR
is dramatically cleaner, and its `table_ocr_pred` section supplies **every token
with a bounding box**, which also recovers the printed indent hierarchy.

## Layout

Five printed columns: *Name of Projects and Facilities*, *Infrastructure*,
*Medical Equipment*, *Motor Vehicle*, *Grand Total*. Hierarchy (5 levels):

```
annex program
└── category            "1. Primary Care Facilities" … "7. Other Health Care Facilities"
    └── subcategory     "1.a", "1.b", … numbered grammar
        └── region      CAR / NCR / NIR / BARMM / Region I–XIII
            └── province
                └── facility (line item)
```

Roles come from label grammar (numbered categories/subcategories) plus the token
x0 indent ladder. PP-StructureV3 renders pages at 2× PDF points and the scan
alternates parity, so ladders shift ~20 px between odd and even pages:

| Role | odd pages (px) | even pages (px) |
|---|---|---|
| category / subcategory | 142–165 | 123–190 |
| region | 204–208 | 186–191 |
| province | 225–229 | 205–213 |
| facility | 246–252 | 227–234 |

Amount column x0 zones (2× px): Infrastructure 780–912, Medical Equipment
912–1045, Motor Vehicle 1045–1176, Grand Total 1176–1320.

## OCR interpretation rules

* Dash misreads — `=`, `一`, `。`, `·`, `E`, `|`, `_`, `二` — are read as the
  printed `-`. Every occurrence is preserved verbatim in
  `nep_hfep_source_rows.json` (`amounts_raw`).
* Single-digit tokens (`0`, `1`, `7`) in amount cells are dash fragments, never
  standalone amounts (annex minimum is ₱110,000).
* `·300,000`-style leading punctuation is stripped, with lineage recorded.
* Row identity `total = infrastructure + medical_equipment + motor_vehicle`
  is asserted for every row; a cell is derived from the row identity only when
  exactly one component is missing.

## Results

| Metric | Value |
|---|---|
| Detail pages | 13 |
| Source rows | 837 |
| Facilities | 464 |
| Facility ledger | ₱14,472,519,000 |
| Printed grand total | ₱14,472,659,000 |
| Internal control checks (category → province) | 347 / 347 pass |
| PPS ↔ VL-1.6 shared rows | 382 agree, 0 conflicts |
| Volume II-A agency PAP | MOOE ₱67,173,000 + CO ₱14,472,659,000 = ₱14,539,832,000 ✓ |

Category ledger reconciliation (printed vs facility sums):

| Category | Printed | Facility sum | Δ |
|---|---|---|---|
| 1. Primary Care Facilities | 506,565,000 | 506,425,000 | **+140,000** |
| 2. LGU Hospitals | 2,428,391,000 | 2,428,391,000 | — |
| 3. DOH Hospitals | 9,509,703,000 | 9,509,703,000 | — |
| 4. BUCAS | 4,400,000 | 4,400,000 | — |
| 5. Drug Abuse Treatment & Rehab Centers | 406,500,000 | 406,500,000 | — |
| 6. Bureau of Quarantine | 86,120,000 | 86,120,000 | — |
| 7. Other Health Care Facilities | 1,530,980,000 | 1,530,980,000 | — |

## Printed-document discrepancy

`metro_manila_med_overhang_140000` — under subcategory *1.d
Completion/Upgrading/Repair/Equipping of Primary Care Facilities*, the
**Metro Manila** control prints ₱31,680,000 medical equipment /
₱47,880,000 total, but its 24 listed facility rows sum to ₱31,540,000 /
₱47,740,000. The ₱140,000 overhang propagates NCR → 1.d → Category 1 →
printed grand total. The published annex appears to omit one ₱140,000
health-center row from the Metro Manila block.

Evidence trail (three independent text sources plus imaging):

1. PP-StructureV3 tokens with cell boxes (p2 y≈1046–1534).
2. `HFEP_2.pdf` native text layer — identical values for all 24 rows and both
   controls.
3. Volume II-A p728 OCR text — identical values.
4. Native-scale glyph comparison: all six "140,000" med cells in the block are
   pixel-identical (696×105 px ink) — no "280,000" misread.
5. Uniform ~20.5 px row spacing with no gap — no dropped row in our extraction;
   the row is absent from the printed annex itself.

The discrepancy is recorded in `nep_hfep_audit.json`
(`printed_discrepancies`) and surfaced in the controls CSV as the difference
between `total_php` and `recursive_sum_total_php`; it is **not** repaired.

## Scope note

The NEP annex covers **all** HFEP capital outlays (₱14.47B — national + LGU
facilities). The HGAB Volume I-B extraction (`extract_hgab_hfep.py`) covers
only the LGU portion (₱10.02B). The two are complementary, not conflicting.

## Reproduce

```bash
python3 analysis-hfep/extract_nep_hfep.py           # write artifacts
python3 analysis-hfep/extract_nep_hfep.py --check   # deterministic rebuild check
python3 -m pytest analysis-hfep/tests/test_nep_hfep.py -q
```

## Outputs (`analysis-hfep/data/`)

* `nep_hfep_facilities.csv` — 464 facility line items with full hierarchy.
* `nep_hfep_controls.csv` — 347 printed controls + grand total, with recursive
  sums for every node.
* `nep_hfep_tree.json` — full node tree with paths, printed amounts, sources.
* `nep_hfep_source_rows.json` — every OCR row verbatim (labels, raw cells,
  token coordinates) for auditability.
* `nep_hfep_audit.json` — control checks, VL cross-check, agency control,
  printed-discrepancy ledger.
