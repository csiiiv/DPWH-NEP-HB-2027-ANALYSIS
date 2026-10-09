# Native I-C DPWH named-project extraction and rollup checks

Date: 9 October 2026. Scope: the peso-denominated project detail of DPWH on
pages 9–942 of `HB_BUDGET/3 - HB 10858 VOL IC.pdf` (Volume I-C, House Bill
10858, FY 2027), extracted from the native InDesign text layer without OCR.

The additive [Native I-C JSON](../data/hb_dpwh_native_ic_projects.json)
sums to **₱639,179,718,000** (MOOE + Capital Outlays), with **15,972 named
project leaves plus 29 FAP project totals**, 3,380 office-node occurrences
and 1,471 region-node occurrences. Office/region counts are repeated hierarchy
positions, not distinct offices or regions. **2,477/2,477 internal nodes balance to the peso**, zero
amount or continuation rows are unexplained, and all closing controls agree.

## Cross-volume agreement with Native I-B

I-C prints the DPWH detail twice by expense class — MAINTENANCE AND OTHER
OPERATING EXPENSES (pp9–45, before the CO banner) and CAPITAL OUTLAYS (pp45–942) — with no
Personnel Services detail. The like-for-like controls all agree exactly:

| Control | I-C (PHP) | I-B (PHP) |
|---|---:|---:|
| Operations core (OO1 + OO2 + Convergence) | 528,316,707,000 | 528,316,707,000 |
| Locally-Funded Projects | 13,875,943,000 | 13,875,943,000 |
| Foreign-Assisted Projects | 44,749,011,000 | 44,749,011,000 |
| I-C MOOE+CO + independently printed I-B PS | 654,102,015,000 | 654,102,015,000 (total) |

The implied Personnel Services figure — I-B total minus I-C MOOE+CO — is
**₱14,922,297,000**, exactly the PS column of the I-B summary. The two
volumes now corroborate each other through **56 checks**: operations/LFP/FAP,
agency PS/MOOE/CO, separate GAS/S2O MOOE and CO values, and all **45 shared
I-B PAP/program controls**. Control identity uses explicit label/path aliases,
never matching amounts. The I-B artifact is included in the provenance hashes,
closing the loop left open in
the [I-B checks](hb_native_ib_rollup_checks.md).

## Geometry and repairs

Indent bands (normalized label x): ~59.2 / 68.3 / 78.9 / 89.5 / 95.5 /
100.0 / 112.2 / 124.3 / 140.7. Bold Tahoma spans mark printed control
headings; regular spans are region/office/project rows. Amount tokens are
the trailing comma-grouped numerals at the row's right edge (the single
AMOUNT column), so long titles crossing the nominal amount-column x are
not mis-split.

| Defect | Repair | Evidence |
|---|---|---|
| One standalone title glyph (U+0000) on p490; three trailing nulls on pp561/800 | One title recovered from following lines (`title_recovered_from_wraps`); all four carry `null_glyph_cleanup` | p490 = "Construction of Concrete Road (Section 1: Sta. 0+000 – Sta. 0+292, Section 2: Sta. 0+114 – Sta. 0+497, Section 3: Sta. 0+000 – Sta. 0+132) at Barangay Paliueg, City of Ilagan, Isabela", ₱10,000,000 |
| Amounts printed up to 6pt off the title baseline (pp685, 751, 762) | Second-chance merge of a lone-amount cluster into a lone-label cluster within 6pt | Batangas 2nd DEO closes to ₱889,000,000 after the ₱50,000,000 "Rehabilitation of Multi-Purpose Building" row merges |
| Family containers printed at the same indent as their parts ("Preventive Maintenance" vs "- Primary/- Secondary/- Tertiary Roads") | Fold the following same-band bold sibling prefix whose sum reaches the container exactly | 7 family containers folded (APP, NDP, Bridge, Water Supply, …) |
| Rollup echoes: NCR/Central Office rows repeating a childless parent's amount (pp9, 45, 49, 939) | Suppress as second printed observations; recorded in the audit (211 rows) | GAS/S2O/FAP heads print banner → NCR → CO trios repeating the same amount before the real detail |
| Two-digit enumerators print ~4–5pt left ("10. Region" vs "9. Region") | Widen by enumerator width, but only when the raw x matches no band | Region sequences 9–17 share one level; "14. Region X" drift (x=100.3 vs siblings 95–96) snaps to its sequence level |
| MOOE/CO print separate GAS/S2O allocations | Both expense-class branches retain their own allocations once; closing banners are checked separately | MOOE = GAS₉+S2O₉ and CO = GAS+S2O+OPERATIONS both close exactly |

