# NEP FY2027 — NIA Irrigation Annex Extraction Findings (v9, FINAL)

> **Document:** DBM National Expenditure Program (NEP) FY2027  
> **Agency:** National Irrigation Administration (NIA)  
> **Annex PDF:** `dbm-other-nep-line-data/NIA.pdf` (30 pages, scanned CCITT images)  
> **Status:** ✅ **All six sub-program controls tally EXACTLY — 791 rows, ₱17,598,181,000**

---

## 1. Final Reconciliation

| # | Sub-Program | Segment (page, y) | Rows | Project Sum (₱) | Control (₱) | Diff |
|---|-------------|-------------------|------|-----------------|-------------|------|
| 1 | National Irrigation System | p1 – p9<222.9 | 216 | 4,662,231,000 | 4,662,231,000 | **0** |
| 2 | Communal Irrigation System | p9≥222.9 – p16<287 | 192 | 1,620,000,000 | 1,620,000,000 | **0** |
| 3 | Other Irrigation System | p16≥287 | 13 | 3,000,000,000 | 3,000,000,000 | **0** |
| 4 | Establishment of Pump Irrigation | p17 – p29<272 | 330 | 7,915,950,000 | 7,915,950,000 | **0** |
| 5 | Special Irrigation | p29≥272 – p30<398 | 29 | 200,000,000 | 200,000,000 | **0** |
| 6 | Extension/Expansion | p30≥398 | 11 | 200,000,000 | 200,000,000 | **0** |
| | **Total** | | **791** | **17,598,181,000** | **17,598,181,000** | **0** |

Program grouping: sub-programs 1–3 = *IRRIGATION SYSTEMS RESTORATION PROGRAM*; 4–6 = *IRRIGATION SYSTEMS DEVELOPMENT PROGRAM*.

---

## 2. Verification Method Stack

Four independent sources were cross-checked row by row:

1. **Embedded OCR text layer** (`get_text` words with coordinates) — authoritative for amounts (see §4).
2. **Per-page text dump with page markers** (`data/nia_pdf_text_by_page.txt`) — `get_text` per page with `===== [PDF PAGE n] =====` separators. Reading order matches the copy-paste export but page attribution is guaranteed; used for per-page structural diffs and line-pitch analysis.
3. **Copy-paste reading-order text** (`NIA_copy_pasted.txt`, 1302 lines) — amounts map to first lines, following lines are label overflow. Page attribution unreliable (only ~15 of 30 header/footer markers survive), so it was aligned globally in reading order.
4. **PaddleOCR-VL 1.6 transcription** (`NIA.pdf_by_PaddleOCR-VL-1.6.json/.md`) — table HTML on ~15 of 30 pages (table recognition failed on the rest); used to confirm segment transitions, heading controls, and locate rows invisible to the embedded layer.
5. **High-DPI rendered crops** (token-anchored 12x–14x zooms in `data/evidence_crops/`) — decisive for adjudicating contested amounts and verifying recovered rows.

**Lesson (v8→v9):** verification crops must be anchored to the exact amount-token bbox. v8's crops were anchored loosely and clipped leading digits (e.g. `9,500,000` rendered as `5,000,000`), which produced 16 spurious "amount fixes". With token-anchored renders, the embedded text layer proved correct on every contested row.

---

## 3. Extraction Bugs Fixed in v9

