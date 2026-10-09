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
    for name, expected in manifest['generator_dependencies'].items():
        require(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected,
                f'Comparison dependency changed: {name}; rebuild current pages')
    for document in manifest['source_documents'].values():
        require(hashlib.sha256((ROOT / document['path']).read_bytes()).hexdigest() == document['sha256'],
                'House PDF changed; source evidence requires review')
    api = manifest['api_snapshot']
    require(hashlib.sha256((ROOT / api['path']).read_bytes()).hexdigest() == api['sha256'], 'API snapshot changed')
    require(manifest['house_version'] == 'native_ic_v2' and manifest['comparison_ready'] is False and manifest['fiscal_year'] == 2027, 'Wrong dataset version/year')
    data, tree, house = read('source_comparison_2027.json'), read('nep_2027_tree.json'), read('hb_dpwh_native_ic_projects.json')
    sys.path.insert(0, str(ANALYSIS / 'builders'))
    from house_native import comparison_inputs, validate_native_detail
    from build_current_pages import INPUTS, region
    require(set(manifest['inputs']) == set(INPUTS), 'Incomplete comparison input manifest')
    require(set(manifest['generator_dependencies']) ==
            {'analysis/builders/house_native.py', 'scripts/hb_native_labels.py'},
            'Incomplete comparison dependency manifest')
    source = read('nep_2027_source_projects.json')
    pap_programs = {r['pap3']: r['program'] for r in source['projects'] if r['zone'] == 'non_fap'}
    validate_native_detail(house, read('hb_dpwh_native_ic_rollup_audit.json'), ROOT)
    house_records, house_controls, printed = comparison_inputs(
        house, read('hb_dpwh_native_rollup.json'), source['pap_controls'], pap_programs, region)
    expected_house = {r['id']: r for r in house_records}
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
    require(s['house_extracted_php'] == sum(r['amount_php'] for r in house_records), 'House extraction sum failed')
    require(s['house_operations_gap_php'] == s['house_operations_printed_php'] - s['house_extracted_php'], 'Coverage gap failed')
    require(s['house_checked_paps'] == len(house_controls) and s['house_balanced_paps'] == len(house_controls) and not data['unresolved_paps'], 'PAP coverage status failed')
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
        h = house_controls.get(p['label'])
        require(p['house_printed_php'] == (h['printed_php'] if h else None) and
                p['house_extracted_php'] == (h['extracted_php'] if h else 0) and
                p['coverage_difference_php'] == (h['difference_php'] if h else None) and
                p['house_pages'] == (h['source_pages'] if h else []),
                'House PAP controls differ from native detail')
        if p['house_printed_php'] is not None:
            require(p['house_extracted_php'] - p['house_printed_php'] == p['coverage_difference_php'], 'PAP extracted scope failed')
    require(s['house_printed_php'] == printed['new_appropriations'] and
            s['house_operations_printed_php'] == printed['operations_including_projects'],
            'House printed controls differ from Native I-B')
    hids, nids = [], []
    for r in data['projects']:
        if r.get('house'):
            hids.append(r['house']['id'])
            require(r['house'] == expected_house.get(r['house']['id']), 'House project title/source mismatch')
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
    require(len(hids) == len(set(hids)) == len(house_records), 'House matching double counted or omitted rows')
    require(len(nids) == len(set(nids)) == len(read('nep_2027_source_projects.json')['projects']),
            'NEP matching double counted project totals/funding units')
    require(dict(Counter(r['status'] for r in data['projects'])) == s['match_counts'], 'Matcher headline counts stale')
    require('hb_grand_upper_php' not in s, 'Invalid upper-bound accounting returned')
    validate_stage_trace(data)
    return data


