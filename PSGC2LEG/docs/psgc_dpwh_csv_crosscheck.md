# Cross-check: DPWH-annotated PSGC CSV vs verified district catalog

**Date:** 2026-10-28
**Checked file:** `anthony_data/PSGC-3Q-2026-Publication-Datafile-with DPWH DEOs and Legislative Districts(PSGC).csv` (undated, cp1252, PSGC 3Q 2026 base + DPWH DEO/district columns)
**Reference:** `PSGC2LEG/data/psgc_leg_assignments.jsonl` + `legislative_districts.json` (COMELEC-anchored 2025 catalog, 254 seats)

## Scope of the CSV's district column

The district/DEO annotations cover **Luzon only** (regions 01–05, 13 NCR, 14 CAR, 17 MIMAROPA):
20,484 of 42,010 barangay rows carry labels. VisMin (06–12, 16, 18–19) is blank.

## Results

| Comparison | Agree | Disagree | Notes |
|---|---|---|---|
| Luzon whole-unit municipalities (single district label, n=761) | 756 | 3 | all 3 resolved against the CSV — see adjudications |
| Antipolo barangay-level (only non-NCR split city) | 16/16 | 0 | |
| NCR barangay-level (n=1,358 in catalog) | 1,346 | 12 | all 12 Caloocan: CSV predates the 3-district split (Bgys 177–188) |
| DEO ↔ district grouping (NCR) | matches `DEO2LEG` crosswalk | — | 10 DEOs, identical groupings incl. Manila-6th split N/S |

Unmapped labels (2, name artifacts only): Pateros barangays carry `TAGUIG CITY (FIRST DISTRICT)` (= Taguig–Pateros 1st in catalog); `CITY OF STA. ROSA (LONE DISTRICT)` vs catalog jurisdiction "Santa Rosa".

## Adjudicated disagreements (external evidence, 2026-10-28)

All three repo rows were `single_source` (BetterGov-only). External checks — Wikipedia
legislative-district composition pages (referencing COMELEC data) and Rappler 2025
municipal results pages (which name the district on each municipal ballot) — **side with
the repo catalog in all three cases**:

1. **Minalin, Pampanga (0305414000)** — CSV says 3rd; correct is **4th** (`leg:ph:pampanga:4:2025`).
   Evidence: Rappler "Minalin, Pamparga election 2025" shows "Representative, 4th District"
   (Bondoc); 4th district composition includes Minalin.
2. **San Francisco, Quezon (0405642000)** — CSV says 4th; correct is **3rd** (`leg:ph:quezon:3:2025`).
   Evidence: 3rd = Bondoc Peninsula municipalities incl. San Francisco; Rappler SF page shows
   "Representative, 3rd District" (Arrogancia).
3. **Paracale, Camarines Norte (0501608000)** — CSV says 2nd; correct is **1st** (`leg:ph:camarines-norte:1:2025`).
   Evidence: 2nd district = Basud, Daet, Mercedes, San Lorenzo Ruiz, San Vicente, Talisay,
   Vinzons (eastern half); Paracale belongs to the western/1st district.

The 2014 UACS/NSCB municipality-district XLSX (`uacs-nscb-municipality-leg`) agrees with
the repo on Minalin (4th) and Paracale (1st) — likely BetterGov's upstream — so it is
corroborating but not independent.

## Verdict

- The CSV's **DEO column is the valuable addition** (barangay-level DEO resolution, including
  the Manila 6th-district North/South split); used by `scripts/build_ncr_deo_geojson.py`.
- The CSV's **district column must not be treated as a source of truth**: error rate ≈ 0.4%
  on Luzon whole-units (3/759) plus the stale Caloocan mapping. It is useful as *corroboration*
  for the 756 agreeing municipalities previously marked `single_source`, but with these known
  errors it does not meet the bar to upgrade verification status on its own.
- No changes were made to the catalog — it survived the cross-check intact.
