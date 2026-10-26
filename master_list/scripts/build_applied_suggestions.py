#!/usr/bin/env python3
"""Derive the applied-suggestions layer from the retained master list.

A suggestion is applied only when it is conflict-free and decisive:

- support_score >= 9
- no named_province_conflict / source_region_conflict in the top chain
- a margin >= 3 over the second suggestion, or the sole suggestion

This is a DERIVED, hash-pinned layer: the master list is consumed read-only
and never rewritten. Each applied record carries the full suggestion it
promoted, the gate factors, and its own score ledger so a reviewer can undo
any single application by deleting its row. Consumers load
data/applied_suggestions.jsonl.gz independently of the master ledger.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'master_list/data'
INPUT = 'master_list/data/projects.jsonl.gz'

APPLIED_METHOD = 'applied_suggestion_v1'
GATE = {
    'min_support_score': 9,
    'required_margin': 3,
    'blocking_conflicts': ['named_province_conflict', 'source_region_conflict',
                           'office_province_conflict'],
}
# Deliberately mirrors registry_matched: the chain is adopted from an
# independent evidence source rather than asserted by the title itself.
SCORE_BASE = 4
SCORE_FACTORS = [
    ('base:applied_suggestion', SCORE_BASE),
    ('evidence:explicit_barangay_mention', 4),
    ('evidence:named_parent_town', 3),
]
BLOCKING = set(GATE['blocking_conflicts'])


def _normalize(text):
    text = unicodedata.normalize('NFKD', text or '').casefold()
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r'\bsta\.?\s+', 'santa ', text)
    text = re.sub(r'\bsto\.?\s+', 'santo ', text)
    return ' '.join(re.findall(r'[a-z0-9]+', text))


def town_named_in_title(suggestion, title_norm):
    """The chain's municipality/city must appear as its own phrase in the
    title. A town homonym riding a province-name pool ("Batangas City" via
    the province "Batangas") is an ordering artifact, never an application."""
    town = None
    for level in ('municipality', 'city', 'sub_municipality'):
        if level in suggestion['location']['ancestry']:
            town = suggestion['location']['ancestry'][level]
            break
    if town is None:
        return False
    return f" {town['name'].lower()} " in f' {title_norm} '


def refines_master(suggestion, master_locations):
    """The application must refine or fill, never rival: either the master
    asserted nothing assignable (ambiguous/unresolved handled by caller) or
    the chain's municipality/city intersects the master assignment."""
    town = None
    for level in ('municipality', 'city', 'sub_municipality'):
        if level in suggestion['location']['ancestry']:
            town = suggestion['location']['ancestry'][level]
            break
    if town is None:
        return False
    for loc in master_locations:
        if loc['psgc_code'] == town['code']:
            return True
        if town['code'] in {v['code'] for v in loc.get('ancestry', {}).values()}:
            return True
    return False



def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def gate_pass(suggestions):
    """Return the top suggestion when it clears the application gate."""
    if not suggestions:
        return None
    top = suggestions[0]
    if top['support_score'] < GATE['min_support_score']:
        return None
    if BLOCKING & set(top.get('conflicts', ()))  :
        return None
    if len(suggestions) > 1:
        margin = top['support_score'] - suggestions[1]['support_score']
        if margin < GATE['required_margin']:
            return None
    return top


