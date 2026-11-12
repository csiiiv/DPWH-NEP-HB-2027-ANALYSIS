# NIA PBC Drop — RDC Endorsement & Proposal Findings

**Built:** 12 November 2026  
**Source:** `/media/.../NIA- PBC_Data/PEOPLE_S BUDGET COALITION REQUIREMENTS/` (RDC ENDORSEMENT 335 MB + POWERPOINT PRESENTATION 11 MB)  
**Artifacts:** [`data/rdc_endorsement/`](data/rdc_endorsement/README.md) · [`data/pbc_presentation/`](data/pbc_presentation/README.md)  
**Tests:** `analysis-nia/tests/test_pbc_drop_layers.py` (11 cases; full suite 69 OK)

This note answers two linked questions from the PBC data drop:

1. What did the RDCs endorse for NIA's FY 2027 regional budgets?
2. Do House insertions (and the corporate NEP) trace to those endorsements — and to NIA's own proposal?

---

## 1. Bottom line

The drop completes a four-stage provenance chain that the annex ledgers alone cannot show:

| Stage | Amount | Source |
|---|---:|---|
| RDC-endorsed regional asks (15 monetary units) | **₱185.98B** | Verified OCR readings of 2026 RDC resolutions |
| NIA corporate proposal (16 particulars lines) | **₱209.34B** | PBC presentation slides 12–17 |
| DBM NEP irrigation annex | **₱17.60B** | Retained `nep_nia_dataset.json` (791 rows) |
| House GAB irrigation annex | **₱18.00B** | Retained `hgab_nia_projects.csv` (828 rows) |

RDC-endorsed regional asks are roughly **10×** what the NEP funded. NIA's corporate proposal (₱209.34B) sits above the regional sum (₱185.98B), consistent with central-office items plus the regions.

Of **145 House insertions** (₱5.743B; Senate workbook `house_insertion`):

- **UPRIIS (35 rows):** most **do** appear in the RDC-endorsed UPRIIS attachment schedule (32 exact-amount candidates; 15 with shared identity tokens).
- **Region 12 (2 rows):** Lambayong RIS (₱171.7M) and Dinganen CIS (₱12M) **do not** appear in RDC XII resolutions or Top 30 / Top 3 FS lists.
- Other regions print summary totals only — row-level tracing is not possible from this drop.

---

## 2. RDC ENDORSEMENT layer

### What we received

32 scanned PDFs (no text layer) across 16 region/unit folders, plus two RDC XII xlsx lists. All 377 pages were OCR'd (tesseract 4.1.0, 200 DPI). `03 REGION II` and `04 MARIIS` are **byte-identical** and carry both RDC2 Resolution 02-56 (NIA RO2) and 02-57 (NIA-MARIIS).

Typical packet: transmittal letter → resolution with Tier 1 / Tier 2 table → acknowledgement form → email trail (Feb–Aug 2026). UPRIIS alone prints a full project-level attachment schedule.

### Verified FY 2027 RDC-endorsed totals

Hand-read, citation-anchored (`verified_totals` in `rdc_endorsement_dataset.json`). OCR-heuristic rows elsewhere are review candidates only.

| Region / unit | Resolution | Total ask (₱) |
|---|---|---:|
| CAR | RDC-CAR 31 s2026 | 15,531,791,000 |
| Region 1 | RDC-1 29 s2026 | 22,225,583,770 |
| Region 2 | RDC2 02-56 s2026 | 27,079,955,000 |
| MARIIS | RDC2 02-57 s2026 | 10,633,228,082 |
| Region 3 | RDC3 03-39 s2026 | 26,560,481,000 |
| UPRIIS | RDC2 03-40 s2026 | 5,341,860,310 |
| Region 4A | RDC IV-A IV-A-05U s2026 | 5,802,245,838 |
| Region 4B | RDC IV-B 2026-092 s2026 | 6,720,000,000 |
| Region 5 | RDC V 1-06G s2026 | 8,568,777,826 |
| Region 6 | RDC VI 03-34 s2026 | 15,571,169,000 |
| Region 7 | RDC VII 38-A s2026 | 9,365,028,450 |
| Region 8 | RDC VIII 06-H s2026 | 9,542,821,841 |
| Region 9 | RDC IX 012 s2026 | 10,226,000,000 |
| Region 10 | RDC X 14-09 s2026 | 5,114,425,000 |
| Region 11 | RDC XI 26 s2026 | 7,700,874,330 |
| Region 12 | RDC XII 187 / 188 / 130 s2026 | *(no single total)* |
| **Sum (15 monetary)** | | **185,984,241,447** |

Notes on variants:

- Region 5 `.2` carries an Endorsed vs NEP vs GAA comparison table.
- Region 11 `.2` upgrades the ask to **₱19.86B** by adding named SRIPs (Cogon Bacaca, Asbang, MIDP Cateel / Kipaliku, Caraga River–San Pedro, Padada rehab).
- Region 8 submitted 19 PPAs (₱9.54B); 15 Tier 1 endorsed (₱8.97B).
- Region 12 Reso 130 names four big-ticket projects (MRISIP, LIRIP, Tulunan SRIP, K2MIPP); Resos 187/188 endorse Top 30 / Top 3 FS lists.

