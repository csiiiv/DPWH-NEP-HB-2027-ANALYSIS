# FMR coordinate flags and normalization

Updated **12 October 2026**. The [normalizer](normalize_hgab_fmr_coordinates.py) processes all **964 HGAB FMR projects**, including the original **83 coordinate-review projects**. Most original flags describe formatting or multi-section structure, rather than missing or incorrect coordinates.

The preferred result is the [normalized JSON](data/hgab_fmr_coordinates_normalized.json), where **each coordinate pair is `[longitude, latitude]`** and each project's `coordinates` is **an array of segment arrays**. Separate segments stay separate; their endpoints are not joined into one continuous road geometry.

## What the original flags mean

Counts below are project counts and overlap. “Normalized” means the format was interpreted with no remaining review flags; it does not certify the surveyed position or the road's geography.

| Original extraction flag | Original projects | Normalized | Still need review | Interpretation and handling |
|---|---:|---:|---:|---|
| `coordinate_format_needs_review` | 63 | 57 | 6 | The first extractor accepted only simple decimal pairs. The normalizer also handles DMS, smart quotes, degree symbols, hemisphere labels, spacing after a decimal point, semicolons, axis labels, lists, and section markers. Actual digit/value problems remain flagged. |
| `out_of_range_or_reversed_decimal_pair` | 13 | 12 | 1 | Most are longitude-first pairs, such as `120.58051, 18.20349`. Hemisphere labels, or a first value greater than 90 followed by a valid latitude, establish the order. Both values in the remaining pair look like longitudes, so neither is invented as a latitude. |
| `endpoint_count_or_section_structure_needs_review` | 10 | 8 | 2 | Multiple starts/ends normally represent multiple segments. Explicit sections pair by section identifier. Station-labelled pairs can supply endpoints. A source-value problem and a single-point record still require review. |
| `section_specific_endpoints` | 1 | 1 | 0 | `START (SEC 1)`, `START (SEC 2)`, `END (SEC 1)`, `END (SEC 2)` become two segments, each with its own start/end array. |
| `outside_philippines_orientation_bounds` | 2 | 0 | 2 | Parsed numeric values fall outside the broad latitude 4–22 / longitude 116–127 orientation bounds. The values remain numeric with flags; the normalizer does not guess replacement digits. |
| `no_explicit_start_end_markers` | 3 | 2 | 1 | Two rows have a coordinate at each of two increasing station limits, so start/end roles are inferred and recorded. One row has two station limits but only one LAT/LONG point; it remains an unspecified point. |
| `nonstandard_endpoint_marker` | 2 | 2 | 0 | `STAR:` and `STARTt:` are interpreted as START, with a normalization rule recording that decision. Raw text remains unchanged. |

The original flags stay in `original_review_flags`. The normalized layer has its own `review_flags`; successful formatting interpretations are listed separately in `normalization_rules`.

## Coordinate arrays and segments

For `ib:p678:r10`, the printed project has two explicitly numbered sections. Its normalized project entry includes:

```json
{
  "project_id": "ib:p678:r10",
  "segment_count": 2,
  "coordinates": [
    [[121.783702, 16.464822], [121.805868, 16.466869]],
    [[121.809653, 16.467103], [121.810549, 16.468489]]
  ]
}
```

The outer array contains segments. Inside each segment, the pairs are ordered **start, end**, with **longitude before latitude**. The project's `segments` objects additionally retain section labels, point IDs, pairing rules, and review flags. Its `points` objects retain individual coordinate arrays, endpoint roles, original fragments, and source offsets.

Section patterns supported include:

| Source pattern | Pairing |
|---|---|
| `START (SEC 1)` / `END (SEC 1)` | Match explicit section number. |
| `Section 1 START: ... END: ...` | Section applies to the following endpoints until the next section. |
| `START: Section 1: ... Section 2: ... END: Section 1: ... Section 2: ...` | Match explicit section number across start/end lists. |
| `START: S1-... S2-... END: S1-... S2-...` | Match S1, S2, etc. |
| `START: (1)... (2)... END: (1)... (2)...` | Match numbered list labels. |
| Several unnumbered pairs under START and END | Pair first start with first end, second with second, etc.; record `segments_paired_by_source_list_order`. This is an inferred correspondence, not an explicit source section identifier. |

