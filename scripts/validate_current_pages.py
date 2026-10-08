#!/usr/bin/env python3
"""Reject stale source dashboards and invalid accounting before publishing."""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT / 'analysis'
DATA = ANALYSIS / 'data'
VIEWERS = ANALYSIS / 'viewers'


def read(name):
    return json.loads((DATA / name).read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def embedded(name, element):
    text = (VIEWERS / name).read_text()
    match = re.search(r'<script id="' + element + r'" type="application/json">(.*?)</script>', text, re.S)
    require(match is not None, f'Missing embedded data in {name}')
    return json.loads(match[1])


def validate_current_pages():
    manifest = read('comparison_manifest.json')
    for name, expected in manifest['inputs'].items():
        require(hashlib.sha256((DATA / name).read_bytes()).hexdigest() == expected,
                f'Stale comparison input: {name}. Run python analysis/builders/build_current_pages.py')
    generator = manifest['generator']
    require(hashlib.sha256((ROOT / generator['path']).read_bytes()).hexdigest() == generator['sha256'],
            'Comparison generator changed; rebuild current pages')
    for document in manifest['source_documents'].values():
        require(hashlib.sha256((ROOT / document['path']).read_bytes()).hexdigest() == document['sha256'],
                'House PDF changed; source evidence requires review')
    api = manifest['api_snapshot']
    require(hashlib.sha256((ROOT / api['path']).read_bytes()).hexdigest() == api['sha256'], 'API snapshot changed')
    require(manifest['house_version'] == 'v5' and manifest['fiscal_year'] == 2027, 'Wrong dataset version/year')
    data, tree, house = read('source_comparison_2027.json'), read('nep_2027_tree.json'), read('hb_dpwh_leaves_corrected_v5.json')
    require(data['manifest'] == manifest, 'Manifest/payload mismatch')
    require(embedded('source_comparison_2027.html', 'comparisonData') == data, 'Stale embedded comparison payload')
    controls = {k: v for k, v in data.items() if k != 'projects'}
    require(read('current_pap_controls.json') == controls, 'Stale PAP controls')

    def encode(d):
        return json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')

    require((VIEWERS / 'source_comparison_2027.html').read_text() == (VIEWERS / 'current_dashboard.template.html').read_text().replace('__PAYLOAD__', encode(data)),
            'Stale comparison template rendering')
    evidence = {'review': read('nep_2027_native_amount_review.json')['records'],
                'repairs': read('nep_2027_tree_validation.json')['repairs']}
    require(embedded('nep_2027_tree.html', 'treeData') == tree, 'Stale embedded NEP tree')
    require(embedded('nep_2027_tree.html', 'evidenceData') == evidence, 'Stale embedded NEP evidence')
    require((VIEWERS / 'nep_2027_tree.html').read_text() == (VIEWERS / 'nep_tree_viewer.template.html').read_text()
            .replace('__TREE_DATA__', encode(tree)).replace('__EVIDENCE_DATA__', encode(evidence)),
            'Stale NEP template rendering')
    validate_source_verification()
    s = data['summary']
    for stage in ('house', 'nep'):
        require(s[stage + '_printed_php'] == s[stage + '_operations_printed_php'] + s[stage + '_gas_s2o_printed_php'],
                f'{stage} accounting identity failed')
    require(s['printed_delta_php'] == s['house_printed_php'] - s['nep_printed_php'] == 11490000000, 'Printed total delta failed')
    require(s['house_gas_s2o_printed_php'] - s['nep_gas_s2o_printed_php'] == -2527587000, 'GAS/S2O scope or accounting failed')
    require(s['house_extracted_php'] == sum(r['amount_php'] for r in house['leaves']), 'House extraction sum failed')
    require(s['house_operations_gap_php'] == s['house_operations_printed_php'] - s['house_extracted_php'], 'Coverage gap failed')
    require(s['house_checked_paps'] == 42 and s['house_balanced_paps'] == 38 and len(data['unresolved_paps']) == 4, 'PAP coverage status failed')
    require(sum(p['coverage_difference_php'] for p in data['unresolved_paps']) == -s['house_operations_gap_php'],
            'Offsetting discrepancies do not reconcile')
    units = read('nep_2027_budget_units.json')['units']
    require(sum(u['amount_php'] for u in units) == s['nep_printed_php'], 'NEP atomic ledger failed')
    checks = read('nep_2027_tree_validation.json')['checks']
    require(len(checks) == tree['summary']['rollup_checks'] and all(
        (c['status'] == 'pass' and c['difference_php'] == 0) or (c['status'] == 'derived' and c['difference_php'] is None)
        for c in checks), 'NEP rollup checks failed')
    nodes = {n['id']: n for n in tree['nodes']}
    api_checks = {r['pap3']: r for r in read('nep_2027_api_reconciliation.json')['pap_checks']}
    require(sum(p['api_coverage_php'] for p in data['paps']) == s['api']['api_php'], 'PAP API coverage sum failed')
    require(sum(p['api_coverage_php'] for p in data['programs']) == s['api']['api_php'], 'Program API coverage sum failed')
    for p in data['paps']:
        require(p['api_coverage_php'] == api_checks[p['label']]['api_php'] and p['source_api_gap_php'] == p['nep_printed_php'] - p['api_coverage_php'],
                'PAP API scope/coverage failed')
        require(nodes[p['id']]['amount_php'] == p['nep_printed_php'], f'PAP control stale: {p["id"]}')
        if p['house_printed_php'] is not None:
            require(p['house_extracted_php'] - p['house_printed_php'] == p['coverage_difference_php'], 'PAP extracted scope failed')
    hids, nids = [], []
    for r in data['projects']:
        if r.get('house'):
            hids.append(r['house']['id'])
            if r['house']['zone'] == 'fap':
                require(sum(r['house']['funding_php'].values()) == r['house']['amount_php'], 'House FAP funding split failed')
        if r.get('nep'):
            n = r['nep']
            nids.append(n['id'])
            require(n['amount_php'] == nodes[n['id']]['amount_php'] and nodes[n['id']]['additive'], 'NEP project amount/source mismatch')
        if r['status'] == 'exact_candidate':
            require(r['delta_php'] == r['house']['amount_php'] - r['nep']['amount_php'], 'Paired delta failed')
        for c in r.get('candidates', []):
            require(c['nep']['amount_php'] == nodes[c['nep']['id']]['amount_php'], 'Suggestion source mismatch')
    require(len(hids) == len(set(hids)) == len(house['leaves']), 'House matching double counted or omitted rows')
    require(len(nids) == len(set(nids)) == len(read('nep_2027_source_projects.json')['projects']),
            'NEP matching double counted project totals/funding units')
    require(dict(Counter(r['status'] for r in data['projects'])) == s['match_counts'], 'Matcher headline counts stale')
    require('hb_grand_upper_php' not in s, 'Invalid upper-bound accounting returned')
    return data


def validate_source_verification():
    """Recompute independent rollups and enforce current static source pages."""
    sys.path.insert(0, str(ANALYSIS / 'builders'))
    from build_source_verification import payloads, PAGES, embed
    sources, overview, manifest = payloads()
    require(read('source_verification_manifest.json') == manifest, 'Stale source verification inputs or presentation; rebuild source verification pages')
    require(read('source_verification_overview.json') == overview, 'Stale source verification overview')
    require(not overview['comparison_ready'], 'Premature comparison-ready status')
    template = (VIEWERS / 'source_verification.template.html').read_text()
    for key, payload in sources.items():
        require(not payload['audit']['failures'], f'{key} hierarchy arithmetic failed')
        expected = template.replace('__TITLE__', payload['title']).replace('__SOURCE_DATA__', embed(payload))
        require((VIEWERS / PAGES[key]).read_text() == expected, f'Stale verification page: {key}')
    require((ROOT / 'site/index.html').read_text() == (ROOT / 'site/index.template.html').read_text().replace('__INDEX_DATA__', embed(overview)),
            'Stale verification homepage')
    return overview


if __name__ == '__main__':
    validate_current_pages()
    print('Current page input hashes, embedded data, scopes, accounting and coverage verified')
