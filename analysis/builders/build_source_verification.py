#!/usr/bin/env python3
"""Build verification-first static pages from three independent retained sources.

No matching, PDF extraction, or network access. All arithmetic is recomputed.
Run build_dpwh_nep_api_tree.py to import the retained FY2027 API listings;
Pages CI uses only committed snapshots, trees, and validation artifacts.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'analysis/data'
VIEWERS = ROOT / 'analysis/viewers'
INPUTS = ['analysis/data/hb_dpwh_native_rollup.json', 'analysis/data/hb_native_ib_rollup_audit.json',
          'analysis/data/nep_2027_tree.json', 'analysis/data/nep_2027_tree_validation.json',
          'analysis/data/nep_2027_budget_units.json', 'analysis/data/nep_2027_native_amount_audit.json',
          'analysis/data/nep_2027_native_amount_review.json', 'analysis/data/nep_2027_source_audit.json',
          'analysis/data/dpwh_transparency_nep_tree.json', 'analysis/data/dpwh_transparency_nep_tree_validation.json',
          'dpwh-transparency-nep-data/json/fy2027-combined.json',
          'analysis/data/source_review_evidence.json',
          'analysis/data/nep_2027_amount_column_reassessment.json',
          'analysis/data/hb_dpwh_native_ic_projects.json',
          'analysis/data/hb_dpwh_native_ic_rollup_audit.json',
          'analysis/builders/house_native.py', 'scripts/hb_native_labels.py']
PAGES = {'hb': 'hb_native_verification.html', 'nep': 'nep_source_verification.html',
         'dpwh_nep_api': 'dpwh_nep_api_verification.html'}


def read(path):
    return json.loads((ROOT / path).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def embed(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')


def audit_hierarchy(nodes, root, office_ledger=None):
    """Validate links and each direct AND terminal-leaf sum, including references."""
    by_id = {n['id']: n for n in nodes}
    if len(by_id) != len(nodes): raise ValueError('Duplicate node IDs')
    seen, checks = set(), []
    def visit(id, parent):
        if id in seen: raise ValueError(f'Cycle or repeated traversal path: {id}')
        seen.add(id)
        n = by_id[id]
        if n['parent'] != parent: raise ValueError(f'Incorrect parent link: {id}')
        sums = [(by_id[c], visit(c, id)) for c in n['children']]
        additive = [(c, s) for c, s in sums if c['additive']]
        if not n['additive']:
            n.update(status='reference', recursive=0, direct=None, leaf_count=0)
            return 0
        if additive:
            direct = sum(c['amount'] for c, _ in additive)
            recursive = sum(s for _, s in additive)
            leaf_count = sum(c['leaf_count'] for c, _ in additive)
        elif office_ledger is not None:
            direct, leaf_count = office_ledger.get(id, (0, 0))
            recursive = direct
        else:
            direct = None; recursive = n['amount']; leaf_count = 1
        printed = n.get('printed')
        failure = (recursive != n['amount'] or
                   direct is not None and direct != n['amount'] or
                   printed is not None and printed != n['amount'])
        n.update(recursive=recursive, direct=direct, leaf_count=leaf_count,
                 status='mismatch' if failure else 'balanced' if printed is not None and direct is not None
                 else 'derived' if direct is not None else 'leaf')
        checks.append({'id': id, 'direct_difference': direct - n['amount'] if direct is not None else None,
                       'recursive_difference': recursive - n['amount'],
                       'printed_difference': n['amount'] - printed if printed is not None else None,
                       'status': n['status']})
        return recursive
    total = visit(root, None)
    if seen != set(by_id): raise ValueError('Unreachable nodes')
    failures = [c for c in checks if c['status'] == 'mismatch']
    return {'total': total, 'nodes': len(nodes), 'leaf_count': by_id[root]['leaf_count'],
            'internal_checks': sum(c['direct_difference'] is not None for c in checks),
            'failures': failures, 'checks': checks}


def prepare_reviews(nodes, records=None, images=None):
    """Separate suspected extraction errors, alignment checks, and derived context."""
    records = records or {}
    images = images or {}
    by_id = {n['id']: n for n in nodes}
    for n in nodes:
        evidence = n.get('evidence')
        kind = ('amount_disagreement' if evidence == 'native_text_review' else
                'alignment' if evidence == 'nearby_alignment_candidate' else
                'row_identity' if evidence == 'native_row_ambiguity' else
                'derived_context' if evidence == 'not_checked' and n['printed'] is None else
                'summary_check' if evidence == 'not_checked' else None)
        n['review_kind'] = kind
        n['review_actionable'] = kind in ('amount_disagreement', 'alignment', 'row_identity', 'summary_check')
        if n['id'] in records:
            r = records[n['id']]
            if r['status'] != evidence or r['printed_amount_php'] != n['printed']:
                raise ValueError(f'Stale review evidence: {n["id"]}')
            n['review_evidence'] = r
        if n['id'] in images:
            n['review_image'] = images[n['id']]
    def count(n):
        n['source_checks_below'] = sum(count(by_id[c]) for c in n['children'])
        n['source_checks_in_branch'] = n['source_checks_below'] + int(n['review_actionable'])
        return n['source_checks_in_branch']
    roots = [n for n in nodes if n['parent'] is None]
    for n in roots: count(n)
    return {'needs_source_check': sum(n['review_actionable'] for n in nodes),
            'types': dict(Counter(n['review_kind'] for n in nodes if n['review_kind']))}


def payloads():
    hb = read(INPUTS[0]); hb_audit = read(INPUTS[1]); hn = []
    def flatten(n, parent):
        if n['columns_php']['total'] != n['printed_amount_php'] or sum(n['columns_php'][k] for k in ('ps', 'mooe', 'co')) != n['printed_amount_php']:
            raise ValueError(f'House expenditure partition failed: {n["id"]}')
        if n['children'] and any(sum(c['columns_php'][k] for c in n['children']) != n['columns_php'][k] for k in ('ps', 'mooe', 'co', 'total')):
            raise ValueError(f'House immediate-child column sum failed: {n["id"]}')
        hn.append({'id': n['id'], 'parent': parent, 'label': n['label'], 'kind': n['kind'],
                   'amount': n['printed_amount_php'], 'printed': n['printed_amount_php'],
                   'children': [c['id'] for c in n['children']], 'additive': True,
                   'source': n['source'], 'columns_php': n['columns_php'], 'evidence': 'native_text'})
        for c in n['children']: flatten(c, n['id'])
    flatten(hb['root'], None)
    ha = audit_hierarchy(hn, hb['root']['id'])
    if ha['failures'] or hb_audit['summary'] != hb['audit_summary'] or hb_audit['summary']['unexplained_amount_rows']:
        raise ValueError('House native checks or source-coverage ledger failed')
    if any(c['row_partition_difference_php'] or any(c.get('direct_differences_php', {}).values()) or any(c.get('recursive_differences_php', {}).values()) for c in hb_audit['checks']):
        raise ValueError('House column checks failed')
    if ha['total'] != hb['audit_summary']['additive_leaf_total_php'] or ha['leaf_count'] != hb['audit_summary']['leaves']:
        raise ValueError('House native leaf ledger mismatch')
    nep = read(INPUTS[2]); native = read(INPUTS[5]); nn = []
    for n in nep['nodes']:
        nn.append({'id': n['id'], 'parent': n['parent'], 'label': n['label'], 'kind': n['kind'],
                   'amount': n['amount_php'], 'printed': n['printed_amount_php'],
                   'children': n['children'], 'additive': n['additive'], 'source': n['source'],
                   'evidence': n.get('native_amount_status', 'not_checked'),
                   'amount_basis': n['amount_basis'],
                   'source_row_columns_php': n.get('source_row_columns_php')})
    column_audit = read(INPUTS[12])
    if column_audit['tree_sha256'] != digest(ROOT / INPUTS[2]) or column_audit['nodes_reassessed'] != len(nn):
        raise ValueError('Stale NEP item/column reassessment')
    columns_by_id = {n['id']: n for n in nn}
    for r in column_audit['operating_unit_row_checks']:
        n = columns_by_id[r['id']]
        columns = n['source_row_columns_php']
        if columns != r['columns_php'] or columns['ps'] != n['amount'] or sum(columns[k] or 0 for k in ('ps','mooe','co')) != columns['total']:
            raise ValueError(f'NEP printed row/class amount mismatch: {n["id"]}')
    if {r['id'] for r in column_audit['operating_unit_row_checks']} != {n['id'] for n in nn if n['source']['table'] == 'by_ou' and n['printed'] is not None}:
        raise ValueError('Incomplete NEP operating-unit row reassessment')
    na = audit_hierarchy(nn, nep['root'])
    if na['failures']: raise ValueError('NEP recursive checks failed')
    ledger = read(INPUTS[4])['units']
    if sum(u['amount_php'] for u in ledger) != na['total']: raise ValueError('NEP atomic ledger mismatch')
    nep_nodes = {n['id']: n for n in nn}
    expected_units = {}
    def atomic(id):
        n = nep_nodes[id]
        if not n['additive']: return
        children = [nep_nodes[c] for c in n['children'] if nep_nodes[c]['additive']]
        if not children or all(c['kind'] == 'funding' for c in children):
            expected_units[id] = n['amount']
        else:
            for c in children: atomic(c['id'])
    atomic(nep['root'])
    if len({u['id'] for u in ledger}) != len(ledger) or {u['id']: u['amount_php'] for u in ledger} != expected_units:
        raise ValueError('NEP atomic unit identity/amount mismatch')
    if native['summary'] != nep['summary']['native_amount_audit']:
        raise ValueError('Stale NEP native evidence summary')
    if len(read(INPUTS[6])['records']) != native['summary']['review_candidates']:
        raise ValueError('Stale NEP review queue')
    if read(INPUTS[3])['summary'] != nep['summary']: raise ValueError('Stale NEP validation ledger')
    tt = read(INPUTS[8]); taudit = read(INPUTS[9]); tn = tt['nodes']
    ta = audit_hierarchy(tn, tt['root'])
    raw = read(INPUTS[10])['data']['data']
    from build_dpwh_nep_api_tree import pesos, validate_records
    validate_records(raw)
    raw_amounts = {r['code']: pesos(r['amount']) for r in raw}
    leaf_amounts = {n['id']: n['amount'] for n in tn if n['kind'] == 'project'}
    if len(raw_amounts) != len(raw) or raw_amounts != leaf_amounts:
        raise ValueError('DPWH NEP API project identities/amounts mismatch')
    raw_by_code = {r['code']: r for r in raw}
    api_nodes = {n['id']: n for n in tn}
    for n in tn:
        if n['kind'] != 'project': continue
        r = raw_by_code[n['id']]
        labels = []; parent = n['parent']
        while parent != tt['root']:
            labels.insert(0, api_nodes[parent]['label']); parent = api_nodes[parent]['parent']
        expected = [str(r.get(k) or '').strip() or 'Unspecified' for k in ('pap1', 'pap2', 'pap3', 'region', 'office')]
        if labels != expected or n['label'] != r['projectName'] or n['source']['project_id'] != r['id']:
            raise ValueError(f'DPWH NEP API source attribution mismatch: {n["id"]}')
    if ta['failures'] or ta['total'] != tt['summary']['total_php'] or ta['leaf_count'] != tt['summary']['projects']:
        raise ValueError('DPWH NEP API snapshot rollups failed')
    if tt['summary'] != taudit['summary']: raise ValueError('Stale DPWH NEP API audit')
    if tt['provenance']['source_sha256'] != digest(ROOT / INPUTS[10]) or tt['provenance']['builder_sha256'] != digest(ROOT / 'analysis/builders/build_dpwh_nep_api_tree.py'):
        raise ValueError('DPWH NEP API importer/input changed; rebuild its tree')
    hs, ns, ts = hb['audit_summary'], native['summary'], tt['summary']
    review_records = read(INPUTS[6])['records']
    review_images = read(INPUTS[11])
    if review_images['queue_sha256'] != digest(ROOT / INPUTS[6]) or review_images['tree_sha256'] != digest(ROOT / INPUTS[2]) or review_images['pdf_sha256'] != nep['provenance']['sha256']['pdf']:
        raise ValueError('Stale PDF review snippets; rebuild source review evidence')
    image_hashes = {}
    for image in review_images['records'].values():
        path = DATA / image['path']
        if digest(path) != image['sha256']: raise ValueError(f'Stale review image: {path.name}')
        image_hashes[str(path.relative_to(ROOT))] = digest(path)
    nr = prepare_reviews(nn, {r['id']: r for r in review_records}, review_images['records'])
    if {n['id'] for n in nn if n['review_actionable']} != set(review_images['records']):
        raise ValueError('Missing/unexpected source snippets in review queue')
    hr = prepare_reviews(hn)
    ar = prepare_reviews(tn)
    from house_native import validate_native_detail
    ic = read('analysis/data/hb_dpwh_native_ic_projects.json')
    validate_native_detail(ic, read('analysis/data/hb_dpwh_native_ic_rollup_audit.json'), ROOT)
    common = {'comparison_ready': False, 'comparisons': 'Deferred until source evidence, coverage, and compatible scope are confirmed.'}
    sources = {
        'hb': {**common, 'key': 'hb', 'title': 'DPWH House Bill — Native I-B', 'scale': 1,
               'scope': 'FY2027 new appropriations · DPWH only · I-B pages 9 and 13–110',
               'grain': 'I-B control tree: office allocations and FAP funding partitions. Native I-C supplies current named-project detail.',
               'evidence_status': 'Native printed controls verified',
               'coverage_status': 'No unexplained amount rows in the I-B DPWH table',
               'gaps': ['Native I-C detail balances and title ownership is regression-checked; individual project identities and amendment completeness still require review.'],
               'project_detail_summary': ic['audit_summary'],
               'root': hb['root']['id'], 'nodes': hn, 'audit': ha, 'detail_summary': hs, 'review_summary': hr,
               'downloads': [{'label': 'Additive native JSON', 'href': '../data/hb_dpwh_native_rollup.json'},
                             {'label': 'Four-column audit and repairs', 'href': '../data/hb_native_ib_rollup_audit.json'},
                             {'label': 'Method and remaining gaps', 'href': '../docs/hb_native_ib_rollup_checks.md'},
                             {'label': 'Native I-C project detail', 'href': '../data/hb_dpwh_native_ic_projects.json'},
                             {'label': 'I-C source and rollup audit', 'href': '../data/hb_dpwh_native_ic_rollup_audit.json'},
                             {'label': 'I-C method and scope', 'href': '../docs/hb_native_ic_rollup_checks.md'}]},
        'nep': {**common, 'key': 'nep', 'title': 'DPWH NEP — Source hierarchy', 'scale': 1,
                'scope': 'FY2027 new appropriations · automatic appropriations excluded',
                'grain': 'Source expense classes, programs, offices, projects, and funding',
                'evidence_status': f"{nr['needs_source_check']} pending source checks; {nr['types']['derived_context']} derived groupings shown as context",
                'coverage_status': 'Atomic source ledger reproduces the printed root',
                'gaps': [f"Review {nr['types']['row_identity']} ambiguous row areas, {nr['types']['amount_disagreement']} text disagreements, {nr['types']['alignment']} possible row-alignment issues, and {nr['types']['summary_check']} summary controls before certifying source evidence.",
                         'Retained OCR/PDF provenance is recorded; arithmetic alone does not verify labels or every printed amount.'],
                'root': nep['root'], 'nodes': nn, 'audit': na, 'detail_summary': nep['summary'], 'review_summary': nr,
                'downloads': [{'label': 'Source hierarchy JSON', 'href': '../data/nep_2027_tree.json'},
                              {'label': 'Source audit', 'href': '../data/nep_2027_source_audit.json'},
                              {'label': 'Every-item column reassessment', 'href': '../data/nep_2027_amount_column_reassessment.json'},
                              {'label': 'Review queue', 'href': '../data/nep_2027_native_amount_review.json'},
                              {'label': 'Source image provenance', 'href': '../data/source_review_evidence.json'},
                              {'label': 'Atomic ledger', 'href': '../data/nep_2027_budget_units.json'}]},
        'dpwh_nep_api': {**common, 'key': 'dpwh_nep_api', 'title': 'DPWH Transparency NEP — FY2027 API hierarchy', 'scale': 1,
                         'scope': 'FY2027 NEP project listings · retained DPWH Transparency NEP data via BetterGov-hosted API',
                         'grain': 'pap1 → pap2 → pap3 → region → office → project code',
                         'evidence_status': 'Derived rollups and project identities checked against retained API rows',
                         'coverage_status': f"{ts['projects']:,} projects reproduce the retained API count and amount summaries",
                         'gaps': ['API groups are derived; source documents and release coverage still require confirmation before comparisons.',
                                  'The API project listing has its own scope. It does not establish complete coverage of the printed NEP budget.'],
                         'root': tt['root'], 'nodes': tn, 'audit': ta, 'detail_summary': ts, 'review_summary': ar,
                         'provenance': tt['provenance'],
                         'downloads': [{'label': 'NEP API hierarchy JSON', 'href': '../data/dpwh_transparency_nep_tree.json'},
                                       {'label': 'API snapshot audit', 'href': '../data/dpwh_transparency_nep_tree_validation.json'},
                                       {'label': 'Original combined FY2027 snapshot', 'href': '../../dpwh-transparency-nep-data/json/fy2027-combined.json'}]},
    }
    expense_labels = {'ps': 'Personnel Services', 'mooe': 'Maintenance and Other Operating Expenses', 'co': 'Capital Outlays'}
    class_nodes = {nep_nodes[i]['label'].casefold(): i for i in nep_nodes[nep['root']]['children']}
    nep_classes = {k: class_nodes[label.casefold()] for k, label in expense_labels.items()}
    if [nep_nodes[i]['kind'] for i in nep_classes.values()] != ['expense_class'] * 3:
        raise ValueError('Unexpected NEP expense-class hierarchy')
    for key, d in sources.items():
        if key == 'dpwh_nep_api':
            d['expense_breakdown'] = None
            continue
        d['expense_breakdown'] = [
            {'key': k, 'label': label,
             'amount_php': hb['root']['columns_php'][k] if key == 'hb' else nep_nodes[nep_classes[k]]['amount'],
             'node_id': None if key == 'hb' else nep_classes[k]}
            for k, label in expense_labels.items()]
        if sum(r['amount_php'] for r in d['expense_breakdown']) != d['audit']['total']:
            raise ValueError(f'{key}: expense classes do not reproduce the total')
    for d in sources.values():
        # Full audit rows live in a downloadable ledger, keeping embedded pages smaller.
        d['audit'].pop('checks')
    overview = {**common, 'phase': 'Verify each source hierarchy before comparisons',
                'sources': [{k: d[k] for k in ('key', 'title', 'scope', 'grain', 'scale', 'audit',
                                              'evidence_status', 'coverage_status', 'gaps', 'comparison_ready', 'review_summary')}
                            | {'page': PAGES[key]}
                            | ({'project_detail_summary': d['project_detail_summary']} if 'project_detail_summary' in d else {})
                            for key, d in sources.items()]}
    manifest = {'schema_version': 1, 'phase': overview['phase'], 'comparison_ready': False,
                'inputs': {p: digest(ROOT / p) for p in INPUTS} | image_hashes,
                'presentation': {p: digest(ROOT / p) for p in
                                 ['analysis/builders/build_source_verification.py',
                                  'analysis/viewers/source_verification.template.html',
                                  'analysis/viewers/source_verification.js', 'analysis/viewers/source_verification.css', 'analysis/viewers/page_navigation.css', 'site/index.template.html']}}
    return sources, overview, manifest


def build():
    sources, overview, manifest = payloads()
    template = (VIEWERS / 'source_verification.template.html').read_text()
    for key, payload in sources.items():
        (VIEWERS / PAGES[key]).write_text(template.replace('__TITLE__', payload['title']).replace('__SOURCE_DATA__', embed(payload)))
    (DATA / 'source_verification_overview.json').write_text(json.dumps(overview, ensure_ascii=False, indent=2) + '\n')
    (DATA / 'source_verification_manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (ROOT / 'site/index.html').write_text((ROOT / 'site/index.template.html').read_text().replace('__INDEX_DATA__', embed(overview)))
    print('Built three independent source verification pages; comparisons deferred.')


if __name__ == '__main__':
    build()