There are **26 multi-segment projects**. The normalized output preserves **1,004 segment records** and **2,007 point observations** across all 964 projects. One segment record is an unpaired single-point observation, rather than a complete start/end segment.

Unavailable points are `null` array elements rather than fabricated coordinates. The invalid end pair in `ib:p670:r4`, for example, produces `[[120.540087, 18.152453], null]` inside its single segment. The single-point record `ib:p689:r18` produces `[[[120.396365, 15.713972]]]` at project level, with an `unspecified` endpoint role and review flags. It is not claimed to be a line or either endpoint.

These are coordinate observations and endpoint pairs, not a surveyed road alignment or a reconstructed polyline. The source does not specify a coordinate reference system or datum. The script converts angle notation to decimal degrees without claiming or transforming to EPSG:4326.

## Format conversions

Decimal and DMS interpretations retain their source fragments and applied rules:

| Source example | Normalized `[longitude, latitude]` | Rule |
|---|---|---|
| `120.58051, 18.20349` | `[120.58051, 18.20349]` | Longitude-first source reordered into named axes; the output array is always longitude first. |
| `16. 259313, 119.971428` | `[119.971428, 16.259313]` | Remove whitespace inside a decimal token. |
| `13°51’06.55”N, 121°08’43.75”E` | `[121.1454861111, 13.8518194444]` | Normalize Unicode punctuation; convert degrees + minutes/60 + seconds/3600. |
| `8.54'22.32"N, 125.29'41.134` | `[125.4947594444, 8.9062]` | DMS uses a dot between degrees/minutes; the final seconds quote is omitted. The conversion is recorded explicitly. |
| `14.648739° Y: 120.502743°` | `[120.502743, 14.648739]` | Interpret the numeric pair and remove the literal axis label. |
| `9.006130, 126.158518o 285` | `[126.158518, 9.00613]` | Preserve `o 285` separately as a trailing annotation rather than a third coordinate. Its meaning is not asserted. |

Conversions are rounded to at most **10 decimal places**, a storage limit rather than a claim of measurement precision. Hemisphere markers establish axes and signs where supplied. DMS minutes/seconds and global latitude/longitude ranges are checked; conflicting axis/sign markers are rejected.

Three probable numeric source typos have **candidate conversions**, which remain `needs_review`:

| Project | Raw value | Candidate | Recorded rule |
|---|---|---|---|
| `ib:p680:r19` | `14828381` | Latitude `14.828381` | `missing_latitude_decimal_candidate` |
| `ib:p703:r11` | `123.691.92` | Longitude `123.69192` | `extra_decimal_separator_candidate` |
| `ib:p723:r3` | `7:005288` | Latitude `7.005288` | `colon_decimal_separator_candidate` |

Those candidates appear in the numeric columns and arrays **with `source_numeric_repair_candidate` flags**. They are proposals, not verified corrections. The original text and first extraction stay intact. Other suspicious digits, such as longitude `129.8030109` or latitude `1.8042275`, are retained as printed and are not “fixed” from neighboring values.

## Remaining normalized-layer flags

**950 projects normalize without remaining flags.** Of the original 83 flagged projects, **74 normalize** and **9 remain**. A distance screen adds **5 previously unflagged projects**, bringing the remaining queue to **14 projects**. Formatting success is distinct from geographic correctness.

| Normalized-layer flag | Projects | Meaning |
|---|---:|---|
| `endpoint_distance_over_100_km` | 9 | Start/end straight-line separation exceeds 100 km. This is a source-value review heuristic, not road length or proof of an error. Values stay unchanged. |
| `source_numeric_repair_candidate` | 3 | Candidate interpretation changes punctuation within numeric digits; review before treating it as accepted. |
| `outside_philippines_orientation_bounds` | 2 | A numeric pair is globally valid but outside the broad Philippines orientation envelope. |
| `invalid_coordinate_pair` | 1 | Two values cannot establish a valid latitude/longitude pair; normalized pair is null. |
| `single_point_without_endpoint_roles` | 1 | Source supplies one coordinate without identifying it as start or end. |
| `missing_or_ambiguous_segment_endpoint` | 1 | No complete pair of endpoints exists for that single-point record. |

