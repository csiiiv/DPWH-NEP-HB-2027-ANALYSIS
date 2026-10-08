#!/usr/bin/env python3
"""Rebuild the DPWH Native I-B additive tree and audit every peso column.

Usage: python3 scripts/hb_native_rollup.py [--check]
--check compares deterministic artifacts without writing them. Exits nonzero
on any unexplained source row, duplicate linkage, or arithmetic discrepancy.
Scope: DPWH summary p9 and detail pp13–110, not the entire I-B volume.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

import pymupdf

from hb_native_extract3 import (build_bands, build_outline, extract_rows,
                               sum_leaf, validate, REGION_RE, DEO_RE, FUNDING_RE)

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / 'HB_BUDGET/2 - HB 10858 VOL IB.pdf'
OUT = ROOT / 'analysis/data/hb_dpwh_native_rollup.json'
REPORT = ROOT / 'analysis/data/hb_native_ib_rollup_audit.json'
COLS = ('ps', 'mooe', 'co', 'total')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    with pymupdf.open(PDF) as doc:
        summary = extract_rows(doc, 8, 9, with_columns=True)
        rows = extract_rows(doc, 12, 110, with_columns=True)
    # The subsequent table uses thousands of pesos and must never be mixed in.
    end = next(i for i, r in enumerate(rows)
               if r['text'].startswith('New Appropriations, by Object of Expenditures'))
    rows = rows[:end]
    bands = build_bands(rows)
    raw = build_outline(rows, bands)
    raw_report = {'checked': 0, 'failed': 0, 'fails': []}
    for n in raw:
        validate(n, raw_report)

    def control(label, source=summary):
        found = [r for r in source if r['text'] == label and r['vals']]
        if len(found) != 1:
            raise ValueError(f'Expected exactly one printed control {label!r}: {found}')
        return found[0]

    nodes, used, repairs = [], set(), []

    def new(label, kind, row, children=None, raw_index=None):
        n = {'id': f'n{len(nodes):04d}', 'kind': kind, 'label': label,
             'printed_amount_php': row['columns_php']['total'],
             'columns_php': row['columns_php'].copy(),
             'source': {'pdf_page': row['page'], 'source_row': row['source_row'],
                        'table': 'summary' if row in summary else 'detail'},
             'children': children or []}
        if raw_index is not None:
            n['source']['raw_root_index'] = raw_index
        nodes.append(n)
        return n

    def import_node(n, kind, raw_index=None):
        used.add(n['source_row'])
        children = [import_node(c, 'funding' if FUNDING_RE.match(c['text']) else
                                'region' if REGION_RE.match(c['text']) else
                                'office' if DEO_RE.search(c['text']) else 'allocation')
                    for c in n['children']]
        return new(n['text'], kind, rows[n['source_row']], children, raw_index)

    gas = new('General Administration and Support', 'section', control('General Administration and Support'))
    s2o = new('Support to Operations', 'section', control('Support to Operations'))
    ops = new('Operations', 'section', control('Operations'))
    local = new('Locally-Funded Project(s)', 'section', control('Locally-Funded Project(s)'))
    fap = new('Foreign-Assisted Project(s)', 'section', control('Foreign-Assisted Project(s)'))
    regular = new('Regular Programs', 'section', control('Total, Regular Programs'), [gas, s2o, ops])
    projects = new('Projects', 'section', control('Total, Projects'), [local, fap])
    root = new('DPWH — Total New Appropriations', 'agency', control('TOTAL NEW APPROPRIATIONS'), [regular, projects])

    program_names = {r['text'] for r in summary if r['text'].endswith('PROGRAM') and r['vals']}
    # Printed closing rows are source boundaries; p26 contains BOTH S2O and ops.
    gas_end = control('Sub-total, General Administration and Support', rows)['source_row']
    s2o_end = control('Sub-total, Support to Operations', rows)['source_row']
    ops_end = control('Sub-total, Operations', rows)['source_row']
    local_end = control('Sub-total, Locally-Funded Project(s)', rows)['source_row']
    current_program = None
    accounted_roots = set()
    for i, n in enumerate(raw):
        sr = n['source_row']
        if n['text'] in program_names:
            program = new(n['text'], 'program', rows[sr], raw_index=i)
            ops['children'].append(program)
            current_program = program
            used.add(sr)
            accounted_roots.add(i)
            repairs.append({'kind': 'reattach_program_banner', 'raw_root_index': i,
                            'source_row': sr, 'label': n['text']})
        elif n['text'].startswith('Locally-Funded Project') and not n['amount']:
            used.add(sr)
            accounted_roots.add(i)
            repairs.append({'kind': 'replace_marker_with_printed_control',
                            'raw_root_index': i, 'label': n['text'],
                            'printed_amount_php': local['printed_amount_php']})
        elif n['text'].startswith('Foreign Assisted-Project') and not n['amount']:
            used.add(sr)
            fap['children'] = [import_node(c, 'fap_project', i) for c in n['children']]
            accounted_roots.add(i)
            repairs.append({'kind': 'replace_marker_with_printed_control',
                            'raw_root_index': i, 'label': n['text'],
                            'printed_amount_php': fap['printed_amount_php']})
        elif n['children']:
            parent = gas if sr < gas_end else s2o if sr < s2o_end else current_program if sr < ops_end else local if sr < local_end else None
            if parent is None:
                raise ValueError(f'Unassigned detail parent: {n["text"]}')
            parent['children'].append(import_node(n, 'activity' if parent in (gas, s2o) else 'pap', i))
            accounted_roots.add(i)
        else:
            # Only collapse an immediately following detail copy. A matching
            # amount elsewhere is not evidence that an allocation is a duplicate.
            following = raw[i + 1] if i + 1 < len(raw) else None
            if not following or not following['children'] or (n['text'], n['columns_php'], n['page']) != (following['text'], following['columns_php'], following['page']):
                raise ValueError(f'Unexplained childless root: {n}')
            used.add(sr)
            accounted_roots.add(i)
            repairs.append({'kind': 'collapse_reprinted_pap_control',
                            'raw_root_index': i, 'retained_raw_root_index': i + 1,
                            'source_row': sr, 'retained_source_row': following['source_row'],
                            'label': n['text'], 'amount_php': n['amount']})
    if accounted_roots != set(range(len(raw))):
        raise ValueError('Not all raw roots accounted for')

    # These rows are additional printed observations of nodes, never allocations.
    closing = {
        'Sub-total, General Administration and Support': gas,
        'Sub-total, Support to Operations': s2o,
        'Sub-total, Operations': ops,
        'Sub-total, Programs': regular,
        'Sub-total, Locally-Funded Project(s)': local,
        'Sub-total, Foreign-Assisted Project(s)': fap,
        'Sub-total, Project(s)': projects,
        'TOTAL NEW APPROPRIATIONS': root,
    }
    closing_checks = []
    for label, node in closing.items():
        r = control(label, rows)
        used.add(r['source_row'])
        diffs = {k: r['columns_php'][k] - node['columns_php'][k] for k in COLS}
        closing_checks.append({'label': label, 'pdf_page': r['page'], 'node_id': node['id'], 'column_differences_php': diffs})

    # Parser duplicate suppression is audited too: adjacent amount rows with
    # identical text, indentation and columns are duplicate printed controls.
    duplicates = []
    amounts = [r for r in rows if r['vals']]
    for j, r in enumerate(amounts):
        if r['source_row'] in used:
            continue
        previous = amounts[j - 1] if j else None
        if previous and previous['source_row'] in used and r['page'] == previous['page'] and r['text'] == previous['text'] and abs(r['x'] - previous['x']) < 0.5 and r['columns_php'] == previous['columns_php']:
            used.add(r['source_row'])
            duplicates.append({'source_row': r['source_row'], 'retained_source_row': previous['source_row'], 'label': r['text'], 'pdf_page': r['page']})
    unexplained = [r for r in amounts if r['source_row'] not in used]

    checks, leaf_rows, seen = [], [], set()

    def rollup(n, path):
        if n['id'] in seen:
            raise ValueError(f'Multiple paths to {n["id"]}')
        seen.add(n['id'])
        path = path + [n['id']]
        child_leaves = [rollup(c, path) for c in n['children']]
        recursive = {k: sum(c[k] for c in child_leaves) for k in COLS} if child_leaves else n['columns_php'].copy()
        direct = {k: sum(c['columns_php'][k] for c in n['children']) for k in COLS} if child_leaves else None
        n['recursive_leaf_sum_php'] = recursive['total']
        n['children_sum_php'] = direct['total'] if direct else None
        n['difference_php'] = recursive['total'] - n['printed_amount_php']
        n['column_leaf_sums_php'] = recursive
        partition_diff = sum(n['columns_php'][k] for k in ('ps', 'mooe', 'co')) - n['columns_php']['total']
        columns_balanced = all(recursive[k] == n['columns_php'][k] and
                               (direct is None or direct[k] == n['columns_php'][k])
                               for k in COLS)
        n['status'] = 'mismatch' if partition_diff or not columns_balanced else 'balanced' if n['children'] else 'leaf'
        check = {'node_id': n['id'], 'path': path, 'label': n['label'], 'kind': n['kind'],
                 'pdf_page': n['source']['pdf_page'], 'row_partition_difference_php': partition_diff}
        if direct is not None:
            check.update(direct_differences_php={k: direct[k] - n['columns_php'][k] for k in COLS},
                         recursive_differences_php={k: recursive[k] - n['columns_php'][k] for k in COLS})
            n['progressive_rollup'] = []
            running = 0
            for c in n['children']:
                running += c['recursive_leaf_sum_php']
                n['progressive_rollup'].append({'child_id': c['id'], 'cumulative_php': running,
                                              'remaining_php': n['printed_amount_php'] - running})
        else:
            if n['source']['source_row'] in leaf_rows:
                raise ValueError('Source allocation consumed twice')
            leaf_rows.append(n['source']['source_row'])
        checks.append(check)
        return recursive

    totals = rollup(root, [])
    if len(seen) != len(nodes):
        raise ValueError('Unreachable nodes')
    failures = [c for c in checks if c['row_partition_difference_php'] or
                any(c.get('direct_differences_php', {}).values()) or
                any(c.get('recursive_differences_php', {}).values())]
    closing_failures = [c for c in closing_checks if any(c['column_differences_php'].values())]
    audit = {
        'scope': 'DPWH only: VOL I-B summary p9, peso detail pp13–110; object expenditure table excluded',
        'units': 'PHP', 'raw_internal_checks': raw_report,
        'summary': {'nodes': len(nodes), 'leaves': len(leaf_rows),
                    'internal_nodes': sum(bool(n['children']) for n in nodes),
                    'row_partition_checks': len(checks),
                    'direct_column_checks': 4 * sum(bool(n['children']) for n in nodes),
                    'recursive_column_checks': 4 * sum(bool(n['children']) for n in nodes),
                    'closing_control_checks': len(closing_checks),
                    'failed_nodes': len(failures), 'failed_closing_controls': len(closing_failures),
                    'unexplained_amount_rows': len(unexplained),
                    'additive_leaf_total_php': totals['total'],
                    'raw_leaf_total_php': sum(sum_leaf(n) for n in raw),
                    'double_count_removed_php': sum(sum_leaf(n) for n in raw) - totals['total'],
                    'leaf_columns_php': totals,
                    'repair_counts': dict(Counter(r['kind'] for r in repairs)),
                    'parser_duplicate_rows': len(duplicates)},
        'repairs': repairs, 'parser_duplicate_rows': duplicates,
        'unexplained_amount_rows': unexplained, 'failures': failures,
        'closing_checks': closing_checks, 'checks': checks,
        'remaining_gaps': [
            {'kind': 'granularity', 'description': 'I-B local leaves are office allocations, not named infrastructure projects. Native I-C extraction is still required for project title coverage.'},
            {'kind': 'scope', 'description': 'Other I-B departments and the separate thousands-of-pesos object table are outside this DPWH rollup.'},
        ],
        'provenance_sha256': {str(p.relative_to(ROOT)): digest(p) for p in
                              (PDF, Path(__file__), ROOT / 'scripts/hb_native_extract3.py')},
    }
    artifact = {'schema_version': 1, 'units': 'PHP', 'scope': audit['scope'],
                'root': root, 'audit_summary': audit['summary'],
                'provenance_sha256': audit['provenance_sha256']}
    return artifact, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    tree, audit = build()
    for path, value in ((OUT, tree), (REPORT, audit)):
        encoded = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            if not path.exists() or path.read_text() != encoded:
                raise SystemExit(f'Stale artifact: {path.relative_to(ROOT)}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(encoded)
    print(json.dumps(audit['summary'], indent=2))
    if audit['summary']['failed_nodes'] or audit['summary']['failed_closing_controls'] or audit['summary']['unexplained_amount_rows'] or audit['raw_internal_checks']['failed']:
        raise SystemExit('Native rollup has unresolved discrepancies; see audit JSON')


if __name__ == '__main__':
    main()
