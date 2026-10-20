#!/usr/bin/env python3
"""Build the NIA browser dataset from the two retained extraction layers.

Sources (both fully reconciled, committed under analysis-nia/data/):
  - HGAB  : House Volume I-B irrigation annex, native text layer (828 rows).
  - NEP   : DBM NEP standalone NIA.pdf, embedded OCR layer (791 rows).

Project pairings across the two documents are deterministic candidates built
from unique (sub-program, canonical title) keys only. No fuzzy matching; rows
without a unique counterpart stay unmatched observations. The money identity
  paired Δ + house_only − nep_only = program Δ
is asserted before anything is written.

Two matching methods are emitted. "strict" is the committed default: raw
source titles, no normalization. "ai_corrected" applies two auditable
normalizations to the matching keys of AI-monitoring rows only — verified NEP
OCR readings (Al/AL/AT Monitoring → AI Monitoring; the 59 variants checked
against rendered pages) and Monitoring/Monitoring System wording equivalence
— without rewriting any stored title. Every comparison row carries both
statuses so the two classifications stay side by side.

Unmatched rows additionally receive deterministic review marks computed from
the corrected residual: repeated-title blocks, one-to-one spelling or
location-suffix variants (equal amounts, accent-folded similarity), or no
near-miss counterpart. Marks are review pointers over equal amounts; they
never create pairs, consume counterpart rows, or certify identity.

Output: analysis-nia/data/nia_workbench.json (regenerable, git-ignored).
"""
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'analysis-nia/data'
OUTPUT = DATA / 'nia_workbench.json'

# HGAB prints full sub-program labels; NEP prints short ones. The dataset's
# own controls are the authority on which rows belong together.
HGAB_SUBPROGRAM_TO_NEP = {
    'National Irrigation System Sub-Program': 'National Irrigation System',
    'Communal Irrigation System Sub-Program': 'Communal Irrigation System',
    'Other Irrigation System Sub-Program': 'Other Irrigation System',
    'Establishment of Pump Irrigation Sub-Program': 'Establishment of Pump Irrigation',
    'Special Irrigation Sub-Program': 'Special Irrigation',
    'Extension/Expansion of Existing Irrigation System Sub-Program': 'Extension/Expansion',
}
# Analytic program grouping: House Restoration comes from the agency table,
# while House Development and both NEP headings are printed in the annexes.
PROGRAM_GROUPS = {
    'National Irrigation System': 'IRRIGATION SYSTEMS RESTORATION PROGRAM',
    'Communal Irrigation System': 'IRRIGATION SYSTEMS RESTORATION PROGRAM',
    'Other Irrigation System': 'IRRIGATION SYSTEMS RESTORATION PROGRAM',
    'Establishment of Pump Irrigation': 'IRRIGATION SYSTEMS DEVELOPMENT PROGRAM',
    'Special Irrigation': 'IRRIGATION SYSTEMS DEVELOPMENT PROGRAM',
    'Extension/Expansion': 'IRRIGATION SYSTEMS DEVELOPMENT PROGRAM',
}


def read(path):
    return json.loads(path.read_text())


def canonical_title(text):
    text = unicodedata.normalize('NFKD', text).casefold()
    return ' '.join(re.findall(r'[a-z0-9]+', text))


# Verified NEP OCR readings: 59 titles print Al/AL/AT Monitoring where the
# rendered annex reads AI. Matching keys may use the verified reading; stored
# titles are never rewritten.
OCR_AI_MONITORING = re.compile(r'\b(?:Al|AL|AT)(\s+Monitoring)')
# Wording equivalence applied to matching keys only: the annexes print both
# "... with AI Monitoring" and "... with AI Monitoring System" for the same
# project wording.
MONITORING_SYSTEM_SUFFIX = re.compile(r'(\bMonitoring)(\s+System)?\b')

AI_MONITORING = re.compile(
    r'\b(?:AI|Artificial\s+Intelligence)[\s-]*(?:Satellite[\s-]*Assisted[\s-]+)?Monitoring\b', re.I)


def corrected_title_for_matching(project):
    """AI-monitoring key normalization: verified OCR reading plus wording."""
    title = project['title']
    if project['stage'] == 'nep':
        title = OCR_AI_MONITORING.sub(r'AI\1', title)
    if not AI_MONITORING.search(title):
        return title
    def drop_system(match):
        return match.group(1)
    return MONITORING_SYSTEM_SUFFIX.sub(drop_system, title)


