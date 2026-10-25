#!/usr/bin/env python3
"""Retain the nearest three barangay edges for no-hit bridge points; never assign them."""
import argparse
import gzip
import json
from pathlib import Path
import tempfile

import archive_bridges as archive
from match_projects import ROOT, SHAPES, SHAPE_NAMES, compare_name, records, sha

OUTPUT = ROOT / 'bridge_inventory/data'


def nearest_units(point, polygons, count=3):
    """Find distinct units by distance to polygon geometry, not centroid distance.

    Inputs must share a metric projected CRS. Expand an exact distance query
    until at least count distinct units are included, then rank deterministically.
    """
    from shapely.ops import nearest_points
    from pyproj import CRS
    crs = CRS(polygons.crs)
    archive.require(crs.is_projected and all(a.unit_name == 'metre' for a in crs.axis_info),
                    'Proximity requires projected metre coordinates')
    archive.require(not point.is_empty, 'Cannot measure an empty point')
    radius = 25.0
    candidates = {}
    while radius <= 12800000:
        indices = polygons.sindex.query(point, predicate='dwithin', distance=radius)
        candidates = {}
        for index in indices:
            row = polygons.iloc[int(index)]
            code = str(int(row['adm4_psgc']))
            geometry = row.geometry
            distance = float(point.distance(geometry))
            previous = candidates.get(code)
            if previous is None or distance < previous['distance_to_polygon_m']:
                edge = nearest_points(point, geometry.boundary)[1]
                candidates[code] = {
                    'source_code': code, 'name': row['adm4_en'],
                    'distance_to_polygon_m': distance, 'distance_to_edge_m': float(point.distance(edge)),
                    'nearest_edge_xy': [float(edge.x), float(edge.y)],
                    'parent_source_codes': {level: str(int(row[f'adm{n}_psgc']))
                        for level, n in [('region', 1), ('province', 2), ('municipality_city', 3)]},
                }
        if len(candidates) >= count or len(indices) == len(polygons):
            break
        radius *= 2
    ranked = sorted(candidates.values(), key=lambda r: (r['distance_to_polygon_m'], r['source_code']))
    selected = ranked[:count]
    third_ties = (sum(abs(r['distance_to_polygon_m'] - selected[-1]['distance_to_polygon_m']) < 1e-6
                      for r in ranked) if selected else 0)
    return selected, {'search_radius_m': radius, 'distinct_units_within_radius': len(ranked),
                      'last_selected_distance_tie_count': third_ties}


