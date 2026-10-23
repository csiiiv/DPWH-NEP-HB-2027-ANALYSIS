# Independent online-source cross-check — PSGC2LEG

**Audited:** 2026-10-23  
**Status:** independent *sample* benchmark; published provisional crosswalk remains unchanged.  
**Machine-readable findings:** [`outputs/official_crosscheck_report.json`](outputs/official_crosscheck_report.json)  
**Pinned benchmark fixture:** [`sources/official_reference_cases.json`](sources/official_reference_cases.json)

## What was checked

We manually transcribed geographic district assignments from **six enacted reapportionment acts** and one official Quezon City Council district directory, then compared their expected 20th-Congress `leg:...` seat IDs against `resolveLocation()` in the provisional crosswalk. Law provisions apply to the specified effective elections; city-council data is a current web directory, not a statute.

| Independent reference | Locations checked | Agreed | Wrong district | Conflicted | Roster-name mismatch | No lookup |
|---|---:|---:|---:|---:|---:|---:|
| [RA 11546 — Bulacan](https://lawphil.net/statutes/repacts/ra2021/ra_11546_2021.html) | 23 | 7 | 1 | 15 | 0 | 0 |
| [RA 11553 — Bataan](https://lawphil.net/statutes/repacts/ra2021/ra_11553_2021.html) | 12 | 12 | 0 | 0 | 0 | 0 |
| [RA 11533 — Rizal](https://lawphil.net/statutes/repacts/ra2021/ra_11533_2021.html) | 9 | 9 | 0 | 0 | 0 | 0 |
| [RA 11804 — South Cotabato](https://lawphil.net/statutes/repacts/ra2022/ra_11804_2022.html) | 11 | 11 | 0 | 0 | 0 | 0 |
| [RA 11714 — Agusan del Norte](https://lawphil.net/statutes/repacts/ra2022/ra_11714_2022.html) | 11 | 0 | 0 | 0 | 11 | 0 |
| [Quezon City Council official district list](https://qccouncil.quezoncity.gov.ph/) | 30 sampled barangays | 7 | 0 | 23 | 0 | 0 |
| [RA 11545 — Caloocan third district](https://lawphil.net/statutes/repacts/ra2021/ra_11545_2021.html) | 11 | 0 | 0 | 0 | 0 | 11 |
| **Total** | **107** | **46** | **1** | **38** | **11** | **11** |

**These are test-case outcomes, not a nationwide accuracy percentage.** Cases were selected to test laws with recent reapportionment and problematic city assignments. The two BetterGov inputs are related and must never be treated as two independent primary sources.

## Priority findings

1. **Wrong assignment: Baliuag, Bulacan.** The provisional single-source assignment returns `leg:bulacan:4th`. [RA 11546](https://lawphil.net/statutes/repacts/ra2021/ra_11546_2021.html) places Baliuag in Bulacan's **2nd** legislative district. This is not merely an ambiguity.
2. **Bulacan conflicts:** 15 of its 23 statutory municipality cases return `source_conflict` rather than a district. These are deliberately not guessed from two inconsistent BetterGov snapshots.
3. **Agusan del Norte 2025 split:** All 11 municipality checks have the correct `leg:agusan-del-norte:lone` *candidate* but are blocked by an older unmatched seat label present in source observations. [RA 11714](https://lawphil.net/statutes/repacts/ra2022/ra_11714_2022.html) clearly separates Butuan City's lone seat from the provincial lone district effective for the 2025 elections.
4. **Quezon City:** 23 of 30 independently sampled barangays are source conflicts. Example: the city council places **Commonwealth** in District 2, but the provisional data offers several different district candidates. Keep these source-specific observations explicit.
5. **Caloocan:** The 11 third-district barangays in [RA 11545](https://lawphil.net/statutes/repacts/ra2021/ra_11545_2021.html) return no mapping through the current name resolver. Do not mistake this for evidence that the locations have no electoral district. Also reconcile [RA 11993's 2024 division of Barangay 176](https://lawphil.net/statutes/repacts/ra2024/ra_11993_2024.html) before inferring present-day codes from the 2021 law's first-district list.
6. **Bataan, Rizal and South Cotabato:** All 32 tested municipality cases agree with the selected legal provisions, but this does not validate every source record in those provinces.

## Separate PSGC reference audit

[PSA's September 30, 2026 PSGC release](https://psa.gov.ph/classification/psgc) confirms the current administrative-code vintage; it corrected **Lambangan → Lambagan** in Cabanglasan, Bukidnon, and retained 42,010 barangays. **PSGC is not an electoral district register.** We identified the official `PSGC-3Q-2026-Publication-Datafile.xlsx` download but did not import the workbook into this benchmark. The committed `byPsgcCode` index therefore remains empty until that file is ingested, validated and harmonized with the repo's 2023 geometry.

[The PSA API](https://psa.gov.ph/classifications-api/psgc) describes a token-based geographic lookup; [its access guide](https://psa.gov.ph/classifications-api/access-guide) describes obtaining a token. The API does not expose a nationwide legislative-district mapping in its documented PSGC fields. **Never infer a legislative district from PSGC code digits.**

## To reproduce

```bash
node PSGC2LEG/crosscheck_official.mjs --check
node PSGC2LEG/crosscheck_official.mjs      # regenerate report
node --test PSGC2LEG/tests/*.test.mjs
```

The report is source-linked row by row, so every suggested repair can be reviewed and proved before adding a **separate, versioned, higher-confidence statutory/electoral override layer**. Do not overwrite the raw BetterGov observations; a correction should carry its source URL, vintage and scope.

## What remains

- Extend statute checks across all seats, not only the seven selected sources; cite enacted law and effective election.
- Audit current COMELEC city-barangay district registries where available; distinguish city council districts from congressional districts when they do not coincide.
- Convert the official 2026 PSA code masterlist to a versioned location gazetteer; handle renamed/merged/split units and 2023 polygon mismatches.
- Verify geographic **coverage and joins**, not merely seat-name availability.
- Only then use geolocated projects to support district-level budget analysis, preserving multi-district segments and never implying sponsorship.
