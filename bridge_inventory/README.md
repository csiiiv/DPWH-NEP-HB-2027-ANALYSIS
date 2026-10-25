# Reusable DPWH bridge inventory

A dated archive of the public [Detailed Bridge Inventory feature service](https://services1.arcgis.com/IwZZTMxZCmAmFYvF/ArcGIS/rest/services/Detailed_Bridge_Inventory/FeatureServer).
The source describes existing bridges along national roads and credits the
Road & Bridge Information Application (RBIA), Bridge Management System (BMS),
and GIAS geospatial data. Its stated data date at first acquisition is
**January 2023**; the retrieval timestamp is recorded separately.

This module retains bridge assets independently of FY2027 budget records, for
reuse in project matching, mapping, and later PSGC location enrichment.

See the [documentation index](docs/README.md) for the methodology, data schema,
current results, rebuild workflow, review priorities, and roadmap.

## Table viewer

Open [index.html](index.html) in a recent browser. It embeds all 8,752 bridge
assets and works directly from disk, without a server or network connection.
Map links open an external map when selected.

Search by bridge ID, name, road, locality, PSGC candidate code, or matched
project. Filter by inventory province, project-match presence, or location
review state. Sort by bridge ID, inventory province, or project-observation
count; use pagination to browse the list. Expand a row's inventory fields,
project observations, or review evidence for the underlying details.

Inventory locality, 2023 spatial locality, and current provisional PSGC
candidates appear in separate columns. The project-coordinate CSV download
contains matched observations; the table itself includes the full inventory.
Unmatched project mentions remain in the matching evidence JSONL and report.

No-hit points include expandable nearest-three barangay edges with distances
and closest-edge map links. Use **Location review → No barangay polygon hit**
to find them. See [proximity review](docs/PROXIMITY_REVIEW.md) for the method
and [all nine results](data/PROXIMITY_REPORT.md).

After refreshing the matching evidence, rebuild proximity evidence and the viewer:

```sh
python3 bridge_inventory/scripts/analyze_proximity.py
python3 bridge_inventory/scripts/build_viewer.py
python3 bridge_inventory/scripts/build_viewer.py --check
python3 bridge_inventory/tests/check_viewer_browser.py
```

The viewer build uses Python's standard library; proximity analysis uses the
existing geospatial dependencies. The browser check uses the installed
Playwright and Chrome. The [viewer manifest](data/viewer_manifest.json) records
source hashes and coverage. The builder uses the snapshot pinned by the
matching audit, so a newer `latest.json` cannot silently mix inventory versions.

First snapshot: [25 October 2026 manifest](snapshots/20261025T084450161740Z/manifest.json).
It retains **8,752 features / 8,752 unique bridge IDs**, all **43 source fields**,
and approximately **5.1 MB** of compressed data and metadata. No missing or
duplicate bridge IDs, invalid coordinate pairs, or out-of-country screening
flags were found. All four locality fields are nonblank in every record; their
contents are retained unchanged. Spatial comparisons and provisional PSGC
reconciliation are published separately below.

Reusable exports from that snapshot:
[GeoJSON](snapshots/20261025T084450161740Z/data/bridges.geojson.gz),
[JSONL](snapshots/20261025T084450161740Z/data/bridges.jsonl.gz),
[CSV](snapshots/20261025T084450161740Z/data/bridges.csv.gz).

## Retained files

[latest.json](latest.json) points to the most recent successfully verified
snapshot and records the SHA-256 of its manifest. Refreshes create a new
timestamped directory under `snapshots/`; previous snapshots are preserved.

Each snapshot contains:

| File | Contents |
|---|---|
| `manifest.json` | Source URLs, item owner, attribution/license metadata, source/edit/retrieval dates, CRS, validation results, per-file sizes and SHA-256 hashes. |
| `raw/service.json`, `raw/item.json` | Verbatim service and ArcGIS item metadata, including available layers and source attribution. |
| `raw/layer.json`, `raw/layer_after.json` | Layer schema, original spatial reference, and source edit metadata before/after acquisition. |
| `raw/object_ids*.json`, `raw/count_*.json` | Advertised record IDs/counts before and after acquisition. |
| `raw/features_*.json.gz` | Verbatim query response bodies, compressed losslessly; all source attributes and requested WGS84 geometry. |
| `data/bridges.geojson.gz` | WGS84 FeatureCollection with unchanged source attributes as properties. |
| `data/bridges.jsonl.gz` | One object per bridge feature: `attributes`, `longitude`, `latitude`. |
| `data/bridges.csv.gz` | All source attribute columns plus `longitude` and `latitude`. Decompress before opening in a spreadsheet. |

Layer **1**, “General Bridge Type,” provides the inventory. The service advertises
17 thematic point layers; this archive does not concatenate those views or
count them as separate bridge populations. All fields exposed by layer 1 are
retained, including `BRIDGE_ID`, `BR_NAME`, `SECTION_ID`, `ROAD_NAME`, `BRGY`,
`MUNICIPAL`, `PROVINCE`, `REGION`, engineering attributes, and source edit fields.

The source CRS is **EPSG:32651**. Query responses request **EPSG:4326** using
`outSR=4326`; GeoJSON coordinates are **[longitude, latitude]**. These are
inventory locations, without a claimed GPS survey accuracy. Source date fields
retain their original ArcGIS epoch-millisecond values. Empty CSV cells represent
null or empty source values; use JSONL/GeoJSON when that distinction matters.

## Refresh and verify

Archive acquisition and its offline verification use Python 3's standard
library. Spatial enrichment and its tests also need the dependencies below.
From the repository root:

```sh
# Fetch a new snapshot (requires network access).
python3 bridge_inventory/scripts/archive_bridges.py

# Verify the latest retained snapshot offline, including rebuilding every export.
python3 bridge_inventory/scripts/archive_bridges.py --check

# Verify an older snapshot by its directory.
python3 bridge_inventory/scripts/archive_bridges.py --check --snapshot bridge_inventory/snapshots/<timestamp>

# Exercise incomplete downloads, changed inventories, invalid coordinates,
# checksum corruption, and preservation of the previous snapshot on failure.
python3 -m unittest discover -s bridge_inventory/tests -v
```

Acquisition starts with the complete object-ID inventory and downloads explicit
ID batches within the service limit. It rejects truncated responses, missing or
duplicate object IDs, wrong response CRS, and changes in source counts, IDs,
edit metadata, or schema during acquisition. It verifies every export against
the retained raw responses before updating `latest.json`. File hashes cover
both stored and decompressed bytes; gzip timestamps are fixed.

Missing/invalid coordinates, out-of-country screening flags, missing bridge
IDs, and repeated bridge IDs remain in the archive and are disclosed in the
manifest. Invalid coordinates produce null derived geometry, while the raw
response retains the source values. The broad Philippines coordinate screen
is an anomaly check, not administrative-boundary validation.

## Read the inventory

```python
import gzip
import json
from pathlib import Path

root = Path('bridge_inventory')
latest = json.loads((root / 'latest.json').read_text())
snapshot = root / latest['snapshot_path']
with gzip.open(snapshot / 'data/bridges.jsonl.gz', 'rt', encoding='utf-8') as source:
    for line in source:
        bridge = json.loads(line)
        print(bridge['attributes']['BRIDGE_ID'], bridge['longitude'], bridge['latitude'])
```

## Project coordinates and spatial PSGC evidence

The [matching report](data/REPORT.md) records the current project-ID and spatial
results. The first run links **1,833 budget observations to 498 distinct bridge
assets**. All 498 points intersect a barangay polygon in the retained 2023
boundary dataset. These observation counts overlap across budget stages.

| File | Use |
|---|---|
| [bridge_project_matches.jsonl.gz](data/bridge_project_matches.jsonl.gz) | One budget observation per record, with exact-ID matches, missing IDs, and bridge mentions needing further identity review. |
| [bridge_project_coordinates.csv.gz](data/bridge_project_coordinates.csv.gz) | One matched observation × bridge per row, coordinates, historical spatial candidates, current PSGC candidate codes, and review flags. |
| [bridge_spatial_evidence.jsonl.gz](data/bridge_spatial_evidence.jsonl.gz) | All 8,752 bridge assets: inventory locality names, coordinate-derived polygon hits at each level, name disagreements, and provisional current PSGC hierarchy candidates. |
| [bridge_matching_audit.json](data/bridge_matching_audit.json) | Input/output hashes, boundary source/vintage, software versions, coverage, and review counts. |

Decompress the coordinate CSV before opening it in a spreadsheet and import
PSGC candidate-code columns as text to preserve leading zeros.

Run the offline enrichment with the existing local boundary checkout:

```sh
python3 bridge_inventory/scripts/match_projects.py
python3 bridge_inventory/scripts/match_projects.py --check
```

This step requires GeoPandas, Shapely, Pyogrio, and Pyproj (versions recorded in
the audit) and the shapefiles under
`dpwh_coor2psgc_geomapping/philippines-psgc-shapefiles/data/2023/`.
That boundary checkout is local/ignored; its actual `.shp`, `.shx`, `.dbf`,
`.prj`, and `.cpg` inputs are hash-recorded. Retained outputs can be consumed
without those dependencies. `--check` rebuilds and compares the evidence files.

Spatial joins retain every intersecting polygon and distinguish strict
containment from boundary touches. Gaps stay unresolved. Historical shapefile
codes remain decimal strings as supplied by their numeric attributes, without
padding, slicing, or conversion into current PSGC codes.

Current PSGC candidates come from matching the spatial barangay → town →
province/city names through the current catalog's actual parent links.
Boundary ambiguity blocks that reconciliation. These are provisional matches
to the retained community-based PSGC catalog; current boundary geometry has not
been verified. The inventory names are compared independently, and differences
remain flagged. For example, Bocal's inventory names Estancia while its point
falls in the 2023 Susugaen polygon, both under Pasuquin, Ilocos Norte.

## Matching boundaries

Prefer an exact `BRIDGE_ID` match, checking uniqueness and supporting road/name
context. Names alone can be repeated. Keep registry matches as separate evidence
attached to the original budget observation, with the snapshot and source object
ID recorded. This acquisition does not change master-list assignments or scores.

The inventory supplies locality **names**, not PSGC codes. Historical boundary
units and current catalog candidates remain separate evidence. A point cannot
establish every jurisdiction crossed by a bridge or the full project extent.

Existing bridge positions remain useful despite the older source date. New or
realigned bridges may be absent or represented by older positions, and inventory
coordinates can contain errors. Absence from this inventory does not establish
that a bridge or project does not exist. The archived item includes the source's
license information as supplied; attribution is preserved verbatim.
