#!/usr/bin/env python3
"""Archive the public DPWH bridge inventory; --check verifies a snapshot offline."""

from __future__ import annotations

import argparse
import collections
import csv
import gzip
import hashlib
import io
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ('https://services1.arcgis.com/IwZZTMxZCmAmFYvF/ArcGIS/rest/'
           'services/Detailed_Bridge_Inventory/FeatureServer')
ITEM = 'https://www.arcgis.com/sharing/rest/content/items/2788d10b96ff4d8a9f3cb58fef90e390'
LAYER = 1


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':'),
                       allow_nan=False) + '\n').encode('utf-8')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_features(features, expected_ids, oid_field):
    """Reject incomplete downloads; retain missing/invalid coordinates as flags."""
    ids = [f['attributes'][oid_field] for f in features]
    require(len(ids) == len(set(ids)), 'Duplicate object IDs in downloaded features')
    require(set(ids) == set(expected_ids), 'Downloaded object IDs differ from source inventory')
    bridge_ids = [f['attributes'].get('BRIDGE_ID') for f in features]
    counts = collections.Counter(b for b in bridge_ids if b and b.strip())
    invalid, outside, missing = [], [], []
    for f in features:
        oid = f['attributes'][oid_field]
        g = f.get('geometry') or {}
        x, y = g.get('x'), g.get('y')
        valid = (all(isinstance(v, (int, float)) and not isinstance(v, bool)
                     and math.isfinite(v) for v in (x, y))
                 and -180 <= x <= 180 and -90 <= y <= 90)
        if not valid:
            invalid.append(oid)
        elif not (116 <= x <= 127.5 and 4 <= y <= 22):
            outside.append(oid)
        if not f['attributes'].get('BRIDGE_ID', '') or not str(f['attributes']['BRIDGE_ID']).strip():
            missing.append(oid)
    return {
        'feature_count': len(features), 'unique_bridge_id_count': len(counts),
        'duplicate_bridge_ids': {k: v for k, v in sorted(counts.items()) if v > 1},
        'missing_bridge_id_object_ids': missing,
        'invalid_or_missing_coordinate_object_ids': invalid,
        'outside_philippines_screen_object_ids': outside,
        'locality_nonblank_counts': {
            k: sum(bool(str(f['attributes'].get(k) or '').strip()) for f in features)
            for k in ('BRGY', 'MUNICIPAL', 'PROVINCE', 'REGION')},
    }


def exports(features, fields, oid_field):
    """Keep source attributes unchanged; invalid point geometries become null."""
    names = [f['name'] for f in fields]
    points, lines = [], []
    buffer = io.StringIO(newline='')
    writer = csv.DictWriter(buffer, fieldnames=names + ['longitude', 'latitude'])
    writer.writeheader()
    for feature in sorted(features, key=lambda f: f['attributes'][oid_field]):
        attrs = feature['attributes']
        g = feature.get('geometry') or {}
        issues = validate_features([feature], [attrs[oid_field]], oid_field)
        valid = not issues['invalid_or_missing_coordinate_object_ids']
        x, y = (g['x'], g['y']) if valid else (None, None)
        points.append({'type': 'Feature', 'id': attrs[oid_field],
                       'properties': attrs, 'geometry':
                       {'type': 'Point', 'coordinates': [x, y]} if valid else None})
        lines.append(encode({'attributes': attrs, 'longitude': x, 'latitude': y}))
        writer.writerow({**attrs, 'longitude': x, 'latitude': y})
    return {
        'data/bridges.geojson.gz': encode({'type': 'FeatureCollection', 'features': points}),
        'data/bridges.jsonl.gz': b''.join(lines),
        'data/bridges.csv.gz': buffer.getvalue().encode('utf-8'),
    }


