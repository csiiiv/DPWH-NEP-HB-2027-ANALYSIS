# Split-city district assignments and map geometry

**Status: implemented 25 October 2026.** The assignment dataset now maps the
barangays of all 13 multi-district cities to their 2025 legislative districts.
The map consequently renders 254 district features for the 254-seat catalog and
does not use unresolved whole-city placeholders.

## Build result

`scripts/build_assignments.py` emits 1,814 `barangay_split` rows. Each row has a
current PSGC code, a concrete `leg_id`, and its source labels. The city parent is
retained as `multi_district_city` so consumers can recognize that a lookup must
continue to the barangay level.

| Multi-district city | assigned barangays | districts |
|---|---:|---:|
| Antipolo | 16 | 2 |
| Cebu City | 80 | 2 |
| Zamboanga City | 98 | 2 |
| Cagayan de Oro | 80 | 2 |
| Davao City | 182 | 3 |
| Caloocan | 193 | 3 |
| Makati | 23 | 2 |
| Manila | 897 | 6 |
| Marikina | 16 | 2 |
| Parañaque | 16 | 2 |
| Quezon City | 142 | 6 |
| Taguig | 38 | 2 |
| Valenzuela | 33 | 2 |

The rosters come from the retained BetterGov district dataset, reconciled by
normalized barangay name against the Q3 2026 PSGC catalog. Two Manila entries
missing from that roster are explicit neighbor-sequence overrides: Barangay 10
to District 1 and Barangay 821 to District 5. Three punctuation/title variants
have narrow aliases rather than broad fuzzy matching.

## Taguig–Pateros

Taguig is handled separately because the retained community roster predates the
EMBO transfer. The original Taguig composition follows Republic Act 8487. The
ten transferred EMBO barangays follow COMELEC Resolution No. 11069:

- District 1: Comembo, Pembo, and Rizal, plus the applicable original Taguig
  barangays and the whole Municipality of Pateros.
- District 2: Cembo, South Cembo, East Rembo, West Rembo, Pitogo, Post Proper
  Northside, and Post Proper Southside, plus the applicable original Taguig
  barangays.

The district map globally dissolves by `leg_id`, so Pateros and the Taguig
District 1 barangays become a single multipolygon feature.

## Geometry pipeline

`scripts/build_viz_geojson.py` uses two retained 2023 layers:

1. `Municities.shp.shp` for districts made of whole cities/municipalities; and
2. `PH_Adm4_BgySubMuns.shp.shp` for the 13 split cities.

The pieces are dissolved by `leg_id`, simplified at 0.002 degrees by default,
and checked against the complete legislative-district catalog. The build fails
if a catalog district is absent, an extra district appears, or a split-city
barangay cannot be assigned.

`viz/geometry_report.json` records counts and per-city coverage. “254/254” means
that every catalog district has a rendered feature. The retained source remains
a generalized 2023 administrative-boundary product rather than a current
cadastral or precinct survey.

Known source-geometry limitations:

- Caloocan barangays 176-A through 176-F are represented by one older aggregate
  Barangay 176 polygon. All six and the aggregate belong to District 1.
- The retained Zamboanga layer has one old `Dulian` polygon instead of separate
  current shapes for Dulian (Upper Bunguiao) and Dulian (Upper Pasonanca). The
  aggregate is rendered in District 2; the layer cannot show the latter's
  separate present-day geometry.
- Coverage ratios compare layers of different vintages. Makati loses the EMBO
  area while Taguig gains it, so their ratios against their old city boundaries
  are expected to fall below or above 100 percent.
- Large-city administrative polygons may include water or other areas not
  represented by the barangay polygons, affecting the reported area ratio for
  Davao and Zamboanga without leaving a catalog barangay unassigned.

## Rebuild checks

```bash
cd PSGC2LEG
python3 scripts/build_assignments.py
python3 scripts/build_viz_geojson.py
python3 scripts/build_province_hues.py
python3 -m unittest discover -s tests -v
python3 tests/check_viz_browser.py
```
