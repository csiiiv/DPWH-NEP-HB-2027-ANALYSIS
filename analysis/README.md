# analysis/ — FY2027 DPWH House / NEP workbench

**Date:** 8 October 2026 · Amounts in datasets are integer Philippine pesos unless noted.

| Start here | |
|---|---|
| Narrative + next steps | [FY2027_work_summary.md](FY2027_work_summary.md) |
| Repo overview | [../README.md](../README.md) |
| Shared path constants | [`paths.py`](paths.py) |

---

## Layout

```
analysis/
  README.md · FY2027_work_summary.md · paths.py
  builders/     Python builders, repairs, crosschecks, parsers
  viewers/      Offline HTML/JS dashboards + short method notes
  data/         Current JSON/pkl datasets
  docs/         Audits, reconciliations, design notes
  tests/        unittest + node viewer smoke tests
  archive/      Superseded v0–v4b leaves and early matcher outputs
  evidence/     PDF crop images
  joebert_data/ External Ghostscript candidate dumps
```

| Folder | Role |
|---|---|
| **builders/** | `build_nep_tree.py`, `build_hb_tree.py`, `build_hb_source_tree.py`, `build_current_pages.py`, `repair_hb_known_defects.py`, `reconcile_nep_source.py`, plus historical parsers/crosschecks |
| **viewers/** | Current and historical dashboards (`*_2027_tree.html`, `source_comparison_2027.html`), viewer JS/templates, companion `*.md` method notes |
| **data/** | Canonical trees, v5 leaves, manifests, validation ledgers, pkl caches |
| **docs/** | Settled audits and reconciliations (native vs v5, Joebert, NEP/API, hierarchy design) |
| **tests/** | `test_*.py` (unittest) and `test_*.cjs` (node viewer smokes) |
| **archive/** | Superseded extracts — see [archive/README.md](archive/README.md) |
| **joebert_data/** | Third-party Ghostscript dumps — see [joebert_data/README.md](joebert_data/README.md) |

Builders import each other by bare module name; `paths.py` puts `analysis/` and `builders/` on `sys.path`. JSON I/O uses `DATA`; HTML/templates use `VIEWERS`; narrative markdown uses `DOCS`; historical inputs use `ARCHIVE`.

---

## Settled baselines

| Role | Artifact |
|---|---|
| House **control** baseline | [`../nep-data/hb_dpwh_native_tree.json`](../nep-data/hb_dpwh_native_tree.json) — 647/647 checks; [docs/hb_native_v5_reconciliation.md](docs/hb_native_v5_reconciliation.md) |
| House project-title candidate | [data/hb_dpwh_leaves_corrected_v5.json](data/hb_dpwh_leaves_corrected_v5.json) — 38/42 PAP controls; four sections are OCR extraction damage |
| NEP new appropriations | [data/nep_2027_tree.json](data/nep_2027_tree.json) · [viewers/nep_2027_tree.md](viewers/nep_2027_tree.md) — ₱642.612015B |

### Open locally

| Viewer | Path |
|---|---|
| Current comparison | [viewers/source_comparison_2027.html](viewers/source_comparison_2027.html) |
| House rollup | [viewers/hb_2027_tree.html](viewers/hb_2027_tree.html) |
| House document-native | [viewers/hb_2027_source_tree.html](viewers/hb_2027_source_tree.html) |
| NEP tree | [viewers/nep_2027_tree.html](viewers/nep_2027_tree.html) |
| Dashboard index | [../site/index.html](../site/index.html) |

Historical (v4b/v3 + API baseline): `viewers/crosscheck_2027.html`, `viewers/taxonomy_comparison.html`.

Packaged GitHub Pages site flattens `viewers/` + `data/` under `_site/analysis/` (see `scripts/build_pages.py`).

---

## Reproduce

```sh
# Current comparison + site index (no PDF extraction)
python analysis/builders/build_current_pages.py
python scripts/validate_current_pages.py

# Trees
python analysis/builders/build_nep_tree.py --source-dir /path/to/paddle_pdf_ocr_v2
python analysis/builders/build_hb_tree.py
python analysis/builders/build_hb_source_tree.py

# Tests
python -m unittest discover -s analysis/tests -p 'test_*.py' -v
node --test analysis/tests/test_budget_display.cjs \
              analysis/tests/test_hb_tree_viewer.cjs \
              analysis/tests/test_hb_source_tree_viewer.cjs

# Package GitHub Pages site
python scripts/build_pages.py
```

Native House control tree (PyMuPDF + VOL I-B):

```sh
python3 scripts/hb_native_extract3.py \
  'HB_BUDGET/2 - HB 10858 VOL IB.pdf' 13 111 nep-data/hb_dpwh_native_tree.json
```

---

## Docs index

| Doc | Topic |
|---|---|
| [docs/hb_native_v5_reconciliation.md](docs/hb_native_v5_reconciliation.md) | Native I-B vs v5 vs I-C controls (settled) |
| [docs/hb_native_full_processing.md](docs/hb_native_full_processing.md) | Native extractor results (647/647) |
| [docs/hb_native_textlayer_assessment.md](docs/hb_native_textlayer_assessment.md) | Why native text beats OCR |
| [docs/joebert_native_crosscheck.md](docs/joebert_native_crosscheck.md) | Joebert dumps vs native tree |
| [docs/hb_known_defect_repairs.md](docs/hb_known_defect_repairs.md) | v5 repair ledger |
| [docs/hb_json_usability_audit.md](docs/hb_json_usability_audit.md) | House JSON inventory / printed controls |
| [docs/nep_2027_api_reconciliation.md](docs/nep_2027_api_reconciliation.md) | NEP source vs API gap |
| [docs/nep_2027_source_audit.md](docs/nep_2027_source_audit.md) | NEP source operations audit |
| [docs/hierarchy_report.md](docs/hierarchy_report.md) | OCR-era hierarchy parser validation |
| [docs/data_structure_and_crosscheck_design.md](docs/data_structure_and_crosscheck_design.md) | Dataset shapes + recursive crosscheck design |
| [docs/pages_update_assessment.md](docs/pages_update_assessment.md) | Dashboard update priorities |
| [joebert_data/README.md](joebert_data/README.md) | External candidate dump notes |
| [archive/README.md](archive/README.md) | Superseded extract lineage |

---

## Open next steps

1. Native I-C project-level re-extract for the four damaged v5 sections
2. NEP 237-candidate image review
3. Source-match certification on the current comparison page
