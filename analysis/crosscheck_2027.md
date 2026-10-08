# FY 2027 Three-Way Crosscheck — DPWH

> **Historical report:** several House tables and matcher counts below predate v4b. The current [NEP/API reconciliation](nep_2027_api_reconciliation.md) accounts for the gap as ₱69.687941B GAS/S2O + ₱117.749011B FAP + ₱9.797B in 23 non-FAP allocations. “House-only” means API-unmatched, not a verified insertion. Disaster-Related Infrastructure already has a ₱1B NEP allocation; Quirino K0264–K0281 is an unchanged NEP/API/House match. Use [FY2027_work_summary.md](FY2027_work_summary.md) for current status.

**Scope:** FY 2027 only. Three independent sources reconciled on one program axis:

| Pillar | Source | Form |
|---|---|---|
| **NEP official** | `reference/ph-budget-analysis` → `Compiled_-_DPWH.xlsx` | 8 program-level NEP totals (₱642.61B) |
| **NEP API** | BetterGov NEP API → `nep-data/json/fy2027-combined.json` | 11,372 project line items (₱445.38B) |
| **House Bill** | `HB_BUDGET/3 - HB 10858 VOL IC.pdf` (text-layer-verified parse) | 15,487 corrected leaves (₱520.65B) + printed control totals |

Artifacts: `analysis/crosscheck_2027.json` (data) · `analysis/crosscheck_2027.html` (dashboard) ·
`analysis/hb_program_classifier.py` (HB→program mapping).

---

## 1. Grand totals

| Measure | Amount | Note |
|---|---:|---|
| NEP FY2027 official (8 programs) | **₱642.61B** | incl. S2O ₱51.61B + GAS ₱18.08B |
| NEP API line items | **₱445.38B** | 69.3% of official; S2O/GAS absent entirely |
| HB 10858 corrected line items | **₱520.65B** | 88.7% of the bill's printed OPERATIONS rollup (₱586.94B) |
| HB grand upper (leaves + printed MOOE ₱24.69B) | **₱545.34B** | MOOE printed = GAS + S2O **exactly** (verified to the peso) |

**Structural identity found in the bill:** printed `MOOE 24,685,746,000 = GAS 1,505,758,000 + S2O 23,179,988,000`.
So the House DPWH grand total = OPERATIONS rollup + MOOE, and leaves + MOOE is a coherent upper bound.

## 2. Program-level three-way table (₱B)

| Program | NEP official | NEP API | API gap | HB leaves | HB − official |
|---|---:|---:|---:|---:|---:|
| Network Development | 176.64 | 91.51 | −85.13 | 153.72 | **−22.92** |
| Asset Preservation | 76.50 | 65.82 | −10.68 | 56.17 | **−20.33** |
| Bridge Program | 44.41 | 37.54 | −6.87 | 42.90 | −1.51 |
| Flood Management | 103.45 | 82.24 | −21.21 | 85.16 | **−18.29** |
| Convergence & Special Support | 157.31 | 156.06 | −1.25 | 169.33 | **+12.02** |
| Local Program | 14.62 | 12.27 | −2.35 | 13.09 | −1.53 |
| S2O + GAS | 69.69 | 0.00 | −69.69 | (24.69 printed) | −45.00 |
| **Total** | **642.61** | **445.38** | **−197.23** | **520.65** + 24.69 printed | **−97.57** (leaves vs all) |

## 3. Reading the deltas

**NEP API is materially incomplete (−₱197B vs official).** Confirmed absences:
- S2O + GAS (₱69.7B): no API representation at all.
- FAP accounts for ₱117.749011B of the gap, including NEP LLRN Phase I ₱35.209919B. Earlier House FAP amounts were not valid NEP gap components.
- The remaining non-FAP gap is ₱9.797B in 23 printed Nationwide/Central Office allocations; see the current reconciliation for the itemized evidence.

**House reshaping vs the NEP baseline (HB − official):**
- **Convergence +₱12.0B** — the main net insertion area: the NEP's own convention files
  barangay/local roads, MPBs, water systems under BIP/Convergence, and the House added heavily there.
