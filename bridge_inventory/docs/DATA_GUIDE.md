# Bridge inventory data guide

See the [documentation index](README.md) and [methodology](METHODOLOGY.md).
All paths below are relative to `bridge_inventory/` unless stated otherwise.
Gzip files can be read directly by Python; decompress CSVs for spreadsheet use
and import PSGC code columns as text to preserve leading zeros.

## Files and record grain

| Path | Grain and purpose |
|---|---|
| `latest.json` | One pointer to the most recent verified inventory snapshot. |
| [index.html](../index.html) | Standalone searchable table of all inventory assets, spatial evidence, and matched project observations. |
| [data/viewer_manifest.json](../data/viewer_manifest.json) | Viewer input/output hashes and asset/project-link counts. |
| `snapshots/<timestamp>/manifest.json` | Provenance, validation, and file hashes for one acquisition. |
| `snapshots/<timestamp>/raw/` | Verbatim metadata and feature-query responses. |
| `snapshots/<timestamp>/data/bridges.jsonl.gz` | One inventory feature per line, all attributes plus longitude/latitude. |
| `snapshots/<timestamp>/data/bridges.geojson.gz` | One inventory feature per GeoJSON feature; attributes in `properties`. |
| `snapshots/<timestamp>/data/bridges.csv.gz` | One inventory feature per CSV row; all attributes plus coordinate columns. |
| [data/bridge_project_matches.jsonl.gz](../data/bridge_project_matches.jsonl.gz) | One selected budget observation per line, including unresolved bridge mentions. |
| [data/bridge_spatial_evidence.jsonl.gz](../data/bridge_spatial_evidence.jsonl.gz) | One inventory asset per line, including assets without a budget match. |
| [data/bridge_project_coordinates.csv.gz](../data/bridge_project_coordinates.csv.gz) | One matched budget observation × bridge pair per row. |
| [data/bridge_matching_audit.json](../data/bridge_matching_audit.json) | Method, input/output hashes, software versions, coverage, and review totals. |
| [data/REPORT.md](../data/REPORT.md) | Generated readable matching report. |
| [data/bridge_proximity.jsonl.gz](../data/bridge_proximity.jsonl.gz) | One no-hit point per record with three nearby barangay edges, distances, and closest-edge coordinates; review candidates only. |
| [data/bridge_proximity_audit.json](../data/bridge_proximity_audit.json) | Proximity source hashes, distance method, and assignment policy. |
| [data/PROXIMITY_REPORT.md](../data/PROXIMITY_REPORT.md) | Ranked nearby units and distances for all no-hit points. |

`latest.json` contains `snapshot_path` relative to the module directory,
`manifest_sha256`, `feature_count`, and `retrieved_at_utc`. Snapshot directory
names use UTC timestamps. Source data dates and source edit timestamps remain
separate metadata.

The matching outputs under `data/` are rebuilt in place. Their audit's
`bridge_snapshot` is relative to the **repository root** and pins the inventory
used for that build. Refreshing `latest.json` alone does not refresh enrichment.

## Keys and inventory records

| Key | Meaning |
|---|---|
| `BRIDGE_ID` / `bridge_id` | Asset identifier used for inventory-to-project matching. |
| `OBJECTID` / `source_object_id` | ArcGIS feature identifier within the recorded snapshot; do not assume stability across service replacements. |
| `record_id` | Original master-list observation identifier; remains distinct across datasets/stages. |
| `spatial_evidence_key` | A matched bridge's key in the spatial evidence file; currently its bridge ID. |

An inventory JSONL record contains `attributes`, `longitude`, and `latitude`.
`attributes` retains all source fields, including engineering attributes and
source edit metadata. The snapshot CSV flattens those attributes into columns.
ArcGIS date attributes retain epoch-millisecond values. JSON exports preserve
null versus empty-string values; CSV blank cells do not distinguish them.
Invalid coordinate values produce null derived coordinates/geometry while raw
responses preserve the source values.

## Project matching records

Fields retain `record_id`, `dataset`, `record_kind`, `title`, `amount_php`,
`source_dataset`, and `source`. Matching adds `status`, extracted `bridge_ids`,
`missing_bridge_ids`, and a `matches` array.

