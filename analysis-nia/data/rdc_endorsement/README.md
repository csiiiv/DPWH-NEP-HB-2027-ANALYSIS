# RDC Endorsement layer (FY 2027 NIA budget provenance)

Built **12 November 2026** from the PBC data drop `RDC ENDORSEMENT/`
(335 MB): 32 scanned resolution PDFs across 16 region/unit folders plus two
RDC XII structured xlsx lists. The question this layer answers: **do the
House FY 2027 insertions trace to RDC-endorsed regional proposals, and how
do RDC-endorsed asks compare with what the NEP actually funded?**

## Pipeline

| Step | Tool | Output |
|---|---|---|
| OCR | `rdc_ocr_batch.py` (external, tesseract 4.1.0, 200 DPI grayscale, psm 4) | `ocr_text/*.txt` (377 pages, ~12 min), `rdc_ocr_manifest.json` (sha1 per source) |
| Parse | `extract_rdc_endorsements.py` | `rdc_endorsement_dataset.json`, `rdc_resolutions.csv`, `rdc_project_rows.csv` |
| Cross-reference | `crossref_rdc_insertions.py` | `rdc_insertion_crossref.json` |

All 32 PDFs are scanned images with **no text layer**; every reading below the
`verified_totals` table is heuristic OCR and flagged for review. The
`verified_totals` are page-anchored manual readings; each entry cites its
resolution and reading basis.

## What the resolutions contain

Each region/unit folder holds the RDC resolution endorsing NIA's FY 2027
regional budget proposal to Administrator Guillen (NIA Central Office), with:
transmittal letters, tier tables (Tier 1 ongoing / Tier 2 new), attachment
project lists (UPRIIS prints the full 80+ row schedule; other regions print
summaries or separate annex resolutions), acknowledgement forms, and email
trails (NIA GovMail threads, Feb–Aug 2026).

Notable structural facts:

- **03 REGION II and 04 MARIIS are byte-identical** (sha1 `5cc89d91…`); the
  one file carries two resolutions: 02-56 (NIA RO2 ₱27,079,955,000) and
  02-57 (NIA-MARIIS ₱10,633,228,082).
- Region 2's file also carries resolutions 02-11 (CV-ISIP framework) and
  02-14 (Sierra Madre Superhighway & Dam Systems — NIA named for dam FS).
- R5's three variants differ; `.2` carries the comparison table
  (Endorsed vs NEP vs GAA) and per-province project lists.
- R11's `.2` variant upgrades the ask from ₱7,700,874,330 to
  ₱19,857,835,832 by adding named big-ticket SRIPs.
- R12 has no single budget total; Reso 130 endorses four big-ticket projects,
  Resos 187/188 endorse the Top 30 / Top 3 FS lists (structured xlsx).

## Verified FY 2027 RDC-endorsed totals

| Region/unit | Resolution | Total ask (₱) | Notes |
|---|---|---:|---|
| CAR | RDC-CAR 31 s2026 | 15,531,791,000 | incl. Tier 2 13,220,971,000 |
| Region 1 | RDC-1 29 s2026 | 22,225,583,770 | T1 9,217,125,000 / T2 13,008,458,770 |
| Region 2 | RDC2 02-56 s2026 | 27,079,955,000 | T1 20,883,855,000 / T2 6,196,100,000 |
| MARIIS | RDC2 02-57 s2026 | 10,633,228,082 | T1 1,363,833,122 / T2 9,269,394,960 |
| Region 3 | RDC3 03-39 s2026 | 26,560,481,000 | table in ₱'000 |
| UPRIIS | RDC2 03-40 s2026 | 5,341,860,310 | attachment row "TOTAL UPRIIS 2027" |
| Region 4A | RDC IV-A IV-A-05U s2026 | 5,802,245,838 | Tier 1 only |
| Region 4B | RDC IV-B 2026-092 s2026 | 6,720,000,000 | 5.64B T1 + 1.08B T2 (derived sum) |
| Region 5 | RDC V 1-06G s2026 | 8,568,777,826 | comparison table total |
| Region 6 | RDC VI 03-34 s2026 | 15,571,169,000 | "PhP 15,571.169 million" |
| Region 7 | RDC VII 38-A s2026 | 9,365,028,450 | 9,365.02845 PHP million |
| Region 8 | RDC VIII 06-H s2026 | 9,542,821,841 | 19 PPAs submitted; 15 Tier 1 endorsed (8,968,076,841) |
| Region 9 | RDC IX 012 s2026 | 10,226,000,000 | "PHP10.226 billion" |
| Region 10 | RDC X 14-09 s2026 | 5,114,425,000 | T1 1,999,965k + T2 4,984,425k + LFP 130,000k |
| Region 11 | RDC XI 26 s2026 | 7,700,874,330 | `.2` variant: 19,857,835,832 with big-ticket SRIPs |
| Region 12 | RDC XII 187/188/130 s2026 | (no single total) | 4 big-ticket projects + Top 30 / Top 3 FS lists |

**Sum of the 15 monetary asks: ₱185,984,241,447** — versus the NEP FY 2027
irrigation annex of ₱17,598,181,000 and the House annex of ₱17,999,305,000.
The RDC-endorsed regional asks are roughly **10× what the NEP funded**, the
quantitative backbone of the PBC presentation's proposal-vs-NEP haircut
narrative.

## House-insertion cross-reference

Of the **145 House insertions** (₱5,742,500,000; Senate workbook `status =
house_insertion`):

- **UPRIIS (35 rows)**: 32 have an exact-amount candidate row in the OCR'd
  RDC attachment schedule; 15 of those also share identity tokens (system,
  lateral, or barangay/work words). These are *corroborations* — the same
  project at the same amount appears in the RDC-endorsed UPRIIS proposal
  that NIA Central Office received in March–April 2026. The 17 amount-only
  matches need row review before use (round amounts can collide).
- **Region 12 (2 rows)**: Lambayong RIS (₱171.7M) and Dinganen CIS (₱12M)
  appear **nowhere** in the RDC XII resolutions or lists — they do not trace
  to RDC endorsements in this drop.
- Other regions' resolutions print summaries, not row-level schedules, so
  only region-level totals (not row matches) are possible there.

Interpretation: UPRIIS insertions largely restore projects that UPRIIS
itself proposed to the RDC and that the NEP did not fund — consistent with
the Senate workbook's insertion rows carrying UPRIIS justifications. The
RDC layer supplies the *pre-NEP proposal provenance* the Senate workbook
lacks.

## Caveats

- OCR-derived values are review candidates, not verified readings; only
  `verified_totals` (hand-read, citation-anchored) should be quoted.
- The UPRIIS attachment parse captures 80 of the printed rows summing to
  ₱2.40B of the printed ₱5.34B total; multi-line and noisy rows were not
  recovered. Do not sum `rdc_project_rows.csv` as a control.
- R5/R6/R11 file variants (`.2`, `.3`) differ in content; the dataset keeps
  all of them as separate documents keyed by sha1.
- Endorsement ≠ funding: RDC endorsement is an input to NIA CO consolidation;
  the corporate proposal the Senate workbook shows is the consolidated ask.

## Rebuild

```sh
python3 analysis-nia/data/rdc_endorsement/extract_rdc_endorsements.py
python3 analysis-nia/data/rdc_endorsement/crossref_rdc_insertions.py
```

OCR text is regenerable only with the external drop mounted; the manifest
pins each source file by sha1.
