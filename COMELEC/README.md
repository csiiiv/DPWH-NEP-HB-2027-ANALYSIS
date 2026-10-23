# COMELEC — electoral-geography source layer (2025 baseline)

This is the **source-ingestion layer** for `PSGC2LEG` and **not** the PSGC hierarchy or the DEO association map. No dashboard behavior is changed. The 20th Congress (2025–2028) baseline uses the May 12, 2025 elections.

## Order of authority / provenance

1. **COMELEC electoral geography:** House legislative seats, participating municipalities/cities, and ultimately direct barangay assignments for cities divided into House districts.
2. **Dated laws and COMELEC resolutions:** supersede obsolete district assignments in the correct election-year interval. Do not apply a law retroactively; preserve prior administrative and electoral boundaries.
3. **PSA PSGC gazetteer:** administrative geographic codes, names, regions, provinces and barangay parentage. PSGC itself does not encode legislative districts.
4. **UACS/NSCB legislative mapping:** earlier reference for diffing and detecting changes; age of its XLSX remains unverified.

See [source_manifest.json](sources/source_manifest.json) for links, acquisition state and limits. The source manifest never silently claims a downloaded or validated file.

**Independent control total:** 254 geographic House districts as of the 2025 NLE, confirmed by the PSA in its September 12, 2025 legislative-district press release. The existing `DEO2LEG` ID registry also contains 254 district IDs, but it is not a primary COMELEC geographical boundary source.

## First runnable step: extract typed first-column records

The [official 2025 elective-positions report](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/12202024_NoOfElectivePositions2025NLE.pdf) is a 61-page PDF with mixed headings for **legislative**, **provincial** and **councilor** districts. The initial extractor outputs *typed raw records with PDF page numbers*. It intentionally **does not infer municipal membership** or label the result as verified until the structural rows have been reviewed.

```bash
python3 -m pip install pymupdf
mkdir -p COMELEC/sources/2025 COMELEC/data/2025
# Download the source PDF manually from the URL in sources/source_manifest.json
python3 COMELEC/extract_positions_2025.py \
  --pdf COMELEC/sources/2025/12202024_NoOfElectivePositions2025NLE.pdf \
  --out COMELEC/data/2025/elective_position_rows.review.json
python3 -m unittest discover -s COMELEC/tests -v
```

The output is deliberately labeled `reviewRequired: true`. When turning it into `district_municipalities.json`, a validator must require explicit `house_legislative` district type, correct seat-owner hierarchy, page/row provenance, unique locality+election ownership, all 254 House district IDs and an exact PSGC locality reconciliation. Province-board or councilor districts must **never** be imported as congressional boundaries.

The official COMELEC **List of Barangays by Legislative/Councilor District** is referenced in [PSA's 2025 census district publication](https://psa.gov.ph/system/files/phcd/Press%20Release%20on%20Legislative%20District%20%282024%20POPCEN%29.pdf) but an original machine-readable copy has **not yet been retrieved**. The barangay stage remains blocked on that direct source or individually verified legally binding maps.

## Planned separate root datasets

| Dataset | Authority | Current stage |
|---|---|---|
| `2025/legislative_districts.json` | COMELEC 2025 House seat roster | official 254-seat control total; complete source rows not extracted |
| `2025/district_municipalities.json` | COMELEC city/municipality list | PDF first-column raw extractor supplied; review and reconciliation pending |
| `2025/district_barangays.json` | COMELEC barangay-by-LD reference | cited by PSA but direct source not acquired |
| `legislative_changes.json` | applicable laws/COMELEC resolutions | partial statutory references in `../PSGC2LEG/sources/official_reference_cases.json` |
| `psgc_admin_2026q3.json` | PSA administrative masterlist | separately ingest after selecting exact PSA release |
| `uacs_legacy.json` | UACS/NSCB | future historical discrepancy report |

**Important:** a PDF source document and an implemented parser do not constitute a verified complete root dataset. Unmatched and ambiguous areas stay explicitly unassigned. This avoids accidentally promoting stale BetterGov maps or city councilor divisions into congressional geometry.

## Time and attribution

Each assignment ultimately needs `validFromElection`, `validToElection` (optional), `districtType: house_legislative`, source ID, page/row identifier and review status. Codes must preserve leading zeros and use a named PSGC vintage. Geographic constituency does **not** prove that a legislator authored or influenced an appropriation.
