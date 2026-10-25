#!/usr/bin/env python3
"""Match budget bridge IDs and derive dated spatial location evidence offline.

Requires geopandas, shapely, pyogrio, and pyproj. Historical polygon codes
remain separate from current PSGC assignments. No master-list scores change.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tempfile

import archive_bridges as archive

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from locations import aliases, normalize

OUTPUT = ROOT / 'bridge_inventory/data'
PROJECTS = ROOT / 'master_list/data/projects.jsonl.gz'
CATALOG = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
CATALOG_SUMMARY = ROOT / 'PSGC2LEG/data/psgc_summary.json'
SHAPES = ROOT / 'dpwh_coor2psgc_geomapping/philippines-psgc-shapefiles/data/2023'
SHAPE_NAMES = {
    'region': ('Regions/PH_Adm1_Regions.shp.shp', 'adm1'),
    'province': ('Provdists/PH_Adm2_ProvDists.shp.shp', 'adm2'),
    'municipality_city': ('Municities/PH_Adm3_MuniCities.shp.shp', 'adm3'),
    'barangay': ('BgySubMuns/PH_Adm4_BgySubMuns.shp.shp', 'adm4'),
}
BRIDGE_ID = re.compile(r'\bB\d{5}(?:LZ|VS|MN)\b', re.IGNORECASE)
BRIDGE_WORD = re.compile(r'\bbridges?\b|\bbr(?=\s*\.)', re.IGNORECASE)


def compare_name(name):
    value = normalize(re.sub(r'\([^)]*\)', '', name or ''))
    value = re.sub(r'^city of | city$', '', value)
    region = re.search(r'\bregion\s+([ivx]+(?: [ab])?)\b', value)
    return f'region {region.group(1)}' if region else value


def compare_inventory(row):
    result = {}
    for level, field in [('barangay', 'BRGY'), ('municipality_city', 'MUNICIPAL'),
                         ('province', 'PROVINCE'), ('region', 'REGION')]:
        units = row['polygon_hits'][level]
        inventory_name = row['inventory_locality'][field]
        name = compare_name(inventory_name)
        if name in {'', 'none', 'not known', 'unknown', 'n a'}:
            status = 'inventory_name_missing'
        elif not units:
            status = 'no_polygon_hit'
        elif len(units) != 1:
            status = 'multiple_polygon_hits'
        elif name == compare_name(units[0]['name']):
            status = 'normalized_name_agreement'
        else:
            status = 'name_differs'
            row['review_flags'].append(f'inventory_{level}_name_differs_from_polygon')
        result[level] = {'status': status, 'inventory_name': inventory_name,
                         'polygon_names': [u['name'] for u in units]}
    return result


class Catalog:
    """Reconcile spatial names by actual parent links; never convert code digits."""
    def __init__(self, rows):
        self.rows = {r['code']: r for r in rows}
        self.barangays = defaultdict(set)
        for row in rows:
            if row['level'] == 'barangay':
                for name in aliases(row):
                    self.barangays[name].add(row['code'])

    def candidates(self, spatial_row):
        hits = spatial_row['polygon_hits']
        if any(len(hits[level]) != 1 or hits[level][0]['relation'] != 'within'
               for level in ('barangay', 'municipality_city', 'province')):
            return []
        barangay, town, province = [normalize(hits[k][0]['name'])
                                    for k in ('barangay', 'municipality_city', 'province')]
        result = []
        for code in sorted(self.barangays.get(barangay, set())):
            chain, parent, seen = [], code, set()
            while parent:
                archive.require(parent not in seen, 'PSGC parent cycle')
                seen.add(parent)
                node = self.rows[parent]
                chain.append(node)
                parent = node['parent_code']
            towns = [r for r in chain if r['level'] in {'city', 'municipality', 'sub_municipality'}]
            provinces = [r for r in chain if r['level'] == 'province']
            if not any(town in aliases(r) for r in towns):
                continue
            # HUC/ICC polygons may occupy an adm2 unit named after the city.
            parents = provinces if provinces else towns
            if not any(province in aliases(r) for r in parents):
                continue
            result.append({'code': code, 'name': self.rows[code]['name'], 'level': 'barangay',
                           'chain': [{'code': r['code'], 'name': r['name'], 'level': r['level']}
                                     for r in chain]})
        return result


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def records(path):
    with gzip.open(path, 'rt', encoding='utf-8') as source:
        yield from map(json.loads, source)


def candidate_ids(title):
    return sorted({m.group().upper() for m in BRIDGE_ID.finditer(title)})


def match_project(project, bridges):
    """Explicit IDs provide identity evidence; a name alone stays for review."""
    if project['record_kind'] == 'allocation':
        return None
    ids = candidate_ids(project['title'])
    if not ids and not BRIDGE_WORD.search(project['title']):
        return None
    found = [code for code in ids if code in bridges]
    missing = [code for code in ids if code not in bridges]
    status = ('exact_id_match' if found and not missing else
              'partial_id_match' if found else 'id_not_in_inventory' if ids else
              'bridge_mention_without_id')
    return {
        'record_id': project['record_id'], 'dataset': project['dataset'],
        'title': project['title'], 'record_kind': project['record_kind'],
        'amount_php': project['amount_php'], 'source_dataset': project['source_dataset'],
        'source': project['source'], 'status': status, 'bridge_ids': ids,
        'missing_bridge_ids': missing,
        'matches': [{'bridge_id': code, 'source_object_id': bridges[code]['attributes']['OBJECTID'],
                     'bridge_name': bridges[code]['attributes']['BR_NAME'],
                     'road_name': bridges[code]['attributes']['ROAD_NAME'],
                     'longitude': bridges[code]['longitude'], 'latitude': bridges[code]['latitude'],
                     'spatial_evidence_key': code} for code in found],
    }


def locate(points, polygons, code_column, name_column):
    """Keep all intersecting units; a boundary touch is not unique containment."""
    import geopandas as gpd
    result = defaultdict(list)
    joined = gpd.sjoin(points.to_crs(polygons.crs), polygons, how='inner', predicate='intersects')
    for index, row in joined.iterrows():
        polygon = polygons.loc[row['index_right'], 'geometry']
        result[index].append({
            # The source stores these codes as numbers. Retain their numeric text
            # without padding, slicing, or treating them as current catalog codes.
            'source_code': str(int(row[code_column])), 'name': row[name_column],
            'relation': 'within' if row.geometry.within(polygon) else 'boundary_touch',
        })
    for units in result.values():
        units.sort(key=lambda u: (u['source_code'], u['relation']))
    return result


def spatial(bridges, inputs):
    import geopandas as gpd
    import shapely
    import pyogrio
    import pyproj
    import gc

    ids = sorted(bridges)
    points = gpd.GeoDataFrame(
        index=ids, geometry=gpd.points_from_xy(
            [bridges[i]['longitude'] for i in ids], [bridges[i]['latitude'] for i in ids]), crs=4326)
    evidence = {code: {
        'bridge_id': code, 'source_object_id': bridges[code]['attributes']['OBJECTID'],
        'coordinates': [bridges[code]['longitude'], bridges[code]['latitude']],
        'inventory_locality': {k: bridges[code]['attributes'][k]
                               for k in ('BRGY', 'MUNICIPAL', 'PROVINCE', 'REGION')},
        'boundary_vintage': '2023', 'polygon_hits': {},
        'current_psgc_assignment': None,
    } for code in ids}
    for level, (filename, prefix) in SHAPE_NAMES.items():
        path = SHAPES / filename
        # Only the files read by the driver affect the retained geometry/attributes.
        for suffix in ('.shp', '.shx', '.dbf', '.prj', '.cpg'):
            sidecar = path.with_suffix(suffix)
            if sidecar.exists():
                inputs[str(sidecar.relative_to(ROOT))] = sha(sidecar)
        columns = [prefix + '_psgc', prefix + '_en']
        polygons = gpd.read_file(path, columns=columns, engine='pyogrio')
        require_crs = polygons.crs
        archive.require(require_crs is not None, f'Missing boundary CRS: {path}')
        hits = locate(points, polygons, *columns)
        for code in ids:
            evidence[code]['polygon_hits'][level] = hits.get(code, [])
        print(f'Spatial lookup: {level}, {len(hits):,}/{len(ids):,} bridge points intersect polygons', flush=True)
        del polygons, hits
        gc.collect()
    for row in evidence.values():
        hits = row['polygon_hits']
        row['most_detailed_level'] = next((k for k in reversed(SHAPE_NAMES) if hits[k]), None)
        row['review_flags'] = []
        for level, units in hits.items():
            if len(units) > 1:
                row['review_flags'].append(f'multiple_{level}_polygons')
            if any(u['relation'] == 'boundary_touch' for u in units):
                row['review_flags'].append(f'{level}_boundary_touch')
        if not hits['barangay']:
            row['review_flags'].append('no_barangay_polygon_hit')
    versions = {'geopandas': gpd.__version__, 'shapely': shapely.__version__,
                'pyogrio': pyogrio.__version__, 'pyproj': pyproj.__version__}
    return evidence, versions


def write_jsonl(directory, name, rows):
    (directory / name).write_bytes(gzip.compress(b''.join(archive.encode(row) for row in rows), mtime=0))


def build(out):
    latest_path = ROOT / 'bridge_inventory/latest.json'
    latest = json.loads(latest_path.read_bytes())
    snapshot = ROOT / 'bridge_inventory' / latest['snapshot_path']
    archive.require(sha(snapshot / 'manifest.json') == latest['manifest_sha256'], 'Stale snapshot pointer')
    archive.check(snapshot)
    bridges = {b['attributes']['BRIDGE_ID']: b for b in records(snapshot / 'data/bridges.jsonl.gz')}
    archive.require(len(bridges) == latest['feature_count'], 'Bridge ID index is not unique/complete')
    inputs = {str(p.relative_to(ROOT)): sha(p) for p in
              (latest_path, snapshot / 'manifest.json', snapshot / 'data/bridges.jsonl.gz', PROJECTS,
               CATALOG, CATALOG_SUMMARY, ROOT / 'master_list/scripts/locations.py',
               Path(__file__), Path(archive.__file__))}
    evidence, versions = spatial(bridges, inputs)
    catalog = Catalog([json.loads(line) for line in CATALOG.read_text().splitlines()])
    for row in evidence.values():
        row['inventory_spatial_comparison'] = compare_inventory(row)
        row['current_psgc_candidates'] = catalog.candidates(row)
        row['current_psgc_reconciliation'] = ('unique_hierarchy_name_candidate'
            if len(row['current_psgc_candidates']) == 1 else 'ambiguous_hierarchy_name_candidates'
            if row['current_psgc_candidates'] else 'unresolved')
    matches, counts, matched_ids = [], defaultdict(Counter), set()
    seen = set()
    for project in records(PROJECTS):
        archive.require(project['record_id'] not in seen, 'Duplicate budget observation ID')
        seen.add(project['record_id'])
        counts[project['dataset']]['all_observations'] += 1
        row = match_project(project, bridges)
        if row is None:
            continue
        counts[row['dataset']][row['status']] += 1
        matched_ids.update(m['bridge_id'] for m in row['matches'])
        matches.append(row)
    write_jsonl(out, 'bridge_spatial_evidence.jsonl.gz', [evidence[i] for i in sorted(evidence)])
    write_jsonl(out, 'bridge_project_matches.jsonl.gz', matches)
    # Flat matches are one observation x bridge. Do not sum amounts across this table.
    buffer = io.StringIO(newline='')
    fields = ['record_id', 'dataset', 'title', 'status', 'bridge_id', 'longitude', 'latitude',
              'spatial_2023_level', 'spatial_2023_candidates', 'spatial_review_flags',
              'current_psgc_candidate_codes', 'current_psgc_reconciliation']
    writer = csv.DictWriter(buffer, fieldnames=fields)
    writer.writeheader()
    for row in matches:
        for match in row['matches']:
            ev = evidence[match['bridge_id']]
            level = ev['most_detailed_level']
            writer.writerow({**{k: row[k] for k in ('record_id', 'dataset', 'title', 'status')},
                             **{k: match[k] for k in ('bridge_id', 'longitude', 'latitude')},
                             'spatial_2023_level': level,
                             'spatial_2023_candidates': json.dumps(ev['polygon_hits'].get(level, []), ensure_ascii=False),
                             'spatial_review_flags': '|'.join(ev['review_flags']),
                             'current_psgc_candidate_codes': '|'.join(r['code'] for r in ev['current_psgc_candidates']),
                             'current_psgc_reconciliation': ev['current_psgc_reconciliation']})
    (out / 'bridge_project_coordinates.csv.gz').write_bytes(gzip.compress(buffer.getvalue().encode(), mtime=0))
    spatial_counts = Counter(evidence[i]['most_detailed_level'] or 'no_polygon_hit' for i in matched_ids)
    audit = {
        'method': 'bridge_exact_id_spatial_2023_v1', 'bridge_snapshot': str(snapshot.relative_to(ROOT)),
        'inputs_sha256': inputs, 'software_versions': versions,
        'coordinate_order': ['longitude', 'latitude'], 'crs': 'EPSG:4326',
        'boundary_source': 'altcoder/philippines-psgc-shapefiles, retained local 2023 PSA/NAMRIA-derived polygons',
        'boundary_code_note': 'Numeric shapefile attributes retained as decimal strings, without padding or current-code conversion.',
        'current_psgc_assignment': 'Provisional hierarchy name candidates only; current geometry not verified and master-list assignments unchanged.',
        'current_psgc_catalog_foundation': json.loads(CATALOG_SUMMARY.read_text()),
        'matching_scope': 'Exact explicit bridge IDs; bridge-word mentions without IDs retained for review.',
        'by_dataset': dict(counts), 'unique_matched_bridges': len(matched_ids),
        'matched_bridge_spatial_levels': dict(spatial_counts),
        'matched_bridges_with_spatial_flags': sum(bool(evidence[i]['review_flags']) for i in matched_ids),
        'matched_bridge_review_flags': dict(Counter(flag for i in sorted(matched_ids)
                                                    for flag in evidence[i]['review_flags'])),
        'matched_bridge_current_psgc_reconciliation': dict(Counter(
            evidence[i]['current_psgc_reconciliation'] for i in sorted(matched_ids))),
        'all_inventory_spatial_levels': dict(Counter(r['most_detailed_level'] or 'no_polygon_hit'
                                                    for r in evidence.values())),
        'outputs_sha256': {p.name: sha(p) for p in sorted(out.iterdir())},
    }
    (out / 'bridge_matching_audit.json').write_bytes(archive.encode(audit))
    report = ['# Bridge project matching and spatial evidence', '',
              f'{len(matched_ids):,} distinct inventory bridges matched by exact ID.', '',
              '| Dataset | Exact ID match | Partial ID match | ID absent | Bridge mention without ID |',
              '|---|---:|---:|---:|---:|']
    for dataset, c in counts.items():
        if any(c[k] for k in ('exact_id_match', 'partial_id_match', 'id_not_in_inventory', 'bridge_mention_without_id')):
            report.append(f'| {dataset} | {c["exact_id_match"]:,} | {c["partial_id_match"]:,} | '
                          f'{c["id_not_in_inventory"]:,} | {c["bridge_mention_without_id"]:,} |')
    report.extend(['', f'Spatial levels among the {len(matched_ids):,} matched assets: '
                   + ', '.join(f'{k}: {v:,}' for k, v in sorted(spatial_counts.items())) + '.', '',
                   'Budget observations overlap across stages; these counts are not unique projects.',
                   'Coordinates describe the referenced bridge asset, not the full extent of funded work.',
                   'The spatial result uses dated 2023 polygons. Source codes are historical numeric attributes,',
                   'not assigned current PSGC catalog codes. All intersecting polygons and boundary touches',
                   'are retained. No nearest-polygon assignment or coordinate snapping is performed.',
                   f'{audit["matched_bridges_with_spatial_flags"]} matched bridges carry spatial/name review flags.',
                   'Current catalog reconciliation: ' + json.dumps(audit['matched_bridge_current_psgc_reconciliation']) + '.',
                   'Inventory locality names are compared with spatial names; disagreements are retained as flags.',
                   'Current PSGC candidates require a matching barangay → town → province/city hierarchy',
                   'through actual catalog parent links. They are provisional name reconciliations of dated',
                   'spatial evidence, not verification against current boundary geometry.',
                   'Master-list locations, scores, and financial ledgers are unchanged.', ''])
    (out / 'REPORT.md').write_text('\n'.join(report), encoding='utf-8')
    return audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Rebuild offline and compare all evidence outputs')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        directory = Path(temp)
        audit = build(directory)
        if args.check:
            for path in directory.iterdir():
                archive.require((OUTPUT / path.name).read_bytes() == path.read_bytes(), f'Stale output: {path.name}')
        else:
            OUTPUT.mkdir(parents=True, exist_ok=True)
            for path in directory.iterdir():
                (OUTPUT / path.name).write_bytes(path.read_bytes())
    print(f'{"Verified" if args.check else "Built"} bridge evidence: {audit["unique_matched_bridges"]:,} distinct matched bridges')


if __name__ == '__main__':
    main()