| Bug | Root cause | Fix |
|-----|-----------|-----|
| **7 rows missing** (Ilaya SRIS 12M p7·y771.5; Simabusa-Nagbayruangan 5M p9·y767.8; Kalumboyan 2M p12·y768.6; TARLAC LA PAZ 10M p22·y773.4; Roxas SPIP 10M p24·y772.8; BATUTU RIVER 10M p27·y774.9; LATERAL J-SIMULAO 15M p28·y769.5) | Body band ended at y≤768; footers are absent from the word layer, so rows down to y=780 are genuine | Band widened to 62–780; rows also listed in `EXTRA_ROWS` as completeness control (deduped by (page, round(y0))) |
| **Nagas-Maramba CIS 15M missing** (p12·y534.5) | Amount prints as `15,000,000.` with trailing period; strict regex `^\d{1,3}(?:,\d{3})+$` rejected it | Regex now allows one trailing punctuation char: `^\d{1,3}(?:,\d{3})+[.,]?$` |
| **Marbel 1 RIS double-counted** (p2·y763.9) | Two overlapping word sets at identical y (word-grouping artifact) — printed once | Deduped by (page, y0) key |
| **Kamalig CIS / Libertad CIS merged** (p14·y214.2/234.2) | Label↔amount y-skew of 2.6pt exceeded the 2.2pt grouping tolerance, shifting Libertad's label onto Kamalig's row and leaving an empty-label row | Tolerance raised to 2.8pt (`ROW_TOL`); document-wide max skew is 2.6, continuations sit 10.2pt away |
| **16 wrong amount overrides (v8 AMOUNT_FIXES)** | Verification renders were mis-cropped (clipped leading digits) | All overrides reverted; text layer values confirmed by token-anchored 12x/14x renders |

---

## 4. OCR Quality Notes

- The degraded OCR layer **drops or shreds** five of six sub-program control headings (values verified via renders + PaddleOCR-VL), shreds green italic headings (Special p29, Extension p30), and drops ~25 p18 SPIP labels — but project **amounts are reliable**: every one of the 16 v8-suspected digit errors was disproven by renders.
- Known text-layer quirks (kept as printed): `—1.620.000.000` (periods for thousands), `7,91` (truncated pump control), `04000` for `0+000` in Masipi West's label.

---

## 5. Geometry Profile (final)

| Property | Value |
|----------|-------|
| Body band (v9) | y 62–780 pts (footers absent from word layer) |
| Heading indent floor | x0 < 135 → heading/artifact; project rows x0 ≥ 135 |
| Amount column | x0 ≥ 520; right edge ≈ 579 |
| Visual-row grouping tolerance | 2.8 pt (max real skew 2.6; continuation pitch 10.2) |
| Row pitch | ~20.4 pt single-line rows |
| Drop bands | six (page, y) bands for shredded control headings |

---

## 6. Files Produced

| File | Description |
|------|-------------|
| `extract_nep_nia.py` | v9 extractor (`build()` → CSVs + tree + audit + source rows + dataset JSON) |
| `data/nep_nia_projects.csv` | **791** project line items |
| `data/nep_nia_subprograms.csv` | 6 sub-program summaries (all `difference=0`) |
| `data/nep_nia_dataset.json` | **Final dataset**: 791 projects with full per-row provenance (raw tokens, bboxes, normalization rules, flags, evidence-crop links) |
| `data/nep_nia_tree.json` | Hierarchy: 2 programs → 6 sub-programs → rows |
| `data/nep_nia_source_rows.json` | Per-row source metadata (coords, word indices) |
| `data/nep_nia_audit.json` | Machine audit (all checks pass) |
| `data/nia_pdf_text_by_page.txt` | Per-page `get_text` dump with page markers (verification aid) |
| `data/evidence_crops/*.png` | Heading verifications + token-anchored amount adjudications + bottom-band/gap scans |
| `tests/test_nep_nia.py` | 14 tests: exact tallies, recoveries, text-layer authority, hygiene, dump agreement, CSV roundtrip, dataset JSON integrity/flags/pinned sources |

Run tests: `python3 -m pytest analysis-nia/tests/test_nep_nia.py` — **14 passed** (26 across the NIA suite).

---

## 7. Context vs Other Budget Documents

| Aspect | HGAB Vol I-B | NEP FY2027 (this work) |
|--------|--------------|------------------------|
| Projects | 828 | 791 |
| Total | ₱17,999,305,000 | ₱17,598,181,000 |
| Sub-programs | 6 (same names) | 6 |
| Reconciliation | Full | **Full — all controls exact** |

NEP Volume 1 p15 cites ₱30.44B total NIA budgetary support; the annex's ₱17.6B covers physical irrigation projects only (remainder = MOOE, CARP, overheads, other services).

---

*Extractor version: v9 · Last updated: 2026-10-12 · Status: COMPLETE — all six sub-program controls tally exactly.*
