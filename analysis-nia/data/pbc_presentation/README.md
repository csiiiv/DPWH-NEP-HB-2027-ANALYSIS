# PBC presentation layer (NIA FY 2027 proposal vs NEP)

Built **12 November 2026** from `POWERPOINT PRESENTATION/FY 2027
BUDGET-NIA-PEOPLE_S BUDGET COALITION.pdf` (18 slides, native text layer,
sha256 `f5b497c9…`) — NIA's own response to the People's Budget Coalition.

## What it adds

The only source in the drop that prints **NIA's original FY 2027 corporate
proposal** beside the 2026 GAA and the NEP, per particulars line, plus
physical targets (ha) and (on slides 8–10) the 2020–2030 physical-target and
investment schedules. This is the missing leg of the
RDC-endorsed → corporate-proposal → NEP → House GAB chain:

- RDC-endorsed regional asks (see `../rdc_endorsement/`): **₱185.98B**
- Corporate proposal (this layer): **₱209.34B**
- NEP irrigation annex (retained dataset): **₱17.60B**
- House GAB annex (retained dataset): **₱18.00B**## Extracted table (P'000 as printed)

| PARTICULARS | 2026 GAA | FY 2027 Proposal | NEP |
|---|---:|---:|---:|
| Climate Change Adaptation Works (National Systems) | 82,000 | 5,494,505 | 200,000 |
| Climate Change Adaptation Works (Communal Systems) | 600,000 | 223,000 | 200,000 |
| Rehabilitation and Protection of Watershed Mgmt | – | 473,221 | 100,000 |
| Improvement of Service Roads in NIS | 1,583,891 | 17,705,462 | 250,000 |
| Improvement of Service Roads in CIS | 550,000 | 2,389,865 | 250,000 |
| Repair of NIS | 11,425,497 | 38,261,911 | 2,021,555 |
| Repair of CIS | 4,211,262 | 20,515,660 | 920,000 |
| Repair of Pump Irrigation Systems | 667,405 | 10,415,188 | 3,000,000 |
| Restoration of NIS | 1,140,980 | 7,260,567 | 1,000,000 |
| Restoration of CIS | 1,434,564 | 13,245,386 | 250,000 |
| New National Irrigation Projects | 13,034,801 | 34,939,697 | 7,561,321 |
| Small Reservoir Irrigation Projects | 3,801,346 | 11,083,425 | 4,579,000 |
| Establishment of Pump Irrigation Projects | 7,473,641 | 34,943,556 | 7,915,950 |
| Small Irrigation Projects / Special Irrigation | 2,154,500 | 6,462,840 | 4,579,000 |
| Extension / Expansion of Existing Irrigation Systems | 881,248 | 1,765,300 | 200,000 |
| Comprehensive Agrarian Reform Program - IC | 882,188 | 4,155,715 | 698,067 |
| **Column totals** | **49,923,323** | **209,335,298** | **33,724,893** |

Physical targets (NEP column callouts): Restore Area 2,243 ha (slide 15),
New Area 1,226 ha (slide 16), New Area 3,926 ha + Restore 513 ha (slide 17).

## Method and validation

Amounts are **machine-read** from the native word layer, column-anchored on
the GAA/PROPOSAL/NEP header words (callout-box "NEP" labels are excluded by
flanking-relationship checks), each cell keeping its bbox. Labels are
hand-verified readings validated 1:1 against the machine-read amount triples
— the build fails unless every verified (gaa, proposal, nep) triple appears
exactly once in the geometric extraction.

Cross-dataset checks that pass:

- EPIP NEP 7,915,950 ×1000 = 7,915,950,000 = NEP annex EPIP control.
- Extension/Expansion NEP 200,000 ×1000 = 200,000,000 = annex control.
- CARP-IC NEP 698,067 ×1000 = 698,067,000 = the agency-only CARP row
  absent from the annex (matches `analysis-nia` agency-table reading).
- CIS rows sum: 920,000+250,000+250,000+200,000 = 1,620,000 ×1000 = annex
  CIS control exactly.
- Proposal column total 209,335,298 P'000 ≈ RDC regional asks 185.98B +
  central-office items — two independent totals of the same ask.

Not reconciled (left for workbench integration): the PBC NEP column total
(33.72B) exceeds the NEP annex total (17.60B) because the presentation's
category set spans development-program lines (New NIP, SRIP, SIP) printed
differently from the annex's six sub-programs; the row-level mapping needs
the Senate workbook hierarchy.

The slide-12 fourth row "Repair of Slope Protection at Panakuyan RIS"
prints no FY 2027 amounts in the text layer (likely a 2026-only row cut off
by the slide layout) and is not included.

## Files

| File | Contents |
|---|---|
| `extract_pbc_presentation.py` | Extractor with 1:1 validation; rebuilds from the mounted drop |
| `pbc_budget_comparison.json` | 16 budget rows + 4 physical targets, bboxes, cross-checks |

## Rebuild

```sh
python3 analysis-nia/data/pbc_presentation/extract_pbc_presentation.py
```

Sibling document: `Solar Panel Cost Justification.pdf` (same folder) defends
the ₱30,000/panel SPIP work-item cost (700 Wp bifacial HJC, Tier 1, supply
+ install + taxes) — relevant context for the 354 EPIP/SPIP annex rows, not
yet extracted.
