# Native-layer HB extraction — full processing results

Follow-up to `hb_native_textlayer_assessment.md`. Question: can we fully process the HB PDFs from the native text layer? **DPWH (the target department): yes, completely — 647/647 structural balance checks pass.**

**8 October 2026 follow-up:** the raw outline is now rebuilt into an additive
[Native I-B rollup JSON](../data/hb_dpwh_native_rollup.json).
**660/660 internal nodes** pass immediate-child and recursive leaf checks in
all four expenditure columns, with **zero unexplained amount rows**. The
1,746 retained leaves sum to **₱654,102,015,000**, including GAS and S2O.
See [progressive rollup checks and gap repairs](hb_native_ib_rollup_checks.md)
and the [machine audit](../data/hb_native_ib_rollup_audit.json).

## Validator design (`scripts/hb_native_extract3.py`)

Geometry-first, OCR-free:

1. Tolerance-based y-clustering (label and amount tokens of one row differ ~0.3pt; `round()` banker's rounding splits them)
2. **Mirrored margins**: odd pages shift right by 13.6pt — normalize by page parity
3. Printed line-number echoes stripped (left x<70, matching right echo)
4. Amount tokens only recognized in the numeric column band (x>280), so loan numbers/dates inside labels are ignored
5. Indent bands from amount-row label-x = outline levels; wrapped fragments attach to the next amount row in-band
6. Section sub-totals close their section; `Foreign Assisted-Project(s)` dividers become roots; `New Appropriations, by Object of Expenditures` ends the ops parse
7. Every internal node validated: **sum of leaf descendants == printed amount**

## DPWH (VOL IB pages 13–110) — fully balanced

- rows 3,348 / amount rows 2,444 / internal checks **647 / 647 pass**
- Every PAP control, regional subtotal, and DEO leaf reconciles to the peso
- FAP: **₱44,749,011,000 across 29 projects with full loan/GOP splits** — matches v5's hardest repair
- All four v5-"unresolved" Convergence PAPs hit printed controls exactly:

| PAP | v5 (OCR-era) | native | printed control |
|---|---:|---:|---:|
| BIP - Access Roads | 132,686,016,000 | **134,927,811,000** | 134,927,811,000 |
| BIP - Multi-Purpose | 78,590,593,000 | **83,706,551,000** | 83,706,551,000 |
| BIP - Coastal Roads | 3,126,800,000 | **1,670,000,000** | 1,670,000,000 |
| Water Supply family | 8,045,366,000 | **8,867,925,000** | 8,867,925,000 |

The v5 net operations residual of ₱5,596,312,000 was OCR damage, not a property of the document.

- Raw leaf sum across detached top-level sections: ₱1,709,735,429,000 vs printed grand ₱654,102,015,000 — the ₱1,055,633,414,000 delta is double-counted controls. The additive rollup fixes this by reattaching five program banners, collapsing 37 evidenced repeated PAP controls, and restoring section/project/agency controls. No allocation amounts change.
- Artifact: `../data/hb_dpwh_native_tree.json`

## Other volumes — extractable, different table families

| Volume | rows | amount rows | internal checks | note |
|---|---:|---:|---|---|
| VOL IA (all other departments) | 48,369 | 33,290 | 0 top-level nodes | 3-col geometry (x≈337/411/557); needs its own band scheme |
| VOL IC (departments cont.) | 33,361 | 21,494 | 2,677 checks, 43 fail (98.4% pass) | mixed families |
| VOL II | 32,996 | 5,085 | 28 checks, 28 fail | different page size (714×858) |

Conclusion: **one geometry profile per table family**, not per volume. The DPWH profile is done; agency-budget profiles (VOL IA/IC) and VOL II are mechanical variants.

## Recommendation

1. Use `hb_dpwh_native_rollup.json` as the additive DPWH House control baseline; retain `hb_dpwh_native_tree.json` as its raw-outline predecessor. Native I-B supersedes the v5 control repair chain, but I-C is still required for named local projects.
2. Add band profiles for the 3-col family (VOL IA/IC agency budgets) and VOL II
3. Keep PaddleOCR markdown only as a qualitative cross-check
