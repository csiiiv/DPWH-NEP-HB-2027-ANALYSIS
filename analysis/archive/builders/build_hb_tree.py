#!/usr/bin/env python3
"""Build a House (HB 10858) FY2027 DPWH rollup tree from v5 allocations and printed controls.

Printed summary, program, and PAP controls are kept distinct from extracted
allocations. No hierarchy amount is invented: derived nodes are sums of their
children, printed nodes carry the audited control, and coverage differences are
reported at every level. The four known unresolved Convergence/local PAPs are
the only permitted control mismatches; anything else fails the build.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE
from paths import ARCHIVE_DATA, ARCHIVE_VIEWERS, retained_data_path

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from build_current_pages import region

A = DATA
ROOT = REPO
INPUTS = ['hb_dpwh_leaves_corrected_v5.json', 'hb_known_defect_repairs.json',
          'hb_json_usability_audit.json', 'current_pap_controls.json']
FAP_GROUP = 'Foreign-assisted project allocations'
# Relative to analysis/viewers/*.html (packaged site rewrites via SITE_CONFIG / flatten).
IB = {'document': 'house_summary', 'pdf': '../../../HB_BUDGET/2 - HB 10858 VOL IB.pdf', 'pdf_page': 9}
IC = {'document': 'house_details', 'pdf': '../../../HB_BUDGET/3 - HB 10858 VOL IC.pdf'}

# v5 native-section rows whose region field absorbed the office label.
REGION_OFFICE_FIXES = {
    'Region VI ILOILO 1ST DISTRICT ENGINEERING OFFICE': ('Region VI', 'Iloilo 1st District Engineering Office'),
    'Region XI DAVAO DEL NORTE DISTRICT ENGINEERING OFFICE': ('Region XI', 'Davao del Norte District Engineering Office'),
}


def read(name):
    return json.loads((retained_data_path(name)).read_text())


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def canonical_region(row, normalizations):
    raw = row['region'] or ''
    if raw in REGION_OFFICE_FIXES:
        fixed, office = REGION_OFFICE_FIXES[raw]
        normalizations.append({'row': row['row'], 'region_raw': raw, 'region': fixed,
                               'office': office,
                               'reason': 'Native section row merged the office into the region; split restores the document layout without changing the amount.'})
        if not row.get('office'):
            row = dict(row, office=office)
        return fixed, row
    return region(raw), row


def rollup(nodes, by_id):
    """Bottom-up amount, validation, coverage, and evidence aggregation."""
    for n in reversed(nodes):
        children = [by_id[id] for id in n['children']]
        child_sum = sum(c['amount_php'] for c in children)
        if n['kind'] in ('project', 'funding'):
            n['extracted_php'] = n['amount_php'] if n['kind'] == 'project' else None
            n['allocation_count'] = int(n['kind'] == 'project')
            n['validation'] = 'funding_balanced' if children else 'allocation' if n['kind'] == 'project' else 'partition'
            n['evidence_counts'] = {n['evidence']: 1} if n['kind'] == 'project' else {}
        else:
            n['amount_php'] = n['printed_amount_php'] if n['printed_amount_php'] is not None else child_sum
            values = [c['extracted_php'] for c in children if c['extracted_php'] is not None]
            n['extracted_php'] = sum(values) if values else None
            n['allocation_count'] = sum(c['allocation_count'] for c in children)
            counts = Counter()
            for c in children:
                counts.update(c.get('evidence_counts') or {})
            n['evidence_counts'] = dict(counts)
            n['validation'] = ('control_only' if not children else 'balanced' if child_sum == n['printed_amount_php'] else 'mismatch') if n['printed_amount_php'] is not None else 'derived'
        n['children_sum_php'] = child_sum if children else None
        n['difference_php'] = child_sum - n['amount_php'] if children else None
        n['coverage_difference_php'] = n['extracted_php'] - n['printed_amount_php'] if n['extracted_php'] is not None and n['printed_amount_php'] is not None else None
        n['gap_descendants'] = int(n['validation'] == 'mismatch') + sum(c['gap_descendants'] for c in children)


def validate(nodes, by_id, known_mismatches):
    """Zero-tolerance check: only the documented PAP mismatches may exist; zones and root must balance."""
    mismatched = {n['label']: n['difference_php'] for n in nodes if n['validation'] == 'mismatch'}
    assert mismatched == known_mismatches, f'Control mismatches exceed the documented set: {mismatched}'
    for id in ('root', 'operations', 'local', 'fap'):
        assert by_id[id]['difference_php'] == 0, f'{id} does not balance'
        assert by_id[id]['validation'] != 'mismatch', f'{id} mismatch'
    # Every node reachable exactly once from root.
    order, seen = [], set()

    def visit(id):
        assert id not in seen, f'Multiple traversal paths to {id}'
        seen.add(id)
        for child in by_id[id]['children']:
            assert by_id[child]['parent_id'] == id, f'Inconsistent parent/child link {id} {child}'
            visit(child)
        order.append(id)
    visit('root')
    assert set(by_id) == seen, f'Unreachable nodes: {sorted(set(by_id) - seen)[:10]}'


def build_tree(house, repairs, audit, controls):
    nodes, by_id = [], {}
    normalizations = []

    def node(id, label, kind, parent=None, printed=None, source=None, **extra):
        n = dict(id=id, label=label, kind=kind, parent_id=parent,
                 printed_amount_php=printed, children=[], source=source or {}, **extra)
        nodes.append(n)
        by_id[id] = n
        if parent:
            by_id[parent]['children'].append(id)
        return n

    printed = audit['pdf_controls_php']
    node('root', 'DPWH FY2027 — House Bill 10858 new appropriations', 'agency', printed=printed['new_appropriations'], source=IB)
    for key, label in [('gas_total', 'General Administration and Support'), ('s2o_total', 'Support to Operations')]:
        node(key, label, 'summary_control', 'root', printed[key], IB,
             coverage_note='Printed summary control. Detailed GAS/S2O allocations are outside the House v5 project table; nothing is implied about their extraction.')
    node('operations', 'Operations including local and foreign-assisted projects', 'operations', 'root',
         printed['operations_including_projects'], IB)
    node('local', 'Locally funded operations and projects', 'zone', 'operations',
         printed['regular_operations'] + printed['local_projects'],
         {**IB, 'printed_controls_php': {'regular_operations': printed['regular_operations'], 'local_projects': printed['local_projects']}},
         coverage_note='Sum of two printed controls; the v5 table does not separate regular operations from local projects.')
    node('fap', 'Foreign-assisted projects', 'zone', 'operations', printed['foreign_assisted_projects'], IB,
         coverage_note='FAP retained PAP labels do not carry printed PAP controls; the printed FAP zone control governs.')

    pap_controls = {p['pap']: p for p in repairs['pap_controls']}
    canonical = {p['label']: p for p in controls['paps']}
    program_controls = {p['program']: p for p in controls['programs']}
    buckets = defaultdict(list)
    for i, row in enumerate(house['leaves']):
        if row['zone'] == 'pap':
            assert row['pap'] in canonical, f"Non-canonical PAP label: {row['pap']!r}"
            program = canonical[row['pap']]['program']
        else:
            assert row['zone'] == 'fap', f"Unknown zone {row['zone']!r}"
            program = row['program']
        buckets[(row['zone'], program)].append((i, row))

    for zone, program in sorted(buckets):
        parent = 'local' if zone == 'pap' else 'fap'
        pid = f'{parent}:program:{program}'
        control = program_controls[program] if zone == 'pap' else None
        node(pid, program, 'program', parent, control['house_local_control_php'] if control else None,
             IB if control else None,
             nep_total_control_php=control['nep_total_control_php'] if control else None,
             nep_local_control_php=control['nep_local_control_php'] if control else None,
             delta_vs_nep_local_php=control['house_local_control_php'] - control['nep_local_control_php'] if control else None)
        groups = defaultdict(list)
        for i, row in buckets[(zone, program)]:
            groups[row['pap'] if zone == 'pap' else FAP_GROUP].append((i, row))
        for pap, records in sorted(groups.items()):
            papid = f'{pid}:pap:{pap}'
            control = pap_controls.get(pap) if zone == 'pap' else None
            canon = canonical.get(pap)
            node(papid, pap, 'pap' if control else 'group', pid,
                 control['printed_php'] if control else None,
                 {**IC, 'pdf_pages': control['source_pages']} if control else
                 {**IC, 'pdf_page': records[0][1].get('pdf_page')},
                 canonical_nep_pap_id=canon['id'] if canon else None,
                 nep_printed_php=canon['nep_printed_php'] if canon else None,
                 delta_vs_nep_php=(control['printed_php'] - canon['nep_printed_php']) if control and canon and canon['nep_printed_php'] is not None else None,
                 **({} if control else {'coverage_note': 'No printed PAP control retained for this section; derived from its allocations.'}))
            regions = defaultdict(list)
            for i, row in records:
                reg, row = canonical_region(row, normalizations)
                regions[reg].append((i, row))
            for reg, rows in sorted(regions.items()):
                rid = f'{papid}:region:{reg}'
                node(rid, reg, 'region', papid,
                     coverage_note='Derived from v5 attribution; regional subtotals are not independently control-checked.')
                offices = defaultdict(list)
                for i, row in rows:
                    offices[row.get('office') or 'Office not recorded'].append((i, row))
                for office, allocations in sorted(offices.items()):
                    oid = f'{rid}:office:{office}'
                    node(oid, office, 'office', rid)
                    for i, row in allocations:
                        source_id = row.get('source_id') or f"v5:row:{row['row']}:{i}"
                        project = node(f'project:{i}', row['project'].replace('\\n', ' '), 'project', oid,
                                       source={**IC, 'pdf_page': row.get('pdf_page'), 'row': row['row'], 'source_id': source_id,
                                               'source_y': row.get('source_y'), 'source_label': row.get('source_label')},
                                       leaf_index=i, amount_php=row['amount_php'],
                                       evidence=('native_section' if row.get('provenance_status') is None else 'inherited_v4b'),
                                       extraction_status=row.get('validation', 'unreviewed'),
                                       zone=zone, region=reg, office=row.get('office', ''),
                                       retained_program=row['program'], retained_pap=row['pap'])
                        if row.get('funding_php'):
                            assert sum(row['funding_php'].values()) == row['amount_php'], f"Funding partition mismatch at {source_id}"
                            for label, amount in sorted(row['funding_php'].items()):
                                node(f"{project['id']}:funding:{label}", label, 'funding', project['id'], amount_php=amount,
                                     coverage_note='Funding partition of the parent project; not a separate allocation.')

    rollup(nodes, by_id)
    known = {p['pap']: p['difference_php'] for p in repairs['pap_controls'] if p['difference_php']}
    validate(nodes, by_id, known)

    mismatched = [n for n in nodes if n['validation'] == 'mismatch']
    operations = by_id['operations']
    summary = dict(total_php=printed['new_appropriations'],
                   gas_s2o_php=printed['gas_total'] + printed['s2o_total'],
                   operations_php=printed['operations_including_projects'],
                   operations_extracted_php=operations['extracted_php'],
                   operations_gap_php=printed['operations_including_projects'] - operations['extracted_php'],
                   allocations=len(house['leaves']),
                   balanced_paps=sum(n['kind'] == 'pap' and n['validation'] == 'balanced' for n in nodes),
                   checked_paps=len(repairs['pap_controls']),
                   mismatched_paps=[{'label': n['label'], 'difference_php': n['difference_php']} for n in mismatched],
                   fap_funding_php={'GOP': 25_190_650_000, 'Loan Proceeds': 19_558_361_000},
                   region_normalizations=len(normalizations),
                   evidence_counts=dict(Counter(('native_section' if r.get('provenance_status') is None else 'inherited_v4b') for r in house['leaves'])),
                   arithmetic_statuses=dict(Counter(n['validation'] for n in nodes)))
    assert summary['operations_extracted_php'] == sum(r['amount_php'] for r in house['leaves'])
    funding = defaultdict(int)
    for n in nodes:
        if n['kind'] == 'funding':
            funding[n['label']] += n['amount_php']
    assert dict(funding) == summary['fap_funding_php'], f'Funding totals changed: {dict(funding)}'
    checks = [{'id': n['id'], 'kind': n['kind'], 'label': n['label'],
               'pdf_pages': n['source'].get('pdf_pages') or ([n['source']['pdf_page']] if n['source'].get('pdf_page') else []),
               'printed_amount_php': n['printed_amount_php'], 'children_sum_php': n['children_sum_php'],
               'difference_php': n['difference_php'], 'status': n['validation'],
               'coverage_difference_php': n['coverage_difference_php'], 'gap_descendants': n['gap_descendants']}
              for n in nodes if n['printed_amount_php'] is not None]
    return dict(schema_version=1, fiscal_year=2027, house_version='v5', nodes=nodes, summary=summary,
                limitations=house['provenance']['limitations'], repairs=repairs['repairs'],
                region_normalizations=normalizations, checks=checks)


def report(tree):
    s = tree['summary']
    mismatch_rows = '\n'.join(f"| {m['label']} | {'+' if -m['difference_php'] > 0 else ''}{-m['difference_php']:,} |" for m in s['mismatched_paps'])
    return f"""# FY2027 DPWH House (HB 10858) rollup tree

