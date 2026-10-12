# Parsing Degraded Budget Annex PDFs — Methodology & Lessons Learned

> **Case study:** DBM NEP FY2027 NIA Irrigation annex (`dbm-other-nep-line-data/NIA.pdf`, 30 pages, scanned CCITT images with an embedded OCR text layer).
> **Result:** 791 project rows, ₱17,598,181,000 — **exact reconciliation against all six sub-program controls, zero manual amount overrides.**
> **Purpose:** a reference for the next degraded budget annex (HFEP, FMR, another NEP agency, or a future NIA reading), so the same dead ends are not walked twice.

Companion documents: [NEP_NIA_EXTRACTION_FINDINGS.md](NEP_NIA_EXTRACTION_FINDINGS.md) (final technical findings), [HGAB_NIA_EXTRACTION_WORKLOG.md](HGAB_NIA_EXTRACTION_WORKLOG.md) (the native-text-layer sibling extraction), [other-analysis/FMR_EXTRACTION.md](../other-analysis/FMR_EXTRACTION.md) (ruled-grid method).

---

## 1. The one-paragraph method that emerged

Trust the **embedded text layer for amounts**, trust **geometry for structure**, and use **high-DPI renders only as a court of appeal — anchored to the exact token bounding box**. Recover the table by grouping words into visual lines within a body band, right-align-match the amount column, attach continuation lines to the row above, and validate by exact arithmetic against printed sub-program controls. Every deviation from a naive read (recovered rows, regex exceptions, dedupes, label repairs) is recorded as a **flag on the row** in the final JSON, never silently normalized away.

---

## 2. Chronology: what was tried, in order

### Phase 0 — Reconnaissance (before any extractor code)

Read the HGAB NIA extraction (native text layer, ruled geometry) and the FMR extraction (raster rules + OCR) to inventory the existing patterns. Probed the NEP NIA PDF and immediately found the defining constraint: **it is a scan**. There are no vector rules, no fonts, no bold spans — only CCITT images plus an OCR text layer of unknown quality. The HGAB method (indent + bold + rules) was therefore **not portable**; the FMR raster method was the closer ancestor.

**Lesson:** classify the PDF (native vs scanned vs hybrid) before choosing a method. `page.get_text("words")` returning words with coordinates but `page.get_drawings()` returning nothing is the signature of a scanned page with an OCR layer.

### Phase 1 — Embedded OCR layer as primary source

`get_text("words")` turned out to carry **full coordinates** and near-complete content. Early probes found the two systemic degradations that shaped everything after:

- **Five of six sub-program control headings are shredded or dropped** (e.g. the CIS control survives only as `—1.620.000.000` — periods for thousands, leading em-dash). The heading *text* is unusable; only the heading *positions* are stable.
- **~25 project labels on p18 are missing** from the word layer (amounts present, labels absent — SPIP rows).

But crucially: **amount tokens were intact.** This asymmetry (structure shredded, data reliable) drove the design: derive segment boundaries from *position*, not text, and treat every amount as trustworthy until proven otherwise.

### Phase 2 — Supplementary OCR (PaddleOCR-VL 1.6)

`NIA.pdf_by_PaddleOCR-VL-1.6.json/.md` provided independent OCR with table recognition. Findings:

- Table HTML produced on only ~15 of 30 pages; on the rest table detection failed and output is flowing text.
- Where present, it **confirmed segment transitions and control amounts**, and correctly read the trailing-period Nagas-Maramba amount.
- It is an **independent witness, not a replacement**: its per-cell segmentation differs from the printed geometry and cannot be diffed row-for-row mechanically.

**Lesson:** a second OCR engine is for cross-examination of specific contested facts (controls, segment starts, anomalous rows), not for bulk extraction. Bulk extraction should stay on the engine with coordinates.

### Phase 3 — Copy-paste text (the user-driven pivot)

Copy-pasting pages out of a PDF viewer (`NIA_copy_pasted.txt`) produced cleaner-looking reading-order text — amounts map to first lines, following lines are label overflow. Two problems killed it as a primary source:

- **Page attribution is unreliable**: only ~15 of 30 header/footer markers survived the copy. A row cannot be provenanced to a page.
- It is the **same OCR layer** reflowed, so it inherits every OCR error while losing the coordinates needed to detect them.