- **Network −₱22.9B, Asset Preservation −₱20.3B, Flood −₱18.3B** — net trims/restructures
  relative to the executive NEP (part of the gap is executive-line items the House moved or dropped).
- **Bridge −₱1.5B, Local −₱1.5B** — essentially intact.

**HB internal consistency:** leaf zones sum exactly (PAP ₱472.71B + FAP ₱47.95B = ₱520.65B ✓);
classification coverage is 99.94% (only 27 rows / ₱0.29B unclassified).

## 4. Case study: Rainwater Collector System (₱1,027.2M) — exact three-way match

A drill-down on one PAP (`analysis/crosscheck_rainwater.py` → `crosscheck_2027_rainwater.json`) shows
what complete data alignment looks like:

| Check | Result |
|---|---|
| HB 10858 printed PAP total (PDF p.401) | ₱1,027,200,000 |
| HB region subtotals (18 region groups, PDF pp.401–411) | ₱1,027,200,000 ✓ |
| NEP API line-item sum (217 projects) | ₱1,027,200,000 ✓ |
| Per-region Δ (HB vs API) | **0 in all 18 regions** |
| DEO office-level sums vs region subtotal | ✓ all regions |

Internal bill structure: 199 DEO lines × ₱4.2M + 17 regional offices × ₱9M + 1 BARMM nationwide line
(₱38.4M) = ₱1,027.2M exactly. The API mirrors the bill 1:1 down to the office level
(`region: "Nationwide"` for BARMM). Conclusion: **the House did not alter the Rainwater Collector
System** — it passed through the NEP unchanged, so the +₱12B Convergence insertion comes from other
families (MPBs, access roads, water systems).

## 5. PAP-level drill-down — every printed PAP vs the API (42 groups)

`analysis/crosscheck_pap_drilldown.py` → `crosscheck_2027_pap_drilldown.json` parses **all 942 PDF pages**,
splits every printed PAP heading into region subtotals (verified against DEO office lines), separates
program-family intros, printed containers, and S2O support blocks, then compares each PAP with its
NEP API `pap3` group (local zone vs API; the API carries no FAP items).

**Coverage ledger (local zone):** matched PAP blocks ₱540.19B + family intro rollups ₱104.19B (children
included in matched) + S2O supports ₱24.77B + residual ₱9.87B ≈ 97.9% of the printed OPERATIONS rollup
(₱586.94B). API side: ₱445.18B of the API's ₱445.38B falls in matched groups.

**Exact three-way matches (7 PAPs)** — House passed these through untouched, to the peso:

| PAP | HB = API |
|---|---:|
| Rainwater Collector System | ₱1,027,200,000 |
| Facilities for Elderlies/ Senior Citizen | ₱340,000,000 |
| Facilities for Persons with Disabilities (PWD) | ₱85,000,000 |
| Gender-Responsive Facilities | ₱85,000,000 |
| Septage and Sewerage | ₱100,000,000 |
| Paving of Unpaved Roads - Primary Roads | ₱5,000,000 |
| Paving of Unpaved Roads - Secondary Roads | ₱21,992,000 |

**Largest House insertions vs the NEP (local zone):**

| PAP | HB | API | Δ |
|---|---:|---:|---:|
| BIP - Multi-Purpose Buildings/ Facilities | 83.71B | 40.97B | **+42.7B** |
| BIP - Access Roads and/or Bridges | 134.93B | 105.52B | **+29.4B** |
| Construction/ Maintenance of Flood Mitigation Structures | 70.96B | 61.82B | **+9.1B** |
| Construction/ Upgrading/ Rehab of Drainage (Primary) | 6.29B | 1.15B | +5.1B |
| Preventive Maintenance - Secondary Roads | 14.43B | 11.68B | +2.8B |
| Rehab/ Recon/ Upgrading of Damaged Paved Roads (Primary) | 18.61B | 17.33B | +1.3B |

**Largest House cuts vs the NEP:**

