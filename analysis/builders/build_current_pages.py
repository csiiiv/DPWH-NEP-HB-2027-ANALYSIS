#!/usr/bin/env python3
"""Build current source-control dashboards from retained, hashed inputs.

No PDF extraction or network dependency. Project matches are review candidates,
never confirmed additions/removals. Duplicate exact keys remain ambiguous.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE

import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = REPO
OUT = DATA
VIEWER_OUT = VIEWERS
INPUTS = ['nep_2027_tree.json', 'nep_2027_tree_validation.json',
          'nep_2027_source_projects.json', 'nep_2027_budget_units.json',
          'nep_2027_native_amount_audit.json', 'nep_2027_native_amount_review.json',
          'hb_dpwh_leaves_corrected_v5.json', 'hb_known_defect_repairs.json',
          'hb_json_usability_audit.json', 'nep_2027_api_reconciliation.json']
METHOD = ('Unique normalized title + canonical region + canonical PAP node ID '
          '(FAP uses program and zone), one-to-one exact candidates. Amount does '
          'not determine identity. Duplicate keys remain ambiguous. Remaining '
          'House rows receive up to three fuzzy suggestions within the same '
          'region/PAP/zone, top-20 token-overlap shortlist (ties ordered by source ID), then SequenceMatcher >=0.85; '
          'suggestions do not consume NEP rows. No pair has been manually certified.')


def read(name):
    return json.loads((OUT / name).read_text())


def write(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized(value):
    value = unicodedata.normalize('NFKC', value or '').casefold().replace('\\n', ' ')
    return re.sub(r'[^a-z0-9]', '', value)


def region(value):
    value = unicodedata.normalize('NFKC', value or '').strip()
    aliases = {'national capital region': 'NCR', 'ncr': 'NCR',
               'cordillera administrative region': 'CAR', 'car': 'CAR',
               'mimaropa region': 'MIMAROPA', 'mimaropa': 'MIMAROPA',
               'negros island region': 'NIR', 'negros island region (nir)': 'NIR',
               'nir': 'NIR', 'nationwide': 'Nationwide',
               'barmm': 'Nationwide', 'bangsamoro autonomous region in muslim mindanao': 'Nationwide'}
    if value.casefold() in aliases:
        return aliases[value.casefold()]
    return re.sub(r'^(?:egion|region)\s+', 'Region ', value, flags=re.I)


def scope_key(row):
    return row['zone'], row['pap_id'] if row['zone'] == 'local' else row['program'], row['region']


def project_matches(house, source):
    hi, ni = defaultdict(list), defaultdict(list)
    for i, r in enumerate(house):
        hi[(*scope_key(r), normalized(r['title']))].append(i)
    for i, r in enumerate(source):
        ni[(*scope_key(r), normalized(r['title']))].append(i)
    matched_h, matched_n, records = set(), set(), []
    for k in sorted(hi):
        if len(hi[k]) == len(ni.get(k, [])) == 1:
            h, n = hi[k][0], ni[k][0]
            records.append({'status': 'exact_candidate', 'confidence': 1,
                            'house': house[h], 'nep': source[n],
                            'delta_php': house[h]['amount_php'] - source[n]['amount_php']})
            matched_h.add(h)
            matched_n.add(n)
    # Token index narrows suggestions without ranking by amount or claiming identity.
    tokens = defaultdict(set)
    for i, r in enumerate(source):
        if i not in matched_n:
            for tok in set(re.findall(r'[a-z0-9]{3,}', r['title'].casefold())):
                tokens[(*scope_key(r), tok)].add(i)
    for i, h in enumerate(house):
        if i in matched_h:
            continue
        k = (*scope_key(h), normalized(h['title']))
        duplicates = ni.get(k, [])
        if duplicates:
            records.append({'status': 'ambiguous', 'house': h,
                            'candidates': [{'nep': source[n], 'confidence': 1} for n in duplicates],
                            'reason': 'Duplicate exact title/region/PAP key; no automatic pairing.'})
            continue
        counts = Counter()
        for tok in set(re.findall(r'[a-z0-9]{3,}', h['title'].casefold())):
            counts.update(tokens.get((*scope_key(h), tok), ()))
        suggestions = []
        for n, _ in sorted(counts.items(), key=lambda pair: (-pair[1], source[pair[0]]['id']))[:20]:
            score = SequenceMatcher(None, normalized(h['title']), normalized(source[n]['title']), autojunk=False).ratio()
            if score >= .85:
                suggestions.append({'nep': source[n], 'confidence': round(score, 4)})
        suggestions.sort(key=lambda r: (-r['confidence'], r['nep']['id']))
        records.append({'status': 'fuzzy_candidate' if suggestions else 'house_unmatched',
                        'house': h, 'candidates': suggestions[:3]})
    for i, n in enumerate(source):
        if i not in matched_n:
            records.append({'status': 'nep_unmatched', 'nep': n})
    return records


def build():
    tree, source, hb, repairs, audit = [read(n) for n in
        ['nep_2027_tree.json', 'nep_2027_source_projects.json',
         'hb_dpwh_leaves_corrected_v5.json', 'hb_known_defect_repairs.json', 'hb_json_usability_audit.json']]
    nodes = {n['id']: n for n in tree['nodes']}
    controls = source['pap_controls']
    pap_programs = {r['pap3']: r['program'] for r in source['projects'] if r['zone'] == 'non_fap'}
    for name, c in controls.items():
        assert c['amount_php'] == nodes[c['id']]['amount_php'], name
    nep = []
    for r in source['projects']:
        n = nodes[r['source_id']]
        assert r['amount_php'] == n['amount_php'] and n['additive'], r['source_id']
        # Project total stays a single record; GOP/loan children are not projects.
        nep.append({'id': r['source_id'], 'title': n['label'], 'amount_php': n['amount_php'],
                    'program': r['program'], 'pap': r['pap3'],
                    'pap_id': controls[r['pap3']]['id'] if r['zone'] == 'non_fap' else 'fap:' + r['program'],
                    'zone': 'local' if r['zone'] == 'non_fap' else 'fap',
                    'region': region(r['region']), 'office': r.get('office', ''),
                    'pdf_page': r['pdf_page'], 'bbox': n['source'].get('bbox'),
                    'evidence': n.get('native_amount_status', 'not_checked'),
                    'funding_php': {nodes[c]['label']: nodes[c]['amount_php'] for c in n['children'] if nodes[c]['kind'] == 'funding'}})
    house = []
    for i, r in enumerate(hb['leaves']):
        pap_id = controls[r['pap']]['id'] if r['zone'] == 'pap' and r['pap'] in controls else None
        assert pap_id is not None or r['zone'] == 'fap', r['pap']
        house.append({'id': r.get('source_id') or f"v5:row:{r['row']}:{i}",
                      'title': r['project'], 'amount_php': r['amount_php'],
                      'pap': r['pap'] if r['zone'] == 'pap' else 'Foreign-assisted projects',
                      'pap_id': pap_id or 'fap:' + r['program'],
                      'program': pap_programs[r['pap']] if r['zone'] == 'pap' else r['program'],
                      'zone': 'local' if r['zone'] == 'pap' else 'fap',
                      'region': region(r['region']), 'office': r.get('office', ''),
                      'pdf_page': r.get('pdf_page'),
                      'evidence': r.get('provenance_status') or r.get('validation', 'unreviewed'),
                      'funding_php': r.get('funding_php', {})})
    api_checks = {r['pap3']: r for r in read('nep_2027_api_reconciliation.json')['pap_checks']}
    printed = audit['pdf_controls_php']
    programs = []
    for r in audit['program_crosscheck']:
        p = r['program']
        nlocal = sum(n['amount_php'] for n in nep if n['zone'] == 'local' and n['program'] == p)
        assert nlocal == r['nep_non_fap_source_php']
        programs.append({'program': p, 'house_local_control_php': r['house_local_control_php'],
                         'nep_local_control_php': nlocal,
                         'api_coverage_php': sum(api_checks[name]['api_php'] for name in controls if pap_programs[name] == p),
                         'house_local_extracted_php': sum(h['amount_php'] for h in house if h['zone'] == 'local' and h['program'] == p),
                         'house_fap_extracted_php': sum(h['amount_php'] for h in house if h['zone'] == 'fap' and h['program'] == p),
                         'nep_fap_control_php': sum(n['amount_php'] for n in nep if n['zone'] == 'fap' and n['program'] == p),
                         'nep_total_control_php': tree['summary']['program_totals_php'][p]})
    hb_paps = {r['pap']: r for r in repairs['pap_controls']}
    paps = []
    for name, control in controls.items():
        h = hb_paps.get(name)
        extracted = sum(r['amount_php'] for r in house if r['zone'] == 'local' and r['pap'] == name)
        assert sum(r['amount_php'] for r in nep if r['zone'] == 'local' and r['pap'] == name) == control['amount_php']
        if h:
            assert extracted == h['v5_leaves_php'] and control['amount_php'] == h['nep_source_php']
        regions = []
        for reg in sorted({r['region'] for r in house + nep if r['zone'] == 'local' and r['pap'] == name}):
            regions.append({'region': reg,
                            'house_extracted_php': sum(r['amount_php'] for r in house if r['zone'] == 'local' and r['pap'] == name and r['region'] == reg),
                            'nep_source_php': sum(r['amount_php'] for r in nep if r['zone'] == 'local' and r['pap'] == name and r['region'] == reg)})
        delta = h['printed_php'] - control['amount_php'] if h else None
        paps.append({'id': control['id'], 'label': name, 'program': pap_programs[name],
                     'house_printed_php': h['printed_php'] if h else None,
                     'house_extracted_php': extracted, 'nep_printed_php': control['amount_php'],
                     'coverage_difference_php': h['difference_php'] if h else None,
                     'api_coverage_php': api_checks[name]['api_php'],
                     'source_api_gap_php': control['amount_php'] - api_checks[name]['api_php'],
                     'delta_php': delta,
                     'comparison_status': 'unmapped_control' if h is None else 'exact_controls' if delta == 0 else 'within_tolerance' if abs(delta) <= .005 * max(h['printed_php'], control['amount_php']) else 'control_difference',
                     'house_pages': h['source_pages'] if h else [], 'nep_page': control['page'], 'regions': regions})
    assert all(api_checks[name]['source_php'] == c['amount_php'] for name, c in controls.items())
    records = project_matches(house, nep)
    summary = {'nep_printed_php': tree['summary']['total_php'],
               'house_printed_php': printed['new_appropriations'],
               'printed_delta_php': printed['new_appropriations'] - tree['summary']['total_php'],
               'house_operations_printed_php': printed['operations_including_projects'],
               'nep_operations_printed_php': sum(n['amount_php'] for n in nep),
               'house_gas_s2o_printed_php': printed['gas_total'] + printed['s2o_total'],
               'nep_gas_s2o_printed_php': sum(tree['summary']['program_totals_php'][p] for p in ['General Administration and Support', 'Support to Operations']),
               'house_extracted_php': sum(h['amount_php'] for h in house),
               'house_allocations': len(house), 'house_local_extracted_php': hb['summary']['zones_php']['pap'],
               'house_fap_php': hb['summary']['zones_php']['fap'],
               'nep_fap_php': source['summary']['fap_php'],
               'house_operations_gap_php': printed['operations_including_projects'] - sum(h['amount_php'] for h in house),
               'house_balanced_paps': sum(p['coverage_difference_php'] == 0 for p in paps),
               'house_checked_paps': len(hb_paps), 'nep_evidence': tree['summary']['native_amount_audit'],
               'match_counts': dict(Counter(r['status'] for r in records)),
               'reviewed_pairs': 0, 'api': read('nep_2027_api_reconciliation.json')['summary']}
    assert summary['house_printed_php'] == summary['house_operations_printed_php'] + summary['house_gas_s2o_printed_php']
    assert summary['nep_printed_php'] == summary['nep_operations_printed_php'] + summary['nep_gas_s2o_printed_php']
    assert summary['house_balanced_paps'] == hb['summary']['balanced_pap_controls']
    assert all(sum(r['funding_php'].values()) == r['amount_php'] for r in house if r['zone'] == 'fap')
    assert sum(sum(r['funding_php'].values()) for r in house if r['zone'] == 'fap') == summary['house_fap_php']
    manifest = {'schema_version': 2, 'fiscal_year': 2027,
                'built_at': datetime.now(ZoneInfo('Asia/Manila')).isoformat(timespec='seconds'),
                'stages': {'nep': 'Executive NEP proposal', 'house': 'HB 10858 supplied source documents; amendment completeness not certified'},
                'house_version': 'v5', 'nep_version': tree['schema_version'],
                'scope': 'New appropriations excluding automatic appropriations; operations project comparison; local and FAP separated',
                'units': 'Integer Philippine pesos', 'matching_method': METHOD,
                'generator': {'path': 'analysis/builders/build_current_pages.py', 'sha256': digest(Path(__file__))},
                'inputs': {n: digest(OUT / n) for n in INPUTS},
                'api_snapshot': {'path': 'dpwh-transparency-nep-data/json/fy2027-combined.json', 'sha256': digest(ROOT / 'dpwh-transparency-nep-data/json/fy2027-combined.json')},
                'source_documents': {key: {'path': str(path.relative_to(ROOT)), 'sha256': digest(path)} for key, path in [('house_summary', ROOT / 'HB_BUDGET/2 - HB 10858 VOL IB.pdf'), ('house_details', ROOT / 'HB_BUDGET/3 - HB 10858 VOL IC.pdf')]},
                'source_pdf_sha256': {'house': hb['provenance']['source_pdf_sha256'], 'nep': tree['provenance']['sha256']['pdf']}}
    payload = {'manifest': manifest, 'summary': summary, 'programs': programs, 'paps': paps,
               'unresolved_paps': [p for p in paps if p['coverage_difference_php'] not in (None, 0)],
               'projects': records, 'house_repairs': repairs['repairs']}
    write('comparison_manifest.json', manifest)
    write('source_comparison_2027.json', payload)
    write('current_pap_controls.json', {k: v for k, v in payload.items() if k != 'projects'})
    template = (VIEWERS / 'current_dashboard.template.html').read_text()
    embedded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    (VIEWERS / 'source_comparison_2027.html').write_text(template.replace('__PAYLOAD__', embedded))
    evidence = {'review': read('nep_2027_native_amount_review.json')['records'],
                'repairs': read('nep_2027_tree_validation.json')['repairs']}
    def embed(d):
        return json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    (VIEWERS / 'nep_2027_tree.html').write_text((VIEWERS / 'nep_tree_viewer.template.html').read_text()
        .replace('__TREE_DATA__', embed(tree)).replace('__EVIDENCE_DATA__', embed(evidence)))
    # The homepage now verifies three independent sources before comparisons.
    from build_source_verification import build as build_verification
    build_verification()
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    build()
