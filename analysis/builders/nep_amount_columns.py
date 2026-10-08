"""Retain per-item expense basis and page-specific printed-column geometry."""
from collections import Counter
import json
import hashlib


def column_roles(sections):
    roles = [c['role'] for c in sections if c['role'] != 'Labels']
    if roles == ['PS', 'MOOE', 'CO', 'Total']:
        return dict(zip(roles, ['ps', 'mooe', 'co', 'total']))
    if roles == ['Amount 1', 'Amount 2', 'Amount 3']:
        return dict(zip(roles, ['ps', 'mooe', 'total']))
    if roles == ['Amount 1', 'Amount 2', 'Amount 3', 'Amount 4']:
        return dict(zip(roles, ['ps', 'mooe', 'co', 'total']))
    raise ValueError(f'Unrecognized operating-unit column layout: {roles}')


def annotate_amount_columns(nodes, raw_ou, page_dir):
    """Inspect every node; distinguish class allocations from full printed rows.

    Omitted columns remain None, not fabricated zeroes. Full operating-unit
    row amounts are context and must not enter a class-specific additive sum.
    """
    lookup = {n['id']: n for n in raw_ou}
    pages = {}
    partitions = []
    for n in nodes.values():
        current = n
        while current['parent'] and current['kind'] != 'expense_class':
            current = nodes[current['parent']]
        basis = {'ps': 'ps', 'p115:r0': 'mooe', 'p144:r0': 'co'}.get(current['id'], 'total')
        n['amount_basis'] = basis
        s = n['source']; pn = s.get('pdf_page')
        if not s.get('bbox') or n['printed_amount_php'] is None:
            continue
        if pn not in pages:
            pages[pn] = json.loads((page_dir / f'page-{pn:04}.json').read_text())['column_sections']
        sections = pages[pn]
        if s['table'] == 'by_ou':
            raw = lookup[s['source_id']]
            mapping = column_roles(sections)
            columns = {k: None for k in ('ps', 'mooe', 'co', 'total')}
            for role, value in raw.get('amounts', {}).items():
                if role not in mapping: raise ValueError(f'Unknown role {role}: {n["id"]}')
                columns[mapping[role]] = value['value']
            if columns['ps'] != n['printed_amount_php']:
                raise ValueError(f'Retained PS amount disagrees with its source column: {n["id"]}')
            if columns['total'] is None:
                raise ValueError(f'Missing printed full-row total: {n["id"]}')
            difference = sum(columns[k] or 0 for k in ('ps', 'mooe', 'co')) - columns['total']
            partitions.append({'id': n['id'], 'columns_php': columns,
                               'known_columns_minus_total_php': difference})
            if difference: raise ValueError(f'Printed row partition mismatch: {n["id"]}')
            n['source_row_columns_php'] = columns
            s['expense_column_roles'] = mapping
            role = next(k for k,v in mapping.items() if v == 'ps')
        else:
            # PAP pages are class-specific amounts, not four-column item totals.
            role = 'Amount 1'
            n['source_row_columns_php'] = {k: n['printed_amount_php'] if k == basis else None
                                           for k in ('ps', 'mooe', 'co', 'total')}
        section = next((c for c in sections if c['role'] == role), None)
        if not section: raise ValueError(f'Missing amount column {role}: {n["id"]}, page {pn}')
        s['amount_role'] = role
        s['amount_column_polygon'] = section['polygon']
    return {'nodes_reassessed': len(nodes),
            'basis_counts': dict(Counter(n['amount_basis'] for n in nodes.values())),
            'operating_unit_row_checks': partitions,
            'page_geometry_sha256': {str(p):hashlib.sha256((page_dir/f'page-{p:04}.json').read_bytes()).hexdigest() for p in pages},
            'policy': 'Class amounts and full printed operating-unit row totals are distinct. Missing/blank columns are not invented zeros. Column/text support does not certify row identity or image accuracy.'}


def inside_column(polygon, x, y):
    """Interpolate the sloping left/right page boundaries at the token's y."""
    t = (y - polygon[0][1]) / (polygon[3][1] - polygon[0][1])
    left = polygon[0][0] + t * (polygon[3][0] - polygon[0][0])
    right = polygon[1][0] + t * (polygon[2][0] - polygon[1][0])
    return left <= x <= right
