#!/usr/bin/env python3
"""Match budget bridge IDs and derive dated spatial location evidence offline.

Requires geopandas, shapely, pyogrio, and pyproj. Historical polygon codes
remain separate from current PSGC assignments. No master-list scores change.

Legislative districts are derived directly from bridge coordinates where
possible: the 2023 municity polygon code joins to the verified PSGC2LEG
municipality-to-district assignments, and split cities fall back to
point-in-polygon against the validated DPWH ArcGIS 2022 congressional
district layer. PSGC name-chain reconciliation remains as separate evidence
for records without coordinates.
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
import geopandas as gpd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from locations import aliases, normalize

OUTPUT = ROOT / 'bridge_inventory/data'
PROJECTS = ROOT / 'master_list/data/projects.jsonl.gz'
CATALOG = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
CATALOG_SUMMARY = ROOT / 'PSGC2LEG/data/psgc_summary.json'
LEG_ASSIGNMENTS = ROOT / 'PSGC2LEG/data/psgc_leg_assignments.jsonl'
LEG_DISTRICTS = ROOT / 'PSGC2LEG/data/legislative_districts.json'
CONGDIST_GEOJSON = (ROOT / 'PSGC2LEG/sources/raw/'
                    'dpwh-arcgis-congdist-geojson__congressional_districts_wgs84.geojson')
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
        # The 2023 shapefile represents NCR (and Isabela City) with adm2 units
        # named like "NCR, Fourth District (Not a Province)". In the current
        # catalog these chains are barangay -> city -> region with no province
        # level, so the province name can never match a chain parent. Validate
        # those chains by region instead of by the pseudo-province text.
        pseudo_province = 'not a province' in (hits['province'][0]['name'] or '').lower()
        region = normalize(hits['region'][0]['name']) if len(hits.get('region', [])) == 1 else None
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
            if pseudo_province:
                # Pseudo-province text names districts, not a PSGC province;
                # require the chain's region to match the polygon region.
                chain_regions = [r for r in chain if r['level'] == 'region']
                if not region or not any(region in aliases(r) for r in chain_regions):
                    continue
            elif not any(province in aliases(r) for r in parents):
                continue
            result.append({'code': code, 'name': self.rows[code]['name'], 'level': 'barangay',
                           'chain': [{'code': r['code'], 'name': r['name'], 'level': r['level']}
                                     for r in chain]})
        return result


class LegDistricts:
    """Derive legislative districts from coordinates, PSGC only as fallback.

    Primary path: the 2023 municity polygon's historical code joins (through
    the PSGC2LEG vintage crosswalk) to the verified municipality-to-district
    assignments. Split cities fall back to point-in-polygon against the DPWH
    ArcGIS 2022 congressional district layer, adopted per the PSGC2LEG
    validation verdicts (7 clean cities, Davao/CDO caveated; Antipolo, Cebu
    City, Caloocan, and Taguig are not adopted — see
    PSGC2LEG/docs/arcgis_congdist_validation.md).
    """

    # 2023 shapefile -> Q3 2026 PSGC recodes, as in build_viz_geojson.py.
    OLD_TO_NEW_PREFIX = {
        '06045': '18045',  # Negros Occidental
        '07046': '18046',  # Negros Oriental
        '07061': '18061',  # Siquijor
        '19066': '09066',  # Sulu
    }
    OLD_TO_NEW_CODE = {
        '0630200000': '1830200000',  # Bacolod (HUC, own code; moved to NIR)
    }
    # ArcGIS CONG_DIST prefix -> catalog jurisdiction, per the validation doc.
    ARCGIS_JURISDICTION = {
        'Manila City': 'City of Manila',
        'Quezon City': 'Quezon City',
        'Caloocan City': 'City of Caloocan',
        'Makati City': 'City of Makati',
        'Marikina City': 'City of Marikina',
        'Parañaque City': 'City of Parañaque',
        'Taguig City': 'City of Taguig',
        'Valenzuela City': 'City of Valenzuela',
        'Antipolo City': 'City of Antipolo',
        'Cebu City': 'City of Cebu',
        'Zamboanga City': 'City of Zamboanga',
        'Cagayan De Oro City': 'City of Cagayan De Oro',
        'Davao City': 'City of Davao',
    }
    # Validation verdicts; cities not listed here are not adopted.
    ADOPTED = {'City of Manila', 'Quezon City', 'City of Caloocan', 'City of Makati',
               'City of Marikina', 'City of Parañaque', 'City of Taguig',
               'City of Valenzuela', 'City of Zamboanga'}
    ADOPTED_WITH_CAVEAT = {'City of Davao', 'City of Cagayan De Oro'}
    DISTRICT_RE = re.compile(r'^(.*?)\s*\((First|Second|Third|Fourth|Fifth|Sixth|Lone) District\)$')

    def __init__(self, assignment_rows, district_rows):
        self.by_code = {}
        for row in assignment_rows:
            self.by_code[row['psgc_code']] = row
        self.districts = {d['leg_id']: d for d in district_rows}
        # leg district-number lookup keyed by normalized jurisdiction label.
        self.by_jurisdiction = defaultdict(list)
        for d in district_rows:
            self.by_jurisdiction[normalize(d['jurisdiction'])].append(d)

    @classmethod
    def modernize(cls, code10):
        if code10 in cls.OLD_TO_NEW_CODE:
            return cls.OLD_TO_NEW_CODE[code10]
        prefix = cls.OLD_TO_NEW_PREFIX.get(code10[:5])
        return prefix + code10[5:] if prefix else code10

    def _catalog_district(self, label):
        """Find the catalog district row for an ArcGIS CONG_DIST label."""
        match = self.DISTRICT_RE.match(label or '')
        if not match:
            return None
        name, ordinal = match.groups()
        jurisdiction = self.ARCGIS_JURISDICTION.get(name, name)
        wanted = {'First': 1, 'Second': 2, 'Third': 3, 'Fourth': 4,
                  'Fifth': 5, 'Sixth': 6, 'Lone': 0}[ordinal]
        for d in self.by_jurisdiction.get(normalize(jurisdiction), []):
            if d['district_no'] == wanted:
                return d
        return None

    def from_polygon_code(self, source_code, relation='within'):
        """Whole-unit district via the verified assignment table."""
        if relation != 'within' or not source_code:
            return None
        code10 = str(source_code).split('.')[0].zfill(10)
        row = self.by_code.get(self.modernize(code10)) or self.by_code.get(code10)
        if not row or row['assignment_type'] != 'whole_unit':
            return None
        district = self.districts.get(row['leg_id'])
        if not district:
            return None
        return {
            'leg_id': district['leg_id'],
            'jurisdiction': district['jurisdiction'],
            'district_label': district['district_label'],
            'district_no': district['district_no'],
            'derivation': 'municity_polygon_code_join',
            'source': 'psgc_leg_assignments',
        }

    def split_city_district(self, point, city_name, arcgis_frame):
        """District within a split city via validated ArcGIS polygons.

        Returns None unless exactly one adopted district polygon contains the
        point; boundary-touching or multi-polygon hits stay unresolved.
        """
        from shapely.geometry import Point
        if city_name not in self.ADOPTED and city_name not in self.ADOPTED_WITH_CAVEAT:
            return None
        if arcgis_frame is None:
            return None
        xy = Point(point[0], point[1])
        projected = gpd.GeoSeries([xy], crs=4326).to_crs(arcgis_frame.crs).iloc[0]
        matches = []
        for label, geometry in zip(arcgis_frame['CONG_DIST'], arcgis_frame.geometry):
            if geometry is None or not projected.within(geometry):
                continue
            district = self._catalog_district(label)
            if district and district['jurisdiction'] == city_name:
                matches.append(district)
        if len(matches) != 1:
            return None
        district = matches[0]
        return {
            'leg_id': district['leg_id'],
            'jurisdiction': district['jurisdiction'],
            'district_label': district['district_label'],
            'district_no': district['district_no'],
            'derivation': 'split_city_point_in_polygon',
            'source': 'dpwh-arcgis-congdist-2022',
            'caveat': ('district polygons validated with caveat: partial coverage'
                       if city_name in self.ADOPTED_WITH_CAVEAT else None),
        }

    def for_bridge(self, evidence_row, arcgis_frame):
        """District for one bridge from its retained spatial evidence."""
        hits = evidence_row['polygon_hits'].get('municipality_city', [])
        within = [h for h in hits if h['relation'] == 'within']
        if len(within) != 1:
            return None
        district = self.from_polygon_code(within[0].get('source_code'))
        if district:
            return district
        # Split city: fall back to direct point-in-polygon on the adopted layer.
        assignment = self.by_code.get(self.modernize(
            str(within[0].get('source_code', '')).split('.')[0].zfill(10)))
        if assignment and assignment['assignment_type'] == 'multi_district_city':
            return self.split_city_district(evidence_row['coordinates'],
                                            assignment['name'], arcgis_frame)
        return None


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


def arcgis_congdist_features():
    """Load the validated DPWH ArcGIS 2022 congressional district layer once."""
    import geopandas as gpd
    frame = gpd.read_file(CONGDIST_GEOJSON)[['CONG_DIST', 'geometry']]
    frame = frame[frame['CONG_DIST'].notna()]
    return frame


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
    # Legislative districts come directly from coordinates where possible;
    # the PSGC chain reconciliation stays as separate fallback evidence.
    inputs[str(LEG_ASSIGNMENTS.relative_to(ROOT))] = sha(LEG_ASSIGNMENTS)
    inputs[str(LEG_DISTRICTS.relative_to(ROOT))] = sha(LEG_DISTRICTS)
    inputs[str(CONGDIST_GEOJSON.relative_to(ROOT))] = sha(CONGDIST_GEOJSON)
    leg = LegDistricts([json.loads(line) for line in LEG_ASSIGNMENTS.read_text().splitlines()],
                       json.loads(LEG_DISTRICTS.read_text())['districts'])
    print('Deriving legislative districts from bridge coordinates ...', flush=True)
    arcgis_frame = None
    split_cities = {a['name'] for a in leg.by_code.values()
                    if a['assignment_type'] == 'multi_district_city'}
    if split_cities & (leg.ADOPTED | leg.ADOPTED_WITH_CAVEAT):
        arcgis_frame = arcgis_congdist_features()
    derivation_counts = Counter()
    for code in sorted(evidence):
        district = leg.for_bridge(evidence[code], arcgis_frame)
        if district:
            evidence[code]['legislative_district'] = district
            derivation_counts[district['derivation']] += 1
        else:
            evidence[code]['legislative_district'] = None
    print(f'Legislative districts: {dict(derivation_counts)}', flush=True)
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
              'current_psgc_candidate_codes', 'current_psgc_reconciliation',
              'leg_district', 'leg_derivation', 'leg_source']
    writer = csv.DictWriter(buffer, fieldnames=fields)
    writer.writeheader()
    for row in matches:
        for match in row['matches']:
            ev = evidence[match['bridge_id']]
            level = ev['most_detailed_level']
            district = ev.get('legislative_district') or {}
            writer.writerow({**{k: row[k] for k in ('record_id', 'dataset', 'title', 'status')},
                             **{k: match[k] for k in ('bridge_id', 'longitude', 'latitude')},
                             'spatial_2023_level': level,
                             'spatial_2023_candidates': json.dumps(ev['polygon_hits'].get(level, []), ensure_ascii=False),
                             'spatial_review_flags': '|'.join(ev['review_flags']),
                             'current_psgc_candidate_codes': '|'.join(r['code'] for r in ev['current_psgc_candidates']),
                             'current_psgc_reconciliation': ev['current_psgc_reconciliation'],
                             'leg_district': district.get('leg_id') or '',
                             'leg_derivation': district.get('derivation') or '',
                             'leg_source': district.get('source') or ''})
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
        'legislative_district_method': {
            'primary': '2023 municity polygon code -> vintage crosswalk -> psgc_leg_assignments (whole-unit)',
            'split_cities': 'point-in-polygon, DPWH ArcGIS 2022 congressional districts, adopted cities per PSGC2LEG/docs/arcgis_congdist_validation.md',
            'not_adopted': ['City of Antipolo', 'City of Cebu', 'City of Caloocan', 'City of Taguig'],
            'caveated': ['City of Davao', 'City of Cagayan De Oro'],
        },
        'matching_scope': 'Exact explicit bridge IDs; bridge-word mentions without IDs retained for review.',
        'by_dataset': dict(counts), 'unique_matched_bridges': len(matched_ids),
        'matched_bridge_spatial_levels': dict(spatial_counts),
        'matched_bridges_with_spatial_flags': sum(bool(evidence[i]['review_flags']) for i in matched_ids),
        'matched_bridge_review_flags': dict(Counter(flag for i in sorted(matched_ids)
                                                    for flag in evidence[i]['review_flags'])),
        'matched_bridge_current_psgc_reconciliation': dict(Counter(
            evidence[i]['current_psgc_reconciliation'] for i in sorted(matched_ids))),
        'matched_bridge_legislative_districts': dict(Counter(
            (evidence[i]['legislative_district'] or {}).get('derivation', 'unresolved')
            for i in sorted(matched_ids))),
        'all_inventory_legislative_districts': dict(Counter(
            (r['legislative_district'] or {}).get('derivation', 'unresolved')
            for r in evidence.values())),
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
                   'Legislative districts among matched assets: '
                   + json.dumps(audit['matched_bridge_legislative_districts']) + '.',
                   'Districts derive directly from bridge coordinates: municity polygon code joins',
                   'the verified PSGC2LEG municipality-to-district assignments (whole-unit), and',
                   'split cities use point-in-polygon on the validated DPWH ArcGIS 2022 layer',
                   '(Antipolo, Cebu City, Caloocan, and Taguig excluded per validation verdicts;',
                   'Davao and Cagayan de Oro adopted with coverage caveats).', '',
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
