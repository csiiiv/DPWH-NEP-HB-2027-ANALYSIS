#!/usr/bin/env python3
"""Derive a coordinate-based PSGC layer from the retained observations.

Each observation carrying GPS points (the source coordinate_interpretation
layer, else GPS parsed from the title — exactly the inputs the master build
reads) is resolved through the local PSGC barangay shapefiles (R-tree
point-in-polygon) into a barangay-level PSGC chain. The output is a
DERIVED, hash-pinned layer in the readable_title_v1 discipline:

- built from UPSTREAM observations, never from the master output, so the
  master build can consume it later without circular hashing
- the shapefiles are git-ignored (1.8 GB local); this builder requires
  them but its small committed output does not
- every record's chain is evidence for review, never an assignment
- multi-point records summarize agreement across points
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import shutil
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'master_list/data'
# Upstream input, deliberately NOT the master output: the layer must stay
# acyclic (like readable_title_v1) so the master build can consume it later
# without circular hashing. Observations carry the same title and
# coordinate_interpretation fields the master build reads.
INPUT = 'master_list/data/processing/observations.jsonl.gz'
CATALOG = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
GEOMAP = ROOT / 'dpwh_coor2psgc_geomapping'

sys.path.insert(0, str(ROOT / 'gps-analysis'))
from scan_gps_inventory import analyze_text  # noqa: E402

METHOD = 'coordinate_psgc_v1'

# The 2023 shapefiles predate the Negros Island / Sulu reorganizations and
# carry NCR "not a province" districts. Their adm2 codes are absent from the
# retained catalog; bridge by name to the current codes. Bacolod's HUC code
# appears at both province and municipality level in the shapefiles. NCR
# districts have no province equivalent and stay unbridged.
PROVINCE_BRIDGE = {
    '0604500000': '1804500000',  # Negros Occidental (pre-reorg Region VI)
    '0704600000': '1804600000',  # Negros Oriental (pre-reorg Region VII)
    '0706100000': '1806100000',  # Siquijor (pre-reorg Region VII)
    '1906600000': '0906600000',  # Sulu (2024 transfer to Region IX)
    '0630200000': '1830200000',  # Bacolod City HUC (pre-reorg Region VI)
}


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def load_catalog():
    catalog = {}
    with CATALOG.open() as stream:
        for line in stream:
            row = json.loads(line)
            catalog[row['code']] = row
    return catalog


def chain_for(catalog, hit):
    """Full PSGC chain for a point hit, with catalog names at each level.

    Shapefile codes absent from the catalog fall into classes: pre-reorg
    provinces/HUCs (PROVINCE_BRIDGE), units inside a moved province
    (bridged by 5-digit suffix within the bridged parent tree), and their
    barangays (bridged by suffix within the resolved municipality). Once
    the deepest unit resolves, ancestors are rebuilt from the CATALOG's
    ancestry so reorg-moved units carry their current region. Codes that
    bridge nowhere keep name=None — surfaced, never hidden."""
    if not hit or not hit.get('matched'):
        return None
    # PSGC cities and municipalities are the same administrative tier; the
    # catalog records them under either level. Accept both everywhere.
    def muni(codes):
        return [c for c in codes if catalog[c]['level'] in ('city', 'municipality')]
    resolved = {}
    for level, key in (('province', 'province_psgc'), ('municipality', 'municipality_psgc'),
                       ('barangay', 'barangay_psgc')):
        code = hit.get(key)
        if not code:
            continue
        code10 = str(code).zfill(10)
        row = catalog.get(code10)
        if row is None and level == 'province':
            code10 = PROVINCE_BRIDGE.get(code10, code10)
            row = catalog.get(code10)
        if row is None and level == 'municipality':
            # The unit kept its name/code-suffix across the reorg; only its
            # parent moved. Search inside the bridged province tree; for an
            # HUC (province==city) the city itself matches by suffix.
            parents = []
            province = resolved.get('province')
            if province:
                parents.append(province['code'])
            suffix = code10[-5:]
            for parent in parents:
                if parent.endswith(suffix) and catalog[parent]['level'] in ('city', 'municipality'):
                    code10, row = parent, catalog[parent]
                    break
                match = [c for c, r in catalog.items()
                         if r['parent_code'] == parent and r['level'] in ('city', 'municipality')
                         and c.endswith(suffix)]
                if len(match) == 1:
                    code10, row = match[0], catalog[match[0]]
                    break
        if row is None and level == 'barangay':
            muni = resolved.get('municipality')
            if muni and muni.get('code'):
                suffix = code10[-5:]
                match = [c for c, r in catalog.items()
                         if r['parent_code'] == muni['code'] and r['level'] == level
                         and c.endswith(suffix)]
                if len(match) == 1:
                    code10, row = match[0], catalog[match[0]]
                elif hit.get('barangay'):
                    # Renumbered barangays bridge by name instead of suffix.
                    wanted = hit['barangay'].strip().lower()
                    by_name = [c for c, r in catalog.items()
                               if r['parent_code'] == muni['code'] and r['level'] == level
                               and r['name'].strip().lower() == wanted]
                    if len(by_name) == 1:
                        code10, row = by_name[0], catalog[by_name[0]]
        resolved[level] = {'code': code10, 'name': row['name'] if row else None,
                           '_row': row}
    # Deepest resolved unit defines catalog-true ancestry.
    chain = {}
    for level in ('barangay', 'municipality', 'province'):
        unit = resolved.get(level)
        if unit and unit.get('_row'):
            row = unit['_row']
            chain[level] = {'code': unit['code'], 'name': unit['name']}
            parent = row.get('parent_code')
            depth = {'barangay': ('municipality', 'province', 'region'),
                     'municipality': ('province', 'region'),
                     'province': ('region',)}[level]
            for ancestor_level in depth:
                if ancestor_level in chain:
                    continue
                prow = catalog.get(parent) if parent else None
                if prow is None:
                    parent = None
                    continue
                levels_ok = (({'municipality'} if ancestor_level == 'municipality'
                              else {ancestor_level}))
                levels_ok = levels_ok | ({'city'} if ancestor_level == 'municipality' else set())
                if prow['level'] in levels_ok:
                    chain[ancestor_level] = {'code': parent, 'name': prow['name']}
                    parent = prow.get('parent_code')
                else:
                    parent = None
            break
    # An HUC's shapefile "province" duplicates the city; drop the redundant
    # slot rather than carrying a null or city-level duplicate. The city is
    # the municipality.
    prov = resolved.get('province')
    if chain.get('province') and prov:
        prow = catalog.get(chain['province']['code'])
        if prow and prow['level'] != 'province':
            del chain['province']
    # Fill unresolved deeper levels (name=None) and region fallback.
    if not chain:
        return None
    for level in ('barangay', 'municipality', 'province'):
        if level not in chain and level in resolved:
            if level == 'province':
                # Never fill a province slot that the shapefiles assigned to
                # an HUC/city (duplicate of the municipality) — drop it.
                prow = catalog.get(resolved['province']['code'])
                if prow is None or prow['level'] != 'province':
                    continue
            chain[level] = {'code': resolved[level]['code'], 'name': None}
    if 'region' not in chain:
        code = hit.get('region_psgc')
        code10 = str(code).zfill(10) if code else None
        row = catalog.get(code10) if code10 else None
        chain['region'] = {'code': code10, 'name': row['name'] if row else None}
    return {k: chain[k] for k in ('region', 'province', 'municipality', 'barangay')
            if k in chain}


def record_points(record):
    """The usable GPS points of an observation, derived exactly as the master
    build derives coordinate_summary: the source coordinate_interpretation
    layer, else GPS parsed from the title. Order matters and matches
    build_master_list.py."""
    coord = record.get('coordinate_interpretation')
    if not coord:
        return [], None
    points = [{key: p.get(key) for key in ('longitude', 'latitude', 'role', 'issues')}
              for p in coord.get('points', [])]
    usable = [p for p in points
              if p.get('longitude') is not None and p.get('latitude') is not None]
    source = 'coordinate_interpretation'
    return usable, source


def build(out_dir: Path, limit=None):
    sys.path.insert(0, str(GEOMAP / 'geomap_r_tree'))
    from coord_to_psgc_rtree import CoordToPSGCMapper

    mapper = CoordToPSGCMapper(shapefile_dir=str(GEOMAP / 'philippines-psgc-shapefiles'))
    catalog = load_catalog()

    rows, considered = [], 0
    point_status = {'resolved': 0, 'unresolved': 0}
    with gzip.open(ROOT / INPUT, 'rt', encoding='utf-8') as stream:
        for line in stream:
            record = json.loads(line)
            usable, source = record_points(record)
            # Title-parsed GPS joins the same way the master build adds it:
            # only when the record carries no coordinate_interpretation.
            if not usable:
                title_gps = analyze_text(record.get('title') or '')
                if title_gps:
                    usable = [p for p in title_gps.get('points', [])
                              if p.get('longitude') is not None and p.get('latitude') is not None]
                    source = 'title'
            if not usable:
                continue
            considered += 1
            if limit and considered > limit:
                break
            per_point = []
            for p in usable:
                hit = mapper.map_coordinate(float(p['latitude']), float(p['longitude']))
                chain = chain_for(catalog, hit)
                per_point.append({
                    'role': p.get('role'),
                    'longitude': p['longitude'], 'latitude': p['latitude'],
                    'matched': bool(chain),
                    'chain': chain,
                })
                point_status['resolved' if chain else 'unresolved'] += 1
            chains = [pp['chain'] for pp in per_point if pp['chain']]
            barangays = {c['barangay']['code'] for c in chains if c.get('barangay')}
            municipalities = {c['municipality']['code'] for c in chains if c.get('municipality')}
            if not chains:
                agreement = 'none_resolved'
            elif len(barangays) == 1:
                agreement = 'single_barangay'
            elif len(municipalities) == 1:
                agreement = 'single_municipality'
            else:
                agreement = 'spans_municipalities'
            rows.append({
                'record_id': record['record_id'],
                'dataset': record['dataset'],
                'coordinate_source': source,
                'coordinate_status': (record.get('coordinate_interpretation') or {}).get('status', 'no_coordinates') if source != 'title' else 'parsed',
                'method': METHOD,
                'point_count': len(usable),
                'agreement': agreement,
                'points': per_point,
            })
    rows.sort(key=lambda r: r['record_id'])
    target = out_dir / 'coordinate_psgc.jsonl.gz'
    with io.TextIOWrapper(gzip.GzipFile(filename='', mode='wb',
                                        fileobj=target.open('wb'), mtime=0),
                          encoding='utf-8', newline='') as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
    audit = {
        'method': METHOD,
        'description': __doc__.strip().splitlines()[0],
        'input': {'path': INPUT, 'sha256': sha(ROOT / INPUT)},
        'records_with_points': considered,
        'coordinate_source_counts': _count(rows, 'coordinate_source'),
        'points': dict(point_status),
        'agreement_counts': _count(rows, 'agreement'),
        'output_sha256': {'coordinate_psgc.jsonl.gz': sha(target)},
    }
    (out_dir / 'coordinate_psgc_audit.json').write_text(
        json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True) + '\n',
        encoding='utf-8')
    return audit


def _count(rows, key):
    counts = {}
    for row in rows:
        counts[row[key]] = counts.get(row[key], 0) + 1
    return dict(sorted(counts.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='Rebuild and compare without modifying outputs')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='coordinate-psgc-') as temp:
        out = Path(temp)
        audit = build(out)
        if args.check:
            stale = [p.name for p in out.iterdir()
                     if not (OUTPUT / p.name).exists() or sha(p) != sha(OUTPUT / p.name)]
            if stale:
                raise SystemExit(f'Coordinate-PSGC outputs stale: {stale}')
            print(f"Coordinate-PSGC check passed: {audit['records_with_points']} records, "
                  f"{audit['points']['resolved']} resolved points.")
            return
        for name in ('coordinate_psgc.jsonl.gz', 'coordinate_psgc_audit.json'):
            shutil.copyfile(out / name, OUTPUT / name)
    print(f"Derived {audit['records_with_points']} coordinate records -> "
          f"master_list/data/coordinate_psgc.jsonl.gz")


if __name__ == '__main__':
    main()