def build(directory):
    import geopandas as gpd
    import pyogrio
    from pyproj import Transformer
    from shapely.geometry import Point

    matching_audit = OUTPUT / 'bridge_matching_audit.json'
    audit = json.loads(matching_audit.read_bytes())
    snapshot = ROOT / audit['bridge_snapshot']
    inventory_path = snapshot / 'data/bridges.jsonl.gz'
    spatial_path = OUTPUT / 'bridge_spatial_evidence.jsonl.gz'
    archive.require(sha(spatial_path) == audit['outputs_sha256'][spatial_path.name], 'Stale spatial evidence')
    archive.require(sha(inventory_path) == audit['inputs_sha256'][str(inventory_path.relative_to(ROOT))],
                    'Inventory differs from spatial evidence')
    inputs = {str(p.relative_to(ROOT)): sha(p) for p in
              (matching_audit, inventory_path, spatial_path, Path(__file__),
               ROOT / 'bridge_inventory/scripts/match_projects.py',
               ROOT / 'master_list/scripts/locations.py')}
    no_hits = [r for r in records(spatial_path) if not r['polygon_hits']['barangay']]
    sources = {r['attributes']['BRIDGE_ID']: r for r in records(inventory_path)}
    names = {}
    for level, (filename, prefix) in SHAPE_NAMES.items():
        path = SHAPES / filename
        for suffix in ('.shp', '.shx', '.dbf', '.prj', '.cpg'):
            part = path.with_suffix(suffix)
            if part.exists():
                inputs[str(part.relative_to(ROOT))] = sha(part)
                archive.require(inputs[str(part.relative_to(ROOT))] ==
                    audit['inputs_sha256'][str(part.relative_to(ROOT))], 'Boundaries differ from spatial build')
        if level != 'barangay':
            table = pyogrio.read_dataframe(path, columns=[prefix + '_psgc', prefix + '_en'], read_geometry=False)
            names[level] = {str(int(row[prefix + '_psgc'])): row[prefix + '_en']
                            for _, row in table.iterrows()}
    path = SHAPES / SHAPE_NAMES['barangay'][0]
    polygons = gpd.read_file(path, columns=['adm1_psgc', 'adm2_psgc', 'adm3_psgc', 'adm4_psgc', 'adm4_en'])
    to_metric = Transformer.from_crs(4326, polygons.crs, always_xy=True)
    to_wgs84 = Transformer.from_crs(polygons.crs, 4326, always_xy=True)
    rows = []
    for record in sorted(no_hits, key=lambda r: r['bridge_id']):
        code = record['bridge_id']
        x, y = to_metric.transform(*record['coordinates'])
        candidates, search = nearest_units(Point(x, y), polygons)
        for rank, candidate in enumerate(candidates, 1):
            candidate['rank'] = rank
            candidate['nearest_edge_coordinates'] = list(to_wgs84.transform(*candidate.pop('nearest_edge_xy')))
            candidate['parents'] = {level: {'source_code': parent,
                                           'name': names[level].get(parent)}
                                    for level, parent in candidate.pop('parent_source_codes').items()}
            candidate['inventory_name_comparison'] = {
                'barangay': compare_name(record['inventory_locality']['BRGY']) == compare_name(candidate['name']),
                **{level: compare_name(record['inventory_locality'][field]) ==
                           compare_name(candidate['parents'][level]['name'])
                   for level, field in [('municipality_city', 'MUNICIPAL'), ('province', 'PROVINCE')]},
            }
        rows.append({'bridge_id': code, 'bridge_name': sources[code]['attributes']['BR_NAME'],
                     'coordinates': record['coordinates'], 'inventory_locality': record['inventory_locality'],
                     'boundary_vintage': '2023', 'distance_crs': polygons.crs.to_string(),
                     'status': 'nearest_candidates_only', 'candidates': candidates, 'search': search})
        print(f'{code}: nearest edge {candidates[0]["distance_to_edge_m"]:.2f} m', flush=True)
    result = directory / 'bridge_proximity.jsonl.gz'
    result.write_bytes(gzip.compress(b''.join(archive.encode(row) for row in rows), mtime=0))
    summary = {'method': 'bridge_no_hit_nearest_edges_v1', 'bridge_snapshot': audit['bridge_snapshot'],
               'scope': 'Inventory points without a barangay polygon intersection',
               'distance_method': 'Projected planar distances in EPSG:32651, metres; candidates ranked by polygon distance, not centroid.',
               'assignment_policy': 'Review candidates only; source coordinates, polygon hits, flags, and PSGC assignments are unchanged.',
               'bridge_geometry': 'Point; no bridge footprint, line, endpoints, or guaranteed center position is available.',
               'no_hit_bridges': len(rows), 'inputs_sha256': inputs,
               'outputs_sha256': {result.name: sha(result)}}
    (directory / 'bridge_proximity_audit.json').write_bytes(archive.encode(summary))
    report = ['# Nearest barangay edges for no-hit bridge points', '',
              'Distances use the point and actual polygon edge in EPSG:32651 (metres), not polygon centroids.',
              'These are review candidates, not new polygon hits or assigned PSGC locations.',
              'The bridge source has points only; center positions and bridge endpoints are not established.', '',
              '| Bridge | Inventory locality | Rank | Nearby barangay | Municipality/city | Edge distance (m) |',
              '|---|---|---:|---|---|---:|']
    for row in rows:
        loc = row['inventory_locality']
        for c in row['candidates']:
            report.append(f'| {row["bridge_id"]} · {row["bridge_name"]} | '
                          f'{loc["BRGY"]}, {loc["MUNICIPAL"]} | {c["rank"]} | {c["name"]} | '
                          f'{c["parents"]["municipality_city"]["name"]} | {c["distance_to_edge_m"]:.2f} |')
    report.extend(['', 'Closest-edge coordinates and name comparisons are retained in `bridge_proximity.jsonl.gz`.',
                   'A nearby edge is consistent with a small mapping gap or a crossing over water; it does',
                   'not establish that explanation. Rank three can be much farther away than the first two.', ''])
    (directory / 'PROXIMITY_REPORT.md').write_text('\n'.join(report), encoding='utf-8')
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='bridge-proximity-') as temp:
        directory = Path(temp)
        summary = build(directory)
        for path in directory.iterdir():
            if args.check:
                archive.require(path.read_bytes() == (OUTPUT / path.name).read_bytes(), f'Stale proximity output: {path.name}')
            else:
                (OUTPUT / path.name).write_bytes(path.read_bytes())
    print(f'{"Verified" if args.check else "Built"} nearest-edge evidence for {summary["no_hit_bridges"]} bridge points')


if __name__ == '__main__':
    main()
