# Bridge project matching and spatial evidence

498 distinct inventory bridges matched by exact ID.

| Dataset | Exact ID match | Partial ID match | ID absent | Bridge mention without ID |
|---|---:|---:|---:|---:|
| dpwh_nep_pdf | 458 | 0 | 23 | 691 |
| dpwh_house_second | 456 | 0 | 27 | 806 |
| dpwh_house_third | 456 | 0 | 27 | 806 |
| dpwh_nep_api | 463 | 0 | 23 | 673 |
| fmr_nep | 0 | 0 | 0 | 1 |
| fmr_hgab | 0 | 0 | 0 | 1 |

Spatial levels among the 498 matched assets: barangay: 498.

Legislative districts among matched assets: {"municity_polygon_code_join": 458, "unresolved": 36, "split_city_point_in_polygon": 4}.
Districts derive directly from bridge coordinates: municity polygon code joins
the verified PSGC2LEG municipality-to-district assignments (whole-unit), and
split cities use point-in-polygon on the validated DPWH ArcGIS 2022 layer
(Antipolo, Cebu City, Caloocan, and Taguig excluded per validation verdicts;
Davao and Cagayan de Oro adopted with coverage caveats).

Budget observations overlap across stages; these counts are not unique projects.
Coordinates describe the referenced bridge asset, not the full extent of funded work.
The spatial result uses dated 2023 polygons. Source codes are historical numeric attributes,
not assigned current PSGC catalog codes. All intersecting polygons and boundary touches
are retained. No nearest-polygon assignment or coordinate snapping is performed.
288 matched bridges carry spatial/name review flags.
Current catalog reconciliation: {"unique_hierarchy_name_candidate": 466, "unresolved": 32}.
Inventory locality names are compared with spatial names; disagreements are retained as flags.
Current PSGC candidates require a matching barangay → town → province/city hierarchy
through actual catalog parent links. They are provisional name reconciliations of dated
spatial evidence, not verification against current boundary geometry.
Master-list locations, scores, and financial ledgers are unchanged.
