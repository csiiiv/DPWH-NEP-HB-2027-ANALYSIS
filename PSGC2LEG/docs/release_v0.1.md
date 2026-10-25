# PSGC2LEG Release v0.1 — Municipality-Level Baseline (2025/20th Congress)

> **Historical release note.** The deferred barangay-level work described
> below has since been completed for all 13 multi-district cities. See
> [`split_city_geometry.md`](split_city_geometry.md) for the current dataset and
> visualization status.

**Generated:** 25 October 2026
**Scope:** Municipality/city-level PSGC→LEG assignment nationwide (committed target).
Barangay-level splits (stretch goal) deferred; split cities carried as
`multi_district_city` records. Metro Manila barangays optional per scope decision.

## Datasets (data/)

| File | Contents | Rows |
|---|---|---|
| `psgc_locations.jsonl` | Canonical PSGC entities (Q3 2026 mirror foundation) | 43,768 |
| `legislative_districts.json` | 2025 LEG catalog, jurisdiction-qualified IDs | 254 |
| `psgc_leg_assignments.jsonl` | Municipality/city → LEG assignments w/ provenance | 1,656 |
| `assignment_report.json` | Coverage, unmatched, UACS cross-check | — |
| `comelec_annexA_seats.json` | Extracted Annex A fragments (OCR, for audit) | — |
| `psgc_summary.json` | PSGC catalog validation summary | — |

## Coverage

- **1,493/1,493 municipalities** and **149/149 cities** + 14 Manila sub-municipal
  districts have assignment rows — **zero missing**.
- 1,629 whole-unit assignments; 27 multi-district-city records (awaiting
  barangay-level stretch-goal pass).
- 35 of 254 districts have no whole-unit coverage — all are seats of the 13
  split cities (Manila 6, QC 6, Caloocan 3, Cebu City 2, Davao City 3, Makati 2,
  Marikina 2, Parañaque 2, Valenzuela 2, Zamboanga City 2, CDO 2, Antipolo 2,
  Taguig 2nd... plus Pateros which IS assigned whole to Taguig–Pateros 1st).
- Pateros: whole-unit to `leg:ph:taguig-pateros:1:2025` per COMELEC Res 11069.

## Validation results

1. **PSGC totals** vs PSA Q3 2026 announcement: 18 regions ✓ 82 provinces ✓
   1,493 municipalities ✓ 42,010 barangays ✓
2. **LEG count** = 254 ✓ (COMELEC Res 11050 Annex A baseline; per-region
   subtotals all reconcile)
3. **UACS 2014 cross-check**: 1,411 comparable rows — 1,297 agree (91.9%).
   114 disagreements cluster exactly in provinces reapportioned since 2014
   (Southern Leyte 19, Aklan 16, Isabela 15, Cavite 11, Agusan del Norte 11,
   Davao del Sur 10, Cebu 8, Bulacan 7, South Cotabato 5, Bataan 4, Laguna 3,
   Batangas 2, Rizal 2, Camarines Norte 1) — spot-verified Bataan vs current
   law composition: BetterGov values correct, UACS 2014 values stale.
4. **Zero invalid leg_ids**; all assignment rows carry source refs.

## Provenance & confidence

- Whole-unit assignments: `bettergov-districts-generated` (single source,
  spot-verified against current reapportionment laws via Bataan test case and
  Annex A seat counts).
- Pateros & Taguig handling: `comelec-res-11069`.
- 15 manual overrides (BetterGov gaps: Lanao del Sur munis, Pangutaran, Hadji
  Muhtamad, 8 new BARMM municipalities): `provisional_name_match` status,
  pending citation pass vs enacted laws/COMELEC documents.
- Split cities: `provisional`, awaiting barangay stretch-goal.

## Known limitations

1. BetterGov is a composite civic-tech dataset — municipality-level values
   agree strongly with UACS where boundaries haven't changed, but a systematic
   law-text verification pass (RA numbers per district) remains open.
2. The 8 new BARMM municipalities (interim province 19999) are assigned to
   Maguindanao del Norte lone provisionally — verify vs the actual SGA
   plebiscite ordinances.
3. Isabela City votes in Basilan's lone district (BetterGov) though coded in
   Region IX — retained with review note.
4. Annex A PDF is a scan; the extracted `comelec_annexA_seats.json` has OCR
   noise and is kept for audit purposes only, not as data.
5. PSGC foundation is the validated community mirror (2026-10-12); swap to
   official PSA XLSX when network allows (byte-level provenance upgrade).

## Regeneration

```
python3 scripts/archive_source.py <id> <url>          # re-download any source
python3 scripts/build_psgc_catalog.py                 # Phase 1
python3 scripts/extract_annexA_seats.py               # Phase 2a (audit)
python3 scripts/build_leg_catalog.py                  # Phase 2
python3 scripts/build_assignments.py                  # Phase 3
```

All outputs deterministic given identical `sources/raw/` contents.
