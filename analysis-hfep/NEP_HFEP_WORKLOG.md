# NEP HFEP Extraction Worklog — Methods, Issues, and Lessons

Reference log for extracting NEP FY 2027 HFEP annex data (and for parsing
similar Philippine budget-table PDFs). Companion docs: `NEP_HFEP_EXTRACTION.md`
(final method + results) and `README.md`. Sibling worklogs worth consulting:
`analysis-nia/HGAB_NIA_EXTRACTION_WORKLOG.md`, `other-analysis/FMR_WORKBENCH.md`.

Timeline: one working session, 2026-10-12. Extractor:
`analysis-hfep/extract_nep_hfep.py`; tests: `analysis-hfep/tests/test_nep_hfep.py`.

## Documents in play

| File | What it is | Quality |
|---|---|---|
| `HFEP.pdf` → renamed `HFEP_2.pdf` by user mid-session | 13-page standalone scan of the HFEP annex (Vol II-A PDF 727–739, printed 719–731) | Native text layer corrupt: period separators ("920.000"), dropped digits, decorated dashes |
| `HFEP.pdf_by_PaddleOCR-VL-1.6.json/.md` | User-supplied PaddleOCR-VL-1.6 run | **6 of 13 pages have tables** (missing 2,5,6,8,9,11,13); merges adjacent row labels; sometimes shifts header columns |
| `HFEP.pdf_by_PP-StructrueV3.json` | User-supplied PP-StructureV3 run | **All 13 pages.** `pred_html` tables + `table_ocr_pred` tokens **with pixel boxes**. Best source. |
| `HFEP.pdf_by_PaddleOCR.md` | User-supplied PaddleOCR markdown | All 13 tables in HTML; merges rows (`<td>= | 140,000` spill rows), unreliable column alignment |
| `NEP-2027-VOLUME-2A_OCR.pdf` | Main volume (772 pp) | Its own OCR of the same annex + the agency PAP table (p282) |
| `NEP-2027-VOLUME-1/2B/3_OCR.pdf` | Other volumes | Not needed here |

## What we tried, in order

1. **Standalone PDF native text (`HFEP.pdf` → `HFEP_2.pdf`).**
   Abandoned as primary. Thousands-separator misreads, digit drops, decoration
   noise ("___", "—", "="), inconsistent dashes. Kept for: page geometry
   (720×864 pt), rendering evidence crops, and as a third independent text
   source during discrepancy adjudication.

