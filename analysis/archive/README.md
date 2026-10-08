# analysis/archive — superseded extracts and matcher outputs

Historical artifacts retained for the repair lineage and audit trail.
**Nothing here is a current dataset.**

| Current | Location |
|---|---|
| Folder map + baselines | [../README.md](../README.md) |
| Narrative | [../FY2027_work_summary.md](../FY2027_work_summary.md) |
| House control baseline | [`../../nep-data/hb_dpwh_native_tree.json`](../../nep-data/hb_dpwh_native_tree.json) |
| House project-title candidate | [`../data/hb_dpwh_leaves_corrected_v5.json`](../data/hb_dpwh_leaves_corrected_v5.json) |

---

## House leaf-dataset lineage (all superseded by v5)

| File | Generation | What it was |
|---|---|---|
| `hb_dpwh_items.json` | v0 raw | First flat parse of VOL I-C OCR markdown; mixed headers/rollups (₱593.4B, 15,066 rows) |
| `hb_dpwh_leaves_validated.json` | v0 strict | Strict-hierarchy flat leaves with validation flags (15,487 rows, pre-repair amounts ₱538.8B) |
| `hb_dpwh_leaves_corrected.json` | v1 | After PDF-text-layer spot-check repairs (₱528.25B) |
| `hb_dpwh_leaves_corrected_v2.json` | v2 | Span-level, heading-aware re-audit (₱522.30B) |
| `hb_dpwh_leaves_corrected_v3.json` | v3 | UNRESOLVED second pass — amount-repair/provenance baseline (₱520.65B) |
| `hb_dpwh_leaves_corrected_v4.json` | v4 | v3 + headingless-tag repair (attribution only) |
| `hb_dpwh_leaves_corrected_v4b.json` | v4b | v4 + stale-PAP re-attribution (12,820 leaves relabeled) — best pre-native candidate |

Current candidate: `../data/hb_dpwh_leaves_corrected_v5.json` (native-controls repair).
Control baseline: `../../nep-data/hb_dpwh_native_tree.json` (native VOL I-B text layer).
Both volumes print balancing controls; the v3→v5 repair chain itself is superseded by the native extraction method for **controls**.

---

## Strict-hierarchy parser outputs (diagnostic)

- `hb_block_tree.json`, `hb_tree_validation.json` — per-block audit of the OCR-era stack parser; pre-repair amounts, damaged controls.
- `hb_dpwh_pap_hierarchy.json` is **not** archived: it remains an active input at `../data/hb_dpwh_pap_hierarchy.json` (printed office/region subtotal attachment in `../builders/build_hb_source_tree.py`).
- `page_family_map.json` — PDF page → governing bold PAP heading (OCR-era).

---

## Text-layer audits (v1–v3)

`textlayer_audit{,_v2,_v3}.{json,md}` — progressive leaf-by-leaf audits of the OCR markdown against the PDF native text layer; source of the ₱18.16B phantom-inflation repair set. `textlayer_audit_v3.json` remains a re-run input of `../builders/repair_hb_known_defects.py`.

---

## Early crosscheck era (API matcher, v0–v4b scope)

- `crosscheck_results.json`, `crosscheck_summary.json`, `report.md`, `report_highlights.json` — first HB-vs-API greedy matcher + report. Insertion/removal labels from this era are superseded.
- `crosscheck_2027_rainwater.json` — single-PAP method validation.
- `crosscheck_2027_v4b_validation.json` — v4b leaf sums vs printed vs API.
- `taxonomy_comparison_data.json` — title-classification data (v3 scope).
- `verify_report.md`, `pdf_verification.json` — first 330-row PDF spot-check.
- `amount_diff_batch.json`, `evidence_sample.json`, `family_blocks.json` — one-off diagnostic batches.

Still live under `../data/` (not archived): `crosscheck_2027.json`, `crosscheck_2027_lineitems.json`, `crosscheck_2027_pap_drilldown.json` — still read by builders when regenerating reconciliations. Historical dashboards that consume them live under `../viewers/`.
