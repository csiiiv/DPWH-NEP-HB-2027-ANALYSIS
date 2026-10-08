# FY2027 NEP source audit — additional local references

Date: October 8, 2026. Scope: FY2027 DPWH only. PDF page numbers below are one-based file pages.

**Complete-tree follow-up:** [nep_2027_tree.md](nep_2027_tree.md) and [interactive tree](nep_2027_tree.html) cover all new appropriations, including Personnel Services. Every additive branch balances exactly (2,552 checks); 237 independent native-text discrepancies remain in an explicit image-review queue. Recursive balance isolates hierarchy/amount problems but cannot rule out equal-and-opposite OCR errors among siblings.

**Follow-up completed:** see [nep_2027_api_reconciliation.md](nep_2027_api_reconciliation.md). The ₱9.797B residual is now accounted for by 23 printed allocations. A normalized operations reference balances all 45 non-FAP PAP controls and totals ₱572.924074B including FAP; the extraction limits below describe the original raw tree.

## Finding

The supplied directory contains a useful source NEP reference: `pdfs/NEP-2027-VOLUME-2B_OCR.pdf` (722 pages), plus a retained PAP hierarchy covering PDF pages 115–690. Its PDF page 8 confirms the existing ₱642,612,015,000 new-appropriations baseline and all six operations program totals in the reference compilation.

The operations-to-API gap can now be split into a printed foreign-assisted component and a much smaller non-FAP residual. No existing API or House dataset was changed.

## Gap decomposition

| Component | PHP |
|---|---:|
| NEP new appropriations | ₱642,612,015,000 |
| Saved API rows | ₱445,378,063,000 |
| Overall difference | ₱197,233,952,000 |
| GAS + S2O across expense classes | ₱69,687,941,000 |
| NEP operations | ₱572,924,074,000 |
| Foreign-assisted projects | ₱117,749,011,000 |
| Non-FAP operations | ₱455,175,063,000 |
| Non-FAP operations minus API | ₱9,797,000,000 |

Identity: **₱197,233,952,000 = ₱69,687,941,000 + ₱117,749,011,000 + ₱9,797,000,000**.

The 25 FAP project rows on PDF pages 688–690 sum exactly to the printed ₱117,749,011,000. No exact normalized project title matches were found in the API. This supports a major FAP coverage omission, but a semantic overlap audit remains necessary before asserting every FAP project is absent under every possible title.

## Operations programs after separating FAP

Amounts in ₱B. Local Program non-FAP includes the ₱1B PPP Strategic Support Fund and ₱13.433675B National Building Program.

| Program | Official | FAP | Non-FAP | API | Non-FAP residual |
|---|---:|---:|---:|---:|---:|
| Asset Preservation Program | 76.500584 | 8.082301 | 68.418283 | 65.806283 | 2.612000 |
| Network Development Program | 176.637644 | 84.457720 | 92.179924 | 91.476924 | 0.703000 |
| Bridge Program | 44.410122 | 5.422533 | 38.987589 | 37.487589 | 1.500000 |
| Flood Management Program | 103.450431 | 19.603487 | 83.846944 | 82.176944 | 1.670000 |
| Convergence and Special Support Program | 157.308648 | 0.000000 | 157.308648 | 156.105648 | 1.203000 |
| Local Program | 14.616645 | 0.182970 | 14.433675 | 12.324675 | 2.109000 |

For every program, the non-FAP and FAP printed controls add exactly to the reference-compilation total. FAP controls are on pages 688–690; non-FAP controls are on pages 195, 262, 312, 347, 404, and 678.

## Corrections to earlier interpretations

- **The ₱1B Disaster-Related Infrastructure block exists in the NEP.** PDF page 430 (printed page 426) has its heading, NCR/Central Office allocation, and ₱1B project. API absence cannot establish that it is a House insertion. Earlier work-summary/report wording needs revision.
- NEP LLRN Phase I is **₱35.209919B**, on page 688. The earlier ₱10.1B figure was a House amount and cannot quantify the missing NEP allocation.
- The FAP National Building Program in this NEP is **₱182.970M**, page 690. Earlier ₱12.9B House-side wording must not be used as a NEP gap component.
- MOOE is only part of GAS/S2O. The NEP already has **₱24.685746B MOOE**, including **₱1.505758B GAS** and **₱23.179988B S2O** (page 115). Their equality to House MOOE amounts does not by itself establish equality of the full GAS/S2O budgets.
- PDF page 7 totals **₱643.953276B**, including automatic appropriations; page 8 totals **₱642.612015B** new appropriations. Keep these scopes distinct.

## Reference inventory

| Artifact relative to supplied directory | Use / limitation |
|---|---|
| `pdfs/NEP-2027-VOLUME-2B_OCR.pdf` | Full source: summary, operating units, PAP, local and FAP blocks |
| `pdfs/2027-Details-of-DPWH.pdf` | 576-page PAP extract; page 1 corresponds to full PDF page 115 in the checked first-page sample |
| `output/NEP-2027-VOLUME-2B_OCR/002.40-pap-tree/tree.json` | 16,453 nodes with labels, amounts, parent links and source pages; 11,217 project-kind nodes |
| `output/NEP-2027-VOLUME-2B_OCR/002.30-by-ou-tree/tree.json` | Separate operating-unit allocation hierarchy for independent reconciliation |
| `output/NEP-2027-VOLUME-2B_OCR/002.50-tree-totals/validation.json` | Retained rollup checks and causes/candidates for mismatches |
| `output/2027-Details-of-DPWH/001.00-paddle-ocr/pages/` | 576 retained OCR page JSON files; QA reports 576 processed, zero failures |
| `output/2027-Details-of-DPWH/002.10-token-geometry/pages/` and `002.11-token-geometry-repair/pages/` | 576 page artifacts each; no canonical PAP tree found in this run |
| `xlsx/NEP-FY2027.xlsx` | Workbook exists with sheets `NEP 2027` and `Sheet1`; contents/totals not audited |
| `reports/dpwh-2027-nep-interpellation-tldr.md` | Secondary analysis with useful NEP page references; not an independent budget source |

## Extraction limits and next step

Retained totals QA has 17 mismatches overall: 9 PAP and 8 operating-unit. Several are explicit rollup/detail double counts and parenting defects. The raw PAP project-kind sum is **₱569.579633B**, but it mixes scopes and is not a verified operations total. Do not ingest the hierarchy by simply summing nodes or selecting every apparent leaf.

Completed: reconciled the **₱9.797B non-FAP residual** and built `nep_2027_source_projects.json` with validated PAP rollups. Source-presence reassessment identifies 33 previous House-only rows with same-region exact NEP titles, plus 97 region conflicts and nine possible heading/allocation rows. Review those conflicts and the 173 OCR candidate API pairs before a full source-based House rematch.

Evidence and exact program arithmetic: `analysis/nep_2027_source_audit.json`.
