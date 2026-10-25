# PSGC Delta Ledger — 4Q 2023 → 3Q 2026

**Status: RESOLVED by generated diff.** The Q3 2026 foundation was acquired via
the `bendlikeabamboo/barangay` community mirror (version 2026-10-12, exactly
matching the PSA 3Q 2026 release date). The municipality-level diff below was
**machine-generated** from `psgc_locations.jsonl` (old) vs the mirror (new) and
matches every official PSA announcement.

## Municipality-level and above (code changes affecting joins)

| Change | Codes | LGUs | Official basis |
|---|---|---|---|
| **Negros Island Region (NIR) created** — Negros Occidental, Negros Oriental (ex-Dumaguete HUC), Siquijor moved to region 18 | `0604xxxxxx→1804xxxxxx`, `0704xxxxxx→1804xxxxxx`, `0706xxxxxx→1806xxxxxx` | 19 munis + Bacolod HUC + Dumaguete CC + Siquijor munis (63 total LGU code changes) | RA 12009 (2024) |
| **Sulu province transferred BARMM → Region IX** | `1906xxxxxx→0906xxxxxx` | 19 municipalities | EO 91, s. 2025 |
| **8 new BARMM municipalities** created from Cotabato SGAs (63 barangays) under interim province code 19999 | new codes `1999901000`–`1999908000` | Kapalawan, Old Kaabakan, Kadayangan, Nabalawag, Pahamuddin, Malidegao, Ligawasan, Tugunan | Cotabato SGA plebiscites 2023-2024, PSA Board Res 13/2021 interim coding |

Municipality count: 1,485 (4Q 2023) → **1,493 (Q3 2026)**; regions 17 → **18**;
barangays 42,001 → **42,010** (net; one merge in Calaca offset by creations).

## Barangay-level only (no municipality impact)

- Q1 2026: Bgy San Rafael merged into Bgy Dacanlao, Calaca City, Batangas (SC G.R. 234228)
- Q1 2026: names corrected: 1 municipality + 7 barangays
- Q2 2025–Q3 2026: ~95 same-code barangay name corrections (e.g., disambiguation suffixes in Sorsogon)
- Q3 2026: Bgy Lambangan → Lambagan, Cabanglasan, Bukidnon

## Davao del Norte municipality rename (Q2 2026)

Per PSA Q2 2026 announcement, one municipality + one barangay renamed following
RA 11814 plebiscite (11 Apr 2026). The machine diff of same-code names showed
**no municipality-level rename** between our 4Q 2023 file and the 2026-10-12
mirror — the affected municipality had presumably already carried the new name,
or the rename is sub-municipality in effect. **No PSGC2LEG join impact.**

## Reference totals (PSA, 30 Sep 2026) — all validated ✓

18 regions · 82 provinces · 33 HUCs · 116 other cities (5 ICC + 111 CC per PSA;
mirror counts 6 ICC due to Isabela City 'not a province' edge case) ·
1,493 municipalities · 42,010 barangays.

## Notes

- **Isabela City (0990100000)**: ICC geographically in Basilan, administratively
  outside BARMM. PSGC annotates '(Not a Province)'. Modeled as ICC city; no
  municipality-level LEG impact (Basilan's lone district covers it).
- Lucena City: HUC for statistical purposes per PSA Board note; assignment unchanged.
- Foundation remains provisional in provenance terms (community mirror) though
  fully validated in content; swap to official PSA XLSX when network allows.
