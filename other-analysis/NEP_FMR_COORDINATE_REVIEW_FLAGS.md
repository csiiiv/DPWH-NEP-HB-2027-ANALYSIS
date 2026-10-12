# NEP FMR coordinate normalization and rendered review

Reviewed on **12 October 2026**. All **23 projects** initially flagged after normalization have now been inspected against their rendered NEP PDF cells. **Fifteen projects are resolved**, and the complete dataset now has **696 projects without remaining flags** and **eight with printed-source anomalies**. All **704 projects and ₱16,000,000,000** are retained.

The updated layer contains **722 segments** and **1,444 point observations** across 13 multi-segment projects. **1,443 points have numeric pairs**; the sole unavailable pair is a visibly invalid printed END coordinate. The conservative extraction's 52-project queue is preserved separately: 48 of those projects now normalize, four retain source findings, and distance screening identifies four further projects.

## Evidence and correction lineage

The [authored review manifest](nep_fmr_coordinate_reviews.json) records each original OCR string, the image-reviewed reading, exact edits and occurrence counts, source page/cell box, PNG hash, reviewer finding, and relevant HGAB evidence. The [image-review audit](data/nep_fmr_coordinate_image_review_audit.json) records the before/after flags and coordinate arrays for all 23 cells.

Sixteen projects have supported OCR edits. Fifteen become normalized; Tagumpay gains correct section pairing but retains two latitude anomalies that really are printed in the source. The images below are source-cell renders at **216 dpi**, including the project title and amount for orientation. Reviewing these cells does not constitute complete title or geographic validation across all projects.

The review finds **19 contextual HGAB row correspondences**, based on titles, locations, and coordinate agreement. Seven of the eight remaining NEP findings repeat the same problematic values in HGAB. These references provide supporting context; a complete NEP/HGAB identity or allocation comparison has not been performed. NEP corrections use the NEP image itself.

The immutable `coordinates_raw` field remains the original OCR text. The new `coordinates_interpreted` field supplies the reviewed text used for parsing. `coordinate_text_basis`, `image_review`, and `image_reviewed_ocr_transcription` identify the accepted OCR edits. Point records preserve both `source_fragment_raw` and `source_fragment_interpreted`, with separate offsets into their respective project strings. Each raw point fragment still equals its original OCR substring.

A printed numeric anomaly does not become an accepted correction merely because it has a plausible replacement. Its source values and review flags remain available. The existing candidate for malformed longitude `123.691.92` is retained with a source-repair flag.

## Supported OCR corrections

| Reviewed cell | Original OCR → rendered reading | Result |
|---|---|---|
| [p1:r17 — Buenlag](data/nep_fmr_coordinate_review_images/nep_fmr_p1_r17.png) | Spurious standalone `:` between START and END is absent from the image. | Normalized. |
| [p12:r4 — Disimuray](data/nep_fmr_coordinate_review_images/nep_fmr_p12_r4.png) | `\|END:` → `END:`; the pipe is a misread table mark. | Normalized. |
| [p20:r14 — Valeriana](data/nep_fmr_coordinate_review_images/nep_fmr_p20_r14.png) | `15°2426.21"N` → `15°24'26.21"N`. | DMS converted; normalized. |
| [p21:r10 — Estrella](data/nep_fmr_coordinate_review_images/nep_fmr_p21_r10.png) | `121.,120888` → `121.120888`. | Normalized. |
| [p24:r6 — Sapangan](data/nep_fmr_coordinate_review_images/nep_fmr_p24_r6.png) | Both `$2-` labels → `S2-`. | Two explicit segments and four points recovered; normalized. |
| [p24:r10 — Tagumpay](data/nep_fmr_coordinate_review_images/nep_fmr_p24_r10.png) | `S51-` → `S1-`. | Two correctly paired sections; printed latitude/distance findings remain. |
| [p25:r8 — Anilao/Dambo](data/nep_fmr_coordinate_review_images/nep_fmr_p25_r8.png) | `121,409858` → `121.409858`. | Normalized. |
| [p25:r14 — Silangan Calutan](data/nep_fmr_coordinate_review_images/nep_fmr_p25_r14.png) | `13 5116.99"` → `13 51'16.99"`; `13 5118.22"` → `13 51'18.22"`. | Two DMS sections converted; normalized. |
| [p28:r6 — Libertad](data/nep_fmr_coordinate_review_images/nep_fmr_p28_r6.png) | `121,432678` → `121.432678`. | Normalized. |
| [p31:r12 — Bigaa](data/nep_fmr_coordinate_review_images/nep_fmr_p31_r12.png) | `123,753214` → `123.753214`. | Normalized. |
| [p33:r16 — Malayu-an](data/nep_fmr_coordinate_review_images/nep_fmr_p33_r16.png) | `11115153` → `11.115153`; the decimal point is visibly printed. | Accepted OCR correction replaces the former numeric candidate; normalized. |
| [p37:r6 — Tutug-an](data/nep_fmr_coordinate_review_images/nep_fmr_p37_r6.png) | `11,310222` → `11.310222`. | Normalized. |
| [p42:r15 — Panlaisan/Butay](data/nep_fmr_coordinate_review_images/nep_fmr_p42_r15.png) | `126 2024.35"E` → `126 20'24.35"E`. | DMS converted; normalized. |
| [p43:r3 — Guia/Sambacan](data/nep_fmr_coordinate_review_images/nep_fmr_p43_r3.png) | `124,551231732243` → `124.551231732243`. | Normalized. |
| [p43:r13 — Montapet](data/nep_fmr_coordinate_review_images/nep_fmr_p43_r13.png) | `124,703373012734` → `124.703373012734`. | Normalized. |
| [p43:r14 — Lamfugon](data/nep_fmr_coordinate_review_images/nep_fmr_p43_r14.png) | `124,.66973333` → `124.66973333`. | Normalized. |

