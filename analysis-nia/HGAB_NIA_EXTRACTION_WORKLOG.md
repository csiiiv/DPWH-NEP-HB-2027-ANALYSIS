# HGAB NIA extraction worklog: process, issues, and fixes

Built on **12 October 2026**. This is the engineering record behind
[README.md](README.md) — what was done, in what order, what broke, and how each
problem was resolved until the annex and agency-table totals reconciled. The
method follows the budget-PDF discipline established in
[`other-analysis/FMR_EXTRACTION.md`](../other-analysis/FMR_EXTRACTION.md) and
[`analysis/docs/pdf_budget_dataset_method.md`](../analysis/docs/pdf_budget_dataset_method.md).

Source: `HB_BUDGET/2 - HB 10858 VOL IB.pdf`, SHA-256
`a82800c4cc2684566a37f7780d8f9131d2e7b2c97444d335d94df012dec065b6`.
Annex PDF pages **896–941** (printed **874–919**); agency controls on PDF
**568/570** (printed **560/562**).

## What was done, in order

1. **Studied the existing pattern.** Read `other-analysis/extract_hgab_fmr.py`
   (ruled-cell geometry), `extract_nep_fmr.py` (raster rules + OCR words), their
   audits, docs, and tests. Adopted the same artifact contract: source rows →
   tree → audit → CSVs, with `--check` determinism and corruption tests.
2. **Probed the annex geometry before writing any extractor.** Checked vector
   drawings, fonts, word coordinates, bold spans, amount-token positions,
   furniture outside the content band, and page-boundary behavior across all 46
   pages.
3. **Pre-validated the arithmetic by hand** (Python sums over probed control
   amounts) so the extraction target was known before code existed.
4. **Prototyped the row model** in a throwaway script to test indent/bold/amount
   assumptions against every page.
5. **Wrote `extract_hgab_nia.py`**, iterating on the failures listed below.
6. **Rendered evidence crops** of the four structurally decisive pages and
   visually confirmed two of them.
7. **Wrote 12 regression tests** including deliberate corruptions, fixed two
   validator gaps the tests exposed.
8. **Documented** the annex in `README.md` and linked it from the repo root.

## Why a new layout profile was needed

The FMR extractor keys on **ruled-cell geometry** — three vertical rules and
full-width horizontal rules per page. The probe found **zero usable rules** in
the NIA annex: drawings are only fill rectangles (page frame, header underlines).
The NIA annex is an **un-ruled, indented layout** with these signals instead:

| Signal | Controls (6 sub-programs) | Program heading | Projects |
|---|---|---|---|
| First-word x | ≈50.4 (even pages) / ≈63.9 (odd) | 51.1 | ≈114.3 / ≈127.8 |
| Font | Tahoma-Bold | Tahoma-Bold | Tahoma |
| Amount | right-aligned, x≥523, bold | none | right-aligned, x≥523, regular |

Other established facts from probing:

- Labels end by x≈502; the amount column starts at x≥523.3 — a clean separator
  that keeps title-embedded numbers out of the money column.
- Amounts sit on the **first line** of a row; wrapped text continues on
  following lines at the project indent.
- **No title wraps across a page boundary** — every page's first content line
  carries an amount. (Verified for all 46 pages.)
- The content band is y 58–748 on continuation pages; PDF 896 additionally
  carries the annex title block above the table.