Each match contains `bridge_id`, `source_object_id`, `bridge_name`, `road_name`,
`longitude`, `latitude`, and `spatial_evidence_key`.

| `status` | Interpretation |
|---|---|
| `exact_id_match` | Every recognized title ID exists in the inventory. |
| `partial_id_match` | At least one recognized ID matches and at least one is absent. |
| `id_not_in_inventory` | Recognized IDs exist in the title, but none match this snapshot. |
| `bridge_mention_without_id` | A bridge keyword is present without a recognized bridge ID; no identity assigned. |

An ID match does not certify project identity across budget stages, agreement
of road/name context, or spatial accuracy. Unmatched observations have no rows
in the coordinate CSV; use the full matching JSONL to inspect their statuses.

## Spatial evidence records

Each record contains the asset key, source object ID, `coordinates`, unchanged
`inventory_locality`, `boundary_vintage`, and `polygon_hits`.

`polygon_hits` holds arrays for `region`, `province`, `municipality_city`, and
`barangay`. Each hit contains `source_code`, `name`, and `relation` (`within`
or `boundary_touch`). Empty arrays mean no intersection at that level.
`most_detailed_level` reports the deepest level with any hit, including
nonunique hits; it does not imply a unique, reviewed assignment.

`inventory_spatial_comparison` stores, for each level, the inventory name,
polygon names, and one of:

- `normalized_name_agreement`
- `name_differs`
- `inventory_name_missing`
- `no_polygon_hit`
- `multiple_polygon_hits`

`review_flags` may contain `multiple_<level>_polygons`,
`<level>_boundary_touch`, `no_barangay_polygon_hit`, or
`inventory_<level>_name_differs_from_polygon`. A record can carry several flags;
counts by flag overlap and must not be summed as distinct affected assets.

`current_psgc_candidates` contains candidate `code`, `name`, `level`, and a
barangay-to-region `chain` of catalog units. `current_psgc_reconciliation` is
`unique_hierarchy_name_candidate`, `ambiguous_hierarchy_name_candidates`, or
`unresolved`. `current_psgc_assignment` remains null. Candidate count and review
flags answer different questions; a unique candidate can still need review.

`legislative_district` is the coordinate-derived district: `leg_id`,
`jurisdiction`, `district_label`, `district_no`, `derivation`
(`municity_polygon_code_join` or `split_city_point_in_polygon`), `source`,
and for split-city results a `caveat` field. It is null when the point has no
strictly containing municity polygon, only boundary touches, or sits in a
split city without adopted ArcGIS coverage (Antipolo, Cebu City, Caloocan,
Taguig). Districts are derived from the bridge coordinate directly; the PSGC
name candidates above are separate fallback evidence.

The coordinate CSV includes only the most detailed historical polygon-hit
array in `spatial_2023_candidates`, along with `spatial_2023_level`,
`spatial_review_flags`, `current_psgc_candidate_codes`,
`current_psgc_reconciliation`, `leg_district`, `leg_derivation`, and
`leg_source`. Use spatial JSONL for the complete hierarchy and
inventory comparison. Multiple candidate codes are pipe-separated in CSV.

## Reuse example

Run from the repository root. This reads the retained evidence without
geospatial dependencies or network access:

```python
import gzip
import json
from pathlib import Path

root = Path('bridge_inventory')

def read_jsonl(path):
    with gzip.open(path, 'rt', encoding='utf-8') as source:
        yield from map(json.loads, source)

spatial = {row['bridge_id']: row for row in
           read_jsonl(root / 'data/bridge_spatial_evidence.jsonl.gz')}
audit = json.loads((root / 'data/bridge_matching_audit.json').read_text())
print('Inventory used:', audit['bridge_snapshot'])

for project in read_jsonl(root / 'data/bridge_project_matches.jsonl.gz'):
    for match in project['matches']:
        evidence = spatial[match['spatial_evidence_key']]
        print(project['record_id'], match['bridge_id'], evidence['coordinates'],
              evidence['current_psgc_candidates'], evidence['review_flags'])
```

Keep the source observation, bridge asset, coordinate evidence, and provisional
PSGC interpretation together. Do not join a retained matching build to an
unrelated newer snapshot solely because `latest.json` changed.
