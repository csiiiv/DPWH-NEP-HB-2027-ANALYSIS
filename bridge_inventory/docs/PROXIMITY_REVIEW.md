# Locality disagreements and nearest-edge review

## What the inventory supplies

The archived DPWH layer provides locality names as well as coordinates:

| Source field | Meaning |
|---|---|
| `BRGY` | Barangay name recorded by DPWH. |
| `MUNICIPAL` | Municipality/city name recorded by DPWH. |
| `PROVINCE` | Province context recorded by DPWH. |
| `REGION` | Region context recorded by DPWH. |

`inventory_barangay_name_differs_from_polygon` means the normalized DPWH
barangay name differs from the barangay polygon containing the point. It
does not establish that the DPWH value or the polygon result is wrong. Bridge
attribution to one bank, spelling, administrative changes, and geometry or
coordinate errors are possible explanations to review.

For example, Bocal's source record names Estancia while its point falls in
the 2023 Susugaen polygon. Both are retained under Pasuquin, Ilocos Norte.
The viewer now labels this as a difference between the DPWH name and the
point's polygon, with both names shown in the expanded review evidence.

## Point geometry and polygon borders

The archived bridge layer's geometry type is `esriGeometryPoint`. Its point
is not documented here as a surveyed center, endpoint, or abutment. This source
contains no bridge footprint or line geometry from which to inspect deck
edges or intersect the full crossing with administrative polygons.

The original spatial test already uses `intersects`, including exact polygon
borders. No hit means the stored point intersects no polygon at that level;
being exactly on a represented border alone should not cause that outcome.
Small gaps, water excluded from polygons, or offset shorelines can still
produce no-hit points near administrative edges.

## Nearest-three analysis

The separate proximity analysis processes every inventory point with no
barangay intersection. It retains the nearest **three distinct barangay
units**, ranked by point-to-polygon distance in EPSG:32651 metres. These are
distances to actual polygon geometry, not centroids. Since the analyzed points
are outside the polygons, their shortest polygon distances equal their edge
distances.

The search expands a metric radius until at least three units are found,
then sorts by distance and source code for deterministic ties. Multiple
features belonging to the same source unit do not consume separate ranks.
The audit retains the final search radius and the number of units tied with
the last selected distance. A third candidate may be much farther away than
the first two; retaining it does not make it equally plausible.

Each candidate stores its historical source code, name, parent units,
point-to-polygon and point-to-edge distances, and the closest edge coordinate
in `[longitude, latitude]`. It also records normalized name comparisons with
the inventory barangay, town, and province. Distances are projected planar
approximations, not survey measurements.

The nine baseline no-hit points have nearest-edge distances from **3.54 to
38.41 metres**. Examples:

| Bridge | First edge | Second edge | Interpretation to review |
|---|---|---|---|
| Bagacay, `B04691LZ` | Bulabog, 3.54 m | Bucalbucalan, 4.19 m | Point close to both mapped banks/areas; inventory names Bulabog. |
| Buyayawon, `B00592SM` | Buabua, Salcedo, 5.18 m | Buyayawon, Mercedes, 8.56 m | Nearby units span two towns; inventory agrees with the second candidate's names. |
| Jacinto Borja 1, `B00001BH` | Bool, Tagbilaran, 23.20 m | Poblacion, Dauis, 82.13 m | Inventory names Poblacion, Dauis; the closest polygon is across the town boundary. |

These distances support investigating small gaps and crossings over water.
They do not establish the physical bridge endpoints or prove a boundary error.
None of the nine points belongs to the current 498 exact-ID matched assets.

## Files, rebuild, and viewer

| File | Contents |
|---|---|
| [bridge_proximity.jsonl.gz](../data/bridge_proximity.jsonl.gz) | One no-hit bridge point per record, three nearby units, distances, edge coordinates, and source-name comparisons. |
| [bridge_proximity_audit.json](../data/bridge_proximity_audit.json) | Input/output hashes, pinned snapshot, scope, CRS, and assignment policy. |
| [PROXIMITY_REPORT.md](../data/PROXIMITY_REPORT.md) | All nine points and their ranked candidate distances. |

After rebuilding the main matching evidence, run from the repository root:

```sh
python3 bridge_inventory/scripts/analyze_proximity.py
python3 bridge_inventory/scripts/analyze_proximity.py --check
python3 bridge_inventory/scripts/build_viewer.py
python3 bridge_inventory/scripts/build_viewer.py --check
```

The analysis needs the same local boundary checkout and geospatial dependencies
as the main spatial build. It verifies the boundary hashes against that build.
The viewer embeds the retained proximity evidence and needs no geospatial
dependencies at runtime. Select **Location review → No barangay polygon hit**,
then expand **Nearest 3 barangay edges**. Each result links to its closest edge
on an external map.

Proximity remains review evidence: the analysis does not move coordinates,
change `polygon_hits`, remove no-hit flags, or assign PSGC codes. Inspecting
actual bridge edges will require a separate verified line/footprint or endpoint
source. Bridge length alone cannot reconstruct the crossing's direction or
endpoints, especially when the point's position along the asset is unknown.