| PAP | HB | API | Δ |
|---|---:|---:|---:|
| Construction/ Rehab of Flood Mitigation Facilities (River Basins) | 16.22B | 20.36B | **−4.1B** |
| Widening of Permanent Bridges | 13.49B | 15.29B | −1.8B |
| Construction of By-Pass and Diversion Roads | 44.79B | 46.46B | −1.7B |
| Construction of Missing Links/ New Roads | 22.66B | 23.91B | −1.3B |

**Internal bill arithmetic — all 8 family rollups verify exactly:** intro heading total = sum of its
type-split children (Preventive Maintenance ₱36.09B, Damaged Paved Roads ₱28.08B, Road Widening ₱18.11B,
Roads with Slips ₱10.92B, Off-Carriageway ₱5.76B, Drainage ₱4.62B, Paving ₱0.60B, and the merged
PWD+Elderlies+Gender heading ₱510M ✓).

**Notes:** (a) the API files barangay-road items under BIP pap3s, so the +42.7B MPB / +29.4B access-road
deltas are where most House pet projects concentrate; (b) FAP-zone blocks (LLRN ₱10.1B, FAP bypasses
₱27.4B, …) have zero API coverage and are excluded from per-PAP deltas; (c) 16–17 of 18 regions show
Δ=0 per region for exact PAPs.

## 6. Line-item drill-down (level 3) — 15,188 leaf rows vs 11,372 API rows

`analysis/crosscheck_lineitems.py` → `crosscheck_2027_lineitems.json`.
The bill nests items two ways (region→DEO→items and region→items directly); matching is by
normalized project title — exact within region scope (office scope as fallback for region-less
rows), then fuzzy Jaccard ≥0.62 with amount/office tie-breaks, greedy 1:1.

| Outcome | Items | Amount |
|---|---:|---:|
| Matched (bill ↔ API) | **8,843** | — |
| …amount-equal (passed through) | 8,464 (95.7%) | — |
| …amount-changed (House re-costed) | 379 | net −₱4.0B |
| HB-only (House insertions) | **6,345** | **₱183.7B** |
| API-only (NEP items dropped from bill) | **2,529** | **₱153.2B** |

**Top House re-costings** (same project, different amount):

| Item | HB | API |
|---|---:|---:|
| Flood Control, Lamunan River (Region VI) | ₱103.2M | ₱688.9M |
| Concrete Road, Umiray, Dingalan (Region III) | ₱57.0M | ₱400.0M |
| Lake Mainit Circumferential Lipata By-Pass (R.XIII) | ₱300.0M | ₱600.0M |
| MPB Sentro Komunidad (NCR) | ₱100.0M | ₱400.0M |

**Historical API-unmatched findings:** apparent PAP-heading rollups require House PDF review. The ₱1B Disaster-Related block already exists in the NEP. Quirino K0264+968–K0281+198 ₱1.392209B is an exact amount-equal match in the current v4b artifact.

**Top NEP items dropped:** Rolando R. Andaya Highway segments (₱2.59B + ₱2.37B), Quirino H-way
K0251−K0264 ₱2.20B, Pancian Viaduct ₱2.09B, Davao City Bypass Package II ₱2.0B.

**Region handling:** leaf regions arrive in noisy OCR forms (`Region Ⅳ-A`, `egion Ⅲ`, `Region ⅩⅢ`);
all are NFKC-normalized to the 18 canonical API regions. Residual ₱40.8B of HB-only items are the
documented headingless-OCR pool (PAP text damaged at parse time) — their titles still matched at
line level where possible.

## 7. Caveats

1. HB→program mapping is keyword/canonical-label based (`hb_program_classifier.py`), tuned so that
   program sums sit within ±₱1.5B of printed control totals where the bill prints them
   (Local Program ₱12.88B printed vs ₱13.09B mapped; FAP ₱44.75B printed vs ₱47.95B leaf-captured).
2. Leaf capture is 88.7% of the printed OPERATIONS rollup; the ~₱66B gap is the previously
   documented OCR-damaged/headingless blocks plus rows attached to S2O control totals.
3. The House bill is *not* directly comparable to the API for "insertion" counting — use
   HB − **official NEP** for House deltas; use API only for line-item-level NEP content.
