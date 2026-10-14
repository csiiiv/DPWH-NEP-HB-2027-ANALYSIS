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


def match_projects(house_projects, nep_projects):
    """Pair rows whose (sub-program, canonical title) key is unique on both sides.

    A key present more than once on either side is ambiguous and never pairs
    (the House annex prints repeated titles as distinct rows; see the audit's
    repeated_title_groups). Everything else stays a source-only observation.
    """
    def build_index(projects):
        index = {}
        for p in projects:
            index.setdefault((p['subprogram_key'], canonical_title(p['title'])), []).append(p)
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
    rows, house_remaining, nep_remaining = match_projects(house['projects'], nep['projects'])
    # Every source row must appear in exactly one comparison row.
    ids = [r['house_id'] for r in rows] + [p['id'] for p in house_remaining]
    if Counter(ids) != Counter(p['id'] for p in house['projects']):
        raise ValueError('Comparison does not partition House rows exactly once')
    ids = [r['nep_id'] for r in rows] + [p['id'] for p in nep_remaining]
    if Counter(ids) != Counter(p['id'] for p in nep['projects']):
        raise ValueError('Comparison does not partition NEP rows exactly once')
    for side, remaining in (('house', house_remaining), ('nep', nep_remaining)):
        other_side = 'nep' if side == 'house' else 'house'
        other_remaining = nep_remaining if side == 'house' else house_remaining
        other_titles = {(p['subprogram_key'], canonical_title(p['title'])) for p in other_remaining}
        for p in remaining:
            rows.append({
                'id': f"{side}_only:{p['id']}",
                'subprogram_key': p['subprogram_key'],
                'status': f'{side}_only', 'method': None,
                f'{side}_id': p['id'],
                f'{other_side}_id': None,
                'delta_php': None,
                'ambiguous_title': (p['subprogram_key'], canonical_title(p['title'])) in other_titles,
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
        'comparison_summary': {
            'counts': dict(Counter(r['status'] for r in rows)),
            'delta_php': program_delta,
            'paired_delta_php': paired_delta,
            'house_only_php': house_only,
            'nep_only_php': nep_only,
            'changed_pairs': sum(r['status'] == 'paired' and r['delta_php'] != 0 for r in rows),
        },
        'matching_note': 'Unique one-to-one candidates within the same sub-program by canonical title. No fuzzy matching. Source-only rows are observations, not certified insertions or deletions.',
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
    print(f"{'Checked' if args.check else 'Wrote'} {OUTPUT} · {data['comparison_summary']['counts']} · "
          f"Δ {data['comparison_summary']['delta_php']:,} PHP")


if __name__ == '__main__':
    main()