class Archive:
    def __init__(self, directory):
        self.directory = directory
        self.files = {}

    def write(self, name, data, **provenance):
        stored = gzip.compress(data, mtime=0) if name.endswith('.gz') else data
        path = self.directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(stored)
        self.files[name] = {'bytes': len(stored), 'sha256': hashlib.sha256(stored).hexdigest(),
                            'uncompressed_bytes': len(data),
                            'uncompressed_sha256': hashlib.sha256(data).hexdigest(), **provenance}

    def fetch(self, name, endpoint, **params):
        url = endpoint + '?' + urlencode({'f': 'json', **params})
        for attempt in range(3):
            try:
                request = Request(url, headers={'User-Agent': 'DPWH-NEP-bridge-archive/1.0'})
                with urlopen(request, timeout=45) as response:
                    raw = response.read()
                    content_type = response.headers.get('Content-Type', '')
                result = json.loads(raw)
                require('error' not in result, f'ArcGIS error: {result.get("error")}')
                self.write(name, raw, url=url, retrieved_at_utc=now(), content_type=content_type)
                return result
            except (OSError, ValueError):
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)


def collect(directory):
    archive = Archive(directory)
    started = now()
    service = archive.fetch('raw/service.json', SERVICE)
    item = archive.fetch('raw/item.json', ITEM)
    endpoint = f'{SERVICE}/{LAYER}'
    layer = archive.fetch('raw/layer.json', endpoint)
    require(layer.get('geometryType') == 'esriGeometryPoint', 'Expected bridge point layer')
    fields = {f['name'] for f in layer['fields']}
    require({'BRIDGE_ID', 'BR_NAME', 'BRGY', 'MUNICIPAL', 'PROVINCE'} <= fields,
            'Required bridge/locality fields missing')
    oid_field = layer['objectIdField']
    query = endpoint + '/query'
    before = archive.fetch('raw/count_before.json', query, where='1=1', returnCountOnly='true')
    inventory = archive.fetch('raw/object_ids.json', query, where='1=1', returnIdsOnly='true')
    ids = sorted(inventory['objectIds'])
    require(ids and len(ids) == len(set(ids)) == before['count'], 'Source count/ID inventory mismatch')
    # Keep GET URLs short: this host rejects long object-ID queries with HTTP 404.
    size = min(200, layer['maxRecordCount'])
    require(size > 0, 'Invalid service record limit')
    features = []
    for offset in range(0, len(ids), size):
        batch = ids[offset:offset + size]
        page = archive.fetch(f'raw/features_{offset // size + 1:04d}.json.gz', query,
                             objectIds=','.join(map(str, batch)), outFields='*',
                             returnGeometry='true', outSR=4326)
        require(not page.get('exceededTransferLimit'), 'Server truncated requested batch')
        require(page.get('spatialReference', {}).get('wkid') == 4326,
                'Server did not return WGS84 geometry')
        validate_features(page['features'], batch, oid_field)
        features.extend(page['features'])
        print(f'Downloaded {len(features):,}/{len(ids):,} bridge features', flush=True)
    after = archive.fetch('raw/count_after.json', query, where='1=1', returnCountOnly='true')
    layer_after = archive.fetch('raw/layer_after.json', endpoint)
    inventory_after = archive.fetch('raw/object_ids_after.json', query, where='1=1', returnIdsOnly='true')
    require(before['count'] == after['count'] and ids == sorted(inventory_after['objectIds']),
            'Source inventory changed during download; retry into a new snapshot')
    require(layer.get('editingInfo') == layer_after.get('editingInfo')
            and layer['fields'] == layer_after['fields'], 'Source data/schema changed during download')
    validation = validate_features(features, ids, oid_field)
    for name, data in exports(features, layer['fields'], oid_field).items():
        archive.write(name, data)
    manifest = {
        'schema_version': 1, 'snapshot': directory.name, 'retrieval_started_at_utc': started,
        'retrieval_completed_at_utc': now(), 'source_url': SERVICE, 'layer_id': LAYER,
        'layer_name': layer['name'], 'source_item_id': service['serviceItemId'],
        'source_owner': item.get('owner'), 'source_access_information': item.get('accessInformation'),
        'source_license_info': item.get('licenseInfo'), 'source_editing_info': layer.get('editingInfo'),
        'source_crs': layer['extent']['spatialReference'], 'export_crs': 'EPSG:4326',
        'coordinate_order': ['longitude', 'latitude'],
        'scope': item.get('snippet'),
        'psgc_assignment': 'not_performed', 'spatial_accuracy': 'not_independently_verified',
        'validation': validation, 'files': archive.files,
    }
    (directory / 'manifest.json').write_bytes(encode(manifest))
    check(directory)
    return manifest


