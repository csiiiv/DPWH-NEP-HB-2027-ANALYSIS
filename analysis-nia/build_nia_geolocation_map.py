#!/usr/bin/env python3
"""Attach barangay polygon centroids to the NIA geolocation layer.

Reads analysis-nia/data/nia_geolocation.json (built by extract_nia_geolocation.py)
and joins each catalog-valid PSGC to its polygon centroid from the retained
2023 PSA barangay boundaries (dpwh_coor2psgc_geomapping submodule). Unlocated or
PSGC-flagged rows keep coordinates: null and their existing review flags.

Centroids are polygon means (bbox-based label points are not exposed by the
retained export); they are map anchors for one barangay among possibly several
project sites, not surveyed locations.

Output: analysis-nia/data/nia_geolocation_map.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
INPUT = HERE / 'data/nia_geolocation.json'
SHP_DIR = ROOT / ('dpwh_coor2psgc_geomapping/philippines-psgc-shapefiles/'
                  'data/2023')
OUTPUT = HERE / 'data/nia_geolocation_map.json'


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def shapefile_reader(directory: Path, stem: str):
    # The retained export uses doubled extensions: <stem>.shp.shp/.dbf/.shx.
    shx = (sorted(directory.glob(f'{stem}.shp.shx')) or sorted(directory.glob(f'{stem}.shx'))
           or sorted(directory.glob(f'{stem}*.shx')))
    if not shx:
        raise ValueError(f'{stem} shapefile missing under {directory}; init the geomapping submodule')
    return shapefile.Reader(shx=str(shx[0]), dbf=str(shx[0]).replace('.shx', '.dbf'),
                            shp=str(shx[0]).replace('.shx', '.shp'), encoding='latin-1')


def centroid(shape) -> list[float] | None:
    if shape.shapeType == shapefile.NULL:
        return None
    # Polygon mean of all vertices is a robust anchor for typical barangay shapes.
    xs: list[float] = []
    ys: list[float] = []
    for part in shape.points:
        xs.append(part[0])
        ys.append(part[1])
    if not xs:
        return None
    return [round(sum(xs) / len(xs), 6), round(sum(ys) / len(ys), 6)]


def build(write_output: bool = True) -> dict:
    data = json.loads(INPUT.read_text())
    bgy = shapefile_reader(SHP_DIR / 'BgySubMuns', 'BgySubMuns')
    mun = shapefile_reader(SHP_DIR / 'Municities', 'Municities')

    def index_codes(reader) -> dict[str, int]:
        index = {}
        for i in range(len(reader)):
            code = reader.record(i)['psgc_code']
            if isinstance(code, int):
                index[f'{code:010d}'] = i
        return index

    bgy_index = index_codes(bgy)
    mun_index = index_codes(mun)

    # The retained 2023 boundaries predate the 2024 Negros Island Region split:
    # they still carry region-06/07 codes for Negros Occidental (→06),
    # Negros Oriental (→07) and Siquijor (→07), while current PSGC publications
    # (and Anthony's layer) use region 18. Translate 18xxxx codes to their
    # pre-split equivalents before lookup.
    def legacy_code(code: str) -> str | None:
        if code.startswith('18'):
            for prefix in ('06', '07'):
                alt = prefix + code[2:]
                if alt in bgy_index or alt in mun_index:
                    return alt
        return None

    mapped = 0
    municipality_fallback = 0
    records = []
    for row in data['records']:
        out = {
            'id': row['id'],
            'psgc': row['psgc'],
            'psgc_status': row['psgc_status'],
            'located': row['located'],
            'province': row['province'],
            'municipality': row['municipality'],
            'barangay': row['barangay'],
            'legislative_district': row['legislative_district'],
            'deo': row['deo'],
            'status_label': row['status_label'],
            'flags': list(row['flags']),
        }
        coordinate = None
        anchor = None
        lookup = row['psgc']
        if lookup and lookup not in bgy_index and lookup not in mun_index:
            # Codes absent from the retained barangay layer can still anchor
            # at municipality level through the parent fallback below.
            legacy = legacy_code(lookup)
            if legacy:
                lookup = legacy
        if row['located'] and lookup and lookup in bgy_index:
            point = centroid(bgy.shape(bgy_index[lookup]))
            if point:
                coordinate = point
                anchor = 'barangay'
        if coordinate is None and row['located'] and lookup \
                and 'psgc_malformed' not in row['flags'] and str(lookup).endswith('00'):
            # Many of Anthony's rows encode the municipality seat as the
            # municipality PSGC itself (barangay suffix 00). Anchor those at
            # the centroid of the municipality polygon.
            if lookup in mun_index:
                coordinate = centroid(mun.shape(mun_index[lookup]))
                anchor = 'municipality'
                out['flags'] = out['flags'] + ['municipality_level_anchor']
        if coordinate is None and row['located'] and lookup and 'psgc_malformed' not in row['flags']:
            # Barangay rows whose retained polygon is absent or null-geometry
            # fall back to the parent municipality polygon. Barangay PSGCs
            # end in two barangay-sequence digits: municipality code keeps the
            # first 8 digits (e.g. 1908807009 → 1908807000).
            for parent in (str(lookup)[:8] + '00', str(lookup)[:6] + '0000'):
                for candidate in (parent, '06' + parent[2:], '07' + parent[2:]):
                    if candidate != parent and not candidate.startswith(('0604', '0704', '0706')):
                        continue
                    if candidate in mun_index:
                        coordinate = centroid(mun.shape(mun_index[candidate]))
                        anchor = 'municipality'
                        out['flags'] = out['flags'] + ['municipality_level_anchor']
                        break
                if coordinate:
                    break
        if coordinate:
            mapped += 1
            if anchor == 'municipality':
                municipality_fallback += 1
        out['coordinates'] = coordinate
        out['coordinate_anchor'] = anchor
        records.append(out)

    payload = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'scope': 'Barangay-centroid anchors for the AI-assisted NIA geolocation layer; '
                 'one anchor per located row, not a surveyed project site.',
        'summary': {
            'records': len(records),
            'located': sum(1 for r in records if r['located']),
            'with_coordinates': mapped,
            'barangay_anchor': mapped - municipality_fallback,
            'municipality_anchor': municipality_fallback,
        },
        'metadata': {
            'geolocation_input': str(INPUT.relative_to(ROOT)),
            'geolocation_input_sha256': sha256(INPUT),
            'barangay_boundaries': 'dpwh_coor2psgc_geomapping/philippines-psgc-shapefiles@'
                                   'a44a73091f19e4950dbdc0d7cb77a5e17b101a0a data/2023/BgySubMuns',
            'method': 'Mean of polygon vertices (lon, lat), WGS84. Barangay polygon when the '
                      'PSGC is barangay-level; municipality polygon (Municities layer) when the '
                      'PSGC is the municipality code itself (suffix 00) — flagged '
                      'municipality_level_anchor.',
        },
        'records': records,
    }
    if write_output:
        OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare the regenerated payload without writing')
    args = parser.parse_args()
    payload = build(write_output=not args.check)
    text = json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text() != text:
            raise SystemExit('NIA geolocation map dataset is missing or stale; run analysis-nia/build_nia_geolocation_map.py')
        print(f'Checked {OUTPUT}')
    else:
        summary = payload['summary']
        print(f'Wrote {OUTPUT}: {summary["with_coordinates"]} of {summary["located"]} located rows mapped')


if __name__ == '__main__':
    main()
