#!/usr/bin/env python3
"""Build a standalone bridge table from retained inventory and matching evidence."""
import argparse
import base64
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import tempfile

import archive_bridges as archive

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'bridge_inventory'
DATA = MODULE / 'data'
TEMPLATE = MODULE / 'viewer/template.html'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_jsonl(path):
    with gzip.open(path, 'rt', encoding='utf-8') as source:
        yield from map(json.loads, source)


def build(directory):
    audit_path = DATA / 'bridge_matching_audit.json'
    audit = json.loads(audit_path.read_bytes())
    snapshot = ROOT / audit['bridge_snapshot']
    archive.check(snapshot)
    inventory_path = snapshot / 'data/bridges.jsonl.gz'
    for path in (snapshot / 'manifest.json', inventory_path):
        archive.require(digest(path) == audit['inputs_sha256'][str(path.relative_to(ROOT))],
                        'Inventory differs from matching evidence; rebuild matching first')
    for name in ('bridge_spatial_evidence.jsonl.gz', 'bridge_project_matches.jsonl.gz'):
        archive.require(digest(DATA / name) == audit['outputs_sha256'][name], f'Stale matching output: {name}')
    spatial = {}
    for row in read_jsonl(DATA / 'bridge_spatial_evidence.jsonl.gz'):
        archive.require(row['bridge_id'] not in spatial, 'Duplicate spatial bridge ID')
        spatial[row['bridge_id']] = row
    proximity_audit_path = DATA / 'bridge_proximity_audit.json'
    archive.require(proximity_audit_path.exists(), 'Run analyze_proximity.py before building the viewer')
    proximity_audit = json.loads(proximity_audit_path.read_bytes())
    for path in (audit_path, inventory_path, DATA / 'bridge_spatial_evidence.jsonl.gz'):
        archive.require(digest(path) == proximity_audit['inputs_sha256'][str(path.relative_to(ROOT))],
                        'Stale proximity evidence; run analyze_proximity.py again')
    proximity_path = DATA / 'bridge_proximity.jsonl.gz'
    archive.require(digest(proximity_path) == proximity_audit['outputs_sha256'][proximity_path.name],
                    'Proximity output checksum mismatch')
    proximity = {}
    for row in read_jsonl(proximity_path):
        archive.require(row['bridge_id'] not in proximity, 'Duplicate proximity bridge ID')
        proximity[row['bridge_id']] = row
        archive.require(row['coordinates'] == spatial[row['bridge_id']]['coordinates'], 'Proximity coordinate mismatch')
    archive.require(set(proximity) == {code for code, row in spatial.items() if not row['polygon_hits']['barangay']},
                    'Proximity coverage differs from no-hit inventory')
    projects = defaultdict(list)
    seen_projects, counts = set(), Counter()
    for row in read_jsonl(DATA / 'bridge_project_matches.jsonl.gz'):
        archive.require(row['record_id'] not in seen_projects, 'Duplicate project observation')
        seen_projects.add(row['record_id'])
        for match in row['matches']:
            code = match['bridge_id']
            archive.require(code in spatial, 'Project links to missing spatial record')
            archive.require(spatial[code]['coordinates'] == [match['longitude'], match['latitude']],
                            'Project coordinate differs from spatial evidence')
            projects[code].append({k: row[k] for k in ('record_id', 'dataset', 'title', 'source_dataset')})
            counts[row['dataset']] += 1
    rows = []
    for source in read_jsonl(inventory_path):
        a = source['attributes']
        code = a['BRIDGE_ID']
        archive.require(code in spatial, 'Inventory bridge missing spatial evidence')
        ev = spatial[code]
        archive.require(ev['source_object_id'] == a['OBJECTID']
                        and ev['coordinates'] == [source['longitude'], source['latitude']],
                        'Spatial evidence differs from inventory feature')
        rows.append({'id': code, 'name': a['BR_NAME'], 'road': a['ROAD_NAME'],
                     'barangay': a['BRGY'], 'town': a['MUNICIPAL'], 'province': a['PROVINCE'],
                     'region': a['REGION'], 'longitude': source['longitude'], 'latitude': source['latitude'],
                     'attributes': a, 'spatial': ev, 'projects': projects.get(code, []),
                     'proximity': proximity.get(code)})
    archive.require(len(rows) == len({r['id'] for r in rows}) == len(spatial), 'Viewer inventory is not complete/unique')
    archive.require(len(projects) == audit['unique_matched_bridges'], 'Matched bridge coverage differs from audit')
    rows.sort(key=lambda r: r['id'])
    manifest = json.loads((snapshot / 'manifest.json').read_bytes())
    payload = {'rows': rows, 'snapshot': snapshot.name, 'retrieved': manifest['retrieval_completed_at_utc'],
               'sourceDate': 'January 2023', 'matchedBridges': len(projects), 'projectLinks': sum(counts.values())}
    packed = base64.b64encode(gzip.compress(archive.encode(payload), mtime=0)).decode('ascii')
    template = TEMPLATE.read_text(encoding='utf-8')
    archive.require(template.count('__BRIDGE_DATA__') == 1, 'Expected one embedded data placeholder')
    (directory / 'index.html').write_text(template.replace('__BRIDGE_DATA__', packed), encoding='utf-8')
    inputs = [audit_path, inventory_path, snapshot / 'manifest.json',
              DATA / 'bridge_spatial_evidence.jsonl.gz', DATA / 'bridge_project_matches.jsonl.gz',
              proximity_path, proximity_audit_path, TEMPLATE, Path(__file__), Path(archive.__file__)]
    info = {'schema_version': 1, 'bridge_snapshot': audit['bridge_snapshot'], 'bridges': len(rows),
            'matched_bridges': len(projects), 'project_links': sum(counts.values()),
            'bridges_with_proximity_candidates': len(proximity),
            'bridges_with_review_flags': sum(bool(r['spatial']['review_flags']) for r in rows),
            'inputs_sha256': {str(p.relative_to(ROOT)): digest(p) for p in inputs},
            'outputs_sha256': {'index.html': digest(directory / 'index.html')}}
    (directory / 'viewer_manifest.json').write_bytes(archive.encode(info))
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Rebuild offline and compare retained viewer')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='bridge-viewer-') as temp:
        out = Path(temp)
        info = build(out)
        for name, target in {'index.html': MODULE / 'index.html',
                             'viewer_manifest.json': DATA / 'viewer_manifest.json'}.items():
            if args.check:
                archive.require(target.read_bytes() == (out / name).read_bytes(), f'Stale viewer: {name}')
            else:
                target.write_bytes((out / name).read_bytes())
    print(f'{"Verified" if args.check else "Built"} viewer: {info["bridges"]:,} bridges, {info["matched_bridges"]:,} with project matches')


if __name__ == '__main__':
    main()
