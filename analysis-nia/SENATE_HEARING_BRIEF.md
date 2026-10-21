# NIA FY 2027 Irrigation Budget — Senate Hearing Brief (Department of Agriculture scope)

**Prepared for:** Senate deliberations on the FY 2027 budget of the Department of Agriculture and attached corporations
**Covers:** National Irrigation Administration (NIA) detailed irrigation project annex — House GAB (HB 10858, 2nd reading, verified text-identical to 3rd reading printing) vs DBM NEP
**Not covered:** The wider DA budget; NIA's agency-level appropriations table, subsidy rows, and object-of-expenditures are outside the detailed annex ledger compared here.
**Every figure below recomputes from retained source ledgers with PDF-page evidence:** https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/#nia/home

---

## 1. Bottom line

- **House GAB annex: ₱17.999B** (828 project rows) vs **DBM NEP: ₱17.598B** (791 rows) → **net House add-on: +₱401,124,000 (+2.3%)**.
- All six printed sub-program controls reconcile to the peso on both sides. The movement is a **reallocation between sub-programs**, not a net expansion.
- Most of the schedule is unchanged: **606 of 791 NEP rows (76.6%) and 606 of 828 House rows (73.2%) pair under corrected title matching — 602 pairs with identical amounts plus 4 changed pairs**.
- Only **4 paired titles changed amount — all reductions, totaling −₱830M**.
- After verified title correction, only **176 House rows (₱6.300B) have no NEP counterpart at all** and **138 NEP rows (₱5.054B) have no House counterpart at all**. These validated figures are **stable regardless of matching method** (asserted in tests).

## 2. Where the +₱401M moved

| Sub-program | NEP | House GAB | Δ |
|---|---|---|---|
| Communal Irrigation System | ₱1.620B | ₱3.243B | **+₱1.623B** |
| National Irrigation System | ₱4.662B | ₱5.471B | **+₱809M** |
| Establishment of Pump Irrigation | ₱7.916B | ₱8.467B | **+₱551M** |
| Extension/Expansion of Existing Systems | ₱200M | ₱200M | 0 |
| Other Irrigation Systems | ₱3.000B | ₱460M | **−₱2.540B** |
| Special Irrigation | ₱200M | ₱158.1M | **−₱41.9M** |

**Narrative:** additions to Communal, National, and Pump Irrigation are financed almost entirely by cutting **Other Irrigation Systems by ₱2.54B (−85%)** and Special Irrigation by ₱41.9M.

## 3. Paired projects

- 602 of 606 pairs carry **identical amounts on both sides**.
- The 4 amount changes are **all reductions** (NEP → House), totaling **−₱830M** net paired movement.
- Funding identity holds exactly: paired Δ (−₱830M) + House-only (₱7.382B) − NEP-only (₱6.151B) = **+₱401.124M annex delta**.

## 4. Unmatched rows — candidates, not certified changes

Unmatched means *no unique same-title counterpart exists*; it does not certify an insertion or deletion. Following the standard candidate convention, unmatched rows split into:

| | Validated — no counterpart found | Unresolved — plausible counterpart |
|---|---|---|
| **House-only (insertion candidates)** | **176 rows / ₱6,299.8M** | 46 rows / ₱1,081.9M |
| **NEP-only (deletion candidates)** | **138 rows / ₱5,053.7M** | 47 rows / ₱1,096.9M |

- The **unresolved** rows carry deterministic near-miss marks — spelling variants (`San Rogue` ↔ `San Roque`, `Cerdeña` ↔ `Cerdefia`), barangay-location qualifiers (`… in Brgy. X`), or repeated-title ambiguity. They are held out of headline counts pending page-level review.
- **Key robustness guarantee:** the validated pool is **identical under strict raw-title matching and corrected matching** (176/138 rows, same pesos). Title-matching choices cannot move a row in or out of the validated counts — asserted by automated tests on every rebuild.
- Under raw strict titles the same residual reads 319 House-only / 282 NEP-only; the difference (97 pairs) is fully explained by **59 verified NEP OCR misreads** (`Al/AL/AT Monitoring` → `AI Monitoring`, each checked against rendered PDF pages) and `Monitoring` ↔ `Monitoring System` wording. These are document-printing artifacts, not government actions, and are now quarantined in the unresolved bucket rather than inflating insertion claims.

## 5. AI monitoring spotlight (pump irrigation projects)

- AI monitoring population: **NEP 327 projects (₱7.016B) → House 299 (₱6.342B) = net −₱674M**.
- **273 of 299 House AI projects are the same NEP items at identical amounts (₱5.786B paired on both sides)** — so the whole −₱674M comes from unmatched rows, not from amount cuts.
- Split of the AI residual:
  - **House-only validated: 13 rows / ₱295M** — nine satellite-assisted rows, Aliaga (₱50M), two location-specific PBRIS EXTN rows, BALAKAN (₱15M). This is the ceiling on genuinely new House AI items.
  - House-only unresolved: 13 rows / ₱261M (spelling, location, repeated-title marks).
  - **NEP-only validated: 40 rows / ₱954M** — the real source of the net AI reduction: NEP AI projects the House schedule does not carry.
- **Neither schedule itemizes the AI component cost** — amounts are whole irrigation-project allocations.

**Quotable:** *"At most ₱295M of House AI-monitoring insertions are genuinely new; the ₱674M net reduction is driven by roughly ₱1.2B of NEP AI projects absent from the House schedule. No document isolates what the AI systems themselves cost."*

## 6. Methodology and defensibility

- Sources: printed annex controls and native text-layer extraction (House) and OCR-verified extraction (DBM NEP standalone PDF), with word-level provenance and PDF-page references for every row.
- Matching: unique canonical title within sub-program; repeated titles never pair even when amounts agree. Two labeled methods (strict; corrected AI titles) share one ledger; stored titles and amounts are never rewritten — only matching keys are normalized.
- Candidate marks require equal amounts and a unique one-to-one counterpart; they are review pointers, never certified pairs.
- Automated checks on every rebuild: partition invariants, money identities, mark symmetry, one-to-one consumption, and anchor figures for both methods.

## 7. One-line takeaways for the record

1. *"The House added ₱401M net to NIA — funded by an 85% cut to Other Irrigation Systems."*
2. *"Only four projects changed amount, all reductions worth ₱830M; everything else is the same money, same titles."*
3. *"176 House rows worth ₱6.3B have no NEP counterpart at all — that figure is immune to title-matching choices."*
4. *"The ₱674M AI-monitoring cut is a scheduling artifact of unmatched NEP items (₱954M validated NEP-only), not a priced reduction of AI systems."*

## 8. Caveats

- Candidate status ≠ certified insertion/deletion; unmatched rows await counterpart review.
- Amounts are whole-project allocations; no itemized AI-monitoring or component costing exists in either document.
- The House agency table's CARP row and broader appropriation are scope context only; this brief covers the detailed irrigation annex.
- The retained House schedule is the 2nd-reading printing; its 46 annex pages were verified text-identical to the 3rd-reading printing, so figures state coverage for both readings without implying a change ledger between them.
