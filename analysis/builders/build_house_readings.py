#!/usr/bin/env python3
"""Compare both native House readings without treating row IDs as identities."""
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parent)]
from paths import DATA, REPO
from house_native import comparison_inputs, validate_native_detail
from build_current_pages import normalized, region
from normalize_labels import annotate_source_labels

INPUTS = ['nep_2027_source_projects.json'] + [name + suffix + '.json'
    for suffix in ('', '_3rd_reading') for name in (
        'hb_dpwh_native_rollup', 'hb_native_ib_rollup_audit',
        'hb_dpwh_native_ic_projects', 'hb_dpwh_native_ic_rollup_audit')]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reading_key(row):
    # Keep raw office in the key so HGAB2↔HGAB3 pairing stays stable; derived
    # office_canonical is carried on records for filters/overview only.
    return (row['zone'], row['pap_id'], row['region'], row['office'],
            row['record_kind'], row.get('title_match_key') or normalized(row['title']))


def grouped_side(records, reading):
    if not records:
        return None
    keep = ('title', 'title_match_key', 'title_base', 'title_base_match_key',
            'chainages', 'chainage_incomplete', 'chainage_length_review',
            'amount_php', 'program', 'pap',
            'pap_id', 'zone', 'region', 'office', 'office_canonical', 'pdf_page',
            'record_kind', 'native_node_id')
    leaves = [{**{k: r[k] for k in keep if k in r}, 'id': f'hb:{reading}:' + r['native_node_id'],
               'source_record_id': r['id']} for r in records]
    side = {**leaves[0], 'amount_php': sum(r['amount_php'] for r in leaves),
            'pdf_pages': sorted({r['pdf_page'] for r in leaves})}
    # Single-leaf sides already carry every field above; only genuinely grouped
    # keys keep the per-leaf ledger, slimmed to identity + amounts + pages.
    if len(leaves) > 1:
        side['records'] = [{k: leaf[k] for k in
                            ('id', 'source_record_id', 'native_node_id', 'amount_php', 'pdf_page')
                            if k in leaf} for leaf in leaves]
    return side


def compare_readings(second, third):
    groups = [defaultdict(list), defaultdict(list)]
    for rows, group in zip((second, third), groups):
        for row in rows:
            group[reading_key(row)].append(row)
    result = []
    for i, key in enumerate(sorted(groups[0].keys() | groups[1].keys())):
        left = grouped_side(groups[0].get(key, []), 'second')
        right = grouped_side(groups[1].get(key, []), 'third')
        delta = (right['amount_php'] if right else 0) - (left['amount_php'] if left else 0)
        repeated = any(side and len(side.get('records') or []) > 1 for side in (left, right))
        status = ('repeated_key' if repeated else 'third_only' if not left else
                  'second_only' if not right else 'amount_changed' if delta else 'same_amount')
        primary = right or left
        result.append({'id': f'house-reading:{i}', 'title': primary['title'],
                       'program': primary['program'], 'pap': primary['pap'],
                       'region': primary['region'], 'zone': primary['zone'],
                       'trace': status, 'second': left, 'third': right, 'delta_php': delta,
                       'match_basis': 'Grouped repeated key; no individual pairing' if repeated
                           else 'Unique normalized title + PAP + region + office + allocation kind + zone'})
    # Every source record is present once, even where individual identity is ambiguous.
    for side, rows in [('second', second), ('third', third)]:
        consumed = [r['source_record_id'] for pair in result if pair[side]
                    for r in (pair[side].get('records') or [pair[side]])]
        if len(consumed) != len(set(consumed)) or set(consumed) != {r['id'] for r in rows}:
            raise ValueError(f'{side}: duplicate or missing reading allocations')
    if sum(r['delta_php'] for r in result) != sum(r['amount_php'] for r in third) - sum(r['amount_php'] for r in second):
        raise ValueError('Reading deltas do not reconcile')
    return result