The printed House total for DPWH new appropriations is **₱{s['total_php']:,}**: GAS ₱18,078,293,000 + S2O ₱49,082,061,000 + Operations ₱586,941,661,000. The tree keeps every printed control separate from extraction. {s['allocations']:,} v5 allocations (₱{s['operations_extracted_php']:,}) roll up under them, leaving the documented **net operations gap of ₱{s['operations_gap_php']:,}**. It is a reconciliation gap, not an enumerated list of missing projects.

## What balances

Root, Operations, the local zone, FAP, and all six local program controls balance exactly against their children. {s['balanced_paps']} of {s['checked_paps']} printed PAP controls balance. The only control mismatches are the four documented unresolved sections:

| Unresolved PAP control | Printed − extracted (₱) |
|---|---:|
{mismatch_rows}

All 29 FAP projects carry GOP/loan partitions that sum exactly to their project amounts (GOP ₱25,190,650,000 + Loan Proceeds ₱19,558,361,000 = ₱44,749,011,000).

## Construction and limits

Run `python analysis/archive/builders/build_hb_tree.py` to rebuild from `hb_dpwh_leaves_corrected_v5.json`, printed controls (`hb_json_usability_audit.json`, `hb_known_defect_repairs.json`), and the canonical mapping (`current_pap_controls.json`). No hierarchy amount is invented. Grouping nodes without printed controls are marked **derived**; printed nodes keep extraction coverage (`coverage_difference_php`) visible at every level. {s['region_normalizations']} region fields that had absorbed office labels were split back, recorded in `hb_2027_tree_validation.json`.

