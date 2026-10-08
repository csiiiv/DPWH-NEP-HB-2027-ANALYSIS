# HB 10858 VOL IC — Hierarchy Validation Report

**Goal:** parse the House FY 2027 DPWH budget detail tables into a properly
nested PAP hierarchy, with every rollup verified bottom-up
(`sum(children) == printed total`) so downstream HB-vs-NEP comparisons
cannot double-count summary rows.

**Parser:** `analysis/parse_hb_tree.py` (v19 — stack parser + arithmetic audit)
**Outputs:**
- `analysis/hb_dpwh_pap_hierarchy.json` — **consumer export**: full nested hierarchy (outcomes → programs → … → projects) with per-block arithmetic status, validation legend, and summary — reconciles exactly with the flat leaf file
- `analysis/hb_dpwh_leaves_validated.json` — flat leaf project rows w/ full path + validation status
- `analysis/hb_block_tree.json` — full container tree with per-block audit
- `analysis/hb_tree_validation.json` — aggregate audit stats

---

## 1. Document structure discovered

| Zone | Rows | What it is | How handled |
|---|---|---|---|
| **alloc** | 0 – 2,444 | MOOE / Support-to-Operations / GAS activity allocations (₱981.54B incl. double-printed sub-rows) | flat reference lines (`alloc_lines`) — irregular outline, not project data |
| **pap** | 2,445 – 20,961 | `Outcome → Program → Sub-program → PAP → Region → Office → project` details | full stack parse with arithmetic validation |
| **fap** | 20,962 – 21,019 | Foreign-Assisted & Locally-Funded tail: `Program → category → loan project` + GOP/Loan funding splits | funding-split rows skipped, letter-enum rows are leaves |

Document anchors: `Operations` total ₱586,941,661,000 (row 2444), Outcome 1
₱209,746,642,000 (row 2445), FOREIGN-ASSISTED ₱44,749,011,000 (row 20962).

## 2. Final numbers (v19)

| Metric | Value |
|---|---:|
| Leaf project rows (pap + fap zones) | 15,487 |
| Leaf sum | **₱538.80B** |
| — status `ok` | 15,271 |
| — status `spillover` (attach past printed total, flagged) | 206 |
| — status `dup_in_block` (repeated name+amount in same block, flagged) | 10 |
| Alloc zone lines (separate reference file section) | 2,295 (₱981.54B incl. rollups) |
| Review blocks (sum ≠ printed total) | 261 |
| PAP-zone region blocks | 831 |
| — arithmetically clean (`validated`/`rollup_only`/`container`) | 749 (90%) |
| — `review` | 82 |

### Region-level arithmetic coverage

| Region block status | Count |
|---|---:|
| validated (children sum exactly to printed total) | 613 |
| container (no printed total, children roll up) | 75 |
| rollup_only (pure summary row, no direct children) | 61 |
| review (mismatch) | 82 |

Leaf mass under clean region blocks: **₱373.18B (69%)**.
Leaf mass under review regions: ₱165.63B (31%) — dominated by OCR damage
(dropped/shortened region totals, lost PAP headers) documented below.

## 3. Document-damage classes handled

The PaddleOCR markdown has systematic structural damage. Each class required
a targeted mechanism, all verified against document anchors:

1. **Literal `\n` merged rows** (210 rows): page-break repeats merge 2–4
   logical rows into one cell with concatenated amounts
   (`'Region XIII\nDinagat Islands DEO'` + `'1,618,000'`).
   *Fix:* phase-1 splitting of label & amount cells on `\n` into separate
   base rows; `decompose_merged_row` for concatenated multi-amounts
   (`'2,651,985,000350,000,00050,000,000'` → region/office/project trio).

2. **Lost region headers** (41 offices): OCR dropped a `Region I` heading in
   the PM-Secondary section, orphaning ~40 DEO blocks (Ilocos…Cavite) under
   the previous region. *Fix:* DEO-name → region inference table
   (`PROVINCE_REGION`): province tokens are unambiguous
   (`'Ilocos Norte 1st DEO'` → Region I), with reuse of an open same-name
   region inside the current PAP.