def build():
    source = json.loads((DATA / INPUTS[0]).read_text())
    programs = {r['pap3']: r['program'] for r in source['projects'] if r['zone'] == 'non_fap'}
    allocations, controls, totals, summaries, documents, fap_pages = [], [], [], [], {}, []
    for reading, suffix in [('second', ''), ('third', '_3rd_reading')]:
        ic = json.loads((DATA / f'hb_dpwh_native_ic_projects{suffix}.json').read_text())
        ib = json.loads((DATA / f'hb_dpwh_native_rollup{suffix}.json').read_text())
        audit = json.loads((DATA / f'hb_dpwh_native_ic_rollup_audit{suffix}.json').read_text())
        validate_native_detail(ic, audit, REPO)
        ib_audit = json.loads((DATA / f'hb_native_ib_rollup_audit{suffix}.json').read_text())
        if ib['audit_summary'] != ib_audit['summary']:
            raise ValueError('I-B reading audit mismatch')
        for path, sha in ib['provenance_sha256'].items():
            if digest(REPO / path) != sha:
                raise ValueError(f'Stale reading I-B source: {path}')
        pending, headings = [ic['root']], []
        while pending:
            node = pending.pop(); pending.extend(node['children'])
            if node['label'].upper() == 'FOREIGN-ASSISTED PROJECTS' and node['kind'] == 'section':
                headings.append(node['source']['pdf_page'])
        if len(headings) != 1: raise ValueError('Expected one native I-C FAP control heading')
        fap_pages.append(headings)
        rows, paps, printed = comparison_inputs(ic, ib, source['pap_controls'], programs, region)
        for row in rows:
            annotate_source_labels(row)
        allocations.append(rows); controls.append(paps); totals.append(printed)
        summaries.append({'allocations': len(rows), 'named_projects': ic['audit_summary']['named_project_leaves'],
                          'mooe_co_php': ic['audit_summary']['additive_leaf_total_php'], **printed})
        for volume, native in [('ib', ib), ('ic', ic)]:
            pdfs = [path for path in native['provenance_sha256'] if path.lower().endswith('.pdf')]
            if len(pdfs) != 1: raise ValueError('Expected one source PDF per reading/volume')
            documents[f'{reading}_{volume}'] = {'path': pdfs[0], 'sha256': native['provenance_sha256'][pdfs[0]]}
    projects = compare_readings(*allocations)
    paps = []
    for name in sorted(controls[0].keys() | controls[1].keys()):
        a, b = controls[0].get(name), controls[1].get(name)
        paps.append({'label': name, 'program': programs[name],
                     'second_php': a['printed_php'] if a else None, 'third_php': b['printed_php'] if b else None,
                     'second_pages': a['source_pages'] if a else [], 'third_pages': b['source_pages'] if b else [],
                     'delta_php': (b['printed_php'] if b else 0) - (a['printed_php'] if a else 0)})
    paps.append({'label': 'Foreign-assisted projects (FAP)', 'program': 'Foreign-assisted projects',
                 'second_php': totals[0]['foreign_assisted_projects'], 'third_php': totals[1]['foreign_assisted_projects'],
                 'second_pages': fap_pages[0], 'third_pages': fap_pages[1],
                 'delta_php': totals[1]['foreign_assisted_projects'] - totals[0]['foreign_assisted_projects']})
    summary = {'second': summaries[0], 'third': summaries[1],
               'control_deltas_php': {key: totals[1][key] - totals[0][key] for key in totals[0]},
               'status_counts': dict(Counter(r['trace'] for r in projects)),
               'allocation_delta_php': sum(r['delta_php'] for r in projects),
               'positive_delta_php': sum(max(0, r['delta_php']) for r in projects),
               'negative_delta_php': sum(min(0, r['delta_php']) for r in projects)}
    manifest = {'schema_version': 1, 'comparison_ready': False,
                'scope': 'House 2nd and 3rd reading: I-B agency controls; I-C operations allocations',
                'method': 'Unique normalized title, PAP, region, office, allocation kind and local/FAP scope. Repeated keys are grouped without individual pairing. Absence is zero only for the reading-ledger difference; presence alone does not certify a new or removed project.',
                'inputs': {name: digest(DATA / name) for name in INPUTS},
                'generator': {'path': str(Path(__file__).relative_to(REPO)), 'sha256': digest(Path(__file__))},
                'dependencies': {name: digest(REPO / name) for name in (
                    'analysis/builders/house_native.py',
                    'analysis/builders/build_current_pages.py',
                    'analysis/builders/normalize_labels.py',
                    'analysis/builders/chainage.py',
                    'scripts/hb_native_labels.py')},
                'source_documents': documents}
    return {'manifest': manifest, 'summary': summary, 'paps': paps, 'projects': projects}


if __name__ == '__main__':
    data = build()
    # Compact JSON: this ledger is a builder input and download artifact, not a
    # hand-edited document; dropping pretty-print keeps it far under the 100MB
    # git ceiling as chainage evidence accumulates.
    (DATA / 'house_reading_changes_2027.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(data['summary'], indent=2))
