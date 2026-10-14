# Highlight evidence review — 15 October 2026

Reviewed all 32 highlight actions across the four funding workspaces in the
packaged browser preview: DPWH 10, FMR 8, HFEP 5 and NIA 9. Every action opened
its intended story dialog without browser errors. Counts reflect the current
findings, not a target. The implementation reference requires a real question
and real evidence for each story.

NIA, HFEP and FMR now have contextual action buttons and tailored evidence
dialogs. Existing story IDs remain valid. DPWH's existing views were reviewed
without implementation changes.

## Workspace assessment

| Workspace | Actions and evidence | Assessment / next work |
|---|---|---|
| DPWH | Buttons already open ten custom evidence views, each with supporting tables and source actions. Separate links retain shareable story URLs. | Existing approach is the strongest reference for contextual evidence. All ten actions opened successfully. |
| FMR | Eight contextual buttons open program/region bridges, changed pairs, unmatched House allocations, coordinate evidence and source segments. Project selection retains the highlight dialog. | Funding and candidate stories have substantive questions. NEP's old empty coordinate-review modal now shows retained interpretation history, with open/history populations kept separate. Geometry/history cards are supporting context for editorial review. |
| HFEP | Five contextual buttons open the NEP overhang chain, funding/category movements, all House internal controls, flagged/interpreted facility evidence and hospital funding priorities. | The old schedule-overview card now leads with the ₱4.451B capital-outlay reduction. The former program-scope card now asks why DOH hospital allocations fall while LGU hospital allocations rise. Scope reconciliation is a collapsed note within the funding-change view; balance and extraction notes remain supporting context. |
| NIA | Nine contextual buttons now open source-derived figures, scoped supporting evidence, limits, workbench links and source-PDF actions. | Funding, matching and AI stories have substantive questions. Coverage, agency scope and extraction review are supporting context; retain pending editorial review rather than manufacture or remove stories to meet a count. |

## NIA findings and implemented evidence

| Finding | Assessment | Evidence now shown |
|---|---|---|
| Annex increase | Useful overview: the ₱401.124M net increase hides larger opposing movements. | NEP/House totals; six printed controls with CSV and PDF actions; paired + House-only − NEP-only bridge by sub-program; pairing coverage. |
| Other Irrigation System shift | Strong: the largest absolute control movement is a ₱2.54B reduction. | Only this sub-program's printed control and its comparison population; reconciled paired/unmatched amounts and printed pages. Fixed the duplicated peso prefix in the card copy. |
| Four paired reductions | Strong: a bounded population with ₱830M net reduction. | Changed-pair totals; largest reductions first; original amounts and source IDs; title actions open both retained source records. |
| Unmatched House rows | Useful investigation lead; does not prove insertion. | All 319 unmatched rows, ranked sub-program allocations, PDF/source-record actions and filtered CSV. Card now says “no unique NEP title match.” |
| Unmatched NEP rows | Useful investigation lead; does not prove cancellation. | All 282 unmatched rows, ranked sub-program allocations and largest NEP amounts first, PDF/source-record actions and filtered CSV. Card now says “no unique House title match.” |
| Pairing coverage | Methodology context; overlaps with the unmatched-row stories. Editorial review suggested. | Row and peso coverage for both ledgers, per-sub-program bridge and all supporting comparison records. Coverage is not project identity or delivery performance. |
| AI monitoring | Strong, provided amounts remain whole-project allocations. | 327 NEP rows / ₱7.01595B; 299 House rows / ₱6.34195B; 123 unmatched House AI rows / ₱2.62695B. Separate populations, title-basis filters, source actions and CSVs support each part of the claim. NEP's 59 verified OCR variants stay separately labeled. The schedules do not isolate AI cost, supplier or maintenance obligations. |
| Agency scope | Scope context, not a budget-change finding. Editorial review suggested. | House annex ₱17.999305B + CARP ₱698.067M = Operations ₱18.697372B; agency-table rows, scope notes and printed pages alongside the ₱45.172024B whole-agency total. These retained House controls do not establish a whole-agency NEP-to-House cut or increase. |
| Extraction review | Evidence-quality context. Editorial review suggested if the page is intended only for budget findings. | Selectable flagged NEP source record with adjudication notes, retained crops and PDF page; flagged and repeated-title populations. Flags include resolved extraction history; repeated titles do not prove duplicate funding. |

## Verification

- Full JavaScript suite: 226 passed, four skipped, zero failures.
- Vite production build and static packaging passed.
- All 32 highlight actions across the four workspaces opened their intended dialogs in a desktop browser.
- All 1,642 NIA project/control source references resolve to retained PDFs with pages in bounds; all 11 referenced crop files exist.
- NIA browser checks cover all nine actions on desktop/mobile, allocation exports, route reloads, nested PDF rendering, retained crops, modal scroll locking and return focus.
- All 13 HFEP/FMR actions passed packaged-site checks at 390px and 1440px, including scoped CSV values, selected-evidence reloads, correct PDF volumes, modal scroll locking and return focus.
- HFEP and FMR render smoke checks and comprehensive desktop browser checks passed across source, comparison, analysis and highlight views.