def match_projects(house_projects, nep_projects, method='strict'):
    """Pair rows whose (sub-program, canonical title) key is unique on both sides.

    A key present more than once on either side is ambiguous and never pairs
    (the House annex prints repeated titles as distinct rows; see the audit's
    repeated_title_groups). Everything else stays a source-only observation.

    method='strict' uses raw source titles (the committed default).
    method='ai_corrected' additionally normalizes AI-monitoring matching keys:
    verified NEP OCR readings (Al/AL/AT → AI) and Monitoring/Monitoring
    System equivalence. Stored titles and amounts are never rewritten.
    """
    if method not in ('strict', 'ai_corrected'):
        raise ValueError(f'unknown matching method: {method}')
    normalize = (lambda p: p['title']) if method == 'strict' else corrected_title_for_matching
    def build_index(projects):
        index = {}
        for p in projects:
            index.setdefault((p['subprogram_key'], canonical_title(normalize(p))), []).append(p)
        return index

    house_index, nep_index = build_index(house_projects), build_index(nep_projects)
    rows, paired_house_ids, paired_nep_ids = [], set(), set()
    for key in sorted(house_index.keys() & nep_index.keys()):
        h, n = house_index[key], nep_index[key]
        if len(h) == 1 and len(n) == 1:
            rows.append({
                'id': f"pair:{n[0]['id']}:{h[0]['id']}",
                'subprogram_key': n[0]['subprogram_key'],
                'status': 'paired', 'method': 'title',
                'nep_id': n[0]['id'], 'house_id': h[0]['id'],
                'delta_php': h[0]['amount_php'] - n[0]['amount_php'],
            })
            paired_house_ids.add(h[0]['id'])
            paired_nep_ids.add(n[0]['id'])
    house_remaining = [p for p in house_projects if p['id'] not in paired_house_ids]
    nep_remaining = [p for p in nep_projects if p['id'] not in paired_nep_ids]
    return rows, house_remaining, nep_remaining


# Deterministic review marks over the corrected unmatched residual. Marks are
# pointers for review, never pairs: each candidate must carry the same amount
# and share the sub-program, and one-to-one consumption keeps marks unique on
# both sides. Identity still requires the rendered pages.
def _similarity(a, b):
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a, b).ratio()


BRGY_SUFFIX = re.compile(r'\s+in\s+Brgy\.\s+\S+.*$', re.I)
SIMILARITY_FLOOR = 0.95


def mark_unmatched_variants(house_remaining, nep_remaining):
    """Mark unmatched rows with deterministic near-miss categories.

    Returns (marks, pools). marks maps source id -> mark dict:
      repeated_title   — corrected-key group where amounts collide, so no
                         one-to-one counterpart can be distinguished
                         (San Juan / Bakod Bayan identity review)
      location_variant — unique same-amount counterpart whose House title
                         only adds a trailing "in Brgy. …" qualifier
      exact_variant    — corrected keys already equal; blocked only by a
                         wider same-key group and resolved by a unique amount
      spelling_variant — unique same-amount counterpart whose corrected
                         title differs only by OCR/typo spelling
      no_counterpart  — no same-amount corrected residual candidate remains
    Marks consume counterpart rows one-to-one, so each mark is unique on both
    sides. Marks never create pairs or certify identity.
    """
    def corrected_key(p):
        return canonical_title(corrected_title_for_matching(p))

    house_stripped = {p['id']: canonical_title(BRGY_SUFFIX.sub('', corrected_title_for_matching(p)))
                      for p in house_remaining}
    marks = {}

    # Phase 1: corrected-key groups shared across sides (using the House key
    # with any trailing Brgy. qualifier removed). Pair strictly by amount.
    by_key_house, by_key_nep = {}, {}
    for p in house_remaining:
        by_key_house.setdefault((p['subprogram_key'], house_stripped[p['id']]), []).append(p)
    for p in nep_remaining:
        by_key_nep.setdefault((p['subprogram_key'], corrected_key(p)), []).append(p)
    consumed = set()
    for key in sorted(by_key_house.keys() & by_key_nep.keys()):
        group_h = sorted(by_key_house[key], key=lambda p: (p['amount_php'], p['id']))
        group_n = sorted(by_key_nep[key], key=lambda p: (p['amount_php'], p['id']))
        amounts_h = [p['amount_php'] for p in group_h]
        amounts_n = [p['amount_php'] for p in group_n]
        pairable = (len(amounts_h) == len(amounts_n)
                    and len(set(amounts_h)) == len(amounts_h)
                    and amounts_h == amounts_n)
        if pairable:
            for p, n in zip(group_h, group_n):
                kind = 'exact_variant' if corrected_key(p) == corrected_key(n) else 'location_variant'
                marks[p['id']] = {'mark': kind, 'counterpart_ids': [n['id']]}
                marks[n['id']] = {'mark': kind, 'counterpart_ids': [p['id']]}
                consumed.update((p['id'], n['id']))
        elif set(amounts_h) & set(amounts_n):
            # Amounts collide inside the group: no distinguishable one-to-one
            # counterpart exists on either side.
            for p in group_h + group_n:
                if p['id'] not in marks:
                    marks[p['id']] = {'mark': 'repeated_title', 'counterpart_ids': []}
        # Groups without overlapping amounts fall through to phase 2 / none.

    # Phase 2: one-to-one spelling variants among the remaining rows.
    available = {p['id']: p for p in nep_remaining
                 if p['id'] not in marks and p['id'] not in consumed}
    for p in sorted(house_remaining, key=lambda p: (-p['amount_php'], p['id'])):
        if p['id'] in marks:
            continue
        candidates = [n for n in available.values()
                      if n['subprogram_key'] == p['subprogram_key']
                      and n['amount_php'] == p['amount_php']
                      and _similarity(house_stripped[p['id']], corrected_key(n)) >= SIMILARITY_FLOOR]
        if len(candidates) == 1:
            n = candidates[0]
            marks[p['id']] = {'mark': 'spelling_variant', 'counterpart_ids': [n['id']]}
            marks[n['id']] = {'mark': 'spelling_variant', 'counterpart_ids': [p['id']]}
            del available[n['id']]

    for p in house_remaining:
        marks.setdefault(p['id'], {'mark': 'no_counterpart', 'counterpart_ids': []})
    for p in nep_remaining:
        marks.setdefault(p['id'], {'mark': 'no_counterpart', 'counterpart_ids': []})
    pools = {}
    kinds = ('repeated_title', 'location_variant', 'exact_variant', 'spelling_variant', 'no_counterpart')
    for side, remaining in (('house', house_remaining), ('nep', nep_remaining)):
        pools[side] = {}
        for kind in kinds:
            rows = [p for p in remaining if marks[p['id']]['mark'] == kind]
            pools[side][kind] = {'count': len(rows), 'amount_php': sum(p['amount_php'] for p in rows)}
    return marks, pools


