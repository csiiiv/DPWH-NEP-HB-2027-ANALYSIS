# PSGC → legislative district mapping (2025 House-seat baseline)
`outputs/psgc_to_leg_2025.json` enumerates **every PSGC code** from the separately versioned [administrative registry](PSGC_SOURCE_OF_TRUTH.md), with a House district ID or `null`, mapping status, provenance and candidate conflicts. It does not collapse 42,010 barangays into the incomplete list found in BetterGov's research snapshots.

## Evidence hierarchy

1. **2025 COMELEC electoral geography**, once the full primary source has been ingested and reviewed. [COMELEC source layer](../COMELEC/README.md) records current acquisition status.
2. **Effective enacted laws / COMELEC resolutions**, here represented by a limited manually transcribed statute fixture in `sources/official_reference_cases.json`. The published `verified_statute` status applies ONLY to those exact records.
3. **PSA PSGC** for administrative ID, name and parent only. The bundled registry mirror is pinned but still needs comparison to the original Q3 2026 XLSX.
4. **UACS/NSCB historical crosswalk** for versioned comparison once its workbook is ingested.

Until the nationwide direct COMELEC location dataset is ingested, this build also retains **explicitly provisional** BetterGov research mappings as a *fallback*, never as verified geography. The Quezon City Council 30-row sample is preserved for independent review but cannot automatically assert House constituency (councilor districts might differ).

## Build and inspect
```bash
node PSGC2LEG/build_code_mapping.mjs
node PSGC2LEG/build_code_mapping.mjs --check
node --test PSGC2LEG/tests/*.test.mjs
```

Format is intentionally compact but complete:
```json
{
 "asOfElection": 2025,
 "records": {
   "1381300022": [null, "conflict", "bettergov_barangay"]
 },
 "coverage": {
   "barangayCodes": 42010
 }
}
```
Each record is `[legislativeDistrictIdOrNull, status, sourceId]`. Use `unresolvedCandidates` only as review hints, never as final district assignments. The result includes status definitions, SHA-256 hashes of all local source files, and a summary of roster coverage.

The source law fixture is **not** nationwide. The correct outcome for unsupported or conflicting memberships is `null`, never a fabricated congressional district. All municipality/child barangay legal assignments explicitly specify source IDs; inherited child mapping is marked `verified_statute_inherited` only if the entire municipality is assigned by law. County/city name collisions use the PSGC parent chain; NCR HUCs are allowed to have no province parent.

Before citing district-level budget totals: verify the applicable election date, reconcile PSGC vintages, and preserve multi-district or spatially spanning projects without guessing fractional allocations.