For Sapangan, the restored S2 START latitude really is `13.7059722`; the review does not substitute a nearby value. For Tagumpay, only the section label is an OCR correction. The image visibly prints the two latitudes near **4.606**, alongside the other endpoints near **14.606**.

## Eight remaining printed-source findings

| Reviewed NEP cell | What the PDF actually prints | HGAB contextual row | Remaining finding |
|---|---|---|---|
| [p1:r7 — Escoda/Elizabeth](data/nep_fmr_coordinate_review_images/nep_fmr_p1_r7.png) | START latitude `17.00918`; END `17.9980347`. | `ib:p667:r7` | Approximately 109.96 km between endpoints. |
| [p4:r13 — Balacad](data/nep_fmr_coordinate_review_images/nep_fmr_p4_r13.png) | END `120.153581, 120.53601`. | `ib:p670:r4` | Neither number can be latitude. START can be reordered; END remains unavailable. |
| [p11:r11 — Buyon](data/nep_fmr_coordinate_review_images/nep_fmr_p11_r11.png) | START latitude `16.851721`; END `18.826792`. | `ib:p677:r5` | Approximately 219.62 km between endpoints. |
| [p18:r15 — Tampac I](data/nep_fmr_coordinate_review_images/nep_fmr_p18_r15.png) | END longitude `129.8030109`. | `ib:p685:r5` | Outside broad Philippines screening bounds; approximately 964.26 km. |
| [p24:r10 — Tagumpay](data/nep_fmr_coordinate_review_images/nep_fmr_p24_r10.png) | S2 START latitude `4.606488`; S1 END latitude `4.606694`. | `ib:p692:r16` | Correct section pairing still gives roughly 1,112 km for each segment. |
| [p30:r14 — Luna/San Isidro](data/nep_fmr_coordinate_review_images/nep_fmr_p30_r14.png) | END longitude `123.691.92`, including both decimal points. | `ib:p703:r11` | Candidate `123.69192` is numeric, but remains an unverified source-format interpretation. |
| [p37:r8 — Busay/Apale](data/nep_fmr_coordinate_review_images/nep_fmr_p37_r8.png) | START latitude `11.871556`; END `10.878222`. | `ib:p713:r12` | Approximately 110.45 km between endpoints. |
| [p44:r10 — Concepcion, Sta. Josefa](data/nep_fmr_coordinate_review_images/nep_fmr_p44_r10.png) | START longitude `126.009391`; END `125.008575`. | No corresponding row established. | Approximately 110.21 km between endpoints. |

All eight now have a documented rendered-source review. Further work requires either confirmation of the intended coordinate from an authoritative road record, or an explicitly labelled inferred correction layer. The supplied NEP/HGAB text does not establish the intended replacement digits for the latitude/longitude anomalies. Repeating the same bad value in both documents strengthens the evidence that the value is printed, without resolving the intended coordinate.

