# joebert_data/ — external Ghostscript candidate dumps

Candidate project extracts from HB 10858, supplied as a third-party dump
(Ghostscript text extraction; **no OCR**). Schema mirrors the BetterGov NEP API
envelope (`status` / `code` / `data.data` / `metadata`).

**These are review candidates, not certified House leaves.** Metadata on every
file warns that omissions and misreads are possible. Do **not** treat unmatched
rows as confirmed insertions relative to NEP until page-checked.

This folder is intentionally outside `data/` — it is an external dump, not a
builder output of this workbench.

## Contents

| File | Scope | Rows | Notes |
|---|---|---:|---|
| `hb10858_projects.json` | DPWH detail candidates from **VOL I-C** | 12,714 | Almost no `pap3` labels (11,372 empty). Sum ≈ ₱360.8B — well below v5 (₱581.3B) and printed operations (₱586.9B). Sparse title+amount overlap with v5 (~3.5k exact pairs). Useful as an independent candidate list, **not** a control baseline. |
| `hb10858_agency_projects.json` | DA Farm-to-Market Roads (VOL I-B) | 795 | Includes chainage / coordinate fields where parsed. |
| `hb10858_hfep_projects.json` | DOH Health Facilities Enhancement Program (VOL I-B) | 513 | Candidate sum equals printed grand total ₱10,021,659,000 in metadata. |
| `hb10858_nia_projects.json` | NIA named irrigation projects (VOL I-B) | 32 | Candidate sum equals printed project subtotal; reconciliation gap 0 in metadata. |

## Relation to this repo's DPWH baselines

| Baseline | Role |
|---|---|
| `../../nep-data/hb_dpwh_native_tree.json` | **House control baseline** (native I-B, 647/647 checks) |
| `../data/hb_dpwh_leaves_corrected_v5.json` | Best project-title candidate until native I-C re-extract |
| `hb10858_projects.json` (this folder) | Independent Ghostscript candidate list for cross-check only |

**Crosscheck vs native tree:** [../docs/joebert_native_crosscheck.md](../docs/joebert_native_crosscheck.md).

Summary: ~97% of native DEO names appear in Joebert (coverage OK); amounts do
**not** roll up (different grain + Joebert defects). Joebert ingested the FAP
grand (₱44.749B) and Flood Mitigation Facilities PAP (₱16.223B ×2) as projects,
has ~₱73B page-break duplicate mass, and matches **0/29** FAP project names.
DA/HFEP/NIA dumps have zero overlap with the DPWH native tree (correct).

See [../docs/hb_native_v5_reconciliation.md](../docs/hb_native_v5_reconciliation.md) and
[../README.md](../README.md).
