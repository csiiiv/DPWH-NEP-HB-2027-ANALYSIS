# Crosscheck: latest House DPWH × Joebert candidate dumps

**Date:** 8 October 2026  
**Machine summary:** [`../data/joebert_hb_crosscheck.json`](../data/joebert_hb_crosscheck.json)  
**Rebuild:** `python analysis/builders/crosscheck_joebert_hb.py`

**Inputs:**
- House **control** baseline: [`../data/hb_dpwh_native_tree.json`](../data/hb_dpwh_native_tree.json) (native VOL I-B)
- House **project-title** candidate: [`../data/hb_dpwh_leaves_corrected_v5.json`](../data/hb_dpwh_leaves_corrected_v5.json)
- Joebert DPWH dump: [`../joebert_data/hb10858_projects.json`](../joebert_data/hb10858_projects.json)
- Other Joebert dumps: DA FMR / HFEP / NIA under [`../joebert_data/`](../joebert_data/)

## Scope mismatch (read this first)

| Source | Volume | Grain | What a “leaf” is |
|---|---|---|---|
| Native tree | VOL **I-B** pp 13–110 | Office / FAP project | DEO row under a PAP, or named FAP project |
| House v5 | VOL **I-C** (OCR-repaired) | Project allocation | Project title + region/office + amount |
| `hb10858_projects.json` | VOL **I-C** | Project candidate | Ghostscript heuristic project-title row |

Native × Joebert is a **geography / control-leak** check, not an amount rollup.
v5 × Joebert is the fair **title+amount** overlap check (same grain, both incomplete).

---

## 1. Headline totals

| Measure | Amount / count |
|---|---:|
| Native ops (printed) | **₱586,941,661,000** |
| Native local office leaves | 1,431 cells · ₱541.220B (40 PAP parents) |
| Native FAP | 29 projects · ₱44,749,011,000 |
| House v5 positive allocations | 16,148 · **₱581,345,349,000** |
| Joebert DPWH gross | 12,714 · **₱360,773,154,440** |
| Joebert after dropping ≥₱1B control leaks + title/amount dups | 9,998 · **₱226.499B** |

Joebert is far below both native ops and v5. Metadata already warns of omissions and misreads.

---

## 2. Native I-B × Joebert (controls / geography)

### Office-name coverage (strong)

| Check | Result |
|---|---|
| Native distinct DEO/office labels | 204 |
| Exact name also present in Joebert `office` | **192 / 204** |
| Office×PAP cells whose office name appears in Joebert | **1,386 / 1,431 (96.9%)** |
| Peso mass of those cells | **₱536.1B / ₱541.2B** |
| Common offices whose Joebert office-sum equals native | **0 / 192** |

Coverage is geographic only. Amount rollups do not agree — expected (different grain + Joebert defects).

### FAP project names

| Check | Result |
|---|---|
| Native FAP projects | 29 · ₱44.749B |
| Exact / prefix name match in Joebert | **0 / 29** |

### Printed controls ingested as “projects”

Three Joebert rows match known ≥₱1B printed controls (**₱77.195B**):

| Control | Amount | Joebert |
|---|---:|---|
| Foreign-Assisted Projects (grand) | ₱44,749,011,000 | 1 row (wrong title / office stamp) |
| Flood Mitigation Facilities (PAP) | ₱16,222,881,000 | **2 rows** I-C p364–365 (Surigao del Sur 2nd DEO) |

Those ghosts are why Joebert **Region XIII** rolls up to ₱77.6B (native-scale nonsense).

### Page-break duplicates

| Check | Result |
|---|---:|
| Duplicate `(normalized name, amount)` keys | 2,692 |
| Extra rows beyond first occurrence | 2,714 |
| Extra peso mass | **≈ ₱73.3B** |
| Consecutive-page pairs (p, p+1) | 2,679 · ≈ ₱72.8B |

### Other sanity flags

- **16** rows with non-thousand `amountPesos`
- **1,467** blank `office` (11.5%)
- **11,372** empty `pap3`
- DA / HFEP / NIA Joebert dumps: **0** exact name hits vs native DPWH nodes (correct — different agencies)

---

## 3. House v5 × Joebert (project titles)

Same grain (I-C project candidates). Matching is normalized title + exact peso amount.

| Check | Result |
|---|---:|
| Shared exact `(title, amount)` keys | **3,479** |
| Unique 1∶1 keys (one v5 · one Joebert) | 2,067 · ₱35.893B |
| v5 rows with a Joebert title+amount hit | **3,480 / 16,148 (21.6%)** |
| v5 peso covered by those hits | **₱64.726B (11.1%)** |
| Joebert rows with a v5 title+amount hit | **4,896 / 12,714 (38.5%)** |
| Joebert peso that hits v5 | **₱93.574B (25.9%)** |
| Also match region+title+amount | 2,327 keys |
| Also match office+title+amount | 3,121 keys |
| After dropping control leaks + dups: Joebert rows still in v5 | 3,479 · ₱64.721B |

Interpretation:

- Roughly **one fifth of v5 rows** (by count) and **one ninth of v5 pesos** appear as exact title+amount pairs in Joebert.
- Joebert’s higher row “precision” (38%) is inflated by duplicate copies of the same title+amount.
- After dedup + control-leak drop, Joebert collapses to ~₱226B and still only ~₱65B overlaps v5 — the dump is both **noisy and incomplete** as a DPWH project universe.
- Overlap is useful as an **independent recall sample**, not as a replacement for v5 or native controls.

---

## 4. Settled interpretation

| Question | Answer |
|---|---|
| Does Joebert confirm the native I-B tree? | **Partially on geography only** (~97% office labels). Not amounts, PAP structure, or FAP. |
| Does Joebert confirm House v5? | **Sparse title+amount overlap** (~22% of v5 rows / ~11% of v5 ₱). Independent signal, not a second baseline. |
| Can Joebert replace v5 or the native tree? | **No.** |
| Biggest Joebert failure modes | (1) PAP/FAP totals stored as projects, (2) page-break duplicates, (3) missing FAP names, (4) broken region tags. |
| DA / HFEP / NIA dumps | Out of scope for DPWH; no name collisions with the native tree. |

---

## 5. Practical use

1. Keep **`hb_dpwh_native_tree.json`** as the DPWH House **control** baseline.
2. Keep **v5** as the project-title candidate until native I-C re-extract.
3. Treat Joebert as a **noisy I-C candidate list**: drop rows whose amount equals a known ≥₱1B control, collapse consecutive-page duplicates, then use for title recall only.
4. Do not region- or office-sum Joebert against native without those filters — Region XIII will dominate with control ghosts.
5. DA FMR / HFEP / NIA Joebert files are separate agency tracks.

## Reproduce

```sh
python analysis/builders/crosscheck_joebert_hb.py
# → analysis/data/joebert_hb_crosscheck.json
```
