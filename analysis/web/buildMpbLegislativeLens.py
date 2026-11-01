#!/usr/bin/env python3
"""Build the FY2027 MPB (multi-purpose building) legislative-district lens.

The MPB population is a scope screen over ordinary DPWH comparison rows (see
analysis/docs/mpb_legislative_lens_method.md).  Unlike the FMR lens, this
builder does NOT re-resolve locations: it consumes the committed location
index's `row_resolution` verbatim, so the MPB tab and the Districts
(Legislative) tab can never disagree about a row.

Outputs analysis/data/mpb_legislative_index_2027.json with the same card
schema the shared Congress card/explorer components already render.

Usage:
  python3 analysis/web/buildMpbLegislativeLens.py            # build
  python3 analysis/web/buildMpbLegislativeLens.py --check    # verify committed output
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

# partition_summary/bucket_row_ids are the shared, field-for-field replicas of
# the overview partition; importing them (rather than copying) keeps every
# Congress lens summing with one implementation.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from buildLocationLens import bucket_row_ids, partition_summary  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'analysis' / 'data'
INPUTS = {
    'comparison': DATA / 'comparison_projects_2027.json',
    'location_index': DATA / 'location_district_index_2027.json',
    'deo_index': DATA / 'congress_district_index_2027.json',
    'cleaned': ROOT / 'master_list' / 'data' / 'cleaned' / 'observations.jsonl.gz',
}
OUTPUT = DATA / 'mpb_legislative_index_2027.json'

# The BIP programme line the budget documents themselves classify as
# multi-purpose buildings.  PAP scope is one half of the union; the title rule
# below is the other.
MPB_PAP = 'BIP - Multi-Purpose Buildings/ Facilities to support Social Services'

# Title scope.  `multi…purpose` in any of its printed spellings (hyphenated,
# underscored, spaced, OCR-mangled), then — within a short window — a
# building/facility completion.  A completion is required: "multi-purpose"
# alone also names non-building projects (e.g. the Cabayongan River
# Multi-Purpose Project small river impounding system under the Flood
# Management Program), which are deliberately out of scope.  Bare
# "Multi-Purpose, <place>" titles ride the PAP rule instead, so no fuzzy
# fallback is needed here.
MPB_PHRASE = re.compile(r'multi[\W_]*purpose', re.IGNORECASE)
_COMPLETION = re.compile(
    r'(?:building|bldg|hall|gymnasium|gym\b|facilit(?:y|ies|eis)'
    r'|buildng|buidlin[g]?|buiding|builidng|bulidin[g]?|bui?ldn|bildin'
    r'|evacuation\s+center|covered\s+court|barangay\s+hall)',
    re.IGNORECASE,
)
# Window between the phrase and the completion, to admit spellings such as
# "Multi-Purpose Buiding", "Multi Purposec Building", "Multi-Purposec Building".
_COMPLETION_WINDOW = 34


def fail(message):
    raise SystemExit(f'MPB lens: {message}')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def ascii_fold(value: str) -> str:
    return unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode()


def mpb_title_scope(title: str):
    """Return (matched_fragment, is_mpb) for the title-scope rule.

    The phrase must be followed by a building/facility completion within the
    window.  Titles that drop the noun entirely ("Multi-Purpose, Barangay …")
    return False here; they are captured by the PAP rule instead, which keeps
    this rule's boundary auditable.
    """
    if not title:
        return None, False
    for match in MPB_PHRASE.finditer(title):
        window = title[match.end():match.end() + _COMPLETION_WINDOW]
        completion = _COMPLETION.search(window)
        if completion:
            fragment = title[match.start():match.end() + completion.end()].strip()
            return fragment, True
    return None, False


def in_scope(row: dict):
    """The union rule: PAP scope OR title scope.  Returns scope evidence."""
    pap_hit = row.get('pap') == MPB_PAP
    fragment, title_hit = mpb_title_scope(row.get('title') or '')
    if not (pap_hit or title_hit):
        return None
    rules = ([] + (['pap'] if pap_hit else []) + (['title'] if title_hit else []))
    return {'rules': rules, 'title_fragment': fragment}


def load_row_coordinates(path: Path):
    """Parsed title coordinates per comparison row, from the cleaned
    observations.  Points are keyed by comparison group id; parse status must
    be `parsed*`; issues travel with each point as review evidence."""
    points = defaultdict(list)
    with gzip.open(path, 'rt') as stream:
        for line in stream:
            record = json.loads(line)
            if record.get('record_kind') != 'project':
                continue
            gid = record.get('comparison_group_id')
            if not gid or not gid.startswith('dpwh:'):
                continue
            summary = record.get('coordinate_summary') or {}
            if not str(summary.get('status', '')).startswith('parsed'):
                continue
            for point in summary.get('points') or []:
                lng = point.get('longitude')
                lat = point.get('latitude')
                if not (isinstance(lng, (int, float)) and isinstance(lat, (int, float))):
                    continue
                points[gid[len('dpwh:'):]].append({
                    'lng': lng, 'lat': lat,
                    'role': point.get('role') or 'point',
                    'issues': point.get('issues') or [],
                    'source_fragment': point.get('source_fragment'),
                    # Observation stage: which source document printed the pair.
                    'stage': (record.get('comparison_stage')
                              or (record.get('dataset') or '').replace('dpwh_', '')),
                })
    return points


PH_LNG = (116.0, 127.0)
PH_LAT = (4.0, 22.0)


def clean_points(raw_points):
    """Unique lon/lat pairs with stage provenance, PH-box screened.

    The bounding box is the review screen the Geolocation workspace inherits
    from the FMR normalizer — outside points are dropped from the map, not
    from the row, and the drop is counted.
    """
    unique = {}
    dropped = 0
    for point in raw_points:
        lng, lat = point['lng'], point['lat']
        if not (PH_LNG[0] < lng < PH_LNG[1] and PH_LAT[0] < lat < PH_LAT[1]):
            dropped += 1
            continue
        key = (round(lng, 7), round(lat, 7))
        entry = unique.setdefault(key, {
            'lng': lng, 'lat': lat, 'roles': [], 'stages': [],
            'issues': [], 'source_fragments': [],
        })
        if point['role'] and point['role'] not in entry['roles']:
            entry['roles'].append(point['role'])
        if point['stage'] and point['stage'] not in entry['stages']:
            entry['stages'].append(point['stage'])
        for issue in point.get('issues') or []:
            if issue not in entry['issues']:
                entry['issues'].append(issue)
        if point.get('source_fragment') and point['source_fragment'] not in entry['source_fragments']:
            entry['source_fragments'].append(point['source_fragment'])
    out = [unique[key] for key in sorted(unique)]
    return out, dropped


def district_descriptors(deo_index: dict):
    descriptors = {}
    for card in deo_index['cards']:
        for district in card['districts']:
            descriptors.setdefault(district['id'], district)
    if len(descriptors) != 254:
        fail(f'Congress index describes {len(descriptors)}/254 districts')
    return descriptors


CARD_TIER_NOTES = {
    'title_psgc': 'A printed DEO exists and the funded-section title resolves cleanly through '
                  'PSGC to this legislative district.',
    'deo_to_leg': 'The title location did not resolve cleanly; the printed DEO maps one-to-one '
                  'to this legislative district.',
    'deo': 'The title location did not resolve cleanly and this DEO serves multiple legislative '
           'districts. The full allocation stays on the DEO card.',
    'region': 'No printed DEO was found across the linked sources; assigned at region grain.',
    'unassigned': 'No printed DEO or region was available; retained on the unassigned catch-all.',
}


def build(built_at: str | None = None) -> dict:
    comparison = json.loads(INPUTS['comparison'].read_text())['projects']
    location = json.loads(INPUTS['location_index'].read_text())
    deo_index = json.loads(INPUTS['deo_index'].read_text())
    resolution = location['row_resolution']
    descriptors = district_descriptors(deo_index)

    scoped, scope_evidence = [], {}
    for row in comparison:
        evidence = in_scope(row)
        if evidence:
            scoped.append(row)
            scope_evidence[row['id']] = evidence

    missing = [row['id'] for row in scoped if row['id'] not in resolution]
    if missing:
        fail(f'{len(missing)} scoped rows lack a location-lens resolution (e.g. {missing[0]})')

    # ---- reuse the location lens's committed placement verbatim ----
    placement = {row['id']: (resolution[row['id']]['basis'],
                             resolution[row['id']]['target_id']) for row in scoped}
    by_row = {row['id']: row for row in scoped}

    card_rows = defaultdict(list)
    for rid, (basis, target) in placement.items():
        card_rows[(basis, target)].append(by_row[rid])

    deo_groups = {}  # office-group id -> offices/districts, from the location index
    for card in location['cards']:
        if card['location_tier'] == 'deo':
            deo_groups[card['id'].removeprefix('location:deo:')] = card

    row_points = {}
    points_by_row = load_row_coordinates(INPUTS['cleaned'])
    points_dropped = 0
    rows_with_points = 0
    for rid in by_row:
        raw = points_by_row.get(rid) or []
        if raw:
            cleaned, dropped = clean_points(raw)
            points_dropped += dropped
            if cleaned:
                row_points[rid] = cleaned
                rows_with_points += 1

    cards, region_cards = [], []
    for (basis, target), rows_list in card_rows.items():
        summary = partition_summary(rows_list)
        row_ids = bucket_row_ids(rows_list)
        if basis in ('title_psgc', 'deo_to_leg'):
            district = descriptors.get(target)
            if district is None:
                fail(f'{basis} target {target} is not in the 254-seat catalog')
            deo_printed = sorted({reading['office']
                                  for row in rows_list
                                  for reading in (resolution[row['id']].get('printed_offices') or [])
                                  if reading.get('deo_group_ids')})
            cards.append({
                'id': f'mpb:{basis}:{target}',
                'tier': 'A',
                'location_tier': basis,
                'undivided': False,
                'offices': [], 'ledger_names': deo_printed,
                'districts': [district],
                'representative': district['representative'],
                'region': district['region'],
                'rows': len(rows_list), 'summary': summary, 'row_ids': row_ids,
                'tier_note': CARD_TIER_NOTES[basis],
            })
        elif basis == 'deo':
            source = deo_groups.get(target)
            if source is None:
                fail(f'DEO group {target} not found in the location index')
            members = [descriptors[did] for did in
                       [d['id'] for d in source['districts']] if did in descriptors]
            reps = [d['representative'] for d in members if d.get('representative')]
            cards.append({
                'id': f'mpb:deo:{target}',
                'tier': 'deo',
                'location_tier': 'deo',
                'undivided': True,
                'offices': source['offices'], 'ledger_names': source['ledger_names'],
                'card_label': source.get('card_label'),
                'districts': members,
                'representative': ({'multiple': True, 'count': len(reps), 'names': reps}
                                   if len(reps) > 1 else (reps[0] if reps else None)),
                'region': source.get('region'),
                'rows': len(rows_list), 'summary': summary, 'row_ids': row_ids,
                'tier_note': CARD_TIER_NOTES['deo'],
            })
        elif basis in ('region', 'unassigned'):
            region_cards.append({
                'id': f'mpb-region:{target}' if basis == 'region' else 'mpb-unassigned',
                'tier': basis,
                'location_tier': basis,
                'undivided': False,
                'offices': [], 'ledger_names': [],
                'card_label': target if basis == 'region' else 'Unassigned MPB projects',
                'districts': [], 'representative': None,
                'region': target if basis == 'region' else None,
                'rows': len(rows_list), 'summary': summary, 'row_ids': row_ids,
                'tier_note': CARD_TIER_NOTES[basis],
            })
        else:
            fail(f'unknown location basis {basis!r} on MPB rows')

    def card_sort_key(card):
        return (-card['summary']['sources']['house']['amount_php'],
                card['districts'][0]['displayName'] if card['districts']
                else card.get('card_label', card['id']))
    cards.sort(key=card_sort_key)
    region_cards.sort(key=lambda c: -c['summary']['sources']['house']['amount_php'])

    # ---- invariants ----
    seen = Counter()
    for card in cards + region_cards:
        for bucket_ids in card['row_ids'].values():
            for rid in bucket_ids:
                seen[rid] += 1
    if set(seen) != set(by_row) or set(seen.values()) != {1}:
        dupes = [rid for rid, count in seen.items() if count > 1]
        missing_rows = set(by_row) - set(seen)
        fail(f'row placement broken: {len(dupes)} duplicated, {len(missing_rows)} unplaced')
    whole = partition_summary(scoped)
    # Tie every numeric leaf of the partition against the sum of the cards.
    from buildLocationLens import assert_ties  # noqa: E402
    tie = assert_ties(whole, [c['summary'] for c in cards + region_cards],
                      'MPB cards vs scoped whole')
    for rid, (basis, target) in placement.items():
        committed = resolution[rid]
        if committed['basis'] != basis or committed['target_id'] != target:
            fail(f'resolution drift on {rid}')

    basis_counts = Counter(basis for basis, _ in placement.values())
    scope_rule_counts = Counter('+'.join(ev['rules']) for ev in scope_evidence.values())
    district_cards = [c for c in cards if c['location_tier'] in ('title_psgc', 'deo_to_leg')]
    located_house = sum(c['summary']['sources']['house']['amount_php'] for c in district_cards)

    return {
        'schema_version': 1,
        'fiscal_year': 2027,
        'built_at': built_at or datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'lens': {
            'name': 'DPWH multi-purpose building legislative lens',
            'authority': 'analysis/docs/mpb_legislative_lens_method.md',
            'grouping_unit': 'One linked DPWH comparison row scoped to the BIP multi-purpose '
                             'building PAP or an MPB title; district placement reused verbatim '
                             'from the location lens.',
            'grain': 'One printed DPWH allocation record; grouped House members counted individually.',
            'stages': 'House 2nd/3rd readings and DBM NEP remain the amount stages; title-printed '
                      'coordinates are evidence only.',
            'tiers': {
                'title_psgc': 'Funded-section title PSGC resolves cleanly to one district '
                              '(location-lens basis, reused).',
                'deo_to_leg': 'Title PSGC not clean; the printed DEO maps one-to-one to one '
                              'legislative district (location-lens basis, reused).',
                'deo': 'Printed DEO serves multiple legislative districts; full allocation '
                       'retained on the DEO (location-lens basis, reused).',
                'region': 'No printed DEO across linked sources; assigned to region.',
                'unassigned': 'No printed DEO or region; retained on the unassigned catch-all.',
            },
            'not_claimed': 'Nothing here establishes that a representative requested, sponsored, '
                           'selected, or controls any project or amount. A card reports where the '
                           'budget documents place the work.',
        },
        'datasets': {'mpb': {'status': 'active',
                             'basis': 'BIP multi-purpose building PAP and MPB-title scope over the '
                                      'DPWH comparison ledger; district assignment reused from the '
                                      'location lens.'}},
        'reconciliation': {
            'whole': whole,
            'tied_numeric_fields': tie,
            'row_counts': {'total': len(scoped),
                           'cards': sum(c['rows'] for c in cards + region_cards),
                           'residual': 0, 'office_change': 0},
        },
        'counts': {
            'cards': len(cards),
            'region_cards': len(region_cards),
            'rows': len(scoped),
            'district_rows': sum(c['rows'] for c in district_cards),
            'fallback_rows': sum(c['rows'] for c in region_cards),
            'districts_with_mpb': len({c['districts'][0]['id'] for c in district_cards}),
            'title_psgc_rows': basis_counts['title_psgc'],
            'deo_to_leg_rows': basis_counts['deo_to_leg'],
            'deo_rows': basis_counts['deo'],
            'region_rows': basis_counts['region'],
            'unassigned_rows': basis_counts['unassigned'],
            'located_house_php': located_house,
            'rows_with_coordinates': rows_with_points,
            'coordinate_points': sum(len(pts) for pts in row_points.values()),
            'coordinate_points_dropped_outside_ph': points_dropped,
            'scope_rules': dict(sorted(scope_rule_counts.items())),
        },
        'cards': cards,
        'region_cards': region_cards,
        'districts': deo_index['districts'],
        # Verbatim copies of the location lens's committed per-row evidence for
        # the scoped rows only: the explorer's Assignment basis column reads
        # row_resolution and its Title PSGC column reads row_psgc. Copying (not
        # re-deriving) is the whole point of this lens — see the method doc.
        'row_resolution': {rid: resolution[rid] for rid in by_row},
        'row_psgc': {rid: location['row_psgc'][rid] for rid in by_row
                     if rid in location.get('row_psgc', {})},
        'row_scope': scope_evidence,
        'row_points': row_points,
        'row_flags': {rid: location['row_flags'][rid] for rid in by_row
                      if rid in location.get('row_flags', {})},
        'input_provenance': {name: {'path': str(path.relative_to(ROOT)), 'sha256': sha256(path)}
                             for name, path in INPUTS.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else None
    payload = build(previous.get('built_at') if args.check and previous else None)
    rendered = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n'
    if args.check:
        if previous is None or OUTPUT.read_text() != rendered:
            raise SystemExit(f'stale or missing artifact: {OUTPUT.relative_to(ROOT)}')
        counts = payload['counts']
        print(f"MPB legislative check passed: {counts['rows']} rows, "
              f"{counts['cards']} cards, {counts['districts_with_mpb']} districts")
        return
    OUTPUT.write_text(rendered)
    counts = payload['counts']
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    print(f"  rows: {counts['rows']} (scope rules: {counts['scope_rules']})")
    print(f"  cards: {counts['cards']} ({counts['districts_with_mpb']} district-assigned) "
          f"+ {counts['region_cards']} catch-all")
    print(f"  bases: title_psgc={counts['title_psgc_rows']} deo_to_leg={counts['deo_to_leg_rows']} "
          f"deo={counts['deo_rows']} region={counts['region_rows']} "
          f"unassigned={counts['unassigned_rows']}")
    print(f"  coordinates: {counts['rows_with_coordinates']} rows, "
          f"{counts['coordinate_points']} unique points "
          f"({counts['coordinate_points_dropped_outside_ph']} dropped outside PH)")


if __name__ == '__main__':
    main()
