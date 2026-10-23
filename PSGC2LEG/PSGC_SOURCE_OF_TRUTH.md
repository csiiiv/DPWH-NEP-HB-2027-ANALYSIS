# PSGC administrative reference (Q3 2026)

The legislative mapper must begin with the **complete PSGC geography**, not from the number of barangays that happened to appear in DEO, BetterGov, or budget extracts.

Official PSA [Q3 2026 publication (Excel)](https://psa.gov.ph/system/files/scd/PSGC-3Q-2026-Publication-Datafile.xlsx): the authority for 18 regions, 82 provinces, 149 cities, 1,493 municipalities, **42,010 barangays** (as of September 30, 2026). **PSGC is NOT a congressional electoral district classification.** District assignments require separate, time-specific laws/COMELEC/city government evidence.

## Included registry and provenance

- `outputs/psgc_admin_registry_2026-10-12.json`: complete code-keyed hierarchy from the [bendlikeabamboo/barangay](https://github.com/bendlikeabamboo/barangay) **2026-10-12** release, [pinned source blob](https://github.com/bendlikeabamboo/barangay/blob/50d9ab4228414beb51bb2a3067f9d6fb4e057248/barangay/data/barangay_flat.json).
- **Provenance caveat**: the parsed mirror was downloaded and count/parent validated but the primary PSA Excel file could not be fetched into this environment, so it remains **unverified against the original source bytes**. Do not claim verified 2026 PSA equivalence or automatically elevate community mappings to official.
- `psgc_registry.mjs`: independent strict PSGC-code-based lookup and parent navigation.
- `psgc_registry_lookup.mjs`: CLI for code/name lookups. Repeated place names are resolved by code and parent; never merge by name only.

Data shape: `records: { "1381300022": ["Commonwealth", "barangay", "1381300000"] }`, alongside source hashes/vintage and complete per-type counts. The listed 150 city-like entities in this *parsed hierarchy* include an extra structural City of Isabela layer (a parent record and a city record); PSA headline reports 149 cities. No synthetic province is created for NCR's highly urbanized cities. Special geographic area, submunicipalities, and BARMM are retained; a city need not have a province parent.

## Run

```bash
node PSGC2LEG/psgc_registry_lookup.mjs check
node PSGC2LEG/psgc_registry_lookup.mjs 1381300022
node PSGC2LEG/psgc_registry_lookup.mjs find Commonwealth
node PSGC2LEG/psgc_registry_lookup.mjs children 1380100000
node --test PSGC2LEG/tests/*.test.mjs
```

## Architecture

```text
GPS -> 2023 geometry (may not include newly changed PSGC codes)
              |
              v
    PSGC code + geometry provenance
              |
              v
 PSGC registry -> verified administration hierarchy
              |
              v
 PSGC2LEG electoral table (independent evidence and date)
              |
              v
 canonical DEO2LEG leg:<jurisdiction>:<seat>
```

Each of the 42,010 barangay PSGC codes must exist **whether or not** it can be assigned to a legislative district. A null district means *unresolved electoral mapping*, not a nonexistent barangay. `DEO2LEG` office association must never be used to override location-level membership.

## Before declaring PSGC masterlist canonical

Import and compare the **original** September 2026 PSA spreadsheet against the pinned mirrored snapshot, preserving the exact workbook SHA256 and legal corrections (e.g. Lambangan -> Lambagan). Diff additions/deletions/renames/parent changes and quarantine discrepancies. Then publish a first-party-ingested version as the primary registry and retain this mirror only as cross-check evidence.

Name-based legal/official benchmark remains at [OFFICIAL_SOURCE_AUDIT.md](OFFICIAL_SOURCE_AUDIT.md); it is *not* automatically expanded over the entire PSGC registry.


## Cross-check with the original PSA publication

Download the [official PSA 3Q 2026 publication file](https://psa.gov.ph/system/files/scd/PSGC-3Q-2026-Publication-Datafile.xlsx). The local importer reads the `PSGC` worksheet directly using Python's standard library; **no Excel conversion and no third-party libraries are needed**.

```bash
python3 PSGC2LEG/audit_official_psgc.py PSGC-3Q-2026-Publication-Datafile.xlsx --output PSGC2LEG/outputs/psa_primary_comparison.json
```

The resulting report records the workbook SHA-256 and every code missing, added or renamed compared with the pinned full-length mirror. The official workbook must be adjudicated before asserting full first-party verification. The old provisional legislative mapping remains an *independent*, separately sourced dimension.
