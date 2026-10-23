#!/usr/bin/env python3
"""Group same-shell allocations across sources for crosschecking.

Two grouping kinds, both keyed by funding zone + PAP + region:

- ``road`` — rows with a parsed chainage base group by normalized road
  title base (``title_base_match_key``), so segments of one road corridor
  land together.
- ``place_shell`` — everything else groups by the title's project shell:
  work phrase + municipality + province from the address-slot parser.
  Barangay / sitio / zone / street slots are deliberately dropped — that
  is the axis along which a single allocation gets salami-sliced into
  multiple lookalike projects.

A group is *exhausted* when every NEP member is attached to another House
row while unattached House members remain. Those leftovers are the split /
insertion candidates: House introduced more allocations on the same shell
than the NEP ever listed. They keep their existing match status and gain a
review flag with group context — never a certified insertion.
"""

from __future__ import annotations

import hashlib
import json
import statistics
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path[:0] = [str(Path(__file__).resolve().parents[1]),
                str(Path(__file__).resolve().parents[1] / 'builders')]
from paths import DATA  # noqa: E402
from normalize_labels import parse_title_slots  # noqa: E402

ATTACHED = {'exact_candidate', 'chainage_candidate', 'location_amendment_candidate',
            'soft_match_candidate', 'scope_amendment_candidate',
            'segment_scope_candidate'}

# Attached-NEP median vs leftover median thresholds. A paired item far from
# the leftovers' scale is a different work (INSPIRE vs barangay covered
# courts), not their supply — those clusters read as unsupplied insertions.
_SCALE_LO, _SCALE_HI = 0.2, 5.0


def _pattern(nep_attached_amounts: list, leftover_amounts: list) -> str:
    """Classify an exhausted group by scale relationship.

    - ``split_like`` — attached NEP items are scale-comparable with the
      leftovers (median ratio 0.2–5×): reads like one NEP allocation
      sliced into several lookalike HGAB rows.
    - ``unsupplied_cluster`` — the attached NEP is far larger than every
      leftover: a genuine NEP↔HGAB pair that happens to share the shell
      with many small House-only insertions.
    - ``micro_supplied`` — reverse: tiny NEP pairs beside large leftovers.
    """
    if not nep_attached_amounts or not leftover_amounts:
        return 'split_like'
    ratio = statistics.median(nep_attached_amounts) / statistics.median(leftover_amounts)
    if ratio > _SCALE_HI:
        return 'unsupplied_cluster'
    if ratio < _SCALE_LO:
        return 'micro_supplied'
    return 'split_like'


def read(name: str):
    return json.loads((DATA / name).read_text())


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _side_key(row: dict, side: str) -> tuple | None:
    """(zone, pap, region, kind, shell) for one side of a comparison record."""
    s = row.get(side)
    if not s:
        return None
    zone = s.get('zone') or row.get('zone')
    pap = s.get('pap_id') or row.get('pap_id') or s.get('pap') or row.get('pap')
    region = s.get('region') or row.get('region')
    chainages = s.get('chainages') or []
    if chainages and s.get('title_base_match_key'):
        # Named road corridor: group by the chainage-stripped base.
        return (zone, pap, region, 'road', s['title_base_match_key'])
    slots = parse_title_slots(s.get('title') or '')
    work = ' '.join(slots.get('work') or [])
    mun = ' '.join(slots.get('municipality') or [])
    prov = ' '.join(slots.get('province') or [])
    if not work:
        return None
    # Place shell: drop barangay/sitio/zone/street — the split axis.
    return (zone, pap, region, 'place_shell', f'{work}|{mun}|{prov}')


def _spans(chainages: list | None) -> list:
    out = []
    for c in chainages or []:
        out.append({'from': c.get('from'), 'to': c.get('to'),
                    'length_m': c.get('length_m')})
    return out


