# Validation: DPWH ArcGIS Congressional_District layer (2022) for split-city resolution

**Question.** Can the DPWH Statistics Division ArcGIS FeatureServer
(`services1.arcgis.com/IwZZTMxZCmAmFYvF`, © March 2022, NAMRIA-derived,
source ids `dpwh-arcgis-congdist-layer-info` / `dpwh-arcgis-congdist-geojson`)
resolve the 13 split-city features in `viz/leg_districts.geojson` at district
level?

**Method.**
1. Parsed all 245 ArcGIS `CONG_DIST` labels into (jurisdiction, district_no);
   239/245 parsed (6 are "Lone District of X" forms under other spellings).
2. Compared district sets per city against our 2025 catalog
   (`data/legislative_districts.json`, 254 seats).
3. For cities with matching district sets, computed area overlap of each
   ArcGIS district polygon against the **unsimplified** 2023 municipal
   boundary (altcoder shapefile, our `psgc_leg_assignments.jsonl` codes).
4. Checked intra-city polygon disjointness (districts must not overlap).

## Verdict per split city

| City | districts ours/arcgis | city coverage | max district leakage | verdict |
|---|---|---|---|---|
| Manila | 6/6 | 99.2% | 2.05% | **usable** |
| Quezon City | 6/6 | 99.3% | 6.35% | **usable** |
| Makati | 2/2 | 87.5% | 1.47% | **usable** (gaps ≤12% of city unassigned) |
| Marikina | 2/2 | 96.9% | 2.63% | **usable** |
| Parañaque | 2/2 | 98.3% | 1.53% | **usable** |
| Valenzuela | 2/2 | 95.9% | 1.80% | **usable** |
| Zamboanga | 2/2 | 95.2% | 2.57% | **usable** |
| Caloocan | 3/**2** | 97.6% | 1.68% | **blocked**: ArcGIS predates the 2021-created 3rd district (RA 11593 area) — only D1/D2 present |
| Taguig | 2/**1** | 43.9% | 17.5% | **blocked**: only "Taguig City (Second District)" exists; 1st (incl. Pateros) missing entirely |
| Davao | 3/3 | 90.0% | 6.83% | **usable with caveat**: 10% of city uncovered; D2/D3 leak 6–7% |
| Cagayan de Oro | 2/2 | 80.0% | 12.3% | **usable with caveat**: 20% uncovered; D2 leaks 12% |
| Antipolo | 2/2 | 90.4% | 35.6% | **unusable as-is**: district union is 135% of the city — polygons bleed into neighboring Rizal territory; needs clip + review |
| Cebu City | 7/7 | 95.7% | 28.5% | **unusable as-is**: union is 121% of the city — D1/D2 bleed into neighboring municipalities |

Intra-city district overlap: **0% everywhere** (districts are mutually
disjoint), so leakage is outward into neighbors, not double-counting.

## Name crosswalk (required for any join)

The two datasets name cities asymmetrically; naive normalization collides
provinces with cities (Quezon≠Quezon City, Cebu≠Cebu City):

| ours (`jurisdiction`) | ArcGIS (`CONG_DIST` prefix) |
|---|---|
| City of Manila | Manila City |
| Quezon City | Quezon City |
| City of Caloocan | Caloocan City |
| City of Makati | Makati City |
| City of Marikina | Marikina City |
| City of Parañaque | Parañaque City |
| City of Taguig | Taguig City |
| City of Valenzuela | Valenzuela City |
| City of Antipolo | Antipolo City |
| City of Cebu | Cebu City |
| City of Zamboanga | Zamboanga City |
| City of Cagayan De Oro | Cagayan De Oro City |
| City of Davao | Davao City |

## Nationwide reapportionment deltas (ArcGIS 2022 → our 2025)

Confirm the layer is 19th-Congress vintage; all are known law-driven changes:

- Bulacan: ArcGIS has 4 districts; 2025 has 6 (RA 11593, 2021)
- Rizal: ArcGIS 2; 2025 has 4
- South Cotabato: ArcGIS 2; 2025 has 3
- Agusan del Norte: ArcGIS 1st/2nd; 2025 is lone district (the 2022 layer
  actually disagrees with the *older* baseline — it reflects a proposed or
  differently-dated split)
- Maguindanao: ArcGIS undivided 1st/2nd; 2025 has Maguindanao del Norte +
  del Sur lone districts (2022 partition)
- Caloocan 3rd, Taguig/Pateros restructure as above
- Pure spelling variants (not deltas): Mt Province/Mountain Province,
  Mindoro Oriental/Oriental Mindoro, etc.

## Recommendation

1. **Adopt for 7 cities** (Manila, QC, Makati, Marikina, Parañaque,
   Valenzuela, Zamboanga): clip each district to its municipal boundary,
   carry `source: dpwh-arcgis-2022` provenance per feature.
2. **Caveated adoption** (Davao, CDO): usable after clipping, but note the
   uncovered area — districts there may miss 2019–2022 boundary updates.
3. **Do not adopt** for Antipolo/Cebu City (overextended polygons) and
   Caloocan/Taguig (missing districts). These need barangay-level
   assignment from PSGC + COMELEC barangay rosters instead.

Verification scripts: `/tmp/arcgis_overlap_check.py`,
`/tmp/arcgis_selfoverlap.py` (exploratory; consolidate into
`scripts/` if adopted).