Flags overlap across those eight projects:

| Flag | Projects | Meaning |
|---|---:|---|
| `endpoint_distance_over_100_km` | 6 | Paired endpoints are more than 100 km apart by straight-line distance. This screen is not a road-length estimate. |
| `invalid_coordinate_pair` | 1 | The printed values cannot form a valid latitude/longitude pair. |
| `outside_philippines_orientation_bounds` | 1 | Numeric pair falls outside latitude 4–22 / longitude 116–127. These are screening bounds, not an administrative polygon. |
| `source_numeric_repair_candidate` | 1 | The printed extra decimal separator permits a candidate reading that has not been accepted as the intended numeric value. |

There are **no remaining unparsed OCR fragments or ambiguous section-pairing flags**. All syntactic OCR obstacles found in the reviewed queue are resolved.

## Output structure and reproducibility

Use the [normalized project CSV](data/nep_fmr_projects_normalized.csv) for allocation sums, [segment CSV](data/nep_fmr_segments.csv) for paired endpoints, and [point CSV](data/nep_fmr_points.csv) for individual observations. Point and segment tables omit allocation amounts to prevent double counting. The [JSON](data/nep_fmr_coordinates_normalized.json) retains raw/interpreted text, point and section lineage, rules, image reviews, and remaining flags. The [issue CSV](data/nep_fmr_coordinate_issues.csv) now contains eight projects.

`project.coordinates` is an array of segments, and each segment contains **[longitude, latitude]** pairs. Multi-section projects retain separate segment arrays, rather than becoming one continuous polyline. Scalar project endpoint columns are filled only for a one-segment project. Unavailable numeric points stay `null` in arrays and blank in numeric CSV fields.

The normalizer applies the [HGAB interpretation rules](FMR_COORDINATE_REVIEW_FLAGS.md) for decimal/DMS/hemisphere notation, longitude-first pairs, spacing, endpoint markers, and section pairing. Reviewed OCR corrections are specific to the source row; they are not general rules that replace commas or digits throughout the dataset. The literal `"ISTART:` on `nep_fmr:p1:r11` continues to be retained and interpreted with `endpoint_marker_typo_normalized`.

Coordinates use decimal degrees. The source does not state a CRS; no datum transformation is applied. A normalized status means parsing and the current screening rules passed; it does not certify the named road's location. Source title/place-name OCR has not been corrected.

From the repository root:

```sh
python3 other-analysis/normalize_nep_fmr_coordinates.py
python3 other-analysis/normalize_nep_fmr_coordinates.py --check
python3 other-analysis/normalize_nep_fmr_coordinates.py --render-review-images --check
python3 -m unittest discover -s other-analysis/tests -v
```

The normalizer requires the authored review manifest and matching retained cell images. It validates the NEP source hash, original row text, exact edits, image boxes/hashes, and contextual HGAB evidence. Use `--render-review-images` without `--check` to restore the source-cell PNGs. `--check` verifies outputs without rewriting them. The regression suite has **39 tests**, including reviewed DMS/decimal/section recovery, preserved raw/interpreted fragment offsets, unchanged allocations, image reproducibility, and rejection of stale review evidence.

## PSGC cross-validation of the eight remaining findings

Added **12 October 2026**. The shared [PSGC validator](validate_fmr_coordinates_psgc.py) geocodes all eight remaining NEP findings' printed points and authored candidate repairs with the [dpwh_coor2psgc_geomapping](../dpwh_coor2psgc_geomapping) submodule, classifying each against the title locality. Every repair lands in the title's municipality — seven on the exact title barangay, including both Tagumpay `4.6… → 14.6…` repairs on **Brgy. Tagumpay, Real, Quezon** — independently corroborating the printed anomalies as transcription-level defects rather than different locations. The repairs stay labelled proposals; see the [House GAB section](FMR_COORDINATE_REVIEW_FLAGS.md#psgc-cross-validation-of-flagged-coordinates) for method, outputs, and the shared manual-review item `ib:p723:r3` (Bangbang, Matalam, Cotabato — NEP has no corresponding row).

See [extraction method and checks](NEP_FMR_EXTRACTION.md) for the complete source scope and workflow.