def load_house():
    import csv
    tree = read(DATA / 'hgab_nia_tree.json')
    audit = read(DATA / 'hgab_nia_audit.json')
    dataset_check = hashlib.sha256((DATA / 'hgab_nia_projects.csv').read_bytes()).hexdigest()
    if not audit['passed'] or audit['errors']:
        raise ValueError('HGAB audit failed; rerun extract_hgab_nia.py')
    nodes = {n['id']: n for n in tree['nodes']}
    with open(DATA / 'hgab_nia_projects.csv', newline='', encoding='utf-8') as handle:
        csv_rows = list(csv.DictReader(handle))
    if len(csv_rows) != audit['summary']['projects']:
        raise ValueError('HGAB project CSV does not match the audit count')
    projects = []
    for r in csv_rows:
        node = nodes[r['id']]
        if node['kind'] != 'project' or int(r['amount_php']) != node['printed_amount_php']:
            raise ValueError(f"HGAB row disagrees with the tree: {r['id']}")
        subprogram_label = r['subprogram']
        subprogram_key = HGAB_SUBPROGRAM_TO_NEP[subprogram_label]
        parent = nodes[node['parent_id']]
        if parent['label'] != subprogram_label:
            raise ValueError(f"HGAB parent disagrees with the CSV: {r['id']}")
        for field in ('source_pdf', 'pdf_page', 'printed_page', 'row_number'):
            if str(node['source'][field]) != r[field]:
                raise ValueError(f"HGAB provenance disagrees with the tree: {r['id']} {field}")
        # The Development heading groups the last three sub-programs; the first
        # three hang directly off the annex title.
        grandparent = nodes[parent['parent_id']]
        group_heading = None if grandparent['kind'] == 'annex_program' else grandparent['label']
        if r['title'] != node['label']:
            raise ValueError(f"HGAB title disagrees with the tree: {r['id']}")
        projects.append({
            'id': r['id'],
            'stage': 'house',
            'subprogram_key': subprogram_key,
            'subprogram_label': subprogram_label,
            'program_group': PROGRAM_GROUPS[subprogram_key],
            'group_heading': group_heading,
            'title': r['title'],
            'amount_php': int(r['amount_php']),
            'source': {
                'source_pdf': r['source_pdf'],
                'pdf_page': int(r['pdf_page']),
                'printed_page': int(r['printed_page']),
                'row_number': int(r['row_number']),
            },
            'path_labels': node['path_labels'],
            'parent_id': node['parent_id'],
        })
    root = nodes[tree['root_id']]
    root_source = {k: root['source'][k] for k in ('source_pdf', 'pdf_page', 'printed_page')}
    subprograms = []
    for n in tree['nodes']:
        if n['kind'] != 'subprogram_control':
            continue
        key = HGAB_SUBPROGRAM_TO_NEP[n['label']]
        subprograms.append({
            'id': n['id'], 'key': key, 'label': n['label'],
            'amount_php': n['printed_amount_php'],
            'project_count': len(n['child_ids']),
            'program_group': PROGRAM_GROUPS[key],
            'group_heading': None if nodes[n['parent_id']]['kind'] == 'annex_program'
                             else nodes[n['parent_id']]['label'],
            'source': n['source'],
        })
    return {
        'key': 'house', 'label': 'House GAB',
        'description': 'House bill annex · supplied Volume I-B copy (legislative stage not independently authenticated)',
        'root': {'id': root['id'], 'label': root['label'], 'amount_php': root['derived_amount_php'],
                 'source': root_source},
        'subprograms': subprograms,
        'projects': projects,
        'audit_summary': audit['summary'],
        'agency_checks': audit['agency_checks'],
        'repeated_title_groups': [
            {'title': g['title'], 'ids': g['project_ids']}
            for g in audit.get('repeated_title_groups', [])
        ],
        'title_numeric_tokens': [
            {'row_id': t['row_id'], 'tokens': t['tokens']}
            for t in audit.get('title_numeric_tokens', [])
        ],
        'metadata': tree['metadata'],
        'provenance': {'analysis-nia/data/hgab_nia_projects.csv': dataset_check},
    }


