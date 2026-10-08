# Crosscheck: native I-B DPWH tree × Joebert candidate dumps

**Date:** 8 October 2026  
**Inputs:**
- House control baseline: [`../../nep-data/hb_dpwh_native_tree.json`](../../nep-data/hb_dpwh_native_tree.json) (native VOL I-B, 647/647 checks)
- Joebert dumps: [`joebert_data/`](../joebert_data/) (Ghostscript candidates; review-status only)

## Scope mismatch (read this first)

| Source | Volume | Grain | What a “leaf” is |
|---|---|---|---|
| Native tree | VOL **I-B** pp 13–110 | Office / FAP project | DEO row under a PAP, or named FAP project with GOP/loan children |
| `hb10858_projects.json` | VOL **I-C** | Project candidate | Heuristic project-title row |

They are **not the same grain**. Exact office- or region-total agreement is not expected. Useful checks are: (1) office-name coverage, (2) whether Joebert swallowed printed controls, (3) FAP project presence, (4) whether the other Joebert files touch DPWH at all.

---

## 1. Headline totals

| Measure | Amount |
|---|---:|
| Native ops (local PAP parents + FAP, banner-deduped) | **₱586,941,661,000** |
| Native local office leaves only | ₱542,192,650,000 across 1,431 DEO rows |
| Native FAP (29 projects) | ₱44,749,011,000 |
| Joebert DPWH candidates (gross) | **₱360,773,154,440** · 12,714 rows |
| v5 (reference, OCR-era I-C) | ₱581,345,349,000 · 16,148 rows |

Joebert’s gross sum is far below both the native operations control and v5. Metadata already warns of omissions and misreads.

---

## 2. What reconciles

### Office-name coverage (strong)

Against the 204 distinct DEO/office labels in the native local tree:

| Check | Result |
|---|---|
| Native offices appearing in Joebert `office` field | **192 / 204** |
| Native office-under-PAP cells whose office name appears in Joebert | **1,387 / 1,432 (96.9%)** |
| Peso mass of those covered cells | **₱537.1B / ₱542.2B** |

Missing offices are mostly naming variants (e.g. native `Cavite District Engineering Office` / `Cavite Third…` / `Mountain Province First…` vs Joebert’s different Cavite/Mountain Province labels) — not proof those DEOs lack projects in I-C.

**Amount rollups by office/region do not agree** (0/192 common offices match to the peso). That is expected: native cells are PAP×office subtotals; Joebert is an incomplete project sample with bad region tags (MIMAROPA and Region IV-A roll up to 0; Region XIII is inflated — see below).

### Other Joebert files vs native DPWH tree

| File | Agency | Rows | Exact name hits vs native nodes |
|---|---|---:|---:|
| `hb10858_agency_projects.json` | Department of Agriculture (FMR) | 795 | **0** |
| `hb10858_hfep_projects.json` | Department of Health (HFEP) | 513 | **0** |
| `hb10858_nia_projects.json` | NIA | 32 | **0** |

Correct: the native tree is DPWH-only. HFEP metadata reports candidate sum = printed grand (₱10,021,659,000); NIA reports gap 0 against its printed project subtotal. Those are self-checks within their schedules, not DPWH crosschecks.

---

## 3. What does not reconcile (Joebert defects)

### Printed controls ingested as “projects”

| Native control | Amount | Joebert |
|---|---:|---|
| Foreign-Assisted Projects (grand) | ₱44,749,011,000 | **1 row** I-C p938 — title is a building rehab under Butuan City DEO |
| Construction/Rehabilitation of Flood Mitigation Facilities (PAP) | ₱16,222,881,000 | **2 rows** I-C p364–365 — same PAP heading, office stamped Surigao del Sur 2nd DEO |

Those three rows alone add **₱77.0B** of phantom project mass and are why Region XIII / Surigao del Sur 2nd look absurd in a Joebert region/office rollup (Region XIII sum ₱77.6B vs native ₱4.95B).

### FAP project names

| Check | Result |
|---|---|
| Native FAP projects | 29 · ₱44,749,011,000 |
| Exact / prefix name match in Joebert | **0 / 29** |

Joebert did not extract the FAP named-project list. It did capture the FAP **grand total** once, attached to the wrong title (above).

### Page-break duplicates

| Check | Result |
|---|---:|
| Duplicate `(normalized name, amount)` keys | 2,692 |
| Extra rows beyond first occurrence | 2,714 |
| Extra peso mass | **≈ ₱73.3B** |
| Of which consecutive-page pairs (p, p+1) | 2,679 pairs · ≈ ₱72.8B |

Metadata claims `duplicateRowsSkipped: 6990`, but a large same-title/same-amount residue remains — classic I-C page-break re-prints.

### Other sanity flags

- **16** rows with non-thousand `amountPesos` (e.g. ₱28,204,500) — possible Total/CO column confusion.
- **1,467** rows with blank `office` (11.5%).
- **11,372** rows with empty `pap3` — almost no PAP attribution.
- Region labels incomplete: no usable MIMAROPA / Region IV-A rollup in Joebert.

Rough “cleaned” Joebert mass (gross − PAP/FAP control leaks − duplicate extras) ≈ **₱254B**, still far below native ops ₱586.9B — i.e. the dump is both noisy **and** incomplete as a DPWH project universe.

---

## 4. Settled interpretation

| Question | Answer |
|---|---|
| Does Joebert confirm the native I-B tree? | **Partially on geography only** — ~97% of native office labels appear. It does **not** confirm amounts, PAP structure, or FAP. |
| Can Joebert replace v5 or the native tree? | **No.** Wrong grain vs native; incomplete and control-contaminated vs a project extract. |
| Biggest Joebert failure modes vs native controls | (1) PAP/FAP totals stored as projects, (2) page-break duplicates, (3) missing FAP names, (4) broken region tags. |
| DA / HFEP / NIA dumps | Out of scope for the DPWH native tree; no name collisions. HFEP/NIA self-totals look internally consistent per their metadata. |

---

## 5. Practical use going forward

1. Keep **`hb_dpwh_native_tree.json`** as the DPWH House **control** baseline.
2. Treat `joebert_data/hb10858_projects.json` as a **noisy I-C candidate list**: drop rows whose amount equals a known native PAP/program/FAP control (≥ ₱1B), and collapse consecutive-page duplicates before any matching.
3. Do not region- or office-sum Joebert against native without those filters — Surigao / Region XIII will dominate with control ghosts.
4. For project-level work, prefer a future **native I-C geometry extract** (or current v5 with the four damaged sections rebuilt). Re-run Joebert against that extract for title recall, not for controls.
5. DA FMR / HFEP / NIA Joebert files are separate agency tracks; crosscheck them to their own VOL I-B schedules, not to the DPWH native tree.

## Reproduce

```sh
python3 - <<'PY'
# see analysis/docs/joebert_native_crosscheck.md §2–3 logic:
# office-name coverage, BIG control amount hits, consecutive-page dups
import json
from pathlib import Path
native = json.load(open('nep-data/hb_dpwh_native_tree.json'))
j = json.load(open('analysis/joebert_data/hb10858_projects.json'))['data']['data']
print(len(native['tree']), 'native top nodes;', len(j), 'joebert rows')
PY
```