Continuation lines attach to the preceding amount row, including across page
boundaries and deeper-indented FAP loan references. Each imported node records
its constituent PDF pages, source-row IDs, and raw text in `source.title_rows`.
Tests verify p561 Pangpang/San Agustin and San Antonio rows and p800 school IDs
and coordinate tails independently of their amounts. The former implementation
prepended ordinary wraps to the following project; balanced arithmetic did not
expose that title damage.

Funding dash/blank rows are recorded as nine zero funding observations rather
than merged into the preceding label. There are 49 positive funding leaves under
29 FAP projects; comparison records consume each project total once.

No allocation amount was adjusted and no residual allocation was invented.

## OCR-era v5 reconciliation

The four OCR-era gaps documented in
[native v5 reconciliation](hb_native_v5_reconciliation.md) are repaired
natively here. Example: the v5 placeholder `v5:row:11336:2228` (☐,
₱10,000,000, Convergence · Region II) is the p490 Paliueg row above; OCR
had shifted titles one row down, giving the ₱5M Annaronan project's amount
to Paliueg and ₱41.8M to the wrong road. With the native tree in place,
the v4b/v5 OCR chain (`hb_dpwh_leaves_corrected_v5.json` and the
`v5:row:*` identifiers) is retired from the current comparison pipeline. The
I-C named-project layer replaces it as the project-title source under the [dual-baseline ADR](adr/0002-separate-controls-and-project-titles.md).

## Checks and audit trail

The [machine audit](../data/hb_dpwh_native_ic_rollup_audit.json) contains
every recursive check, closing control, cross-volume control, echo list,
repairs, and source/code SHA-256 hashes.

- **2,477 recursive checks:** every internal node's leaf sum equals its
  printed control; `difference_php` is zero everywhere.
- **3 closing controls:** OPERATIONS = outcomes sum; CAPITAL OUTLAYS =
  GAS+S2O+OPERATIONS; MOOE = GAS₉+S2O₉.
- **56 independent cross-volume checks**, including 45 shared PAP/program controls.
- **211 rollup echoes** accounted as second printed observations — none
  silently dropped; **zero unexplained amount or continuation rows**.
- Every node reachable exactly once from the root; each source leaf
  consumed once (`rollup` raises on double consumption).
- Regression tests tamper with rows before outline construction (amount
  shifts, out-of-band rows, control tampering) and require the audit to
  catch each. Additional tests alter the independently printed PS column and
  offset two PAP amounts while keeping operations unchanged.

## Reproduce

```sh
python3 scripts/hb_native_rollup.py
python3 scripts/hb_native_ic_rollup.py
python3 scripts/hb_native_ic_rollup.py --check
python3 -m unittest scripts.tests.test_hb_native_ic_rollup -v
python3 analysis/builders/build_current_pages.py
python3 analysis/builders/build_stage_trace.py
python3 scripts/validate_current_pages.py
```

## Remaining gaps

- The title spanning pp936–937 retains both page references and has a source
  regression. Original hyphenation is preserved; only whitespace and null
  glyphs are normalized.
- The recovered p490 title and three glyph-cleaned titles remain flagged for
  downstream spot-checks.
- Native I-C now supplies the NEP candidate matcher, stage trace, downloads, and
  packaging, using `hb:ic:*` source IDs. The operations comparison retains
  16,270 allocations totaling ₱586,941,661,000; 44/44 mapped NEP-facing local
  PAP controls balance and the old extraction gap is zero. One NEP PAP has no
  mapped House control; that alone does not establish removal.
- Candidate matches are not certified project identities. NEP row evidence,
  API release coverage, and House amendment completeness remain open;
  `comparison_ready` stays false.
- `HB_BUDGET_3rd_reading/` is a separate, unprocessed source set. These outputs
  continue to describe the supplied `HB_BUDGET/` PDFs.