def build() -> dict:
    comparison = read('source_comparison_2027.json')
    records = comparison['projects']
    groups: dict[tuple, dict] = {}

    def group_for(key: tuple) -> dict:
        return groups.setdefault(key, {
            'zone': key[0], 'pap': key[1], 'region': key[2], 'kind': key[3],
            'shell': key[4], 'house_rows': [], 'nep_rows': [],
        })

    for record in records:
        status = record.get('status')
        attached = status in ATTACHED
        # One record per budget line on the FINAL sheet: attached pairs
        # collapse to a single HGAB-anchored entry (NEP side kept as
        # provenance), unattached HGAB rows stand alone, and NEP-only rows
        # remain NEP-only supply. Sides that fall in a different shell
        # (relocated municipality) still land somewhere — never dropped.
        house_side, nep_side = record.get('house'), record.get('nep')
        house_key = _side_key(record, 'house') if house_side else None
        nep_key = _side_key(record, 'nep') if nep_side else None

        def add_member(key, member):
            group_for(key)[member['store']].append(member)

        if house_side and house_key:
            h = {
                'id': house_side.get('id'),
                'status': status,
                'attached': attached,
                'title': house_side.get('title'),
                'amount_php': house_side.get('amount_php'),
                'chainages': _spans(house_side.get('chainages')),
                'length_m': sum(c.get('length_m') or 0 for c in house_side.get('chainages') or []) or None,
                'pdf_page': house_side.get('pdf_page'),
                'store': 'house_rows',
            }
            if attached and nep_side:
                # Collapse: carry the NEP provenance on the House record.
                h['nep_amount_php'] = nep_side.get('amount_php')
                h['nep_id'] = nep_side.get('id')
                h['delta_php'] = ((house_side.get('amount_php') or 0)
                                  - (nep_side.get('amount_php') or 0))
            add_member(house_key, h)
        if nep_side and nep_key:
            # NEP member: only when NOT already collapsed into its House
            # pair (different-shell relocations still produce a NEP-side
            # member in the NEP shell so supply is never lost).
            if not (attached and house_side and nep_key == house_key):
                n = {
                    'id': nep_side.get('id'),
                    'status': status,
                    'attached': attached,
                    'title': nep_side.get('title'),
                    'amount_php': nep_side.get('amount_php'),
                    'chainages': _spans(nep_side.get('chainages')),
                    'length_m': sum(c.get('length_m') or 0 for c in nep_side.get('chainages') or []) or None,
                    'pdf_page': nep_side.get('pdf_page'),
                    'house_pair_id': (house_side.get('id') if attached else None),
                    'store': 'nep_rows',
                }
                add_member(nep_key, n)

    findings = []
    for key, g in groups.items():
        # Collapsed model: every entry in members is one budget line on the
        # final sheet (attached pairs collapsed to their HGAB anchor) or an
        # NEP-only supply row in a different shell.
        supply = g['nep_rows']
        paired_anchors = [m for m in g['house_rows'] if m['attached']]
        leftover = [m for m in g['house_rows'] if not m['attached']]
        nep_only = [m for m in supply if not m.get('house_pair_id') and not m['attached']]
        # Cost per km where length parsed.
        for m in g['house_rows'] + supply:
            m['amount_per_km_php'] = (m['amount_php'] / (m['length_m'] / 1000)
                                      if m.get('length_m') and m['length_m'] > 0
                                      else None)
        nep_total = len(paired_anchors) + len(nep_only)
        if not nep_total or nep_only or not leftover:
            # Exhausted requires: NEP supply existed, is fully accounted for
            # by collapsed pairs, and House leftovers remain. Groups with
            # unpaired NEP supply left (nep_only) are covered by the
            # deletion-candidate queues instead.
            continue
        attached_amounts = [m.get('nep_amount_php') or m['amount_php']
                            for m in paired_anchors]
        leftover_amounts = [m['amount_php'] for m in leftover if m['amount_php']]
        findings.append({
            'zone': g['zone'], 'pap': g['pap'], 'region': g['region'],
            'kind': g['kind'], 'shell': g['shell'],
            'state': 'hgab_leftover',
            'pattern': _pattern(attached_amounts, leftover_amounts),
            'title': next((m['title'] for m in g['house_rows']), ''),
            'house_rows': len(g['house_rows']),
            'nep_rows': nep_total,
            'paired_rows': len(paired_anchors),
            'leftover_house_rows': len(leftover),
            'leftover_nep_rows': 0,
            'leftover_amount_php': sum(m['amount_php'] or 0 for m in leftover),
            'leftover_ids': [m['id'] for m in leftover],
            'leftover_nep_ids': [],
            'house_amount_php': sum(m['amount_php'] or 0 for m in g['house_rows']),
            'nep_amount_php': sum(attached_amounts),
            'members': g['house_rows'],
        })
    # Mirror findings: shells whose HGAB side is fully paired while NEP
    # supply remains unpaired — items dropped or re-titled at HGAB. These
    # overlap the global deletion queues but gain shell context here.
    nep_leftover_findings = []
    for key, g in groups.items():
        supply = g['nep_rows']
        nep_only = [m for m in supply if not m.get('house_pair_id') and not m['attached']]
        paired_anchors = [m for m in g['house_rows'] if m['attached']]
        leftover = [m for m in g['house_rows'] if not m['attached']]
        if not paired_anchors or leftover or not nep_only:
            # Requires: pairs anchor this shell, no HGAB leftovers here, and
            # NEP supply remains unmatched.
            continue
        nep_leftover_findings.append({
            'zone': g['zone'], 'pap': g['pap'], 'region': g['region'],
            'kind': g['kind'], 'shell': g['shell'],
            'state': 'nep_leftover',
            'pattern': None,
            'title': next((m['title'] for m in nep_only), ''),
            'house_rows': len(g['house_rows']),
            'nep_rows': len(paired_anchors) + len(nep_only),
            'paired_rows': len(paired_anchors),
            'leftover_house_rows': 0,
            'leftover_nep_rows': len(nep_only),
            'leftover_amount_php': 0,
            'leftover_ids': [],
            'leftover_nep_ids': [m['id'] for m in nep_only],
            'leftover_nep_amount_php': sum(m['amount_php'] or 0 for m in nep_only),
            'house_amount_php': sum(m['amount_php'] or 0 for m in g['house_rows']),
            'nep_amount_php': sum(m['nep_amount_php'] or m['amount_php'] or 0
                                  for m in paired_anchors),
            'members': g['house_rows'] + nep_only,
        })
    nep_leftover_findings.sort(key=lambda f: (-f['leftover_nep_amount_php'], f['shell']))
    findings.sort(key=lambda f: (-f['leftover_amount_php'], f['shell']))

    # Region rollup: where do leftover shells (both directions) sit?
    region_roll: dict[str, dict] = {}

    def roll_entry(region: str) -> dict:
        return region_roll.setdefault(region or 'No recorded region', {
            'region': region or 'No recorded region',
            'exhausted_groups': 0, 'road_groups': 0, 'place_shell_groups': 0,
            'split_like_groups': 0, 'unsupplied_cluster_groups': 0,
            'micro_supplied_groups': 0, 'paired_rows': 0,
            'leftover_house_rows': 0, 'leftover_amount_php': 0,
            'nep_leftover_groups': 0, 'leftover_nep_rows': 0,
            'leftover_nep_amount_php': 0,
            'house_rows': 0, 'nep_rows': 0,
        })

    for f in findings:
        entry = roll_entry(f['region'])
        entry['exhausted_groups'] += 1
        entry['road_groups' if f['kind'] == 'road' else 'place_shell_groups'] += 1
        entry[f"{f['pattern']}_groups"] += 1
        entry['leftover_house_rows'] += f['leftover_house_rows']
        entry['leftover_amount_php'] += f['leftover_amount_php']
        entry['house_rows'] += f['house_rows']
        entry['nep_rows'] += f['nep_rows']
        entry['paired_rows'] += f['paired_rows']
    for f in nep_leftover_findings:
        entry = roll_entry(f['region'])
        entry['nep_leftover_groups'] += 1
        entry['road_groups' if f['kind'] == 'road' else 'place_shell_groups'] += 1
        entry['leftover_nep_rows'] += f['leftover_nep_rows']
        entry['leftover_nep_amount_php'] += f['leftover_nep_amount_php']
        entry['house_rows'] += f['house_rows']
        entry['nep_rows'] += f['nep_rows']
        entry['paired_rows'] += f['paired_rows']
    region_summary = sorted(
        region_roll.values(),
        key=lambda r: (-(r['leftover_amount_php'] + r['leftover_nep_amount_php']),
                       r['region']))

    leftover_ids = {i for f in findings for i in f['leftover_ids']}
    leftover_nep_ids = {i for f in nep_leftover_findings for i in f['leftover_nep_ids']}
    # NEP supply = any collapsed pair anchor or NEP-only member (collapsed
    # pairs keep their NEP provenance on the House member).
    groups_with_supply = sum(
        1 for g in groups.values()
        if any(m.get('attached') for m in g['house_rows']) or g['nep_rows'])
    summary = {
        'groups_total': len(groups),
        'groups_with_nep_supply': groups_with_supply,
        'exhausted_groups': len(findings),
        'exhausted_road_groups': sum(1 for f in findings if f['kind'] == 'road'),
        'exhausted_place_shell_groups': sum(1 for f in findings if f['kind'] == 'place_shell'),
        'split_like_groups': sum(1 for f in findings if f['pattern'] == 'split_like'),
        'unsupplied_cluster_groups': sum(1 for f in findings if f['pattern'] == 'unsupplied_cluster'),
        'micro_supplied_groups': sum(1 for f in findings if f['pattern'] == 'micro_supplied'),
        'nep_leftover_groups': len(nep_leftover_findings),
        'leftover_house_rows': len(leftover_ids),
        'leftover_amount_php': sum(f['leftover_amount_php'] for f in findings),
        'leftover_nep_rows': len(leftover_nep_ids),
        'leftover_nep_amount_php': sum(f['leftover_nep_amount_php'] for f in nep_leftover_findings),
        'flag': 'insertion_candidate_group_exhausted',
        'flag_description': (
            'House-only row on a same-shell group (road corridor, or work + '
            'municipality + province place shell) whose NEP rows are all '
            'attached to other House rows; similar projects exhausted with no '
            'remaining NEP match. Split / insertion or scope-expansion '
            'candidate — group context provided, identity never certified.'
        ),
    }
    manifest = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'built_at': datetime.now(ZoneInfo('Asia/Manila')).isoformat(timespec='seconds'),
        'generator': {
            'path': 'analysis/builders/build_road_groups.py',
            'sha256': digest(Path(__file__)),
        },
        'inputs': {'source_comparison_2027.json': digest(DATA / 'source_comparison_2027.json')},
        'matching_method': (
            'Road rows group by zone+PAP+region+chainage-stripped title base; '
            'everything else groups by zone+PAP+region+place shell (work phrase '
            '+ municipality + province, dropping barangay/sitio/street — the '
            'split axis). Attached pairs collapse to one HGAB-anchored record '
            '(NEP amount + delta as provenance). Two finding states: '
            'hgab_leftover (NEP supply fully paired, House rows remain — split '
            '/ insertion candidates, with a scale pattern: split_like 0.2–5× '
            'median ratio, unsupplied_cluster paired item far larger, '
            'micro_supplied reverse) and nep_leftover (House side fully paired, '
            'NEP supply remains — dropped or re-titled candidates). Neither is '
            'a certified insertion or deletion.'
        ),
    }
    payload = {'manifest': manifest, 'summary': summary,
               'groups': findings, 'nep_leftover_groups': nep_leftover_findings,
               'region_summary': region_summary}
    (DATA / 'road_group_candidates_2027.json').write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    for r in region_summary[:10]:
        print(f"  {r['region']:<28} hgab_left={r['leftover_house_rows']:>4} "
              f"₱{r['leftover_amount_php']:>13,} | "
              f"nep_left={r['leftover_nep_rows']:>3} "
              f"₱{r['leftover_nep_amount_php']:>13,} "
              f"({r['exhausted_groups']}+{r['nep_leftover_groups']} groups)")
    return payload


if __name__ == '__main__':
    build()