No source titles, source amounts, extraction rules or provisional pairings were
changed. Changes build on the pre-existing NIA work in the working tree.

## HFEP findings and implemented evidence

| Finding | Assessment | Evidence now shown |
|---|---|---|
| NEP control overhang | Concrete source discrepancy, modest relative to the whole budget. | Printed NEP ₱14.472659B versus facility ledger ₱14.472519B; the single ₱140,000 overhang echoed across five controls and two columns, with source-page buttons, CSV and Metro Manila arithmetic. Avoid claiming a specifically identified missing facility or adding echoed discrepancies together. |
| Capital-outlay reduction | Strong budget finding; replaces the generic “Two retained HFEP schedules” copy. | Four printed funding columns reconcile House − NEP = −₱4.451B; eight category movements independently reproduce the same change. DOH Hospitals fall ₱6.378B while LGU Hospitals rise ₱3.130155B. Both original category labels, absent-category handling, the separate NEP residual, printed pages and CSVs remain visible. |
| House controls balance | Internal-consistency context. Editorial review suggested if the page should focus on budget changes. | All 311 internal controls, each with four funding-column checks; selectable control evidence, printed/facility sums and 1,244 exported check rows. Root/grand-total echoes are excluded from the internal-check count. Parent controls are not extra funding. |
| Extraction notes | Evidence-quality context. Editorial review suggested. | Recomputed population of 19 distinct NEP facilities: 10 flagged and 11 interpreted, with overlap retained once. The old “nine” claim was stale and its flag-only table missed unflagged interpretation events. Filters, raw cells, accepted readings, documented label repairs, source PDFs and facility CSVs now support the full claim. These are not all unresolved findings. |
| Hospital funding priorities | Stronger public-interest question: why do DOH hospital allocations fall while LGU hospital allocations rise, and what could this mean for access to care? | DOH Hospitals decrease ₱6.378B; LGU Hospitals increase ₱3.130155B; the combined hospital change is −₱3.247845B. Two printed category controls and their PDF pages lead to 236 NEP hospital rows (₱11.938094B) and 254 House rows (₱8.690249B), largest allocations first, with category filters, source evidence and CSVs. Opposite movements do not prove a direct transfer or service consequences; request amendment justifications and service plans. |

The former annex/program reconciliation is now a collapsed scope note within
the capital-outlay reduction dialog, retaining its program-scope CSV and annex/
agency PDF actions. `hospital-priorities` is the new story ID; the former
`agency-check` link remains an alias for the reframed card.

## FMR findings and implemented evidence

| Finding | Assessment | Evidence now shown |
|---|---|---|
| Program increase | Strong overview of the ₱3.6281B increase. | Printed regional controls and region-level paired + House-only − NEP-only bridges, filters and control CSV. Heading search scopes both controls and the bridge. |
| Largest regional increase | Strong concentration finding: CALABARZON gains ₱776.4M. | Its printed controls and complete regional candidate population, including NEP-only observations, with the funding bridge, both source records and candidate/control exports. |
| Paired amount changes | Bounded review question. | Four changed pairs; separate gross gains and reductions and a ₱45M net paired reduction, matching basis, original source records, PDF actions and filtered CSV/JSON. Candidate identity remains provisional. |
| Unmatched House rows | Useful lead; does not prove insertion. | 355 rows worth ₱5.969005B, largest House amounts first, regional reconciliation and source PDFs, candidate records and filtered CSV/JSON. |
| NEP coordinate history | Supporting interpretation context; the old open-review list was empty. Editorial review suggested. | Zero open findings alongside 52 originally flagged projects, raw and interpreted cells, original/remaining flags, rendered evidence where retained, and project CSV. The open population remains explicitly selectable and empty; the history population is labeled separately. The onward link opens interpreted source projects. |
| House coordinate review | Concrete open evidence: two ₱10M allocations. | Both remaining findings, selectable source records, endpoint/point provenance, authored repair proposals, PDF pages and CSV. An alternate population exposes the 83 original flagged projects without presenting them as unresolved. |
| NEP/House multiple segments | Source-geometry context. Editorial review suggested if these do not warrant separate stage stories. | 13 NEP and 26 House projects, selected raw cells and each normalized segment's endpoints and interpretation basis; project allocations count once. Multiple segments do not establish duplicate funding or project splitting; endpoint distance is not constructed road length or cost/km. |

HFEP/FMR checks live in `scripts/check_annex_highlights.py`: every action is
exercised at desktop/mobile widths, including scoped CSV amounts, source-page
modals, reloads, focus restoration, population selection and overflow checks.
Pure-model tests also verify the bridges, residual, complete control population,
review-population overlap and preservation of retained source data.