2. **PaddleOCR-VL-1.6 markdown tables.**
   First supplementary source. Coverage gap discovered: only pages
   1,3,4,7,10,12 carry tables. Also merges consecutive row labels into one cell
   (e.g. two Caloocan centers in one `<td>`), which loses row identity.
   **Pivot:** demoted to cross-validation-only source. Final result: 382 shared
   rows agree with PP-StructureV3, 0 conflicts (after occurrence-order pairing,
   see Issues #6).

3. **PaddleOCR.md (plain).**
   All 13 tables present but rows merge across lines (a `= | 140,000` fragment
   row follows a two-label row), so row counts don't match the page. Not used
   directly; served as a hint that a row-count discrepancy existed in the
   printed annex (it didn't — see the ₱140k investigation).

4. **PP-StructureV3 (final primary).**
   - `markdown.text` / `pred_html` gives table structure for all 13 pages.
   - `prunedResult.table_res_list[0].table_ocr_pred` gives `rec_texts` +
     `rec_boxes` — **every token with a bounding box at 2× PDF-point scale**.
   - We rebuilt the grid from tokens alone (y-grouping → rows; fixed x-zones →
     4 amount columns), and used label-token x0 as the **indent ladder** for
     hierarchy. This was the breakthrough: geometry replaced fragile
     header/structure parsing.
   - `cell_box_list` exists but does NOT align 1:1 with `pred_html` cells
     (328 vs 375 on p1) — do not join on it.

## Issues encountered and resolutions

1. **PDF renamed mid-session** (`HFEP.pdf` → `HFEP_2.pdf`, same sha256).
   Fix: reference `HFEP_2.pdf` in metadata; keep sha in provenance.

2. **Row-grid reconstruction from tokens.** Tokens don't declare rows/columns.
   Fix: sort by y-center, group within 12 px (2× scale); assign amount tokens
   to 4 fixed x-zones measured from cluster analysis of all pages (infra
   780–912, med 913–1045, motor 1046–1176, total 1177–1320 px). Amount
   right-edges are stable per column — zones never overlap.

3. **Dash misreads.** PP-StructureV3 reads the printed `-` as `=`, `一`, `。`,
   `·`, `E`, `|`, `_`, `二`, and sometimes as bare digits `0/1/7` (dash
   fragments). Fix: explicit interpretation rules (`DASH_MISREADS`,
   `DASH_LIKE_DIGITS`), every raw reading preserved in
   `nep_hfep_source_rows.json`, every interpretation logged with rule lineage.
   Annex minimum amount (₱110,000) rules out single digits as real values.

4. **Indent ladder parity shift.** Odd/even pages shift ~20 px (region
   204–208 odd vs 186–191 even, etc.). Fix: parity-aware thresholds. Repeated
   labels are resolved by indent, not name: "CAR" at x0≈205 is a region
   control, "CAR" at x0≈247 is a facility row prefix.

5. **Facility names colliding with control grammar.** e.g. "Region II Trauma
   and Medical Center" is a facility (deep indent), not a region. Fix:
   grammar checks (numbered `1.`/`1.a` prefixes) first; indent zone decides
   region vs province vs facility; "Region N"/acronym labels only count as
   regions inside the region indent zone.

6. **VL cross-check false conflicts.** Repeated labels within a page (two
   "CAR" controls under different subcategories) matched first-occurrence →
   40 bogus "conflicts". Fix: pair k-th occurrence ↔ k-th occurrence in
   document order. Result: 382/382 agree.

7. **The ₱140,000 Metro Manila overhang** (the big one). Symptom: facility
   ledger ₱14,472,519,000 vs printed grand total ₱14,472,659,000; gap
   propagates Metro Manila → NCR → 1.d → Category 1 → GT, med+total columns
   only; infra and motor reconcile exactly. Investigation sequence:
   - Suspected dropped row at p2→p3 split (user hypothesis: Navotas City).
     **Disproved**: render showed p2 ends cleanly with "Navotas Medical and
     Wellness Center"; p3 opens with header + "Navotas City" block; tree
     re-attachment was already correct; Navotas City's own control (₱140,000)
     is exact.
   - Suspected "140,000" misread as such vs "280,000" (identical glyph
     count). **Disproved**: all six Metro Manila "140,000" med cells are
     pixel-identical ink (696×105 px at 8×); "28" vs "14" would differ.
   - Suspected a missing OCR row (uniform 20.5 px spacing has no gap).
     **Disproved**: no spacing gap in the Caloocan/Navotas/Valenzuela block.
   - Third-source adjudication: `HFEP_2.pdf` native text and Volume II-A
     p728 OCR text both print identical values for all 24 rows + controls.
   - **Conclusion**: the printed annex itself omits one ₱140,000 facility row
     from Metro Manila's list while keeping it in every rollup. Volume II-A's
     agency PAP table independently shows CO ₱14,472,659,000 (the over-complete
     total), supporting "missing row" over "inflated controls". Recorded as
     `metro_manila_med_overhang_140000` in `PRINTED_DISCREPANCIES`, surfaced as
     `printed_discrepancy` flags + `reconciliation.status` on the 5 affected
     nodes; **not repaired**.

8. **Odd-looking amounts.** 5 facility amounts aren't round (₱55,000;
   ₱95,000; ₱10,682,000; ₱33,204,000; ₱149,703,000). Verified each by cell
   render (5–10×) + Volume II-A text agreement. Recorded in
   `VERIFIED_ODD_AMOUNTS` with verification method; flagged
   `verified_odd_amount` per item.

9. **CSV hierarchy column shift.** The first CSV writer mapped
   category/subcategory/region/province by **tree-path position**, which
   silently shifted for categories without numbered subcategories (2–6:
   region names in `subcategory`, facility names in `province`). Found while
   generating the items-with-pages listing (user-visible join failures).
   Fix: map columns by **node kind** (`_crumb` walks ancestors and assigns by
   `kind`); added regression test `test_csv_hierarchy_joins` (464/464 joins,
   categories reconcile). Also fixed control rows to carry their own level in
   their column.

10. **Non-deterministic output** (`--check` failure): `differences_php` dict
    key order varied across runs (PYTHONHASHSEED). Fix: build dicts over the
    fixed `COLUMN_NAMES` tuple. Deterministic byte-identical rebuilds since.

11. **Column-header token fragments.** Wrapped header tokens ("Medical" /
    "Equipment") create a phantom second row per page. Fix: `column_header` /
    `ocr_fragment` roles excluded from the tree; ownership validation covers
    all structural rows exactly once.

## Provenance model (final artifacts)

Per-item/`control` provenance blocks in `nep_hfep_data_list.json`:

- `normalizations` — e.g. label whitespace collapse (raw preserved in
  `label_raw` / `facility_raw`).
- `amount_lineage` — per-cell: raw OCR reading, interpretation rule
  (`derived_from_row_identity_total_minus_components`,
  `single_digit_dash_fragment_read_as_dash`, `leading_punctuation_stripped`),
  interpreted value. 88 items carry lineage; 219 derived cells total.
- `flags`:
  - `ocr_suspect_label` (4) — printed/OCR typos kept verbatim ("Staion",
    "Lyinq-in", "Facillity", missing space).
  - `verified_odd_amount` (5) — individually verified non-round amounts.
  - `printed_discrepancy` (5) — nodes on the ₱140k overhang chain.
  - `page_break_continuation` (57) — region/province/facility rows continuing
    a block from the previous page (rows a page-local parser would mis-attach;
    numbered category/subcategory starts excluded).
- `image_review_status` — per-item review state (`not_individually_reviewed`
  unless individually rendered and checked).

Document-level verification block: control summary (347 checks, 0 failures,
5 documented discrepancies), agency PAP cross-check, VL cross-check (382
agreements), findings ledger, label quirks, verified odd amounts.

## Pipeline (final shape)

```
PP-StructureV3 JSON ──token grid──▶ rows (labels, raw cells, coords)
        │                                │
        │                        role classification
        │                        (grammar + indent ladder)
        ▼                                ▼
  x-zone columns ◀── fixed zones ── amount parsing + row-identity repair
                                         ▼
                                    tree build (5 levels)
                                         ▼
                    validate: 347 rollups + agency PAP + VL cross-check
                                         ▼
                       mark provenance (normalizations/lineage/flags)
                                         ▼
        artifacts: CSVs, tree, source rows, audit, consolidated data list
```

## Lessons for the next annex (NIA, FMR, …)

1. **Try PP-StructureV3 first.** If `table_ocr_pred` exists, use tokens +
   boxes as the source of truth; use `pred_html` only as a sanity check.
   Native PDF text of scanned PH budget tables is never trustworthy for
   amounts.
2. **Measure the geometry, don't guess.** Cluster token x0s across all pages
   to fix column zones and indent ladders; check for page-parity shifts (this
   scan had ±20 px alternating).
3. **Row identity is the invariant.** `total = infra + med + mv` repairs and
   detects OCR damage better than any per-cell heuristic.
4. **Pair cross-source rows by occurrence order**, not first label match —
   labels repeat across subcategories on the same page.
5. **Published PH budget documents contain genuine arithmetic defects.**
   When three independent sources agree and the sums still don't, treat it as
   a finding: quantify it, localize it to the smallest subtree, verify the
   boundary rows visually, and record it — never silently repair.
6. **Adjudicate suspected misreads by glyph geometry** (ink width/height at
   high zoom) before re-OCR: "140,000" vs "280,000" are indistinguishable by
   token width but obvious as pixel-identical vs pixel-different cells.
7. **Map hierarchy columns by node kind, not path position** — annexes mix
   levels (some categories skip subcategories).
8. **Keep a discrepancy ledger in code** (`PRINTED_DISCREPANCIES`,
   `VERIFIED_ODD_AMOUNTS`, `LABEL_QUIRKS`): validation can then distinguish
   "known document defect" from "extraction regression" automatically.
9. **Determinism discipline**: fixed key order everywhere, `--check` mode
   byte-compare, and tests that join outputs (CSV↔tree↔data list) catch
   writer drift the audit numbers won't.
10. **Ask for the supplementary OCR runs.** Two different OCR engines plus
    native text = cheap adjudication panel; user-supplied runs (VL-1.6,
    PP-StructureV3) unblocked this extraction entirely.

## Open items

- None blocking. The ₱140k Metro Manila omission is documented, not repaired.
- Cross-document comparison (NEP vs HGAB HFEP, A+B analysis) is a separate
  future pass — per-document JSON outputs (`*_data_list.json`) are the
  intended inputs.

## 2nd vs 3rd reading HGAB verification (post-session check)

Question: did the HFEP extraction cover both HGAB I-B copies, and does anything
change between readings? Verified two ways:

1. **Inline (original run):** the HGAB audit's `reading_comparison` compares
   `page.get_text()` over annex PDF 877–893 of
   `HB_BUDGET/2 - HB 10858 VOL IB.pdf` (working copy) vs
   `HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf` —
   17/17 pages textually identical.
2. **Differential re-run:** full extraction re-executed with `IB` pointed at
   the 3rd-reading copy, then every artifact diffed against the retained run —
   0/826 node differences (labels, amounts, hierarchy), identical audit
   summary and ledger (₱10,021,659,000). Only `source_pdf` / `source_sha256`
   provenance fields differ (expected: different file, same content).

Conclusion: the two I-B copies print the same HFEP annex; all retained
artifacts are valid for either. Legislative-stage authenticity remains
unauthenticated (both are supplied copies).