### RDC XII structured lists (native xlsx)

| List | NIA entries | Status |
|---|---|---|
| Top 30 regional priorities | Kabulnan-2, Lower Malitubog, Lebak, Sepaka | All ACO **Accepted** |
| Top 3 FS proposals | Minapan Multipurpose, Lumabat River SRIP | FS costs ₱65M / ₱12.5M |

### House-insertion cross-reference

| Method | Result |
|---|---|
| UPRIIS attachment: exact amount + optional token overlap | 32/35 UPRIIS insertions have amount candidates; **15 strong** (shared system/lateral/barangay tokens) |
| RDC XII named stems (Kabulnan, Malitubog, Lebak, Tulunan, Sepaka, …) | **0** House insertions match big-ticket names |
| Region 12 restoration insertions | **No RDC evidence** in this drop |

Interpretation: many UPRIIS House insertions restore projects UPRIIS proposed to the RDC that the NEP did not fund — consistent with Senate workbook justifications. Endorsement ≠ funding; RDC input feeds NIA Central Office consolidation before NEP/House.

**Caveat:** the UPRIIS OCR parse recovers 80 attachment rows summing to ₱2.40B of the printed ₱5.34B control. Do not sum `rdc_project_rows.csv` as a control.

---

## 3. PBC presentation layer

Source: `FY 2027 BUDGET-NIA-PEOPLE_S BUDGET COALITION.pdf` (18 slides, **native** text layer). Slides 12–17 print PARTICULARS | 2026 GAA | FY 2027 Proposal (P'000) | NEP.

Amounts are machine-read and bbox-anchored; labels are hand-verified and validated 1:1 against amount triples. Full table: [`data/pbc_presentation/README.md`](data/pbc_presentation/README.md).

### Column totals (P'000 as printed)

| | 2026 GAA | FY 2027 Proposal | NEP |
|---|---:|---:|---:|
| **Sum of 16 particulars** | 49,923,323 | **209,335,298** | 33,724,893 |
| **In pesos** | ₱49.92B | **₱209.34B** | ₱33.72B |

Headline haircuts (proposal → NEP):

| Particulars | Proposal (₱'000) | NEP (₱'000) | NEP / Proposal |
|---|---:|---:|---:|
| Repair of NIS | 38,261,911 | 2,021,555 | 5.3% |
| Repair of CIS | 20,515,660 | 920,000 | 4.5% |
| Establishment of Pump Irrigation | 34,943,556 | 7,915,950 | 22.7% |
| New National Irrigation Projects | 34,939,697 | 7,561,321 | 21.6% |
| Service Roads NIS | 17,705,462 | 250,000 | 1.4% |

### Cross-checks against retained ledgers

| Check | Result |
|---|---|
| EPIP NEP ×1000 | = annex EPIP control ₱7,915,950,000 |
| Extension/Expansion NEP ×1000 | = annex ₱200,000,000 |
| CARP-IC NEP ×1000 | = agency-only CARP row ₱698,067,000 |
| CIS-related NEP rows sum | = annex CIS control ₱1,620,000,000 |

The presentation NEP column total (₱33.72B) exceeds the annex total (₱17.60B) because the slide categories (New NIP, SRIP, SIP, etc.) do not map 1:1 onto the annex's six sub-programs. Row-level mapping needs the Senate workbook hierarchy.

Sibling file `Solar Panel Cost Justification.pdf` (not extracted) defends ₱30,000/panel as a full SPIP work-item cost — context for EPIP/SPIP unit-cost scrutiny.

---

## 4. How this sits with existing analysis

| Existing layer | What this drop adds |
|---|---|
| NEP ↔ House annex comparison | Pre-NEP **ask** (RDC + corporate proposal) and the magnitude of the haircut |
| Senate workbook (submission / insertions / justifications) | Independent corroboration that many UPRIIS insertions were RDC-endorsed regional asks |
| Agency-table CARP row | Same ₱698,067,000 appears in the PBC NEP column |
| Geolocation gap (181 unlocated) | Not closed by this drop (FGIS/RIMP are separate folders, not yet ingested) |

---

## 5. Files & rebuild

```text
analysis-nia/data/rdc_endorsement/
  ocr_text/                     # 32 OCR transcripts
  rdc_ocr_manifest.json         # sha1 per source PDF
  rdc_endorsement_dataset.json  # documents + verified_totals + XII lists
  rdc_resolutions.csv
  rdc_project_rows.csv          # UPRIIS OCR rows (review only)
  rdc_insertion_crossref.json
  extract_rdc_endorsements.py
  crossref_rdc_insertions.py
  README.md

analysis-nia/data/pbc_presentation/
  pbc_budget_comparison.json
  extract_pbc_presentation.py
  README.md
```

```sh
python3 analysis-nia/data/rdc_endorsement/extract_rdc_endorsements.py
python3 analysis-nia/data/rdc_endorsement/crossref_rdc_insertions.py
python3 analysis-nia/data/pbc_presentation/extract_pbc_presentation.py
python3 -m unittest analysis-nia.tests.test_pbc_drop_layers -v
```

OCR re-run requires the external drop mounted (`rdc_ocr_batch.py` was run once into `ocr_text/`).
