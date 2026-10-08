# HB 10858 vs DPWH NEP FY 2027 — Data Structure & Crosscheck Design

This document describes the general structure of the two datasets, how they
map onto each other, and the recursive root-down algorithm for crosschecking
budget consistency, insertions, and removals.

---

## 1. HB 10858 (House FY 2027 budget proposal) — `analysis/hb_dpwh_pap_hierarchy.json`

**Source:** `HB_BUDGET/3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.md`
(PaddleOCR markdown of the House bill's *Details of DPWH Programs/Projects*).

**Nature:** a *printed budget book* — one document, hierarchical layout,
amounts in **pesos**. Structure was reconstructed by
`analysis/parse_hb_tree.py` and validated bottom-up
(`sum(children) == printed_total` per block).

### Zones

| Zone | Rows | Contents |
|---|---|---|
| `alloc` | 0–2444 | MOOE / Support-to-Operations / GAS activity allocations (₱981.54B incl. internal rollups) — flat reference lines, not projects |
| `pap` | 2445–20961 | the project detail hierarchy (main crosscheck scope) |
| `fap` | 20962–end | Foreign-Assisted & Locally-Funded tails (loan projects, GOP/Loan splits) |

### Hierarchy (pap + fap zones)

```
Outcome  (e.g. ORGANIZATIONAL OUTCOME 1 : Ensure Safe and Reliable National Road System)
└─ Program            (Asset Preservation Program, Flood Management Program, BIP, …)
   └─ Sub-program     (Preventive Maintenance, Road Widening, …)
      └─ PAP          (Preventive Maintenance - Primary Roads, Bridge Program, …)
         └─ Region    (NCR, Region I … Region XIII, MIMAROPA, NIR, BARMM, Nationwide)
            └─ Office (District Engineering Office / Regional Office / Central Office)
               └─ project leaf  {name, amount_php}
```

Note: intermediate levels are *optional per branch* — some PAPs go straight
Region → projects (no DEO split), some sections sit directly under a Program.

### Node shape (export JSON)

```json
{
  "kind": "region",              // outcome|program|subprog|pap|region|office
  "name": "Region II",
  "row": 2453,                   // source markdown row
  "printed_total_php": 626468000,
  "children_sum_php": 626468000, // computed
  "arithmetic": "validated",     // validated|rollup_only|container|review|inferred
  "n_direct_leaves": 8,
  "projects": [ {"name": "...", "amount_php": 61977000, "row": 2454, "flag": "ok"} ],
  "children": [ … ]
}
```

**Quality:** 15,487 leaves / ₱538.80B; 90% of region blocks arithmetically
clean; leaf-level flags `ok` (15,271), `spillover` (206), `dup_in_block` (10).
See `analysis/hierarchy_report.md` for the OCR-damage classes handled.

---

## 2. DPWH NEP FY 2027 (Executive proposal) — `nep-data/json/fy2027-combined.json`

**Source:** NEP API dump (`status/code/data` envelope; also per-project detail
files `nep-data/json/fy2027-details/2027DPWH-Proposal-*.json` with attached
BP202 / Certificate-of-Implementability documents).

**Nature:** a *flat database table* — one row per project, amounts in
**thousands of pesos**. 11,372 projects, ₱445.38B total
(`data.summary.totalAmount = 445,378,063.0` thousands).

### Row shape (flat, denormalized)

```json
{
  "id": 18361,
  "code": "2027DPWH-Proposal-00001",
  "fiscalYear": 2027,
  "region": "Region IV-A",
  "office": "Batangas 2nd District Engineering Office",
  "projectName": "Improvement of Road along Poblacion Road, San Pascual, Batangas",
  "pap1": "CONVERGENCE AND SPECIAL SUPPORT PROGRAM",     // ≈ top container
  "pap2": "Basic Infrastructure Program",                // ≈ program
  "pap3": "BIP - Access Roads and/or Bridges …",         // ≈ PAP
  "amount": 33000,                                        // THOUSANDS of pesos
  "documentCount": 5
}
```

The path `pap1 → pap2 → pap3 → region → office → project` mirrors the HB
hierarchy, but it is *metadata on each row*, not a document outline — NEP has
no printed subtotals to validate against.

### Taxonomy stats

| | HB (pap+fap leaves) | NEP |
|---|---|---|
| top-level groups | 8 root sections (Outcome 1, Outcome 2, Locally-Funded, Foreign-Assisted, …) | 4 `pap1` values (OO1, OO2, Convergence & Special Support, Locally-Funded) |
| programs | 5 program-level labels in pap zone (+ FAP tails) | 8 `pap2` values |
| PAP categories | 84 distinct `pap` labels | 43 `pap3` values |
| regions | 31 (incl. OCR variants) | 18 (clean) |
| offices | 263 | 220 |
| projects (leaves) | 15,487 (pap 15,253 / fap 234) | 11,372 |
| ₱ total | ₱538.80B (pap ₱490.91B + fap ₱47.90B, pesos) | ₱445.38B (thousands) |

Exact-name overlap today: **7,722 project names** appear in both
(before normalization/fuzzy matching).

---

## 3. Key contrasts driving the crosscheck design

| Aspect | HB 10858 | NEP FY 2027 | Consequence |
|---|---|---|---|
| Shape | nested document w/ printed totals | flat rows w/ path metadata | HB validates bottom-up; NEP is ground truth per row |
| Units | **pesos** | **thousands of pesos** | ×1,000 scale when comparing |
| Amount granularity | one amount per line (subtotals everywhere) | one amount per project | compare only leaf-to-leaf |
| Identity | OCR-mangled names, no codes | `code` + clean `projectName` | need normalization + fuzzy matching |
| Region labels | `Region Ⅲ`, `egion IV-A`, NCR | `Region IV-A`, `NCR`, `CAR` | normalize via `norm_region` map |
| Coverage | includes alloc zone (₱981.5B) + FAP tails | project rows only | restrict to pap+fap leaves |
| Program labels | House rearranged some groupings (e.g. BIP under Convergence in NEP vs under OO1/OO2 sections in HB; `GANIZATIONAL OUTCOME 2` truncation) | canonical | match projects by name+region+office first, not by path |

---

## 4. Crosscheck algorithm — recursive root-down consistency checking

The user's design: **work from the roots, flag budget inconsistencies at each
level, then recursively drill into discrepancies (insertions / removals /
edits).** Concretely:

### Pass 0 — align the roots

Align HB root sections and PAPs to NEP `pap1/pap2/pap3` via a canonical
mapping (handling OCR truncation: `GANIZATIONAL OUTCOME 2` → Outcome 2;
label rearrangements: HB `Basic Infrastructure Program` spans NEP pap1
`CONVERGENCE AND SPECIAL SUPPORT PROGRAM`).

For every aligned container pair, compare:

```
hb.subtotal(pap)   = Σ amounts of HB leaves under that PAP
nep.subtotal(pap)  = Σ amount×1000 of NEP rows under matching pap2/pap3 + region/office path
```

Flag at container level:

| Flag | Meaning |
|---|---|
| `CONTAINER_OK` | totals match (± small tolerance) — subtree consistent, skip deep-dive |
| `CONTAINER_NET_DELTA` | totals differ — drill down (expected: House net addition/cut) |
| `CONTAINER_HB_ONLY` | PAP/category exists in HB but not NEP at all |
| `CONTAINER_NEP_ONLY` | exists in NEP but missing from HB (whole-program removal) |

This bounds the work: a PAP whose total matches exactly needs no project-level
comparison.

### Pass 1 — bucket reconciliation per container

Within each mismatching PAP, split into region buckets, then office buckets
(whichever level HB provides), and repeat the four flags above. Buckets that
reconcile close their subtree immediately; buckets that don't get drilled.

### Pass 2 — project-level set comparison

For every unbalanced bucket, match leaves (3-pass matcher already in
`analysis/crosscheck_hb_nep.py`):

1. exact normalized name within (office, region)
2. normalized-name global index (same region)
3. fuzzy ≥ 0.92 (token-set ratio on cleaning stationing, extra spaces, case)

Classify each leaf:

| Flag | Rule |
|---|---|
| `SAME` | matched, |Δamount| ≤ tolerance (e.g. <0.5% and <₱1M) |
| `AMOUNT_EDITED` | matched, amount differs |
| `MOVED` | matched by name globally, but office/region/path changed |
| `INSERTED_IN_HB` | HB leaf with no NEP partner → **House addition (pet project candidate)** |
| `REMOVED_FROM_HB` | NEP row with no HB partner → **House deletion** |
| `DUPLICATE_RISK` | HB `dup_in_block` flag or many:many name match |

### Pass 3 — audit trail & aggregation

Produce:

- a **variance tree** mirroring the hierarchy, where every node carries
  `hb_total`, `nep_total`, `delta`, `flag`, and counts of child flags — so a
  reader can drill from ₱-level root deltas down to the exact inserted/removed
  projects that compose them (insertions − removals + edits ≈ container delta,
  verified arithmetically);
- a flat `findings` list sorted by ₱ impact;
- summary stats: House net addition, net removal, amount-edited count, and the
  top named projects by each class.

### Why this is sound

- Every container comparison inherits the **already-validated** HB arithmetic
  (review blocks are known OCR damage, treated with tolerance, not silently
  mixed into deltas);
- Reconciling subtrees are pruned early (Pass 0/1), so fuzzy matching — the
  expensive, error-prone step — only runs where money actually doesn't add up;
- Insertions/removals are *provably complete* per bucket: any amount not
  explained by matched pairs is, by construction, in one of the two classes.

---

## 5. Deliverables planned

| File | Contents |
|---|---|
| `analysis/crosscheck_v2.py` | root-down recursive implementation |
| `analysis/crosscheck_tree.json` | variance tree (per-container deltas + flags) |
| `analysis/crosscheck_findings.json` | flat findings: SAME/AMOUNT_EDITED/INSERTED/REMOVED/MOVED |
| `analysis/report.md` (update) | headline stats + top insertions/removals |
| `canvases/hb-nep-crosscheck.canvas.tsx` (update) | interactive drill-down |
