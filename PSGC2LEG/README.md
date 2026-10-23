# PSGC2LEG — Provisional geographic-to-legislative crosswalk

Research-oriented, dependency-free, reproducible **GPS → PSGC location → geographic House district** bridge. Designed to complement, **not replace**, [DEO2LEG](../DEO2LEG/README.md). This branch deliberately does not change existing dashboards.

## Scope and confidence

- **Current published dataset:** named municipality and city-barangay crosswalk built from *pinned* BetterGov files and validated against the 254 DEO2LEG district IDs.
- **Not yet an official national PSGC-code crosswalk.** The two BetterGov files are related work, so agreement between them only warrants `corroborated_provisional`, not verified boundaries. A current, versioned PSA gazetteer is required to publish PSGC code keys. `byPsgcCode` is intentionally empty in the default release.
- The 2023 PSGC shapefiles used by existing `dpwh_coor2psgc_geomapping` are older than PSA's Q3 2026 PSGC masterlist. Do not silently equate these code vintages.
- This data locates a project geographically. It does **not** identify the legislator who requested, approved, sponsored, or controlled funds.

## Inputs

| Path | Use | Upstream Git blob |
|---|---|---|
| `sources/districts.json` | Municipality and city barangay assignments | `d3efd8ea21f3c6e274046c12fe9eaeac4efafc3d` |
| `sources/districts_generated.json` | Second, related geographic reference | `ebaf4f220e13e57b399a5fa9efa7c7e05f16307e` |
| `../DEO2LEG/deo_leg_crosswalk.json` | Canonical 20th Congress district IDs | local canonical graph |

Original upstream: [BetterGov open-data-visualization](https://github.com/bettergovph/open-data-visualization). Neither mapping source is an authoritative legal district boundary. The generated metadata records input SHA-256 hashes and unresolved rows.

## Build and verify

```bash
node PSGC2LEG/build.mjs
node PSGC2LEG/build.mjs --check
node --test PSGC2LEG/tests/*.test.mjs
```

The output is `outputs/psgc_leg_crosswalk.json` with `municipalities`, `barangays`, `cities` and `byPsgcCode` maps. Key formats are normalized `<province>|<municipality>` and `<city>|<barangay>`; these are **not** PSGC codes. District references are the existing `leg:...` IDs, not guessed DEO district ordinals.

## Lookup a GPS geocoder result

Use the already-existing `CombinedPSGCGeomapper(...).geomap_point(lat,lon)` to obtain an administrative result. Pass that result as JSON to the CLI:

```bash
node PSGC2LEG/lookup.mjs /path/to/geocoder-result.json
```

Supported input: `{province, municipality, barangay, municipality_psgc?, barangay_psgc?}`. Code keys take precedence **when the code index is built**; otherwise exact normalized, hierarchy-aware names are used. Every result includes `status` and `matchMethod`.

A multi-district city without a barangay returns `requires_barangay`; unmatched names return `unmapped`; conflicting source assignments return `conflict` with **no chosen district**. For a lone-district city the city's seat can be returned directly. Geocoder point failures and administrative-boundary uncertainty must be handled upstream.

## Direct GPS lookup (existing PSGC geomapper)

The repository already has `dpwh_coor2psgc_geomapping` and its 2023 administrative polygons. With that geocoder installed and initialized, use:

```bash
python3 PSGC2LEG/lookup_gps.py 14.601 120.984
```

The GPS wrapper calls `CombinedPSGCGeomapper.geomap_point(latitude, longitude)`, then the same `lookup.mjs` resolver. A returned legislative district is still a **provisional administrative crosswalk**, not a legally verified district polygon. The sample coordinates above are illustrative and do not assert a particular district. A failed polygon lookup returns `no_psgc_polygon_match`.

## Optional: compile actual PSGC numeric code keys

Supply a versioned, flattened PSGC gazetteer as a JSON array of rows:

```json
[
  {
    "province": "Test Province",
    "municipality": "Sample City",
    "barangay": "Sample Barangay",
    "municipality_psgc": "<10-digit-code>",
    "barangay_psgc": "<10-digit-code>"
  }
]
```

This is a *schema illustration*; the codes are placeholders. Obtain the actual gazetteer from the [PSA PSGC Q3 2026 masterlist](https://psa.gov.ph/classification/psgc) or a pinned validated equivalent and flatten it to those fields. No values are fabricated from name similarity.

```bash
node PSGC2LEG/build.mjs --psgc path/to/psgc_flat.json --psgc-version 2026-Q3
node PSGC2LEG/build.mjs --check --psgc path/to/psgc_flat.json --psgc-version 2026-Q3
```

Before publishing numeric codes, **manually audit** code-vintage changes, the city/barangay splits and all `psgc_code_conflict`/unmatched mappings. The optional code-index build is not currently used for the committed default output. `byPsgcCode` may be empty: don't represent this as code-complete.

## Review priorities

1. Independently validate municipality/district membership against the laws establishing/reapportioning each seat and COMELEC geography, especially new cities and redistricted provinces.
2. Check incomplete or duplicated multi-district-city barangay lists (Manila, Quezon City, Caloocan, Taguig, Davao City).
3. Add 2026-Q3 PSGC codes and verify non-unique or renamed barangays by full province+city+barangay hierarchy.
4. Handle road/segment geometry separately: a single endpoint does not imply the entire road belongs to one district.
5. Maintain representative **seat** resolution separately from geographic mapping; current ambiguous representative seats in DEO2LEG stay ambiguous.

**No project-level budget allocations are made by this package.** Counts or amounts should only be aggregated from *unique geolocated projects*, not the DEO office ledger; a multi-district project must be described as spanning districts unless segment-level cost data supports a split.