def validate_stage_trace(comparison=None):
    """Reject stale candidate traces and recompute joins before packaging."""
    sys.path.insert(0, str(ANALYSIS / 'builders'))
    from build_stage_trace import INPUTS, build_rows, pap_stage_rows
    trace = read('stage_trace_2027.json')
    manifest = trace['manifest']
    require(manifest['fiscal_year'] == 2027 and manifest['comparison_ready'] is False,
            'Invalid stage-trace year or comparison-ready status')
    require(set(manifest['inputs']) == set(INPUTS), 'Incomplete stage-trace input manifest')
    for name, expected in manifest['inputs'].items():
        require(hashlib.sha256((DATA / name).read_bytes()).hexdigest() == expected,
                f'Stale stage-trace input: {name}. Run python analysis/builders/build_stage_trace.py')
    generator = manifest['generator']
    require(generator['path'] == 'analysis/builders/build_stage_trace.py', 'Unexpected stage-trace generator')
    require(hashlib.sha256((ROOT / generator['path']).read_bytes()).hexdigest() == generator['sha256'],
            'Stage-trace generator changed; rebuild stage trace')
    comparison = comparison if comparison is not None else read('source_comparison_2027.json')
    reconciliation = read('nep_2027_api_reconciliation.json')
    require(manifest['upstream_comparison_built_at'] == comparison['manifest']['built_at'],
            'Stage trace uses an older candidate comparison')
    for key in ('source_documents', 'api_snapshot'):
        require(manifest[key] == comparison['manifest'][key], f'Stage-trace {key} provenance differs')
    require(trace['projects'] == build_rows(comparison, reconciliation),
            'Stage-trace projects differ from retained source joins')
    require(trace['paps'] == pap_stage_rows(comparison), 'Stage-trace PAP controls differ')
    require(trace['unresolved_paps'] == comparison['unresolved_paps'], 'Stage-trace House gaps differ')
    require(trace['transparency_gaps'] == reconciliation['unpaired_source'], 'Stage-trace API gaps differ')
    summary = trace['summary']
    rows = trace['projects']
    require(summary['records'] == len(rows) and
            summary['trace_counts'] == dict(Counter(r['trace'] for r in rows)),
            'Stage-trace headline counts differ')
    require(summary['api_tree_total_php'] == read('dpwh_transparency_nep_tree.json')['summary']['total_php']
            == reconciliation['summary']['api_php'], 'Stage-trace API total differs')
    stages = summary['stages']
    expected_stages = {
        'transparency_nep': {'projects': reconciliation['summary']['api_rows'],
                             'php': reconciliation['summary']['api_php']},
        'official_nep': {'projects': reconciliation['summary']['non_fap_rows'] + reconciliation['summary']['fap_rows'],
                         'operations_php': reconciliation['summary']['operations_php'],
                         'new_appropriations_php': comparison['summary']['nep_printed_php']},
        'house': {'allocations': comparison['summary']['house_allocations'],
                  'extracted_php': comparison['summary']['house_extracted_php'],
                  'printed_new_appropriations_php': comparison['summary']['house_printed_php']},
    }
    for stage, expected in expected_stages.items():
        require(all(stages[stage][key] == value for key, value in expected.items()),
                f'Stage-trace source headline differs: {stage}')
    api_summary = reconciliation['summary']
    coverage_keys = {'paired_rows': 'api_pairs', 'pair_kinds': 'api_pair_kinds',
                     'nep_not_in_transparency_rows': 'unpaired_source_rows',
                     'nep_not_in_transparency_php': 'unpaired_source_php',
                     'unpaired_api_rows': 'unpaired_api_rows'}
    require(all(summary['transparency_to_official'][key] == api_summary[source]
                for key, source in coverage_keys.items()), 'Stage-trace API coverage differs')
    totals = summary['official_to_house']
    exact = [r for r in rows if r['house_match'] == 'exact_candidate']
    up = [r for r in exact if r['house_minus_nep_php'] > 0]
    down = [r for r in exact if r['house_minus_nep_php'] < 0]
    require(totals['exact_amount_same'] == sum(r['house_minus_nep_php'] == 0 for r in exact)
            and totals['exact_candidate_increase_n'] == len(up)
            and totals['exact_candidate_decrease_n'] == len(down)
            and totals['exact_candidate_increase_php'] == sum(r['house_minus_nep_php'] for r in up)
            and totals['exact_candidate_decrease_php'] == sum(r['house_minus_nep_php'] for r in down),
            'Stage-trace candidate deltas differ')
    require(totals['match_counts'] == comparison['summary']['match_counts']
            and totals['printed_house_minus_nep_php'] == comparison['summary']['printed_delta_php']
            and totals['reviewed_pairs'] == comparison['summary']['reviewed_pairs'],
            'Stage-trace comparison summary differs')
    require(embedded('stage_trace_2027.html', 'traceData') == trace, 'Stale embedded stage trace')
    encoded = json.dumps(trace, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    require((VIEWERS / 'stage_trace_2027.html').read_text() ==
            (VIEWERS / 'stage_trace.template.html').read_text().replace('__PAYLOAD__', encoded),
            'Stale stage-trace template rendering')
    return trace


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
