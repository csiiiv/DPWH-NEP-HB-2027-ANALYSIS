# Native VOL I-B tree vs v5 / VOL I-C — three-way reconciliation

**Retired v5 report — 9 October 2026:** the figures below describe the historical OCR candidate. Current House controls use [Native I-B](../data/hb_dpwh_native_rollup.json); project titles and comparisons use [Native I-C](../data/hb_dpwh_native_ic_projects.json). The [I-C audit](hb_native_ic_rollup_checks.md) closes the four historical extraction gaps. v5 is retained for reproduction and is excluded from current webpage inputs and downloads.

**Date:** 8 October 2026 · **Inputs:** `../data/hb_dpwh_native_tree.json`
(native text-layer parse of VOL I-B pp 13–110, `scripts/hb_native_extract3.py`),
House v5 (`hb_dpwh_leaves_corrected_v5.json`), printed I-C controls
(`hb_known_defect_repairs.json`).

This document reconciles the new native-layer tree against the OCR-era v5
extract and the printed Volume I-C controls, and records what it settles.

---

## 1. The native tree reproduces the entire budget additively

The raw tree's leaf sum (₱1,709,735,429,000) double-counts printed summary
rows. Split by zone, the additive layer is exact:

| Zone (top-level nodes) | Leaf sum | Printed control |
|---|---:|---|
| GAS/S2O activities (pp 13–25) + the ₱27,150,000 straddler printed on p26 | 67,160,354,000 | GAS 18,078,293,000 + S2O 49,082,061,000 ✓ |
| 40 local PAP parents + PPP Fund + Disaster-Related (pp 26–104) | 542,192,650,000 | Regular local operations 528,316,707,000 + LFP 13,875,943,000 ✓ |
| Foreign-Assisted Projects marker root (pp 105–110) | 44,749,011,000 | FAP 44,749,011,000 ✓ (29 projects; GOP 25,190,650,000 + Loan 19,558,361,000 across 49 funding leaves) |
| **Total** | **654,102,015,000** | **Printed grand total ✓ exact** |

The 43 childless top-level nodes are **printed banner/summary rows**: 37 are
PAP controls re-printed above their own detail block (drop the childless copy,
keep the parent), and 6 are program banners (APP, NDP, Bridge, Flood,
Convergence, LFP marker) whose amounts equal the sum of the PAP parents below
them. No banner survives as a leaf after this dedup — the additive layer is
exactly the three zones above.

## 2. PAP-by-PAP three-way reconciliation

Matching native I-B PAP parents to v5 PAPs by normalized heading (BIP prefix
variants unify):

- **35/35** PAPs with a saved I-C control: **native I-B control == printed
  I-C control, to the peso.** The two volumes agree on every shared control.
- **34/37** matched PAPs: v5 leaf sum == native control.
- The only v5 mismatches are the four already-documented unresolved PAPs —
  now confirmed as **v5/I-C-OCR extraction damage, not document properties**:

| PAP | I-B = I-C printed | v5 leaves | v5 error |
|---|---:|---:|---:|
| BIP - Access Roads | 134,927,811,000 | 132,686,016,000 | −2,241,795,000 (missing rows) |
| BIP - Multi-Purpose Buildings | 83,706,551,000 | 78,590,593,000 | −5,115,958,000 (missing rows) |
| BIP - Coastal Roads | 1,670,000,000 | 3,126,800,000 | +1,456,800,000 (extra/misattributed rows) |
| Water Supply family (I-B merges WS+Septage+Rainwater) | 8,867,925,000 | 9,072,566,000 (WS 8,045,366,000 + RW 1,027,200,000) | +204,641,000 net |

The four v5 deltas sum to **−5,596,312,000 = the entire v5 operations gap**.
With the native layer as witness, v5's extraction coverage is the only
remaining defect; the bill itself balances everywhere.

## 3. New structural facts from the native layers

1. **VOL I-C p373 prints `CONVERGENCE AND SPECIAL SUPPORT PROGRAM
   231,382,287,000`.** The OCR markdown dropped this heading, so
   `hb_2027_source_tree.md` called Convergence a "derived residual, never
   printed." It is printed; the residual value is confirmed as a real control.
   Decomposition closes exactly:
   BIP 221,004,362,000 (= Access Roads 134,927,811,000 + MPB 83,706,551,000 +
   Coastal 1,670,000,000 + Local Ports 700,000,000)
   + Disaster-Related 1,000,000,000
   + PWD/Elderlies/Gender family 510,000,000
   + Water Supply family 8,867,925,000
   = 231,382,287,000.
2. **VOL I-C p412 prints the `Basic Infrastructure Program (BIP)` program
   control 221,004,362,000** above its four sub-PAPs.
3. **The Water Supply family in I-C has three sub-PAPs** (pp 374–409):
   Water Supply System 7,740,725,000, **Septage and Sewerage 100,000,000**
   (heading lost in OCR; v5 absorbed its rows into WS), and Rainwater
   Collector System 1,027,200,000. Family control 8,867,925,000 == I-B.
4. **The PWD family is a sub-PAP with its own control** (p410):
   "Construction/Rehabilitation/Improvement of Facilities for Persons with
   Disabilities (PWD) and Elderlies/Senior Citizens, including
   Gender-Responsive Facilities" = 510,000,000, split into PWD 85,000,000,
   Elderlies/Senior Citizen 340,000,000, and Gender-Responsive Facilities
   85,000,000 (17 regions × 5,000,000 each). v5 keeps only the PWD 85M PAP;
   the Elderlies 340M and Gender 85M rows need re-attribution.
5. **I-B and I-C agree on every shared control** — 35/35 to the peso. There
   is no cross-volume discrepancy in DPWH; all differences against v5 are
   extraction defects.

## 4. What this settles

| Question | Settled answer |
|---|---|
| Was the ₱5.596B v5 operations gap real? | **No.** Both volumes print controls that balance; the gap is v5 OCR-era extraction damage confined to four sections. |
| Is Convergence ever printed? | **Yes** — I-C p373 (and I-B p80 zone arithmetic). The "derived residual" framing was an OCR artifact. |
| Current House control baseline | [Additive Native I-B](../data/hb_dpwh_native_rollup.json): 660/660 internal checks pass across PS/MOOE/CO/Total. The raw tree below is its historical predecessor. |
| v5 still needed? | No for current processing. Native I-C replaces its project-title layer; v5 remains a historical reproduction artifact. |
| Native I-C extraction | Complete: 15,972 named-project leaves, 29 FAP totals, 2,686 balanced internal controls, and 56 independent I-B checks. Current comparisons balance 44/44 mapped non-FAP PAPs; one NEP PAP remains unmapped. |

## 5. Reproduce

```sh
python3 scripts/hb_native_extract3.py 'HB_BUDGET/2 - HB 10858 VOL IB.pdf' 13 110 analysis/data/hb_dpwh_native_tree.json
```

Zone/banner accounting and the three-way tables above are recomputed by the
snippet documented in git history of this file (banner-dedup rule: drop
childless top-level nodes whose (text, amount) matches a parent).

The end page is inclusive: page 111 belongs to the separate object-expenditure
table and changes the inferred bands if included. For the additive hierarchy,
progressive balances, and recursive four-column checks, use
`python3 scripts/hb_native_rollup.py`; see
[Native I-B rollup checks](hb_native_ib_rollup_checks.md).
