#!/usr/bin/env python3
"""Chainage unit ledger: every chainage-bearing allocation, all sources.

The readings comparison keeps only House2↔House3 pairing; the Chainage
analysis needs the full population (HGAB2, HGAB3, DBM NEP) to benchmark
price-per-km against program/region peers. Emitted as a compact sidecar so
the readings ledger stays a pairing artifact.
"""
import hashlib
import json
import sys
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parent)]
from paths import DATA, REPO

from chainage import total_length_m

INPUTS = ['stage_trace_2027.json', 'house_reading_changes_2027.json']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unit(source, side, reading_key):
    """One chainage-bearing allocation record, normalized across sources."""
    length = total_length_m(source['chainages'])
    return {
        'id': f'{side}:{source.get("native_node_id") or source.get("id")}',
        'source': side,
        'reading': reading_key,
        'title': source['title'],
        'title_base': source.get('title_base'),
        'program': source.get('program'),
        'pap': source.get('pap'),
        'zone': source.get('zone'),
        'region': source.get('region'),
        'office': source.get('office'),
        'amount_php': source['amount_php'],
        'chainages': source['chainages'],
        'chainage_incomplete': source.get('chainage_incomplete') or None,
        'length_review': source.get('chainage_length_review') or None,
        'length_m': length,
        'point_only': length is None,
    }


def build():
    stages = json.loads((DATA / 'stage_trace_2027.json').read_text())
    readings = json.loads((DATA / 'house_reading_changes_2027.json').read_text())
    units = []
    seen = set()

    def push(source, side, reading_key):
        if not source or not source.get('chainages'):
            return
        key = (side, source.get('native_node_id') or source.get('id'))
        if key in seen:  # repeated keys collapse to their grouped side
            return
        seen.add(key)
        units.append(unit(source, side, reading_key))

    # NEP sides from the stage trace; House sides from the readings ledger.
    for row in stages['projects']:
        push(row.get('nep'), 'nep', None)
    for pair in readings['projects']:
        push(pair.get('second'), 'hb2', 'second')
        push(pair.get('third'), 'hb3', 'third')

    nep_total = sum(u['amount_php'] for u in units if u['source'] == 'nep')
    hb2_total = sum(u['amount_php'] for u in units if u['source'] == 'hb2')
    hb3_total = sum(u['amount_php'] for u in units if u['source'] == 'hb3')
    manifest = {
        'schema_version': 1,
        'scope': 'Every allocation record with parsed chainage spans across '
                 'DBM NEP, HGAB2 and HGAB3; repeated reading keys collapse to their grouped side.',
        'inputs': {name: digest(DATA / name) for name in INPUTS},
        'generator': {'path': str(Path(__file__).relative_to(REPO)), 'sha256': digest(Path(__file__))},
    }
    summary = {
        'units': len(units),
        'by_source': {side: sum(1 for u in units if u['source'] == side) for side in ('nep', 'hb2', 'hb3')},
        'amount_php': {'nep': nep_total, 'hb2': hb2_total, 'hb3': hb3_total},
        'with_length': sum(1 for u in units if not u['point_only']),
    }
    return {'manifest': manifest, 'summary': summary, 'units': units}


if __name__ == '__main__':
    data = build()
    (DATA / 'chainage_units_2027.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(data['summary'], indent=2))
