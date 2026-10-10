#!/usr/bin/env python3
"""Build the additive Native I-C named-project tree and audit every peso.

I-C prints DPWH detail by expense class: MAINTENANCE AND OTHER OPERATING
EXPENSES (pp9–45, before the CO banner) and CAPITAL OUTLAYS (pp45–942).
Both classes retain their own GAS/S2O allocations once; repeated NCR/CO
observations do not add allocations. I-C prints no PS detail, so its root
is MOOE+CO; PS is independently checked against the I-B summary.

Additive hierarchy assembled from the extractor's outline:

  root (derived: MOOE + CO)
  ├─ MAINTENANCE AND OTHER OPERATING EXPENSES   [GAS₉ + S2O₉]
  └─ CAPITAL OUTLAYS
     ├─ GENERAL ADMINISTRATIVE AND SUPPORT
     ├─ SUPPORT TO OPERATIONS
     └─ OPERATIONS
        ├─ ORGANIZATIONAL OUTCOME 1 (APP, NDP, Bridge)
        ├─ ORGANIZATIONAL OUTCOME 2 (Flood Management)
        ├─ CONVERGENCE AND SPECIAL SUPPORT PROGRAM
        ├─ LOCALLY-FUNDED PROJECTS
        └─ FOREIGN-ASSISTED PROJECTS (outcomes → PAPs → projects → funding)

Cross-volume check: every printed program/PAP control shared with the
additive Native I-B baseline must agree to the peso.

Usage: python3 scripts/hb_native_ic_rollup.py [--check] [--pdf PATH] [--ib-rollup PATH] [--out PATH] [--report PATH]
Exits nonzero on any unexplained source row or arithmetic discrepancy.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf

from hb_native_labels import control_key, unenumerated
from hb_native_ic_extract import (FUNDING_RE, REGION_RE, attach_post_wraps,
                                  build_bands, build_outline, extract_rows,
                                  sum_leaf)

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / 'HB_BUDGET/3 - HB 10858 VOL IC.pdf'
IB_ROLLUP = ROOT / 'analysis/data/hb_dpwh_native_rollup.json'
OUT = ROOT / 'analysis/data/hb_dpwh_native_ic_projects.json'
REPORT = ROOT / 'analysis/data/hb_dpwh_native_ic_rollup_audit.json'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def classify(raw_node, zone, ancestors=()):
    text = unenumerated(raw_node['text'])
    if FUNDING_RE.match(text):
        return 'funding'
    if text in ('GENERAL ADMINISTRATIVE AND SUPPORT', 'SUPPORT TO OPERATIONS',
                'LOCALLY-FUNDED PROJECTS', 'FOREIGN-ASSISTED PROJECTS'):
        return 'section'
    if text.startswith('ORGANIZATIONAL OUTCOME'):
        return 'outcome'
    if REGION_RE.match(text) or text.startswith('Bangsamoro Autonomous Region'):
        return 'region'
    if (re.search(r'(?:Engineering Office(?: \d+)?|Central Office|Regional Office|District Office|Bureau Proper)$', text)
            or re.fullmatch(r'Regional Office [A-Z0-9 -]+(?: Region)?(?: \([^)]*\))?', text)) and not re.match(
            r'^(Construction|Rehabilitation|Repair|Improvement|Completion|Upgrading|Procurement)\b', text, re.I):
        return 'office'
    if zone == 'fap' and raw_node['children'] and all(
            FUNDING_RE.match(unenumerated(c['text'])) for c in raw_node['children']):
        return 'fap_project'
    if text.casefold().endswith('program'):
        return 'program'
    if raw_node['children']:
        return 'pap' if zone in ('local', 'fap') else 'activity'
    if raw_node.get('bold') or zone == 'support' or any(
            'Public-Private Partnership Strategic Support Fund' in a for a in ancestors):
        return 'allocation'
    return 'project'


def build(pdf=PDF, ib_rollup=IB_ROLLUP):
    pdf = Path(pdf).resolve()
    ib_rollup = Path(ib_rollup).resolve()
    with pymupdf.open(pdf) as doc:
        rows = extract_rows(doc, 8, len(doc))
    bands = build_bands(rows)
    raw, skipped, suppressed = build_outline(rows, bands)
    # recover \\x00 artifact titles from their wrap continuations
    raw = attach_post_wraps(raw, rows, bands)
    by_source = {r['source_row']: r for r in rows}
    title_sources = set()
    def record_titles(n):
        title_sources.update(n['title_rows'])
        title_sources.update(n.get('zero_funding_rows', []))
        for child in n['children']:
            record_titles(child)
    for top in raw:
        record_titles(top)
    unexplained_titles = [r for r in rows if not r['amounts'] and r['source_row'] not in title_sources]


    nodes, used, repairs = [], set(), []

    def new(label, kind, row, children=None):
        n = {'id': f'c{len(nodes):04d}', 'kind': kind, 'label': label,
             'printed_amount_php': row['amounts'][-1],
             'source': {'pdf_page': row['page'], 'source_row': row['source_row']},
             'children': children if children is not None else []}
        nodes.append(n)
        return n

    def import_node(raw_node, zone, ancestors=()):
        row = by_source[raw_node['source_row']]
        used.add(row['source_row'])
        kind = classify(raw_node, zone, ancestors)
        children = [import_node(c, zone, ancestors + (raw_node['text'],))
                    for c in raw_node['children']]
        # label from the outline node (post-wrap artifact recovery may have
        # replaced an unreadable \x00 first line with the wrapped title);
        # stray mid-title null glyphs (page-break artifacts) become spaces
        label = raw_node['text'] or row['text']
        label = re.sub(r'\s+', ' ', label.replace('\x00', ' ')).strip()
        n = new(label, kind, row, children)
        n['source']['title_rows'] = [
            {'source_row': sr, 'pdf_page': by_source[sr]['page'],
             'text': by_source[sr]['text']} for sr in raw_node['title_rows']]
        if raw_node.get('zero_funding_rows'):
            n['source']['zero_funding'] = [
                {'label': by_source[sr]['text'].rstrip(' -'), 'amount_php': 0,
                 'pdf_page': by_source[sr]['page'], 'source_row': sr}
                for sr in raw_node['zero_funding_rows']]
        if raw_node.get('null_glyph_cleanup'):
            n['null_glyph_cleanup'] = True
            repairs.append({'kind': 'null_glyph_cleanup', 'node_id': n['id'],
                            'pdf_page': n['source']['pdf_page']})
        if raw_node.get('title_recovered_from_wraps'):
            n['title_recovered_from_wraps'] = True
            repairs.append({'kind': 'recover_artifact_title', 'node_id': n['id'],
                            'label': n['label'][:70],
                            'pdf_page': n['source']['pdf_page']})
        if raw_node.get('family_container'):
            n['family_container'] = True
            repairs.append({'kind': 'fold_family_container', 'node_id': n['id'],
                            'label': n['label'][:70],
                            'pdf_page': n['source']['pdf_page']})
        if raw_node.get('second_observation'):
            n['second_observation'] = True
            repairs.append({'kind': 'retain_second_observation', 'node_id': n['id'],
                            'label': n['label'][:70],
                            'pdf_page': n['source']['pdf_page']})
        if raw_node.get('reference'):
            n['additive'] = False
            repairs.append({'kind': 'retain_reference', 'node_id': n['id'],
                            'label': n['label'][:70],
                            'pdf_page': n['source']['pdf_page']})
        return n

    # group the extractor's top-level nodes by text
    tops = {}
    for t in raw:
        tops.setdefault(t['text'], []).append(t)

    def one(text):
        found = tops.get(text, [])
        if len(found) != 1:
            raise ValueError(f'Expected exactly one {text!r}: {len(found)}')
        return found[0]

    moee_banner = one('MAINTENANCE AND OTHER OPERATING EXPENSES')
    co_banner = one('CAPITAL OUTLAYS')
    # collect section copies (MOOE p9 vs CO p45+)
    gas_copies = tops.get('GENERAL ADMINISTRATIVE AND SUPPORT', [])
    s2o_copies = tops.get('SUPPORT TO OPERATIONS', [])
    gas_mooe = next(t for t in gas_copies if t['page'] < 45)
    gas_co = next(t for t in gas_copies if t['page'] >= 45)
    s2o_mooe = next(t for t in s2o_copies if t['page'] < 45)
    s2o_co = next(t for t in s2o_copies if t['page'] >= 45)
    ops_banner = one('OPERATIONS')

    # OPERATIONS children: every top-level node printed after the OPERATIONS
    # banner (outcome banners at LEVEL_PROGRAM and LFP/FAP section banners)
    ops_idx = raw.index(ops_banner)
    ops_children_raw = raw[ops_idx + 1:]
    ops_child_labels = [t['text'] for t in ops_children_raw]
    if ops_child_labels != ['ORGANIZATIONAL OUTCOME 1 : Ensure Safe and Reliable National Road System',
                            'ORGANIZATIONAL OUTCOME 2 : Protect Lives and Properties Against Major Floods',
                            'CONVERGENCE AND SPECIAL SUPPORT PROGRAM',
                            'LOCALLY-FUNDED PROJECTS',
                            'FOREIGN-ASSISTED PROJECTS']:
        raise ValueError(f'Unexpected OPERATIONS children: {ops_child_labels}')

    # ---- assemble additive hierarchy -------------------------------------------
    ops = new('OPERATIONS', 'section', by_source[ops_banner['source_row']],
              [import_node(t, 'fap' if t['text'] == 'FOREIGN-ASSISTED PROJECTS' else 'local')
               for t in ops_children_raw])
    co = new('CAPITAL OUTLAYS', 'expense_class', by_source[co_banner['source_row']],
             [import_node(gas_co, 'support'), import_node(s2o_co, 'support'), ops])
    moee = new('MAINTENANCE AND OTHER OPERATING EXPENSES', 'expense_class',
               by_source[moee_banner['source_row']],
               [import_node(gas_mooe, 'support'), import_node(s2o_mooe, 'support')])
    moee_amt = by_source[moee_banner['source_row']]['amounts'][-1]
    co_amt = by_source[co_banner['source_row']]['amounts'][-1]
    root = {'id': 'root', 'kind': 'root',
            'label': 'DPWH FY2027 — House Bill 10858 VOL I-C (additive detail)',
            'printed_amount_php': moee_amt + co_amt, 'derived': True,
            'source': {'pdf_page': 9, 'source_row': None},
            'children': [moee, co]}
    nodes.append(root)

    # ---- closing controls --------------------------------------------------------
    closing = []

    def close(label, raw_node, sum_value):
        row = by_source[raw_node['source_row']]
        used.add(row['source_row'])
        closing.append({'label': label, 'pdf_page': row['page'],
                        'printed_php': row['amounts'][-1],
                        'observed_sum_php': sum_value,
                        'difference_php': row['amounts'][-1] - sum_value})

    used.update({moee_banner['source_row'], co_banner['source_row'], ops_banner['source_row']})
    close('OPERATIONS = outcomes sum', ops_banner,
          sum(sum_leaf(t) for t in ops_children_raw))
    close('CAPITAL OUTLAYS = GAS+S2O+OPS (CO copy)', co_banner,
          sum_leaf(gas_co) + sum_leaf(s2o_co) + sum(sum_leaf(t) for t in ops_children_raw))
    close('MOOE = GAS+S2O (MOOE copy)', moee_banner,
          sum_leaf(gas_mooe) + sum_leaf(s2o_mooe))
    # the MOOE copies' own banners are consumed as observations, not allocations
    for copy in (gas_mooe, s2o_mooe):
        used.add(copy['source_row'])

    unexplained = [r for r in rows if r['amounts'] and r['source_row'] not in used]

    # rows the outline retained as second-observation wrappers (previously
    # suppressed rollup echoes) are now nodes; the suppressed list only still
    # receives rows that failed to attach. FAP funding-summary references are
    # imported as non-additive nodes and excluded from allocation accounting.
    echo_nodes = [n for n in nodes if n.get('second_observation')]
    reference_nodes = [n for n in nodes if n.get('additive') is False]

    # ---- recursive rollup --------------------------------------------------------
    checks, leaf_rows, seen, allocation_sources = [], [], set(), set()

    def rollup(n, path):
        if n['id'] in seen:
            raise ValueError(f'Multiple paths to {n["id"]}')
        seen.add(n['id'])
        path = path + [n['id']]
        printed = n['printed_amount_php']
        if n.get('additive') is False:
            # Non-additive printed reference (banner echo / FAP funding
            # summary). Still walk nested echo children so every provenance
            # node is visited; they contribute nothing to parent sums.
            for c in n['children']:
                rollup(c, path)
            n['recursive_leaf_sum_php'] = None
            n['difference_php'] = None
            return 0
        child_sums = [rollup(c, path) for c in n['children']]
        # children that are all non-additive references carry no detail:
        # the node is its own allocation (banner trio pattern).
        leaf_sum = sum(child_sums) if any(c.get('additive') is not False
                                          for c in n['children']) else printed
        n['recursive_leaf_sum_php'] = leaf_sum
        n['difference_php'] = leaf_sum - printed
        if any(c.get('additive') is not False for c in n['children']):
            n['progressive_rollup'] = []
            running = 0
            for c in n['children']:
                if c.get('additive') is False:
                    continue
                running += c['recursive_leaf_sum_php']
                n['progressive_rollup'].append({'child_id': c['id'], 'cumulative_php': running,
                                                'remaining_php': printed - running})
            checks.append({'node_id': n['id'], 'path': path, 'label': n['label'][:80],
                           'kind': n['kind'], 'pdf_page': n['source']['pdf_page'],
                           'printed_amount_php': printed,
                           'recursive_leaf_sum_php': leaf_sum,
                           'difference_php': n['difference_php']})
        else:
            if n['source']['source_row'] in allocation_sources:
                raise ValueError('Source allocation consumed twice')
            allocation_sources.add(n['source']['source_row'])
            leaf_rows.append(n['source']['source_row'])
        return leaf_sum

    total = rollup(root, [])

    # ---- cross-volume check vs Native I-B ---------------------------------------
    # I-B additive baseline: Regular Programs (GAS+S2O+Operations, including
    # Personnel Services) + Projects (LFP+FAP). I-C prints no PS detail and
    # nests LFP/FAP inside OPERATIONS, so the like-for-like controls are:
    #   1. I-C (OO1+OO2+CSSP)  ==  I-B Operations section
    #   2. I-C LFP             ==  I-B Locally-Funded Project(s)
    #   3. I-C FAP             ==  I-B Foreign-Assisted Project(s)
    #   4. I-C MOOE+CO + independently printed I-B PS == I-B total
    ib = json.loads(Path(ib_rollup).read_text())

    def ib_find(label):
        for n in _ib_control_iter(ib['root']):
            if n.get('label') == label:
                return n
        return None

    ic_ops = next(n for n in nodes if n['label'] == 'OPERATIONS')
    ic_lfp = next((n for n in nodes if n['label'].startswith('LOCALLY-FUNDED')), None)
    ic_fap = next((n for n in nodes if n['label'].startswith('FOREIGN-ASSISTED')), None)
    ib_ops = ib_find('Operations')
    ib_lfp = ib_find('Locally-Funded Project(s)')
    ib_fap = ib_find('Foreign-Assisted Project(s)')
    ib_total = ib['root']['printed_amount_php']

    # I-C programs printed under OPERATIONS before LFP/FAP
    outcome_programs = [c for c in ic_ops['children'] if c is not ic_lfp and c is not ic_fap]
    ic_ops_core = sum(c['printed_amount_php'] for c in outcome_programs)

    shared = []

    def check(label, ic_value, ib_value):
        shared.append({'label': label, 'ic_php': ic_value, 'ib_php': ib_value,
                       'difference_php': ic_value - ib_value})

    check('Operations core (OO1+OO2+CSSP) vs I-B Operations', ic_ops_core,
          ib_ops['printed_amount_php'])
    check('LFP', ic_lfp['printed_amount_php'], ib_lfp['printed_amount_php'])
    check('FAP', ic_fap['printed_amount_php'], ib_fap['printed_amount_php'])
    ps_implied = ib_total - root['printed_amount_php']
    check('I-C MOOE+CO + printed I-B PS vs I-B total',
          root['printed_amount_php'] + ib['root']['columns_php']['ps'], ib_total)
    check('Implied PS vs I-B PS column', ps_implied, ib['root']['columns_php']['ps'])
    check('MOOE vs I-B MOOE column', moee_amt, ib['root']['columns_php']['mooe'])
    check('Capital Outlays vs I-B CO column', co_amt, ib['root']['columns_php']['co'])
    for expense, copies in (('mooe', (gas_mooe, s2o_mooe)), ('co', (gas_co, s2o_co))):
        for title, copy in zip(('General Administration and Support', 'Support to Operations'), copies):
            check(f'{title} ({expense})', copy['amount'], ib_find(title)['columns_php'][expense])

    # Every I-B local PAP/program has an explicitly matched I-C control.
    # Family parts inherit their printed family label (e.g. '- Primary Roads').
    local_index = {}
    def index_control(node, ancestors=()):
        if node['kind'] in ('program', 'pap'):
            local_index.setdefault(control_key(node['label'], ancestors), []).append(node)
        for child in node['children']:
            index_control(child, ancestors + (node['label'],))
    for top in ic_ops['children']:
        if top is not ic_fap:
            index_control(top)
    for control in _ib_control_iter(ib['root']):
        if control['kind'] not in ('program', 'pap'):
            continue
        candidates = local_index.get(control_key(control['label']), [])
        if len(candidates) != 1:
            raise ValueError(f"Expected one I-C control for {control['label']!r}: {len(candidates)}")
        check('PAP/program: ' + control['label'], candidates[0]['printed_amount_php'],
              control['columns_php']['mooe'] + control['columns_php']['co'])


    # ---- audit -------------------------------------------------------------------
    failures = [c for c in checks if c['difference_php']]
    closing_failures = [c for c in closing if c['difference_php']]
    crossvolume_failures = [s for s in shared if s['difference_php']]
    kinds = Counter(n['kind'] for n in nodes)
    audit = {
        'scope': 'DPWH VOL I-C project details pp9–942 (native text layer)',
        'units': 'PHP',
        'summary': {
            'nodes': len(nodes), 'leaves': len(leaf_rows),
            'internal_nodes': sum(1 for n in nodes if n['children']),
            'recursive_checks': len(checks), 'failed_nodes': len(failures),
            'closing_control_checks': len(closing), 'failed_closing_controls': len(closing_failures),
            'unexplained_amount_rows': len(unexplained),
            'unexplained_title_rows': len(unexplained_titles),
            'retained_second_observations': len(echo_nodes),
            'retained_reference_nodes': len(reference_nodes),
            'additive_leaf_total_php': total,
            'named_project_leaves': sum(n['kind'] == 'project' and not n['children'] for n in nodes),
            'fap_projects': kinds.get('fap_project', 0),
            'zero_funding_observations': sum(len(n['source'].get('zero_funding', [])) for n in nodes),
            'region_nodes': kinds.get('region', 0), 'office_nodes': kinds.get('office', 0),
            'funding_leaves': kinds.get('funding', 0),
            'shared_controls_with_ib': len(shared),
            'crossvolume_disagreements': len(crossvolume_failures),
            'repair_counts': dict(Counter(r['kind'] for r in repairs)),
        },
        'repairs': repairs, 'failures': failures, 'closing_checks': closing,
        'retained_second_observations': [
            {'node_id': n['id'], 'label': n['label'][:80], 'kind': n['kind'],
             'pdf_page': n['source']['pdf_page'], 'printed_php': n['printed_amount_php']}
            for n in echo_nodes],
        'retained_reference_nodes': [
            {'node_id': n['id'], 'label': n['label'][:80], 'kind': n['kind'],
             'pdf_page': n['source']['pdf_page'], 'printed_php': n['printed_amount_php']}
            for n in reference_nodes],
        'crossvolume_controls': shared, 'crossvolume_failures': crossvolume_failures,
        'implied_personnel_services_php': ps_implied,
        'unexplained_amount_rows': [
            {'pdf_page': r['page'], 'text': r['text'][:80], 'amounts': r['amounts']}
            for r in unexplained],
        'unexplained_title_rows': unexplained_titles,
        'skipped_rows': [{'pdf_page': r['page'], 'text': r['text'][:80],
                          'amounts': r['amounts']} for r in skipped],
        'remaining_gaps': [
            {'kind': 'artifacts',
             'description': 'One standalone null title on p490 is recovered from following lines; three trailing nulls on pp561/800 are cleaned without changing title ownership.'},
            {'kind': 'scope',
             'description': 'I-C prints no Personnel Services detail; the I-C additive root is MOOE+CO (₱639,179,718,000). Implied PS = I-B total − I-C total = '
                            f'₱{ps_implied:,}.'},
        ],
        'provenance_sha256': {str(Path(p).relative_to(ROOT)): digest(p) for p in
                              (pdf, Path(ib_rollup), Path(__file__),
                               ROOT / 'scripts/hb_native_ic_extract.py',
                               ROOT / 'scripts/hb_native_labels.py')},
    }
    artifact = {'schema_version': 2, 'units': 'PHP', 'scope': audit['scope'],
                'root': root, 'audit_summary': audit['summary'],
                'provenance_sha256': audit['provenance_sha256']}
    return artifact, audit


def _ib_control_iter(node):
    yield node
    for child in node.get('children', []):
        yield from _ib_control_iter(child)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--pdf', default=str(PDF),
                        help='input VOL I-C PDF (default: certified 2nd-reading copy)')
    parser.add_argument('--ib-rollup', default=str(IB_ROLLUP),
                        help='Native I-B additive tree used for cross-volume checks')
    parser.add_argument('--out', default=str(OUT), help='output additive tree JSON')
    parser.add_argument('--report', default=str(REPORT), help='output audit JSON')
    args = parser.parse_args()
    tree, audit = build(Path(args.pdf), Path(args.ib_rollup))
    for path, value in ((Path(args.out), tree), (Path(args.report), audit)):
        encoded = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            if not path.exists() or path.read_text() != encoded:
                raise SystemExit(f'Stale artifact: {path}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(encoded)
    print(json.dumps(audit['summary'], indent=2))
    s = audit['summary']
    if s['failed_nodes'] or s['failed_closing_controls'] or s['unexplained_amount_rows'] \
            or s['crossvolume_disagreements'] or s['unexplained_title_rows']:
        raise SystemExit('Native I-C rollup has unresolved discrepancies; see audit JSON')


if __name__ == '__main__':
    main()