def load_nep():
    dataset = read(DATA / 'nep_nia_dataset.json')
    meta = dataset['meta']
    if not meta.get('all_controls_reconciled'):
        raise ValueError('NEP dataset reports unreconciled controls')
    if meta['row_count'] != len(dataset['projects']):
        raise ValueError('NEP dataset row_count disagrees with its projects')
    if meta['grand_total'] != sum(p['amount_php'] for p in dataset['projects']):
        raise ValueError('NEP dataset grand_total disagrees with its projects')
    projects = []
    for p in dataset['projects']:
        prov = p['provenance']
        flags = p.get('flags') or []
        row_flags, flag_details = [], []
        for flag in flags:
            if not isinstance(flag, dict):
                continue
            kind = flag.get('flag') or ('amount_adjudicated' if flag.get('applies') == 'amount' else None)
            if kind:
                row_flags.append(kind)
                detail = {'flag': kind, 'applies': flag.get('applies')}
                if flag.get('note'):
                    detail['note'] = flag['note']
                if flag.get('evidence_crop'):
                    detail['evidence_crop'] = flag['evidence_crop']
                flag_details.append(detail)
        projects.append({
            'id': p['id'],
            'stage': 'nep',
            'subprogram_key': p['sub_program'],
            'subprogram_label': p['sub_program'],
            'program_group': PROGRAM_GROUPS[p['sub_program']],
            'group_heading': PROGRAM_GROUPS[p['sub_program']],
            'title': p['label'],
            'amount_php': p['amount_php'],
            'source': {
                'source_pdf': meta['source_pdf'],
                'pdf_page': prov['page'],
                'printed_page': None,
                'row_number': None,
                'y0': prov['y0'],
            },
            'extraction_flags': row_flags,
            'flag_details': flag_details,
            'provenance': {
                'amount_raw': prov.get('amount_raw'),
                'amount_token_bbox': prov.get('amount_token_bbox_x0y0'),
                'continuation_lines': prov.get('continuation_lines'),
                'word_indices': prov.get('word_indices'),
                'x0': prov.get('x0'),
                'y0': prov.get('y0'),
            },
        })
    subprograms = []
    for s in dataset['sub_programs']:
        subprograms.append({
            'id': f"nep-sp:{re.sub(r'[^a-z0-9]+', '-', s['sub_program'].casefold()).strip('-')}",
            'key': s['sub_program'], 'label': s['sub_program'],
            'amount_php': s['control_amount'],
            'program_group': PROGRAM_GROUPS[s['sub_program']],
            'group_heading': PROGRAM_GROUPS[s['sub_program']],
            'project_count': s['project_count'],
            'segment_start': s['segment_start'],
            'source': {'source_pdf': meta['source_pdf'], 'pdf_page': s['segment_start']['page'],
                       'printed_page': None, 'row_number': None},
        })
    audit = read(DATA / 'nep_nia_audit.json')
    expected_audit = {
        'total_projects': len(dataset['projects']),
        'grand_total': sum(p['amount_php'] for p in dataset['projects']),
    }
    for field, value in expected_audit.items():
        if audit.get(field) != value:
            raise ValueError(f'NEP audit disagrees with dataset: {field}')
    if not all(check.get('tallies') for check in audit.get('sub_program_checks', {}).values()):
        raise ValueError('NEP audit reports a failing sub-program control')
    return {
        'key': 'nep', 'label': 'DBM NEP',
        'description': 'Executive proposal · standalone NIA schedule (scanned annex, embedded OCR text layer)',
        'root': {'id': 'nep-root', 'label': 'FY 2027 Irrigation Program (NEP volume)'},
        'subprograms': subprograms,
        'projects': projects,
        'audit_summary': {
            'total_projects': audit.get('total_projects'),
            'grand_total': audit.get('grand_total'),
            'control_total': audit.get('control_total'),
            'all_controls_reconciled': meta['all_controls_reconciled'],
        },
        'metadata': meta,
        'provenance': {'analysis-nia/data/nep_nia_dataset.json':
                       hashlib.sha256((DATA / 'nep_nia_dataset.json').read_bytes()).hexdigest()},
    }