Counts overlap. See [the remaining review CSV](data/hgab_fmr_coordinate_issues.csv) for all 14 project records and their raw text, candidates, arrays, page references, and flags. The point CSV preserves flags at point level, including a null pair for the one invalid observation.

## PSGC cross-validation of flagged coordinates

Added **12 October 2026**. The [PSGC validator](validate_fmr_coordinates_psgc.py) geocodes every flagged project's printed points, read from the normalized JSON by point ID, with the [dpwh_coor2psgc_geomapping](../dpwh_coor2psgc_geomapping) submodule (PSA 2023 PSGC shapefiles) and classifies each result against the locality stated in the title: `AGREE` (municipality and province), `PARTIAL` (province only), `DISAGREE`, or `NO_MATCH` (outside all administrative polygons). Authored candidate repairs are geocoded the same way; each repair names its point ID and must reproduce the layer's printed coordinates, or the build refuses as stale. The audit anchors the normalized layers, the validator, the submodule commit, and the four primary shapefiles by SHA-256.

Twenty-two of 23 candidate repairs land in the title's municipality (most on the exact title barangay), giving the digit-level repairs a second, independent line of evidence. The sole manual-review item is `ib:p723:r3` (Bangbang, Matalam, Cotabato): both of its points geocode to M'Lang, Cotabato, so no digit repair reconciles title and coordinates. The repaired coordinates remain labelled proposals; this layer is evidence only and does not modify the normalized outputs or raw text. Outputs: [audit JSON](data/fmr_psgc_validation.json) and [points CSV](data/fmr_psgc_validation_points.csv).

```sh
python3 other-analysis/validate_fmr_coordinates_psgc.py           # rebuild (~30 s, loads shapefiles)
python3 other-analysis/validate_fmr_coordinates_psgc.py --check   # verify committed evidence
```

## Files and usage

| Artifact | Use |
|---|---|
| [Normalized JSON](data/hgab_fmr_coordinates_normalized.json) | Preferred array representation: projects → separate coordinate segment arrays, with segment/point provenance. |
| [Normalized project CSV](data/hgab_fmr_projects_normalized.csv) | One budget row per project. `coordinates_json` carries all segments; start/end scalar columns are populated only for single-segment projects. |
| [Segment CSV](data/hgab_fmr_segments.csv) | One row per segment/point-only record, with `coordinates_json`, section, `start_longitude`, `start_latitude`, `end_longitude`, `end_latitude`, and project ID. |
| [Point CSV](data/hgab_fmr_points.csv) | One row per observation, with `longitude`, `latitude`, endpoint role, source fragment, applied rules, and issues. |
| [Normalization audit](data/hgab_fmr_coordinate_normalization_audit.json) | Coverage, original-flag outcomes, remaining flags, counts, and source-tree/PDF/normalizer hashes. |

Amounts occur once per project in the project CSV and project JSON. Segment and point CSVs omit amounts so expanding a multi-section project cannot duplicate its appropriation. In JSON, `points`, `segments`, and project `coordinates` are different views of the same observations; they must not be concatenated or counted as additional locations.

Run from the repository root:

```sh
# Rebuild the source extraction only when needed.
python3 other-analysis/extract_hgab_fmr.py

# Normalize all source projects and verify deterministic output.
python3 other-analysis/normalize_hgab_fmr_coordinates.py
python3 other-analysis/normalize_hgab_fmr_coordinates.py --check

# Run extraction and normalization regressions.
python3 -m unittest discover -s other-analysis/tests -v
```

The normalizer checks project coverage, unchanged allocation totals/raw coordinate text, point-to-segment ownership, and unique point IDs. **Thirteen normalization tests** cover decimal/DMS interpretation, section/list pairing, coordinate arrays, station inference, numeric candidates, rejected values, CSV column order, and budget preservation. Combined with the 11 extraction tests, the suite has **24 passing tests**.
