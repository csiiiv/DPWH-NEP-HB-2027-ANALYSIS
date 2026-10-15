# House GAB Reading Comparison: 2nd ↔ 3rd Printing

## Summary

The House bill **HB 10858** is distributed in two printings:

| Copy | PDF path | Legislative stage (as printed) | Source tree used by |
|------|----------|-------------------------------|---------------------|
| **2nd-reading copy** | `HB_BUDGET/` (Vols I-A–I-C, I-B for annexes) | "GAB 2R" / "GAB_2R" | DPWH native extraction, all three annex extractors (FMR, HFEP, NIA) |
| **3rd-reading printing** | `HB_BUDGET_3rd_reading/` (same Vol structure) | "GAB 3R" / "GAB_3R" | DPWH 3rd-reading native extraction; external GAB reference dataset |

For **DPWH operations** both readings are independently extracted and compared
(`house_reading_changes_2027.json`). For **annex workbenches** only the 2nd-reading
copy is retained as the working extraction — but the annex text was verified
identical between the two printings at page level. This document describes that
verification so it need not be re-run from scratch.

## Annex Text Identity Verification

Each annex extractor runs a deterministic `page.get_text()` comparison between
the supplied 2nd-reading `HB_BUDGET/2 - HB 10858 VOL IB.pdf` and the 3rd-reading
copy `HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf` over the
exact annex page range. All pages match with zero differences.

### FMR (Farm-to-Market Roads)

| Parameter | Value |
|-----------|-------|
| Annex pages | 667 – 726 (PDF page numbers in VOL IB) |
| Total pages compared | 60 |
| Identical pages | 60 |
| Different pages | 0 |
| Extractor | `other-analysis/extract_hgab_fmr.py` function `reading_comparison()` |
| Audit key | `audit.summary.reading_comparison_identical_pages` / `_total_pages` (both = 60) |
| Full comparison JSON | Embedded in `other-analysis/data/hgab_fmr_audit.json` → `.reading_comparison.pages[667..726]` |

Source trace:
- 2nd-reading file hash: `HB_BUDGET/2 - HB 10858 VOL IB.pdf` (SHA stored in `fmr_tree.json` → `.metadata.source_sha256`)
- 3rd-reading file: `HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf`
- Method: PyMuPDF `Document[pdf_page - 1].get_text()` equality

### HFEP (Health Facilities Enhancement Program)

| Parameter | Value |
|-----------|-------|
| Annex pages | 877 – 893 (PDF page numbers in VOL IB) |
| Total pages compared | 17 |
| Identical pages | 17 |
| Different pages | 0 |
| Extractor | `analysis-hfep/extract_hgab_hfep.py` function `reading_comparison()` |
| Audit key | `audit.summary.reading_comparison_identical_pages` / `_total_pages` (both = 17) |
| Full comparison JSON | `other-analysis/data/hgab_hfep_audit.json` → `.reading_comparison.pages[877..893]` |

### NIA (Irrigation)

| Parameter | Value |
|-----------|-------|
| Annex pages | 896 – 941 (PDF page numbers in VOL IB) |
| Total pages compared | 46 |
| Identical pages | 46 |
| Different pages | 0 |
| Extractor | `analysis-nia/extract_hgab_nia.py` function `reading_comparison()` |
| Audit key | `audit.summary.reading_comparison_identical_pages` / `_total_pages` (both = 46) |
| Full comparison JSON | Embedded in `analysis-nia/data/hgab_nia_audit.json` → `.reading_comparison.pages[896..941]` |

## Why This Matters

The Overview "Budget coverage by stage" table (and each annex workspace's own
coverage card) uses the **HGAB 2nd-reading extraction** for all three annexes.
Because the annex text is identical across readings, those figures state coverage
for HGAB 3rd without needing a separate 3rd-reading annex extraction.

If a future edition of HB 10858 were to change any annex page between readings,
the extractor would flag the mismatch and refuse to build (each workspace adapter
runs `ensure(identical === total)`). A separate 3rd-reading annex extraction
would then be required.

## CI Evidence

- The extractor functions run inside `--check` mode on every CI build (see
  `.github/workflows/pages.yml` lines 108–131):
  ```bash
  python3 other-analysis/extract_hgab_fmr.py --check
  python3 analysis-hfep/extract_hgab_hfep.py --check
  python3 analysis-nia/build_nia_workbench.py --check
  ```
- Page-level identity counts are baked into the audit JSON artifacts that the
  browser datasets depend on; if an extractor output changes, the `--check`
  diff fails.
- Frontend tests assert the exact page counts per workspace
  (`analysis/web/src/mainOverview.test.js`):
  ```js
  assert.equal(byKey.fmr.readings.third.verified_identical_pages, 60);
  assert.equal(byKey.hfep.readings.third.verified_identical_pages, 17);
  assert.equal(byKey.nia.readings.third.verified_identical_pages, 46);
  ```

## Quick Reference: Reproducing

If you ever need to reproduce this verification outside CI:

```bash
# Install dependencies
python3 -m pip install pymupdf

# Re-run all three comparisons (these are embedded in the extractors):
python3 other-analysis/extract_hgab_fmr.py          # prints audit summary incl. reading_comparison_total_pages=60
python3 analysis-hfep/extract_hgab_hfep.py           # prints ...total_pages=17
python3 analysis-nia/extract_hgab_nia.py             # prints ...total_pages=46

# Or run just the comparison function interactively:
python3 -c "
from other_analysis.extract_hgab_fmr import reading_comparison as fmr_rc
from analysis_hfep.extract_hgab_hfep import reading_comparison as hfep_rc
from analysis_nia.extract_hgab_nia import reading_comparison as nia_rc
for name, rc in (('FMR', fmr_rc), ('HFEP', hfep_rc), ('NIA', nia_rc)):
    c = rc()
    print(f'{name}: {c[\"identical_pages\"]}/{c[\"total_pages\"]} identical')
"
```

The comparison uses only local PDFs — no network access, no external data.

## Related Documentation

- [DPWH GAB 2nd ↔ 3rd reading change ledger](../data/house_reading_changes_2027.json)
  — independent comparison under a retained matching key (far larger set than
  the annex pages).
- [External GAB reference cross-check](gab_fy2027_reference_crosscheck.md)
  — corroborates both native readings against the `kimileeee/gab-fy2027-dataset`.
- [Main overview coverage table plan](main_overview_page_plan.md)
