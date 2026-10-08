# 0001. Use native PDF text layer for House printed controls

- Status: Accepted
- Date: 2026-10-08
- Deciders: analysis workbench maintainers

## Context and Problem Statement

HB 10858 Volumes I-B and I-C are digital InDesign PDFs. Early House extracts
were built from PaddleOCR markdown of Volume I-C. That path produced a
persistent ₱5.596B operations gap against printed controls and dropped
program banners (Convergence, BIP). How should printed House **controls**
be established?

## Decision Drivers

* Controls must reconcile to the peso against the printed bill
* Prefer ground truth over OCR when the PDF already embeds text
* Must explain whether the operations gap is a bill property or extraction damage
* Reproducible from committed PDFs with a single script

## Considered Options

1. Keep refining the OCR markdown → leaf repair chain (v3→v5)
2. Use third-party Ghostscript dumps (`joebert_data/`) as the control baseline
3. Parse the PDF native text layer with a geometry-first extractor (PyMuPDF)

## Decision Outcome

Chosen option: **3 — native text layer**, implemented for Volume I-B in
`scripts/hb_native_extract3.py` → `analysis/data/hb_dpwh_native_tree.json`.

After banner/summary dedup, 647/647 internal checks pass and zones reproduce
GAS/S2O + local PAPs + FAP = ₱654.102015B exactly. Three-way reconciliation
shows I-B and I-C agree on 35/35 shared PAP controls; the entire v5 gap is
OCR-era extraction damage on four Convergence sections.

### Consequences

* Good: House control baseline no longer depends on OCR quality
* Good: “derived Convergence residual” framing is corrected — I-C prints it
* Bad: I-B is office-granularity; project titles still need I-C (native or v5)
* Bad: I-C project-level native extract is still TODO

## More Information

* [../hb_native_v5_reconciliation.md](../hb_native_v5_reconciliation.md)
* [../hb_native_textlayer_assessment.md](../hb_native_textlayer_assessment.md)
* [../hb_native_full_processing.md](../hb_native_full_processing.md)
* ADR-0002 (control vs project-title separation)
