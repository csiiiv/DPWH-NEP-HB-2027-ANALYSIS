# HB 10858 native text-layer assessment

**Current context — 9 October 2026:** this report retains its original extraction/crosscheck scope. The additive House control baseline is [Native I-B](../../data/hb_dpwh_native_rollup.json); named local projects still require Native I-C. See [independent source verification](../../docs/source_hierarchy_verification.md) before using these candidates in comparisons.

Question: is the HB PDF data more parsable than typical PDFs, and would retrieval be easier?

**Short answer: yes — decisively.** All four volume PDFs are native Adobe InDesign digital documents (Creator: InDesign 21.4, Producer: Adobe PDF Library 18.0), not scans. They carry a complete embedded text layer with glyph coordinates and fonts. The PaddleOCR-VL markdown currently in `HB_BUDGET/` was produced by OCR-ing digital PDFs and is *noisier than the source*.

## Evidence

### 1. Native text coverage is near-total

| Volume | Pages | Thin/empty text pages | Share |
|---|---:|---:|---:|
| VOL IA (full) | 1,339 | 1 | 0.1% |
| VOL IB (DPWH) | 982 | 19 | 1.9% |
| VOL IC | 942 | 6 | 0.6% |
| VOL II | 610 | 0 | 0.0% |

Thin pages are dividers/section covers, not missing content. No OCR required for 98–100% of pages.

Raw `pdftotext` yields per volume: IA 3,086,490 chars; IB 2,771,812; IC 2,162,951; II 1,228,297 (~9.2M total).

### 2. The native layer preserves table structure via coordinates

Using `pymupdf` word extraction (x/y per token), the DPWH detail tables have a completely stable geometry (VOL IB, 648×792pt pages):

- **Columns**: Capital Outlays amounts start at x≈463–479; Total at x≈537–552; the right-margin line-number echo at x≈588.
- **Hierarchy via indentation** (a stronger signal than any OCR can give):
  - PAP heading: x≈74–88
  - Region heading: x≈80–94
  - DEO/office row: x≈102
- **Wrapped PAP headings** (e.g. "…Roads with Slips, Slope / Collapse and Landslide - Primary Roads") are two consecutive rows at identical x — trivially re-joined.
- Printed line numbers (1, 2, 3…) exist on both margins as row anchors.

### 3. Balance proof — first-pass parse, zero repairs

Parsed `Preventive Maintenance - Secondary Roads` (PDF pages 28–31, VOL IB) directly from the native layer with a ~60-line prototype:

- Printed PAP control: ₱14,433,303,000
- Parsed 65 DEO-level rows summing to ₱14,433,303,000 — **exact balance**
- All 15 regional subtotals re-derived from their DEO children — **15/15 exact** (e.g. NCR 9,761,280,000 = 9,649,276,000 + 40,803,000 + 25,500,000 + 22,889,000 + 22,812,000)

This is one of the sections the OCR pipeline needed heavy repair on (repair log: maintenance PAPs 618→737 rows, ₱25.8B→₱36.1B). Under the native layer it balances on the first attempt.

### 4. Grand controls verbatim in text layer

VOL IB page 9 prints `654,102,015,000` (TOTAL NEW APPROPRIATIONS, DPWH) directly extractable — matches the audited control in `hb_json_usability_audit.md`.

## Why the OCR markdown *looked* structured but wasn't

The PaddleOCR MD renders HTML tables, which suggests fidelity, but exhibits systematic defects absent from the native layer:

- Column bleed: subtotals landing in the wrong column ("Sub-total, Support to Operations" row shows `40,401,000` — a Capital Outlays value — in the Total column).
- `P` currency prefixes split into separate cells (`P | 980,954,000`), and concatenated cells (`980,954,000 P`).
- Row/cell scrambling when wrapped headings and blank line-number rows interleave.
- Duplicate header fragments and stray page furniture ("DS", "1”").

Every one of the 15 repaired sections in `hb_known_defect_repairs.md` is consistent with OCR-scramble damage, not with the printed document.

## Caveats

- ~1–2% thin pages per volume need a page-level emptiness check (dividers are expected; anything else falls back to OCR).
- `P` prefixes and the two-column duplicate amounts (CO and Total often identical) still need token-level handling — but with coordinates this is deterministic, not heuristic.
- The split "Part 1/Part 2" PDFs of VOL IA are redundant; the full `1 - HB 10858 VOL IA.pdf` is the better source (Part 1 has no OCR artifacts at all — none were ever generated).
- Volumes use different dominant fonts per section (Rockwell Condensed in DPWH details vs Arial/Courier elsewhere); indent thresholds must be derived per-section rather than hard-coded.

## Recommendation

1. **Rebuild House extraction from the native text layer** (pymupdf words + x-indent hierarchy + printed line-number anchors). Expected outcome: most of the v3→v5 repair chain becomes unnecessary because the underlying defects were OCR-induced.
2. **Keep PaddleOCR outputs only as a cross-check** for the thin pages and as a secondary validation channel.
3. **Re-attack the four unresolved Convergence PAPs** (BIP Access Roads −₱2.24B, BIP Multi-Purpose −₱5.12B, Water Supply +₱0.30B, Coastal Roads +₱1.46B — the remaining ₱5.596B net gap) with the native parser first; if the printed rows exist, they are in the text layer verbatim.

Prototype validation code for this assessment is reproducible with: `pymupdf` → `page.get_text("words")` → y-cluster rows → strip line-number echoes (x≈41–45 and x>580) → classify by label x-start → sum CO column per DEO row.