It remained useful as a reading-order sanity check (title continuation flow).

### Phase 4 — Per-page `get_text` dump with explicit page markers (the synthesis)

The winning structural aid: dump `doc[p].get_text("text")` per page into one file with `===== [PDF PAGE n] =====` separators (`data/nia_pdf_text_by_page.txt`). This preserves copy-paste's reading-order clarity **and** guarantees page attribution. It enabled:

- per-page row counting (amount-only lines) as an independent tally,
- locating where segments begin by reading around page boundaries,
- diffing parser output page-by-page during debugging.

**Lesson:** when copy-paste feels cleaner than API text, don't switch sources — rebuild the copy-paste *view* from the API with the metadata (page numbers) restored.

### Phase 5 — Geometry extractor (v1…v9)

The extractor itself went through nine versions. The bug classes, in the order they surfaced:

| Version | Bug class | Root cause | Fix |
|---|---|---|---|
| v1–v7 | wrong segment boundaries | heading text unreadable | hardcode segment starts as `(page, y)` bands, verified by renders + PaddleOCR-VL |
| v8 | 16 "amount errors" fixed by hand | **verification renders mis-cropped** — clipped leading digits (`9,500,000` read as `5,000,000` in a crop) | all 16 overrides reverted in v9; renders re-anchored to token bbox |
| v8 | 7 rows missing | body band ended at y≤768, but footers are absent from the word layer so genuine rows live down to y≈775 | band widened to y≤780 |
| v8 | 1 row missing | amount printed `15,000,000.` with trailing period; strict regex rejected it | regex now `^\d{1,3}(?:,\d{3})+[.,]?$` |
| v8 | 1 row double-counted | word-grouping emitted two overlapping sets at the same y | dedupe by `(page, round(y0))` |
| v8 | 2 rows merged | label↔amount y-skew 2.6pt exceeded the 2.2pt grouping tolerance | tolerance 2.8pt (continuation pitch is 10.2pt, so the margin is wide) |
| v9 | — | all six controls exact, 791 rows | **final** |

### Phase 6 — Provenance dataset + this document

v9's reconciliation made manual overrides unnecessary, so every surviving special case is now a *flag on a row* rather than a code path. The final artifact is `data/nep_nia_dataset.json`: 791 projects, each with raw token, bbox, page/y/x, word indices, continuation count, normalization rules in force, and the full flag registry (26 flagged rows: 16 `amount_adjudicated`, 7 `bottom_band_row`, 2 `label_repaired`, 2 `label_quirk`, 1 `trailing_period_amount`, 1 `prior_version_double_count`).

---

## 3. The five hard-won lessons

### 3.1 Verification crops must be token-anchored

The most expensive mistake of the project. A verification render that crops a *column region* at low zoom can clip the leftmost digits of an amount; the human (or model) reading the crop then "corrects" a correct value. Every v8 `AMOUNT_FIXES` entry came from such crops. The rule that fixed it:

```python
# anchor to the token bbox, pad symmetrically, zoom hard
clip = pymupdf.Rect(x0-4, y0-5, x0+85, y0+11)   # token x0, not column x
pix = page.get_pixmap(matrix=pymupdf.Matrix(12, 12), clip=clip)
```

Render at 12x–14x, pad a few points on each side, and the printed digits are unambiguous. If a crop disagrees with the text layer, **suspect the crop first**.

### 3.2 The embedded OCR layer can be authoritative for digits even when it is garbage for structure

Every one of the 16 suspected digit errors was disproven. The OCR engine that shredded headings and dropped 25 labels still read every comma-grouped amount correctly. Amounts are the high-value tokens (right-aligned, isolated, uniform font) — exactly what OCR does best. **Do not bulk-correct amounts from another source without per-row render proof.**

### 3.3 Arithmetic is the only complete validator

Row-count checks and coverage percentages all missed the v8 bugs (a doubled row and a dropped row can offset; two 10M rows swapped between sub-programs preserve everything but truth). The validator that caught every real bug was:

```
for each sub-program:  sum(project amounts) == printed control   (exact integer equality)
grand total:           sum(all) == sum(controls)                (exact)
row keys:              (page, y0) unique, sorted                (order + dedupe)
```

Exact equality, not tolerance. A scanned annex with 791 rows reconciling to the peso is achievable; accept nothing less before declaring done.

### 3.4 Recovery lists are completeness controls, not extraction paths

The 9 rows once recovered by hand (`EXTRA_ROWS`) are still listed in the extractor, but the v9 parser now captures all of them automatically; the list serves as an assertion set (deduped on capture, tested individually). Hand-recovered rows rot; hand-written assertions about rows the parser must find do not.

### 3.5 Page attribution is non-negotiable

Any working aid that loses page attribution (copy-paste text, de-paged OCR output) will eventually mislead. Every artifact we kept — word lists, per-page dump, source rows, dataset — keys rows to `(page, y0)`. That key is also what makes flags, crops, and tests able to reference a row unambiguously.

---

## 4. Data-source scorecard

| Source | What it is | Verdict |
|---|---|---|
| Embedded OCR word layer (`get_text("words")`) | coordinates + text, same engine as the scan's OCR | **Primary.** Amounts authoritative; structure degraded |
| Per-page `get_text` dump with markers | reading-order text, guaranteed page keys | **Structural aid.** Best for segment starts, per-page tallies |
| Copy-paste export | same layer reflowed, pages unreliable | Reading-order sanity check only |
| PaddleOCR-VL 1.6 JSON/MD | independent OCR + table HTML on half the pages | **Witness.** Controls, segment transitions, contested rows |
| 12x–14x token-anchored renders | pixels of the printed page | **Court of appeal.** Final arbiter for contested values |
| Printed control totals | six sub-program sums + grand total | **The validator.** Exact match is the done criterion |

---

## 5. Reusable extraction profile (scanned annex, no rules)

1. **Classify** the PDF: `get_drawings()` empty + `get_text("words")` populated ⇒ scanned-with-OCR ⇒ this profile.
2. **Find the amount column**: histogram word x0 for tokens matching `^\d{1,3}(?:,\d{3})+[.,]?$`; the amount column is a tight x0 cluster near the right edge (~520–580 here).
3. **Set the body band** from y-histograms of amount tokens, then **extend the bottom** until the last amount-bearing line — footers may be absent from the word layer, so "low" is not "furniture".
4. **Group words into visual rows** by y with tolerance just above the max label↔amount skew (measure it; 2.8pt here vs 10.2pt continuation pitch).
5. **Amount-right, label-left** split at the amount column x0; continuation lines (no amount token) append to the row above, unless they match heading fragments.
6. **Segment boundaries** from page-boundary reading + renders + a second OCR engine; encode as ordered `(page, y)` bands assigning each row to the latest start above it.
7. **Validate exactly** against printed controls; every residual diff must resolve to a named row with a rendered crop.
8. **Flag, don't fix**: trailing punctuation, dedupes, label repairs, adjudications, quirks — all become per-row flags in the final JSON.
9. **Test the invariants**: exact tallies per segment, unique sorted `(page, y0)` keys, specific recovered rows present with specific amounts, CSV/JSON roundtrips, pinned source hashes.

Constants that worked here (re-measure per document): amount regex above · amount x0 ≥ 520 · heading indent floor x0 < 135 · body band y 62–780 · row tolerance 2.8pt · row pitch ~20.4pt.

---

## 6. What to do differently next time

- **Render the token-anchored crop on the first suspicion, not the tenth.** v8's entire override episode would have been one afternoon instead of three.
- **Compute the label↔amount skew distribution before choosing grouping tolerance** (it was measurable: max 2.6pt vs pitch 10.2pt).
- **Start the per-page dump on day one**; it costs one minute and answers half the structural questions.
- **Treat "amount looks odd" as a rendering problem until proven otherwise.** In a coordinate-bearing OCR layer, isolated right-column amounts are the most reliable tokens in the document.
- **Write the flag registry during extraction, not after.** Reconstructing why v8 did what it did was archaeology; recording the decision when it is made is provenance.

---

*Built 12 October 2026 · NEP NIA annex v9 · 791 rows · ₱17,598,181,000 · all controls exact.*