def read(directory, name):
    data = (directory / name).read_bytes()
    return gzip.decompress(data) if name.endswith('.gz') else data


def check(directory):
    manifest = json.loads((directory / 'manifest.json').read_bytes())
    for name, info in manifest['files'].items():
        stored = (directory / name).read_bytes()
        require(len(stored) == info['bytes'] and hashlib.sha256(stored).hexdigest() == info['sha256'],
                f'Stored checksum/size mismatch: {name}')
        raw = read(directory, name)
        require(len(raw) == info['uncompressed_bytes']
                and hashlib.sha256(raw).hexdigest() == info['uncompressed_sha256'],
                f'Uncompressed checksum/size mismatch: {name}')
    layer = json.loads(read(directory, 'raw/layer.json'))
    inventory = json.loads(read(directory, 'raw/object_ids.json'))
    features = []
    for name in sorted(manifest['files']):
        if name.startswith('raw/features_'):
            page = json.loads(read(directory, name))
            require(not page.get('exceededTransferLimit'), 'Truncated archived batch')
            require(page.get('spatialReference', {}).get('wkid') == 4326, 'Archived CRS mismatch')
            features.extend(page['features'])
    validation = validate_features(features, inventory['objectIds'], layer['objectIdField'])
    require(validation == manifest['validation'], 'Archived validation summary differs')
    for name, expected in exports(features, layer['fields'], layer['objectIdField']).items():
        require(read(directory, name) == expected, f'Export differs from archived source: {name}')
    print(f'Verified {validation["feature_count"]:,} features, checksums, and all exports', flush=True)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Offline verification; no network requests')
    parser.add_argument('--snapshot', type=Path, help='Existing snapshot directory to check')
    args = parser.parse_args()
    require(not args.snapshot or args.check, '--snapshot requires --check')
    if args.check:
        directory = args.snapshot
        if directory is None:
            latest = json.loads((ROOT / 'latest.json').read_bytes())
            directory = ROOT / latest['snapshot_path']
            require(hashlib.sha256((directory / 'manifest.json').read_bytes()).hexdigest()
                    == latest['manifest_sha256'], 'Latest snapshot manifest checksum mismatch')
        check(directory)
        return
    snapshots = ROOT / 'snapshots'
    snapshots.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    destination = snapshots / stamp
    # Download into staging; a failed acquisition never replaces a verified snapshot.
    with tempfile.TemporaryDirectory(prefix='.fetch-', dir=snapshots) as temp:
        staging = Path(temp)
        manifest = collect(staging)
        manifest['snapshot'] = stamp
        (staging / 'manifest.json').write_bytes(encode(manifest))
        staging.rename(destination)
    latest = {'snapshot_path': f'snapshots/{stamp}',
              'manifest_sha256': hashlib.sha256((destination / 'manifest.json').read_bytes()).hexdigest(),
              'feature_count': manifest['validation']['feature_count'],
              'retrieved_at_utc': manifest['retrieval_completed_at_utc']}
    temporary = ROOT / f'.latest-{stamp}.tmp'
    temporary.write_bytes(encode(latest))
    temporary.replace(ROOT / 'latest.json')
    print(f'Archived snapshot: {destination}')


if __name__ == '__main__':
    main()