Extraction balance is not completeness: {s['evidence_counts'].get('inherited_v4b', 0):,} allocations inherit v4b amounts and PAP attribution, and balanced PAP controls do not certify every title, region, or regional subtotal. GAS/S2O detailed allocations are outside the v5 project table. Unmatched rows across sources remain review candidates, never confirmed insertions or removals.

## Artifacts

- [Interactive drilldown](hb_2027_tree.html): programs, PAPs, regions, offices, projects, and FAP funding partitions with page references.
- [Canonical tree](../data/hb_2027_tree.json): hierarchy, validation and coverage status, provenance.
- [Rollup checks, repairs, normalizations](../data/hb_2027_tree_validation.json).
- Regression tests: `python -m unittest discover -s analysis/tests -p 'test_hb_tree.py' -v`.

Next: resolve the four unresolved sections against the source PDF, then rematch House rows against the NEP source tree branches.
"""


def build():
    tree = build_tree(*[read(n) for n in INPUTS])
    paths = {f'analysis/data/{name}': retained_data_path(name) for name in INPUTS}
    paths['analysis/archive/builders/build_hb_tree.py'] = Path(__file__)
    for name in ['2 - HB 10858 VOL IB.pdf', '3 - HB 10858 VOL IC.pdf']:
        paths[f'HB_BUDGET/{name}'] = ROOT / 'HB_BUDGET' / name
    tree['provenance'] = {'method': 'House v5 allocations grouped by canonical PAP program mapping, region, and office under retained printed summary/program/PAP controls. Derived nodes are child sums; coverage differences are explicit; no residual or inferred allocations.',
                          'inputs_sha256': {key: hashlib.sha256(path.read_bytes()).hexdigest() for key, path in paths.items()},
                          'source_documents': {'house_summary': '../../../HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf',
                                               'house_details': '../../../HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf'}}
    (ARCHIVE_DATA / 'hb_2027_tree.json').write_text(json.dumps(tree, ensure_ascii=False, indent=2) + '\n')
    validation = {k: tree[k] for k in ('summary', 'repairs', 'region_normalizations', 'checks')}
    validation['limitations'] = tree['limitations']
    validation['provenance'] = tree['provenance']
    (ARCHIVE_DATA / 'hb_2027_tree_validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
    (ARCHIVE_VIEWERS / 'hb_2027_tree.html').write_text((ARCHIVE_VIEWERS / 'hb_tree_viewer.template.html').read_text().replace('__HB_TREE_DATA__', encode(tree)))
    (ARCHIVE_VIEWERS / 'hb_2027_tree.md').write_text(report(tree))
    print(json.dumps(tree['summary'], indent=2))
    return tree


if __name__ == '__main__':
    build()
