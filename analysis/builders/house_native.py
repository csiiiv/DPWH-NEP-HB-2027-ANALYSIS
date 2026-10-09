"""Adapt native House controls and detail to comparison records without OCR.

All operations allocations are retained. Regional/office/block allocations
remain identified as allocations; FAP totals consume funding children once.
"""
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from hb_native_labels import control_key, unenumerated


def walk(node):
    yield node
    for child in node['children']:
        yield from walk(child)


def validate_native_detail(ic, audit, repo):
    """Check retained source hashes, title ownership, and every additive node."""
    if ic['schema_version'] != 2 or ic['audit_summary'] != audit['summary']:
        raise ValueError('Native House artifact/audit version mismatch')
    if ic['provenance_sha256'] != audit['provenance_sha256']:
        raise ValueError('Native House provenance mismatch')
    for name, expected in ic['provenance_sha256'].items():
        if hashlib.sha256((repo / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f'Stale native House source: {name}')
    for key in ('failed_nodes', 'failed_closing_controls', 'unexplained_amount_rows',
                'crossvolume_disagreements', 'unexplained_title_rows'):
        if audit['summary'][key]:
            raise ValueError(f'Native House audit failure: {key}')
    seen, allocations, title_rows = set(), set(), set()
    def check(n):
        if n['id'] in seen:
            raise ValueError('Repeated native House node')
        seen.add(n['id'])
        lines = n['source'].get('title_rows', [])
        if lines:
            label = re.sub(r'\s+', ' ', ' '.join(r['text'] for r in lines).replace('\x00', ' ')).strip()
            if label != n['label'] or lines[0]['source_row'] != n['source']['source_row']:
                raise ValueError(f'Native House title/source mismatch: {n["id"]}')
            for row in lines:
                if row['source_row'] in title_rows:
                    raise ValueError('Native House continuation consumed twice')
                title_rows.add(row['source_row'])
        total = sum(check(c) for c in n['children']) if n['children'] else n['printed_amount_php']
        if not n['children']:
            sr = n['source']['source_row']
            if sr in allocations:
                raise ValueError('Native House allocation consumed twice')
            allocations.add(sr)
        if total != n['printed_amount_php'] or total != n['recursive_leaf_sum_php'] or n['difference_php']:
            raise ValueError(f'Native House rollup failed: {n["id"]}')
        return total
    total = check(ic['root'])
    if total != audit['summary']['additive_leaf_total_php'] or len(seen) != audit['summary']['nodes']:
        raise ValueError('Native House summary differs from hierarchy')


def printed_controls(ib):
    nodes = list(walk(ib['root']))
    sections = {n['label']: n for n in nodes if n['kind'] == 'section'}
    values = {'new_appropriations': ib['root']['printed_amount_php'],
              'personnel_services': ib['root']['columns_php']['ps'],
              'mooe': ib['root']['columns_php']['mooe'],
              'capital_outlays': ib['root']['columns_php']['co']}
    for key, label in [('gas_total', 'General Administration and Support'),
                       ('s2o_total', 'Support to Operations'),
                       ('regular_operations', 'Operations'),
                       ('local_projects', 'Locally-Funded Project(s)'),
                       ('foreign_assisted_projects', 'Foreign-Assisted Project(s)')]:
        values[key] = sections[label]['printed_amount_php']
    values['operations_including_projects'] = sum(values[k] for k in
        ('regular_operations', 'local_projects', 'foreign_assisted_projects'))
    return values


def comparison_inputs(ic, ib, controls, pap_programs, canonical_region):
    """Return records, mapped PAP observations, and printed I-B controls."""
    keys = {control_key(name): name for name in controls}
    if len(keys) != len(controls):
        raise ValueError('Ambiguous canonical NEP PAP labels')
    records, paps = [], {}
    ops = next(n for n in walk(ic['root']) if n['label'] == 'OPERATIONS')

    def visit(n, ancestors=(), pap=None, reg='', office='', zone='local', program=None):
        text = unenumerated(n['label'])
        if text == 'FOREIGN-ASSISTED PROJECTS':
            zone = 'fap'
        if n['kind'] == 'region':
            reg = canonical_region(text)
        if n['kind'] == 'office':
            office = text
        if zone == 'fap' and n['kind'] == 'program':
            program = text.title()
            # Keep the existing NEP program spelling.
            program = next((p for p in set(pap_programs.values())
                            if control_key(p) == control_key(text)), program)
        name = keys.get(control_key(n['label'], ancestors))
        if zone == 'local' and name and n['kind'] in ('pap', 'program'):
            pap = name
            if name in paps:
                raise ValueError(f'Duplicate House control: {name}')
            paps[name] = {'pap': name, 'printed_php': n['printed_amount_php'],
                          'source_pages': [n['source']['pdf_page']], 'node_id': n['id']}
        if n['kind'] == 'fap_project' or not n['children']:
            if zone == 'local' and pap is None:
                raise ValueError(f'Unmapped House allocation: {n["label"]}')
            if zone == 'fap' and n['kind'] != 'fap_project':
                raise ValueError(f'Unexpected FAP terminal: {n["label"]}')
            funding = {}
            if zone == 'fap':
                for c in n['children']:
                    if c['kind'] != 'funding' or c['label'] in funding:
                        raise ValueError(f'Invalid funding partition: {n["label"]}')
                    funding[c['label']] = c['printed_amount_php']
                for observation in n['source'].get('zero_funding', []):
                    if observation['label'] in funding:
                        raise ValueError('Repeated zero funding observation')
                    funding[observation['label']] = 0
                if sum(funding.values()) != n['printed_amount_php']:
                    raise ValueError(f'Unbalanced FAP project: {n["label"]}')
            records.append({'id': 'hb:ic:' + n['id'], 'native_node_id': n['id'],
                            'title': text if zone == 'fap' else n['label'],
                            'amount_php': n['printed_amount_php'],
                            'pap': pap if zone == 'local' else 'Foreign-assisted projects',
                            'pap_id': controls[pap]['id'] if zone == 'local' else 'fap:' + program,
                            'program': pap_programs[pap] if zone == 'local' else program,
                            'zone': zone, 'region': reg or 'Nationwide', 'office': office,
                            'record_kind': n['kind'], 'pdf_page': n['source']['pdf_page'],
                            'source': n['source'],
                            'evidence': 'native_text_title_recovered' if n.get('title_recovered_from_wraps')
                                        else 'native_text', 'funding_php': funding})
            return
        for child in n['children']:
            visit(child, ancestors + (n['label'],), pap, reg, office, zone, program)

    visit(ops)
    for name, control in paps.items():
        extracted = sum(r['amount_php'] for r in records if r['zone'] == 'local' and r['pap'] == name)
        control['extracted_php'] = extracted
        control['difference_php'] = extracted - control['printed_php']
        if control['difference_php']:
            raise ValueError(f'House PAP allocation gap: {name}')
    if sum(r['amount_php'] for r in records) != ops['printed_amount_php']:
        raise ValueError('House operations records do not reproduce I-C control')
    return records, paps, printed_controls(ib)