def mark_review_metadata(stage):
    """Flag exact repeated titles and numeric title tokens per stage.

    Repeated titles are identity-review candidates (the House audit records
    them explicitly; NEP gets the same deterministic exact-title scan). Rows
    are never merged or dropped.
    """
    groups = {}
    for p in stage['projects']:
        groups.setdefault((p['subprogram_key'], p['title']), []).append(p['id'])
    repeated = {pid: ids for ids in groups.values() if len(ids) > 1 for pid in ids}
    for p in stage['projects']:
        if p['id'] in repeated:
            p['repeated_title'] = True
            p['repeated_title_ids'] = repeated[p['id']]
        tokens = re.findall(r'\d{1,3}(?:,\d{3})+', p['title'])
        if tokens:
            p['numeric_title_tokens'] = tokens
    return [{'subprogram_key': key[0], 'title': key[1], 'ids': ids}
            for key, ids in sorted(groups.items()) if len(ids) > 1]


def validate_stage(stage):
    """Reject stale controls and duplicate IDs before constructing comparisons."""
    projects, subprograms = stage['projects'], stage['subprograms']
    if len({p['id'] for p in projects}) != len(projects):
        raise ValueError(f"{stage['key']}: duplicate source IDs")
    keys = {s['key'] for s in subprograms}
    if len(keys) != len(subprograms) or any(p['subprogram_key'] not in keys for p in projects):
        raise ValueError(f"{stage['key']}: invalid sub-program membership")
    for p in projects:
        if type(p['amount_php']) is not int or p['amount_php'] < 0:
            raise ValueError(f"{stage['key']}: invalid integer PHP amount")
    for s in subprograms:
        scoped = [p for p in projects if p['subprogram_key'] == s['key']]
        if len(scoped) != s['project_count'] or sum(p['amount_php'] for p in scoped) != s['amount_php']:
            raise ValueError(f"{stage['key']}: sub-program control disagrees: {s['key']}")
    total = sum(p['amount_php'] for p in projects)
    if stage['root'].get('amount_php', total) != total:
        raise ValueError(f"{stage['key']}: root total disagrees")


