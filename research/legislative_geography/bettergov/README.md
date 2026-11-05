# BetterGov legislative-geography source audit (independent PR)

This is a **read-only ingestion audit** of the [BetterGovPH data-source claims](https://visualizations.bettergov.ph/sources) and the backing [open-data-visualization](https://github.com/bettergovph/open-data-visualization) repository. Its purpose is to help develop the **2025 COMELEC → legislative district → PSA PSGC** pipeline safely.

It **does not** assign an authoritative electoral district to any barangay and **does not** change the DPWH dashboard or the earlier [draft PSGC2LEG PR #2](https://github.com/csiiiv/DPWH-NEP-HB-2027-ANALYSIS/pull/2). Nothing is merged automatically.

## Documents

- [`source_manifest.json`](source_manifest.json): exact upstream commit, blob SHA-1, source-page claims, and official PSA district-count control.
- [`audit.mjs`](audit.mjs): reproducible pinned-source audit with SHA verification.
- [`audit_report.json`](audit_report.json): complete summary and **every conflicting city/barangay assignment**, with an election-derived suggestion preserved as a *candidate*.
- [`tests/audit.test.mjs`](tests/audit.test.mjs): schema, coverage and safety regressions.

## Findings

- The BetterGov source catalog reports 256 districts, while the **PSA/COMELEC official May 2025 geographic-district total is 254**. These denominators should not be silently equated.
- `districts.json` is marked *in progress* with an internal metadata date of **2025-11-06** and a reported count of **162**.
- `city_barangays_mapping.json` contains **136 cities / 7,418 named barangays** in its hierarchy, but that file does **not** assert membership in congressional districts.
- `districts_generated.json` has **1,627 top-level municipality/city records** and nested city barangay seats derived from `scripts/extract_districts_from_elections.py`, which scans 2025 election results for House contests. These must be checked against dated COMELEC constituency reference lists.
- The primary city listing contains **253 city-qualified barangay names assigned to more than one district** (including erroneous placeholder values such as `barangays`). The independent election-derived label, where present, is preserved as a candidate for review—not published as verified.
- The generated tree includes `Agusan Del Norte → City Of Butuan → Lone District`. That province-group placement is insufficient to identify Butuan's **separate** House seat created under [RA 11714](https://lawphil.net/statutes/repacts/ra2022/ra_11714_2022.html) effective for the 2025 election. It requires congressional seat identity verification.

Count notes: locality rows are **source keys**, not counts of unique current PSGC administrative units. Member/party-list records are not a substitute for counting House geographic seats. There is **no assertion of nationwide PSGC completeness** in this report.

## Reproduce (Node.js 22+)

```bash
node research/legislative_geography/bettergov/audit.mjs
node research/legislative_geography/bettergov/audit.mjs --check
node --test research/legislative_geography/bettergov/tests/*.test.mjs
```

The script downloads four files at the exact pinned upstream commit and verifies each Git blob SHA-1 *before* reading it. To run with local mirrored files, provide `--source-dir /path/to/repo`, preserving upstream relative paths.

## Proposed path into PSGC2LEG

1. Use **COMELEC 2025** direct legislative/councilor-typed electoral geography as the binding election-year source. Do **not** conflate councilor and House districts.
2. Overlay dated statutes/COMELEC resolutions (e.g. RA 11714), keeping source URLs and effective-election scope.
3. Resolve municipalities and barangays to the 2026 PSGC release for administrative identity and parentage; avoid guessing PSGC codes.
4. Treat BetterGov's pinned 2025 election-derived district labels as **crosschecks/candidates**, not the source of truth when there is a conflict.
5. Produce a separate coverage report: PSGC barangays with a verified House seat, unmapped, conflicting, or stale. Only then promote the vetted join.

The report intentionally contains no person-level project or funding attribution.