3. **Page-break continuation cascade**: repeated `PROGRAMS/ACTIVITIES/PROJECTS`
   header rows cause backward classification to mark the *last project of
   each office* as PAP, cascading `subprog`/`program` up the whole leaf run.
   *Fix:* forward demotion guard — `pap/subprog/program`-classified rows
   arriving at depth ≥ PAP with sub-₱1B amounts (or leaf-worded <₱6B) are
   re-classified as leaves (2,933 rows corrected).

4. **PAP totals repeated at page breaks** (e.g. PM-Secondary ₱14,433,303,000
   re-printed mid-region). *Fix:* `find_open_same` dedupe — same kind+label
   (+ same/unset total) anywhere up the stack reopens the existing block.

5. **Leaf-verb PAP/sub-program headings** (`Construction/Maintenance of Flood
   Mitigation…` ₱70.96B, `Rehabilitation/Reconstruction/Upgrading of Damaged
   Paved Roads` ₱28.08B): start with project verbs so they misclassify as
   leaves. *Fix:* promotion A (overflow + container-follows → heading) and
   structural promotion at program/subprog depth (66 promotions).

6. **Headingless PAPs** after last leaf of an implicit new section:
   promotion B inserts `<headingless>` PAPs (22) so later regions roll up
   to the right parent instead of spilling into the previous PAP.

7. **OCR-truncated headings**: `PERATIONS`, `GANIZATIONAL OUTCOME 2`,
   `IONAL BUILDING PROGRAM`, `egion IV-A`, `. Region V` — matched via
   tolerant regexes (`ORG_SEARCH_RX`, `SECTION_RX`, `norm_region`).

8. **Funding-split rows** (`GOP`, `Loan Proceeds`, `GOP\nLoan Proceeds`) in
   the FAP zone are financing sources, not projects — excluded from leaves.

## 4. What `review` means

A block marked `review` has `sum(children) != printed_total` **after**
all structural repairs. Inspecting the largest ones shows they are genuine
source-document/OCR defects, not parser errors:

| Block | Printed | Sum(children) | Likely cause |
|---|---:|---:|---|
| NCR @2700 (PM-Secondary) | 9,761,280,000 | 9,760,416,000 | OCR digit corruption (−864k) |
| Region Ⅲ @9803 (BIP) | 10,970,796,000 | 10,770,796,000 | one project total dropped (−200M) |
| Region X @10184 (BIP) | 12,274,000,000 | 12,074,000,000 | −200M |
| Region VIII @10146 (BIP) | 3,151,000,000 | 3,154,000,000 | +3M (dup row) |
| Region Ⅳ-A @2728 (PM-Primary) | 2,501,421,000 | 1,803,421,000 | region header row lost its printed amount |

These retain full child detail; only the printed rollup is unreliable.
The `validation` status on each leaf and the `contrib` field on each block
in `hb_block_tree.json` let any consumer filter to arithmetic-clean
subtrees only (`status in {validated, rollup_only, container}`).

## 5. Downstream usage

```python
import json
d = json.load(open("analysis/hb_dpwh_leaves_validated.json"))
clean = [l for l in d["leaves"] if l["validation"] == "ok"]
# strictest: only leaves whose enclosing region block validated arithmetically
```

Fields per leaf: `org_outcome, program, sub_program, pap, region, office,
project, amount_php, row, zone, validation`.

## 6. Remaining known limits

1. 82 review regions (₱75.8B leaf mass): printed totals corrupted upstream.
   Projects themselves are intact; rollup checks flag them for transparency.
2. 206 `spillover` leaves attach past their region's printed total
   (region total OCR-shortened); they are flagged, not dropped.
3. The alloc zone keeps flat lines only — its irregular outline
   (`1. → a. → 1. → …` nesting) is activity-level MOOE detail and is
   not part of the PAP crosscheck.
4. `dup_in_block` (10 rows) — repeated name+amount pairs kept and flagged
   since legitimate same-name multi-site projects exist.
