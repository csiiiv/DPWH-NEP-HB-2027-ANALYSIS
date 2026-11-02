#!/usr/bin/env python3
"""Build a map supplement for MPB rows that print no title coordinate.

Does NOT mutate mpb_legislative_index_2027.json. Emits a joinable overlay:

  analysis/data/mpb_psgc_approx_overlay_2027.json

Each marker is one PSGC unit (barangay preferred, else municipality/city)
whose 2023 PSA polygon centroid anchors every coordinate-less MPB row that
resolved to that unit. Multiple rows at the same code collapse to one marker
with House-only / NEP-only / paired counts. Province-only and unplaced rows
are listed so the district catch-all badges can keep covering them.

Usage:
  python3 analysis/web/buildMpbPsgcApproxOverlay.py
  python3 analysis/web/buildMpbPsgcApproxOverlay.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'analysis' / 'data'
SHAPE_ROOT = (ROOT / 'dpwh_coor2psgc_geomapping' /
              'philippines-psgc-shapefiles' / 'data' / '2023')
MUNICITY_SHP = SHAPE_ROOT / 'Municities' / 'Municities.shp.shp'
BARANGAY_SHP = SHAPE_ROOT / 'BgySubMuns' / 'PH_Adm4_BgySubMuns.shp.shp'
MPB_INDEX = DATA / 'mpb_legislative_index_2027.json'
OUTPUT = DATA / 'mpb_psgc_approx_overlay_2027.json'

# Same vintage bridges PSGC2LEG/viz uses when joining 2023 geometry to the
# modern PSGC catalog (Negros Occidental/Oriental, Sulu, Bacolod City).
OLD_TO_NEW_PREFIX = {
    '06045': '18045', '07046': '18046', '07061': '18061', '19066': '09066',
}
OLD_TO_NEW_CODE = {'0630200000': '1830200000'}
# Caloocan Barangay 176-D/E are aggregate polygons in the 2023 release; fall
# back to the city centroid rather than inventing a fragment.
CITY_FALLBACK_CODES = {
    '1380100192': '1380100000',  # Barangay 176-D → City of Caloocan
    '1380100193': '1380100000',  # Barangay 176-E → City of Caloocan
}

USABLE_LEVELS = {'barangay', 'municipality', 'city'}
PAIR_BUCKETS = ('increased', 'reduced', 'unchanged', 'scope_review')


def fail(message: str) -> None:
    raise SystemExit(f'MPB PSGC approx: {message}')


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def modernize(code10: str) -> str:
    if code10 in OLD_TO_NEW_CODE:
        return OLD_TO_NEW_CODE[code10]
    prefix = OLD_TO_NEW_PREFIX.get(code10[:5])
    return prefix + code10[5:] if prefix else code10


def demote_modern(code10: str) -> list[str]:
    """Lookup keys: modern code plus any 2023-vintage aliases that map to it."""
    keys = [code10]
    for old, new in OLD_TO_NEW_CODE.items():
        if new == code10:
            keys.append(old)
    for old_prefix, new_prefix in OLD_TO_NEW_PREFIX.items():
        if code10.startswith(new_prefix):
            keys.append(old_prefix + code10[5:])
    return keys


def polygon_centroid_lnglat(geometry) -> tuple[float, float]:
    # Geographic CRS centroids are fine for marker anchors; we are not
    # measuring area or claiming survey precision.
    point = geometry.centroid
    return float(point.x), float(point.y)


def load_centroids() -> dict[str, dict]:
    if not MUNICITY_SHP.exists() or not BARANGAY_SHP.exists():
        fail(f'shapefiles missing under {SHAPE_ROOT.relative_to(ROOT)}')

    centroids: dict[str, dict] = {}

    municities = gpd.read_file(MUNICITY_SHP)[['psgc_code', 'adm3_en', 'geometry']].to_crs(4326)
    municities['code10'] = municities['psgc_code'].astype(str).str.zfill(10).map(modernize)
    for row in municities.itertuples(index=False):
        lng, lat = polygon_centroid_lnglat(row.geometry)
        centroids[row.code10] = {
            'lng': lng, 'lat': lat,
            'level': 'municipality',
            'name': row.adm3_en,
            'source': 'municipality_2023',
        }

    barangays = gpd.read_file(BARANGAY_SHP)[
        ['adm4_psgc', 'adm4_en', 'geo_level', 'geometry']].to_crs(4326)
    barangays = barangays[barangays['geo_level'] == 'Bgy'].copy()
    barangays['code10'] = barangays['adm4_psgc'].astype(str).str.zfill(10)
    for row in barangays.itertuples(index=False):
        lng, lat = polygon_centroid_lnglat(row.geometry)
        # Keep vintage code as-is for direct hits; also index the modernized
        # form so Q3 2026 catalog codes resolve.
        entry = {
            'lng': lng, 'lat': lat,
            'level': 'barangay',
            'name': row.adm4_en,
            'source': 'barangay_2023',
        }
        centroids[row.code10] = entry
        modern = modernize(row.code10)
        if modern != row.code10:
            centroids[modern] = entry

    return centroids


def row_class_map(mpb_index: dict) -> dict[str, str]:
    classes = {}
    for card in list(mpb_index.get('cards') or []) + list(mpb_index.get('region_cards') or []):
        row_ids = card.get('row_ids') or {}
        for rid in row_ids.get('insertions') or []:
            classes[rid] = 'house_only'
        for rid in row_ids.get('deletions') or []:
            classes[rid] = 'nep_only'
        for bucket in PAIR_BUCKETS:
            for rid in row_ids.get(bucket) or []:
                classes[rid] = 'paired'
    return classes


def resolve_centroid(psgc: dict, centroids: dict[str, dict]) -> tuple[dict | None, str | None]:
    level = psgc.get('level')
    code = str(psgc.get('psgc_code') or '').zfill(10) if psgc.get('psgc_code') else None
    if not code or level not in USABLE_LEVELS:
        return None, None

    # Prefer the selected unit; Caloocan 176-D/E fall back to the city.
    candidates = []
    if code in CITY_FALLBACK_CODES:
        candidates.append((CITY_FALLBACK_CODES[code], 'city_fallback'))
    candidates.append((code, 'direct'))
    if level == 'barangay' and psgc.get('municipality_code'):
        candidates.append((str(psgc['municipality_code']).zfill(10), 'municipality_fallback'))

    for candidate, reason in candidates:
        for key in demote_modern(candidate):
            hit = centroids.get(key) or centroids.get(modernize(key))
            if hit:
                return {
                    **hit,
                    'psgc_code': candidate if reason != 'direct' else code,
                    'requested_psgc_code': code,
                    'placement_reason': reason,
                }, reason
    return None, None


def build(built_at: str | None = None) -> dict:
    if not MPB_INDEX.exists():
        fail(f'missing {MPB_INDEX.relative_to(ROOT)}')
    mpb = json.loads(MPB_INDEX.read_text())
    row_points = mpb.get('row_points') or {}
    row_psgc = mpb.get('row_psgc') or {}
    classes = row_class_map(mpb)
    centroids = load_centroids()

    groups: dict[str, dict] = {}
    unplaced = []
    placement_reasons = Counter()
    grain_counts = Counter()

    for rid, psgc in row_psgc.items():
        if row_points.get(rid):
            continue
        hit, reason = resolve_centroid(psgc, centroids)
        if hit is None:
            unplaced.append(rid)
            continue
        placement_reasons[reason] += 1
        # Collapse key: the centroid unit actually drawn (fallback city/municity
        # shares one marker when several barangays lack geometry).
        key = hit['psgc_code']
        entry = groups.setdefault(key, {
            'psgc_code': key,
            'requested_codes': set(),
            'level': hit['level'] if hit['placement_reason'] != 'municipality_fallback'
            else 'municipality',
            'name': hit['name'],
            'lng': hit['lng'],
            'lat': hit['lat'],
            'centroid_source': hit['source'] if hit['placement_reason'] == 'direct'
            else hit['placement_reason'],
            'barangay': psgc.get('barangay'),
            'municipality': psgc.get('municipality'),
            'province': psgc.get('province'),
            'district_ids': set(),
            'row_ids': [],
            'counts': {'house_only': 0, 'nep_only': 0, 'paired': 0},
        })
        entry['requested_codes'].add(str(psgc.get('psgc_code') or '').zfill(10))
        if psgc.get('district_id'):
            entry['district_ids'].add(psgc['district_id'])
        # Prefer richer place labels from barangay-level rows when collapsing
        # several requests onto a municity fallback centroid.
        if psgc.get('level') == 'barangay' and hit['placement_reason'] == 'direct':
            entry['level'] = 'barangay'
            entry['name'] = psgc.get('name') or entry['name']
            entry['barangay'] = psgc.get('barangay')
        entry['municipality'] = entry['municipality'] or psgc.get('municipality')
        entry['province'] = entry['province'] or psgc.get('province')
        entry['row_ids'].append(rid)
        category = classes.get(rid, 'house_only')
        entry['counts'][category] += 1
        grain_counts[entry['level']] += 0  # filled below after collapse

    markers = []
    for key, entry in sorted(groups.items()):
        counts = entry['counts']
        total = counts['house_only'] + counts['nep_only'] + counts['paired']
        grain = entry['level'] if entry['level'] in USABLE_LEVELS else 'municipality'
        grain_counts[grain] += 1
        markers.append({
            'id': f'mpb-approx:{key}',
            'psgc_code': key,
            'level': grain,
            'name': entry['name'],
            'barangay': entry['barangay'],
            'municipality': entry['municipality'],
            'province': entry['province'],
            'district_ids': sorted(entry['district_ids']),
            'lng': round(entry['lng'], 7),
            'lat': round(entry['lat'], 7),
            'centroid_source': entry['centroid_source'],
            'requested_psgc_codes': sorted(entry['requested_codes']),
            'counts': {**counts, 'total': total},
            'row_ids': sorted(entry['row_ids']),
        })

    placed_rows = sum(m['counts']['total'] for m in markers)
    no_point_rows = sum(1 for rid in (set(row_psgc) | set(classes)) if not row_points.get(rid))
    # Rows with neither points nor psgc still belong on district badges.
    for rid in classes:
        if not row_points.get(rid) and rid not in row_psgc and rid not in unplaced:
            unplaced.append(rid)

    return {
        'schema_version': 1,
        'lens': 'mpb_psgc_approx',
        'fiscal_year': mpb.get('fiscal_year', 2027),
        'built_at': built_at or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'note': (
            'Approximate map placements for MPB rows that print no title '
            'coordinate. Anchors are 2023 PSA barangay/municipality polygon '
            'centroids joined through title-PSGC codes. Not survey GPS; the '
            'map renders these as dashed boxes. The base MPB index is unchanged.'
        ),
        'counts': {
            'markers': len(markers),
            'rows_placed': placed_rows,
            'rows_unplaced': len(unplaced),
            'rows_without_title_coordinates': no_point_rows,
            'placement_reasons': dict(sorted(placement_reasons.items())),
            'markers_by_level': dict(sorted(grain_counts.items())),
            'rows_by_class': {
                'house_only': sum(m['counts']['house_only'] for m in markers),
                'nep_only': sum(m['counts']['nep_only'] for m in markers),
                'paired': sum(m['counts']['paired'] for m in markers),
            },
        },
        'markers': markers,
        'unplaced_row_ids': sorted(unplaced),
        'input_provenance': {
            'mpb_index': {'path': str(MPB_INDEX.relative_to(ROOT)), 'sha256': sha256(MPB_INDEX)},
            'municity_shp': {'path': str(MUNICITY_SHP.relative_to(ROOT)), 'sha256': sha256(MUNICITY_SHP)},
            'barangay_shp': {'path': str(BARANGAY_SHP.relative_to(ROOT)), 'sha256': sha256(BARANGAY_SHP)},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else None
    payload = build(previous.get('built_at') if args.check and previous else None)
    # Drop volatile shapefile hashes from the equality check? Keep them — drift
    # in geometry should fail --check. built_at is pinned under --check.
    rendered = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n'
    if args.check:
        if previous is None or OUTPUT.read_text() != rendered:
            raise SystemExit(f'stale or missing artifact: {OUTPUT.relative_to(ROOT)}')
        print(f"MPB PSGC approx check passed: {payload['counts']['markers']} markers, "
              f"{payload['counts']['rows_placed']} rows placed, "
              f"{payload['counts']['rows_unplaced']} unplaced")
        return
    OUTPUT.write_text(rendered)
    counts = payload['counts']
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    print(f"  markers: {counts['markers']} "
          f"(by level {counts['markers_by_level']})")
    print(f"  rows placed: {counts['rows_placed']} / "
          f"{counts['rows_without_title_coordinates']} without title coordinates")
    print(f"  unplaced (no point on map; still on district badges): {counts['rows_unplaced']}")
    print(f"  placement: {counts['placement_reasons']}")
    print(f"  class rows: {counts['rows_by_class']}")


if __name__ == '__main__':
    main()