def build(out_dir: Path):
    rows, considered, blocked_by = [], 0, {}
    with gzip.open(ROOT / INPUT, 'rt', encoding='utf-8') as stream:
        for line in stream:
            record = json.loads(line)
            suggestions = record['location'].get('suggestions') or []
            if not suggestions:
                continue
            considered += 1
            top = suggestions[0]
            title_norm = _normalize(record.get('title_clean') or record['title'])
            master_locs = record['location']['locations']
            reason = None
            if top['support_score'] < GATE['min_support_score']:
                reason = 'below_min_score'
            elif BLOCKING & set(top.get('conflicts', ())):
                reason = 'conflicting_top'
            elif len(suggestions) > 1 and \
                    top['support_score'] - suggestions[1]['support_score'] < GATE['required_margin']:
                reason = 'margin_too_small'
            elif not town_named_in_title(top, title_norm):
                reason = 'parent_town_not_in_title'
            elif master_locs and not refines_master(top, master_locs):
                reason = 'rivals_master_assignment'
            if reason:
                blocked_by[reason] = blocked_by.get(reason, 0) + 1
                continue
            applied_score = SCORE_BASE + sum(i for _, i in SCORE_FACTORS[1:])
            rows.append({
                'record_id': record['record_id'],
                'dataset': record['dataset'],
                'title': record.get('title_clean') or record['title'],
                'title_source': record['title'],
                'master_status': record['location']['status'],
                'master_locations': [
                    {'psgc_code': l['psgc_code'], 'name': l['name'], 'level': l['level']}
                    for l in record['location']['locations']],
                'applied': {
                    'method': APPLIED_METHOD,
                    'suggestion_method': record['location']['suggestion_method'],
                    'psgc_code': top['location']['psgc_code'],
                    'name': top['location']['name'],
                    'level': top['location']['level'],
                    'ancestry': top['location']['ancestry'],
                    'support_score': top['support_score'],
                    'margin_over_second': (top['support_score'] - suggestions[1]['support_score'])
                                          if len(suggestions) > 1 else None,
                    'factors': top['factors'],
                    'gate': {k: v for k, v in GATE.items() if k != 'blocking_conflicts'},
                    'score': applied_score,
                    'score_factors': [{'rule': r, 'impact': i} for r, i in SCORE_FACTORS],
                    'verification_status': 'provisional_applied_suggestion',
                },
            })
    rows.sort(key=lambda r: r['record_id'])
    target = out_dir / 'applied_suggestions.jsonl.gz'
    with io.TextIOWrapper(gzip.GzipFile(filename='', mode='wb',
                                        fileobj=target.open('wb'), mtime=0),
                          encoding='utf-8', newline='') as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
    audit = {
        'method': APPLIED_METHOD,
        'description': __doc__.strip().splitlines()[0],
        'input': {'path': INPUT, 'sha256': sha(ROOT / INPUT)},
        'gate': GATE,
        'records_with_suggestions': considered,
        'applied': len(rows),
        'blocked_by_reason': dict(sorted(blocked_by.items())),
        'applied_by_master_status': _status_counts(rows),
        'output_sha256': {'applied_suggestions.jsonl.gz': sha(target)},
        'score_base': SCORE_BASE,
        'score_factors': [{'rule': r, 'impact': i} for r, i in SCORE_FACTORS],
    }
    (out_dir / 'applied_suggestions_audit.json').write_text(
        json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True) + '\n',
        encoding='utf-8')
    return audit


def _status_counts(rows):
    counts = {}
    for row in rows:
        counts[row['master_status']] = counts.get(row['master_status'], 0) + 1
    return dict(sorted(counts.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='Rebuild and compare without modifying outputs')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='applied-suggestions-') as temp:
        out = Path(temp)
        audit = build(out)
        if args.check:
            stale = [p.name for p in out.iterdir()
                     if not (OUTPUT / p.name).exists() or sha(p) != sha(OUTPUT / p.name)]
            if stale:
                raise SystemExit(f'Applied-suggestions outputs stale: {stale}')
            print(f'Applied-suggestions check passed: {audit["applied"]} of '
                  f'{audit["records_with_suggestions"]} suggestion records applied.')
            return
        for name in ('applied_suggestions.jsonl.gz', 'applied_suggestions_audit.json'):
            (out / name).replace(OUTPUT / name)
    print(f"Applied {audit['applied']} of {audit['records_with_suggestions']} "
          f"suggestion records -> master_list/data/applied_suggestions.jsonl.gz")


if __name__ == '__main__':
    main()