def build(write_output=True):
    house = load_house()
    nep = load_nep()
    for stage in (house, nep):
        validate_stage(stage)
    house['repeated_title_groups_computed'] = mark_review_metadata(house)
    nep['repeated_title_groups_computed'] = mark_review_metadata(nep)
    strict_rows, strict_house_rem, strict_nep_rem = match_projects(house['projects'], nep['projects'])
    corr_rows, corr_house_rem, corr_nep_rem = match_projects(house['projects'], nep['projects'], method='ai_corrected')
    # Normalization may only add pairs; a strict pair disappearing under the
    # corrected method would mean the normalization corrupted a key.
    strict_pair_set = {(r['house_id'], r['nep_id']) for r in strict_rows}
    corr_pair_set = {(r['house_id'], r['nep_id']) for r in corr_rows}
    if not strict_pair_set <= corr_pair_set:
        raise ValueError('Corrected matching dropped a strict pair')
    if sum(r['delta_php'] != 0 for r in corr_rows) != sum(r['delta_php'] != 0 for r in strict_rows):
        raise ValueError('Corrected matching changed the changed-pair set')
    marks, variant_pools = mark_unmatched_variants(corr_house_rem, corr_nep_rem)
    # Marks must be one-to-one and symmetric.
    used_counterparts = Counter(cid for m in marks.values() for cid in m['counterpart_ids'])
    if any(count > 1 for count in used_counterparts.values()):
        raise ValueError('Variant marks consumed a counterpart row twice')
    for pid, mark in marks.items():
        for cid in mark['counterpart_ids']:
            if marks[cid]['counterpart_ids'] != [pid] or marks[cid]['mark'] != mark['mark']:
                raise ValueError(f'Asymmetric variant mark: {pid}')

    # The corrected partition is the master ledger; every source row appears
    # in exactly one comparison row. strict_status recovers the strict
    # classification per row: corrected pairs that were also strict pairs are
    # 'paired'; corrected-only pairs are 'split_pair' (one strict house_only
    # plus one strict nep_only observation); corrected-unmatched rows were
    # necessarily strict-unmatched because strict pairs ⊆ corrected pairs.
    rows = []
    for r in corr_rows:
        strict_status = 'paired' if (r['house_id'], r['nep_id']) in strict_pair_set else 'split_pair'
        rows.append({**r, 'method': 'ai_corrected', 'strict_status': strict_status,
                     'variant_mark': None, 'variant_mark_kind': None})
    ids = [r['house_id'] for r in rows] + [p['id'] for p in corr_house_rem]
    if Counter(ids) != Counter(p['id'] for p in house['projects']):
        raise ValueError('Comparison does not partition House rows exactly once')
    ids = [r['nep_id'] for r in rows] + [p['id'] for p in corr_nep_rem]
    if Counter(ids) != Counter(p['id'] for p in nep['projects']):
        raise ValueError('Comparison does not partition NEP rows exactly once')
    corr_other_titles = ({(p['subprogram_key'], canonical_title(corrected_title_for_matching(p)))
                          for p in corr_nep_rem} |
                         {(p['subprogram_key'], canonical_title(corrected_title_for_matching(p)))
                          for p in corr_house_rem})
    for side, remaining in (('house', corr_house_rem), ('nep', corr_nep_rem)):
        other_side = 'nep' if side == 'house' else 'house'
        for p in remaining:
            rows.append({
                'id': f"{side}_only:{p['id']}",
                'subprogram_key': p['subprogram_key'],
                'status': f'{side}_only', 'method': None,
                'strict_status': f'{side}_only',
                f'{side}_id': p['id'],
                f'{other_side}_id': None,
                'delta_php': None,
                'ambiguous_title': (p['subprogram_key'], canonical_title(corrected_title_for_matching(p))) in corr_other_titles,
                'variant_mark': marks[p['id']] if marks[p['id']]['mark'] != 'no_counterpart' else None,
                'variant_mark_kind': marks[p['id']]['mark'],
            })
    rows.sort(key=lambda r: r['id'])

    lookup = {s: {p['id']: p for p in stage['projects']}
              for s, stage in (('house', house), ('nep', nep))}
    house_root = house['root']['amount_php']
    nep_total = sum(p['amount_php'] for p in nep['projects'])
    paired_delta = sum(r['delta_php'] for r in rows if r['status'] == 'paired')
    house_only = sum(lookup['house'][r['house_id']]['amount_php']
                     for r in rows if r['status'] == 'house_only')
    nep_only = sum(lookup['nep'][r['nep_id']]['amount_php']
                   for r in rows if r['status'] == 'nep_only')
    program_delta = house_root - nep_total
    if paired_delta + house_only - nep_only != program_delta:
        raise ValueError('Comparison money reconciliation failed')

    # Strict classification recovered from strict_status, plus per-method
    # summaries and the AI-monitoring breakdown under both methods. The
    # corrected summary must exactly reproduce the AI reading-note figures:
    # 273 pairs (₱5,785,950,000) against 26 House-only (₱556,000,000) and
    # 54 NEP-only (₱1,230,000,000).
    def summarize(status_field):
        def strict_view(r):
            if status_field != 'strict_status':
                return r['status']
            # split_pair rows are one strict house_only + one strict nep_only
            return {None: r['status'], 'paired': 'paired', 'split_pair': None,
                    'house_only': 'house_only', 'nep_only': 'nep_only'}[r['strict_status'] if status_field == 'strict_status' else None]
        return None

    def summarize_counts(status_field):
        counts = {'paired': 0, 'house_only': 0, 'nep_only': 0}
        for r in rows:
            if status_field == 'status':
                counts[r['status']] += 1
            else:
                if r['strict_status'] == 'paired':
                    counts['paired'] += 1
                elif r['strict_status'] == 'split_pair':
                    counts['house_only'] += 1
                    counts['nep_only'] += 1
                else:
                    counts[r['strict_status']] += 1
        return counts

    def summarize_side(status_field, side, status):
        if status_field == 'status':
            selected = [r for r in rows if r['status'] == status]
        else:
            if status == 'paired':
                selected = [r for r in rows if r['strict_status'] == 'paired']
            elif status == 'house_only':
                selected = [r for r in rows if r['strict_status'] in ('split_pair', 'house_only')]
            else:
                selected = [r for r in rows if r['strict_status'] in ('split_pair', 'nep_only')]
        if side == 'paired':
            return (len(selected),
                    sum(lookup['nep'][r['nep_id']]['amount_php'] for r in selected),
                    sum(lookup['house'][r['house_id']]['amount_php'] for r in selected))
        amount = sum(lookup[side][r[f'{side}_id']]['amount_php'] for r in selected if r[f'{side}_id'])
        return len(selected), amount

    def method_summary(status_field):
        counts = summarize_counts(status_field)
        paired_count, paired_nep, paired_house = summarize_side(status_field, 'paired', 'paired')
        h_count, h_amount = summarize_side(status_field, 'house', 'house_only')
        n_count, n_amount = summarize_side(status_field, 'nep', 'nep_only')
        changed = [r for r in rows if r['delta_php']]
        # DPWH-style candidate split: rows with a deterministic near-miss mark
        # (spelling/location/repeated/exact variant) have a plausible
        # counterpart and stay unresolved; only no_counterpart rows are
        # validated candidates for headline counts. Under strict matching the
        # split_pair rows (pairs created by the verified OCR correction) are
        # equally unresolved: their plausible counterpart is the corrected
        # twin, pending page-level verification.
        unresolved_kinds = ('repeated_title', 'location_variant', 'exact_variant', 'spelling_variant')
        def split(rows_subset, side, strict=False):
            unresolved, no_counterpart = [], []
            for r in rows_subset:
                if (strict and r.get('strict_status') == 'split_pair') or r.get('variant_mark_kind') in unresolved_kinds:
                    unresolved.append(r)
                else:
                    no_counterpart.append(r)
            return {'unresolved': {'count': len(unresolved),
                                   'amount_php': sum(lookup[side][r[f'{side}_id']]['amount_php'] for r in unresolved)},
                    'no_counterpart': {'count': len(no_counterpart),
                                       'amount_php': sum(lookup[side][r[f'{side}_id']]['amount_php'] for r in no_counterpart)}}
        def strict_rows(status):
            if status == 'paired':
                return [r for r in rows if r['strict_status'] == 'paired']
            return [r for r in rows if r['strict_status'] in ({'house_only': ('split_pair', 'house_only'),
                                                               'nep_only': ('split_pair', 'nep_only')}[status])]
        if status_field == 'status':
            h_rows = [r for r in rows if r['status'] == 'house_only']
            n_rows = [r for r in rows if r['status'] == 'nep_only']
        else:
            h_rows = strict_rows('house_only')
            n_rows = strict_rows('nep_only')
        strict_split = status_field != 'status'
        return {'counts': counts, 'delta_php': program_delta,
                'paired_delta_php': paired_house - paired_nep,
                'house_only_php': h_amount, 'nep_only_php': n_amount,
                'changed_pairs': len(changed),
                'house_only_split': split(h_rows, 'house', strict_split),
                'nep_only_split': split(n_rows, 'nep', strict_split)}

    def ai_rows(status_field, status, side):
        is_ai = lambda p: p and (AI_MONITORING.search(p['title'])
                                 or (p['stage'] == 'nep' and OCR_AI_MONITORING.search(p['title'])))
        if status_field == 'status':
            selected = [r for r in rows if r['status'] == status]
        else:
            mapping = {'paired': ['paired'], 'house_only': ['split_pair', 'house_only'],
                       'nep_only': ['split_pair', 'nep_only']}
            selected = [r for r in rows if r['strict_status'] in mapping[status]]
        if side != 'paired':
            selected = [r for r in selected if r[f'{side}_id'] and is_ai(lookup[side].get(r[f'{side}_id']))]
        else:
            selected = [r for r in selected if r['nep_id'] and r['house_id']
                        and is_ai(lookup['nep'].get(r['nep_id'])) and is_ai(lookup['house'].get(r['house_id']))]
        return selected

    def ai_summary(status_field):
        paired = ai_rows(status_field, 'paired', 'paired')
        h_only = ai_rows(status_field, 'house_only', 'house')
        n_only = ai_rows(status_field, 'nep_only', 'nep')
        marks_pool = {}
        unresolved_kinds = ('repeated_title', 'location_variant', 'exact_variant', 'spelling_variant')
        for kind in ('repeated_title', 'location_variant', 'exact_variant', 'spelling_variant', 'no_counterpart'):
            hrows = [r for r in h_only if (r.get('variant_mark_kind') or 'no_counterpart') == kind]
            nrows = [r for r in n_only if (r.get('variant_mark_kind') or 'no_counterpart') == kind]
            marks_pool[kind] = {
                'house_only': {'count': len(hrows),
                               'amount_php': sum(lookup['house'][r['house_id']]['amount_php'] for r in hrows)},
                'nep_only': {'count': len(nrows),
                             'amount_php': sum(lookup['nep'][r['nep_id']]['amount_php'] for r in nrows)},
            }
        # DPWH-style validated/unresolved split for AI insertion candidates.
        # Under strict matching the split_pair rows are the OCR twins: their
        # plausible counterpart is the corrected-method pair, so they stay
        # unresolved rather than counting as validated insertions.
        def ai_split(rowset, side):
            unresolved = [r for r in rowset
                          if (status_field != 'status' and r.get('strict_status') == 'split_pair')
                          or r.get('variant_mark_kind') in unresolved_kinds]
            validated = [r for r in rowset if r not in unresolved]
            return {'unresolved': {'count': len(unresolved),
                                   'amount_php': sum(lookup[side][r[f'{side}_id']]['amount_php'] for r in unresolved)},
                    'no_counterpart': {'count': len(validated),
                                       'amount_php': sum(lookup[side][r[f'{side}_id']]['amount_php'] for r in validated)}}
        candidate_split = {'house_only': ai_split(h_only, 'house'), 'nep_only': ai_split(n_only, 'nep')}
        nep_php = sum(lookup['nep'][r['nep_id']]['amount_php'] for r in paired + n_only)
        house_php = sum(lookup['house'][r['house_id']]['amount_php'] for r in paired + h_only)
        return {
            'paired_count': len(paired),
            'paired_nep_php': sum(lookup['nep'][r['nep_id']]['amount_php'] for r in paired),
            'paired_house_php': sum(lookup['house'][r['house_id']]['amount_php'] for r in paired),
            'house_only_count': len(h_only),
            'house_only_php': sum(lookup['house'][r['house_id']]['amount_php'] for r in h_only),
            'nep_only_count': len(n_only),
            'nep_only_php': sum(lookup['nep'][r['nep_id']]['amount_php'] for r in n_only),
            'nep_php': nep_php, 'house_php': house_php,
            'net_delta_php': house_php - nep_php,
            'unmatched_marks': marks_pool,
            'candidate_split': candidate_split,
        }

    strict_summary = method_summary('strict_status')
    corrected_summary = method_summary('status')
    strict_ai = ai_summary('strict_status')
    corrected_ai = ai_summary('status')
    # The AI reading-note anchors, asserted so both methods stay reconcilable.
    expected_strict_ai = {'paired_count': 176, 'paired_house_php': 3_715_000_000,
                          'house_only_count': 123, 'house_only_php': 2_626_950_000,
                          'nep_only_count': 151, 'nep_only_php': 3_300_950_000}
    expected_corrected_ai = {'paired_count': 273, 'paired_house_php': 5_785_950_000,
                             'house_only_count': 26, 'house_only_php': 556_000_000,
                             'nep_only_count': 54, 'nep_only_php': 1_230_000_000}
    for field, value in expected_strict_ai.items():
        if strict_ai[field] != value:
            raise ValueError(f'Strict AI summary drifted from the reading note: {field}={strict_ai[field]}')
    for field, value in expected_corrected_ai.items():
        if corrected_ai[field] != value:
            raise ValueError(f'Corrected AI summary drifted: {field}={corrected_ai[field]}')
    if strict_summary['counts'] != {'paired': 509, 'house_only': 319, 'nep_only': 282}:
        raise ValueError('Strict classification drifted from the committed workbench figures')
    if corrected_summary['counts'] != {'paired': 606, 'house_only': 222, 'nep_only': 185}:
        raise ValueError('Corrected classification counts drifted')

    # Sub-program comparison rows mirror the FMR regional controls.
    subprogram_controls = []
    house_sp = {s['key']: s for s in house['subprograms']}
    nep_sp = {s['key']: s for s in nep['subprograms']}
    if set(house_sp) != set(nep_sp):
        raise ValueError('Sub-program keys differ across stages')
    for key in sorted(house_sp):
        h, n = house_sp[key], nep_sp[key]
        subprogram_controls.append({
            'id': key, 'key': key, 'label': h['label'],
            'program_group': h['program_group'],
            'house_php': h['amount_php'], 'nep_php': n['amount_php'],
            'delta_php': h['amount_php'] - n['amount_php'],
            'house_count': h['project_count'], 'nep_count': n['project_count'],
            'house_source': h['source'], 'nep_source': n['source'],
        })

    # Agency-table checks become the House stage's independent controls.
    agency_controls = []
    for c in house['agency_checks']:
        note = c.get('note') or ''
        agency_controls.append({
            'label': c['label'],
            'mooe_php': c.get('mooe_php'), 'total_php': c.get('total_php'),
            'annex_total_php': c.get('annex_total_php'),
            'difference_php': c.get('difference_php'),
            'passed': c.get('passed'),
            'agency_only': 'agency-only scope' in note,
            'scope_note': note or None,
            'source': {'source_pdf': c['source']['source_pdf'],
                       'pdf_page': c['source']['pdf_page'],
                       'printed_page': c['source']['printed_page']},
        })

    data = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'stages': {'house': house, 'nep': nep},
        'comparison': rows,
        'subprogram_controls': subprogram_controls,
        'agency_controls': agency_controls,
        'comparison_summary': corrected_summary,
        'comparison_summaries': {
            'strict': strict_summary,
            'ai_corrected': corrected_summary,
        },
        'ai_monitoring_summaries': {
            'strict': strict_ai,
            'ai_corrected': corrected_ai,
        },
        'unmatched_variant_pools': variant_pools,
        'matching_note': (
            'Two labeled methods share one ledger. strict: unique one-to-one candidates '
            'within the same sub-program by canonical title, no fuzzy matching. '
            'ai_corrected: additionally normalizes AI-monitoring matching keys only '
            '(verified NEP OCR readings Al/AL/AT→AI; Monitoring/Monitoring System '
            'equivalence); stored titles are never rewritten. Every row carries status '
            '(corrected) and strict_status. Unmatched rows carry deterministic variant '
            'marks (repeated_title, location_variant, exact_variant, spelling_variant, '
            'no_counterpart) — equal-amount review pointers that never create pairs or '
            'certify identity. Source-only rows are observations, not certified '
            'insertions or deletions.'),
        'documents': {
            'house': {
                'path': 'HB_BUDGET/2 - HB 10858 VOL IB.pdf',
                'label': 'House · Volume I-B (supplied copy)',
                'pages': 'annex 896–941 · agency table 568/570',
                'page_count': 982,
            },
            'nep': {
                'path': 'dbm-other-nep-line-data/NIA.pdf',
                'label': 'DBM NEP · standalone NIA annex',
                'pages': '30 pages, scanned',
                'page_count': 30,
            },
        },
    }
    if write_output:
        OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare the regenerated payload without writing')
    args = parser.parse_args()
    data = build(write_output=False)
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text() != payload:
            raise SystemExit('NIA browser dataset is missing or stale; run analysis-nia/build_nia_workbench.py')
    else:
        OUTPUT.write_text(payload)
    print(f"{'Checked' if args.check else 'Wrote'} {OUTPUT} · "
          f"strict {data['comparison_summaries']['strict']['counts']} · "
          f"corrected {data['comparison_summaries']['ai_corrected']['counts']} · "
          f"Δ {data['comparison_summary']['delta_php']:,} PHP")


if __name__ == '__main__':
    main()