- Outside the band there is only running-header/footer furniture (page number,
  "GENERAL APPROPRIATIONS BILL, FY 2027" / "NATIONAL IRRIGATION ADMINISTRATION -
  PROGRAMS/ACTIVITIES/PROJECTS", column headers).
- A bold `:` span on PDF 897 is a font quirk inside a project title, not a
  heading.
- A naive text search for `LAT`/`LONG` hit 52 pages — all false positives from
  "Lateral"/"along". Unlike FMR, **the NIA annex has no coordinate column**.

## Issues encountered and how each was fixed

### 1. FMR ruled-cell approach inapplicable
- **Symptom:** zero horizontal/vertical vector rules on any NIA annex page.
- **Fix:** built a layout profile from indent + bold font + amount-column
  position, with hard guards (bold/indent conflicts raise immediately).

### 2. Prototype title assembly was backwards
- **Symptom:** the first prototype joined continuation lines *before* the
  amount-bearing line, producing garbage control labels ("with Battery
  IRRIGATION SYSTEMS DEVELOPMENT PROGRAM Establis…") and "trailing
  continuation" warnings at 34 page ends.
- **Note:** its **sums were already correct** (₱17,999,305,000; per-control
  matches), which proved amount attribution and role detection while isolating
  the bug to title assembly.
- **Fix:** rows open with their amount line (`title_lines`), and subsequent
  amount-less lines at the project indent append to `continuation_lines`. A
  control/heading line resets the open row, so continuation chains never cross
  a control boundary.

### 3. Control-indent threshold off by a fraction
- **Symptom:** `Non-bold control indent row on PDF 896: 'Abra River Irrigation
  System…'` — the first project was classified as a control.
- **Root cause:** `CONTROL_INDENT_X = 115.0`, but projects start at x≈114.3.
- **Fix:** threshold set to 100.0, safely between 63.9 and 114.3.

### 4. Page-scope check too strict
- **Symptom:** `Project row before any control on PDF 897`.
- **Root cause:** the guard was per-page, but continuation pages legitimately
  open with project rows under the current control.
- **Fix:** made the check global (`saw_control` flag); each page still must open
  with a complete row start (enforced separately and verified).

### 5. Agency reader assumed wrapped labels only
- **Symptom:** `Agency amount row without label: '13 IRRIGATION SYSTEMS
  RESTORATION PROGRAM 9,174,255,000…'`.
- **Root cause:** the agency PAP table prints label and amounts on the *same*
  line for most rows; only some rows (e.g. Communal, Extension/Expansion) wrap
  the label across lines.
- **Fix:** the reader accepts a same-line label segment, combined with any
  pending wrapped label lines.

### 6. Wrapped agency label segments in wrong order
- **Symptom:** label came out as "SYSTEM SUB-PROGRAM EXTENSION/EXPANSION OF
  EXISTING IRRIGATION".
- **Root cause:** same-line label was prepended before pending wrapped lines.
- **Fix:** order is `pending + same-line segment`.

### 7. Tree parenting bug crashed the CSV stage
- **Symptom:** `IndexError` building `hgab_nia_subprograms.csv` — zero rollup
  checks existed.
- **Root cause:** in `build_tree`, project rows never re-assigned `parent` to
  the current sub-program (an over-clever conditional-expression attachment),
  so no project was parented and every control was childless.
- **Fix:** explicit `if/elif/else` per role; sub-program → projects, first three
  sub-programs → annex root, last three → printed Development heading.

### 8. Synthetic root broke row-ownership coverage
- **Symptom:** ownership check failed after adding the synthetic annex-title
  root node (it has no source row).
- **Fix:** ownership counts exclude `kind == "annex_program"`; the root keeps
  its own evidence checks (title text + bbox).

### 9. Amount tokens leaked into control labels
- **Symptom:** every agency sub-program control came back
  "unmatched" — annex labels were `"National Irrigation System Sub-Program
  5,471,255,000"`.
- **Root cause:** `label_raw` was built from the full line text, which includes
  the amount token sharing the first line.
- **Fix:** lines now carry both `text` (all words) and `label_text` (words
  outside the amount column); `word_indices` keep full ownership for coverage
  checks while labels exclude money.

### 10. Singular/plural label variant between annex and agency table
- **Symptom:** after fix 9, the two "Other Irrigation System**s** Sub-program"
  agency rows still matched nothing — the annex prints "Other Irrigation System
  Sub-Program" (singular).
- **Fix:** explicit `AGENCY_LABEL_ALIASES` mapping, with amount-based
  disambiguation: the ₱460,000,000 row matches the annex control; the
  ₱698,067,000 row is recognized as **agency-only** (CARP-linked via special
  provision 3, printed 560) and validated against the Development/Operations
  roll-ups instead of an annex control.

### 11. Validator gaps exposed by corruption tests
- **Symptom A:** dropping a tree node raised `KeyError` inside `walk` (dangling
  `child_ids`). **Fix:** skip unknown child references during traversal; the
  coverage checks still fail the audit.
- **Symptom B:** swapping two equal-amount projects between sub-programs passed
  the audit — nothing tied a project to its printed parent. **Fix:** added
  `printed_heading_parent_disagreement`, deriving expected parents from source
  row order (the FMR pattern).
- **Symptom C:** the CARP test matched "CARP" in three notes. **Fix:** the
  agency-only row is identified by its note prefix (`agency-only scope`).
- **Symptom D:** the numeric-token test guessed row IDs that were off by three
  (r12/r13 vs actual r15/r17). **Fix:** verified against the emitted audit
  artifact instead of assuming — a reminder that row numbers count every row on
  the page, including headings.

### 12. Minor tooling friction
- A first probe heredoc crashed (`TypeError` on tuple indexing) and a follow-up
  had a syntax error; probes moved to a temp file. The first extractor draft
  carried dead drafting code (an unused line-enumeration block, duplicate
  `build_tree`/`attach_root`, no-op statements in `validate`); the file was
  rewritten clean before first successful run.
- `--check` flagged stale outputs after each code edit — expected behavior of
  the contract (extractor hash is embedded in metadata); artifacts were
  regenerated and the final state passes byte-for-byte.

## Reconciled totals

Internal controls (all pass, difference 0):

| Sub-program | Control (PHP) | Projects | Project sum (PHP) |
|---|---:|---:|---:|
| National Irrigation System | 5,471,255,000 | 217 | 5,471,255,000 |
| Communal Irrigation System | 3,243,000,000 | 215 | 3,243,000,000 |
| Other Irrigation System | 460,000,000 | 5 | 460,000,000 |
| Establishment of Pump Irrigation | 8,466,950,000 | 354 | 8,466,950,000 |
| Special Irrigation | 158,100,000 | 26 | 158,100,000 |
| Extension/Expansion of Existing Irrigation System | 200,000,000 | 11 | 200,000,000 |
| **Annex total** | **17,999,305,000** | **828** | **17,999,305,000** |

Agency-table cross-checks (11/11 pass; MOOE and Total read as separate columns,
and every irrigation row's MOOE equals its Total):

| Agency row | Agency (PHP) | Reconciles to |
|---|---:|---|
| IRRIGATION SYSTEMS RESTORATION PROGRAM | 9,174,255,000 | = NIS + CIS + Other annex controls |
| IRRIGATION SYSTEMS DEVELOPMENT PROGRAM | 9,523,117,000 | = annex group 8,825,050,000 + agency-only CARP row 698,067,000 |
| Sub-total, Operations | 18,697,372,000 | = annex total + CARP row |
| Six sub-program rows | each | = matching annex control |
| Other Irrigation Systems Sub-program (CARP) | 698,067,000 | agency-only; flagged, not merged |
| TOTAL NEW APPROPRIATIONS | 45,172,024,000 | scope context: the annex is not the whole NIA budget |

Coverage: **12,775 content words** assigned exactly once across 835 source rows
(828 projects, 6 controls, 1 printed heading); **554 furniture words**
classified; no unexplained amount-like tokens anywhere on the 46 pages.

## Validation status

- `python3 analysis-nia/extract_hgab_nia.py --check` — deterministic rebuild
  passes byte-for-byte.
- `python3 -m unittest discover -s analysis-nia/tests -v` — **12/12 tests**,
  including corruptions that must fail: dropped project, dropped/double-owned
  word, offsetting cross-sub-program errors with an unchanged root total,
  swapped equal-amount projects, altered agency MOOE/Total values.
- `other-analysis` suite still passes (45 tests) — no shared files touched.

## Remaining evidence limits

- No row-by-row rendered-image review (`comparison_ready: false`).
- The annex title-root node is a derived container, clearly marked `derived`.
- No NEP-side extraction yet; the DBM NEP `NIA.pdf` shows a printed
  "IRRIGATION SYSTEMS RESTORATION PROGRAM" heading and an NIS control of
  ₱4,662,231,000 vs the House copy's ₱5,471,255,000 — an unexplained
  ₱809,024,000 divergence reserved for follow-up work.
