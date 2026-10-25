#!/usr/bin/env python3
"""Collate retained FY2027 source observations and infer provisional locations."""
from __future__ import annotations

import argparse
from collections import Counter
import csv
from decimal import Decimal
import gzip
import hashlib
import io
import json
from pathlib import Path
from functools import lru_cache
import sys
import tempfile

from locations import (SCORE_BASES, SCORE_BONUSES, SCORE_METHOD, SCORE_PENALTIES,
                       Matcher, normalize, score_location)

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'gps-analysis'))
from scan_gps_inventory import analyze_text

title_coordinates = lru_cache(maxsize=30000)(analyze_text)
OUTPUT = ROOT / 'master_list/data'
CATALOG = 'PSGC2LEG/data/psgc_locations.jsonl'
CATALOG_SUMMARY = 'PSGC2LEG/data/psgc_summary.json'


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def base(dataset, agency, stage, source_id, title, amount, path, **kwargs):
    if not isinstance(amount, int):
        raise ValueError(f'Noninteger PHP amount: {dataset}:{source_id}')
    return dict(record_id=f'{dataset}:{source_id}', dataset=dataset, agency=agency,
                stage=stage, fiscal_year=2027, source_record_id=str(source_id),
                title=title, amount_php=amount, source_dataset=path,
                record_kind='project', source_region='', implementing_office='',
                program='', subprogram='', structured_localities=[],
                source={}, **kwargs)


def observations(inputs):
    path = 'analysis/data/nep_2027_source_projects.json'
    data = read(path)
    inputs[path] = {'sha256': sha(ROOT / path), 'scope': data['scope']}
    for p in data['projects']:
        r = base('dpwh_nep_pdf', 'DPWH', 'nep', p['source_id'], p['title'], p['amount_php'], path)
        r.update(record_kind=p['allocation_kind'], program=p['program'], subprogram=p['pap3'],
                 source_region=p['region'], implementing_office=p['office'],
                 source={'pdf_page': p['pdf_page'], 'row_id': p['source_id'],
                         'source_pdf': data['source_pdf']}, source_flags=p.get('source_flags', []),
                 zone=p['zone'])
        yield r
    for suffix, stage in [('', 'house_second'), ('_3rd_reading', 'house_third')]:
        path = f'analysis/data/hb_dpwh_native_ic_projects{suffix}.json'
        data = read(path)
        inputs[path] = {'sha256': sha(ROOT / path), 'scope': data['scope']}
        def walk(n, ancestors):
            if n.get('additive') is False:
                return
            kids = [c for c in n['children'] if c.get('additive') is not False]
            if n['kind'] == 'fap_project' or not kids:
                r = base(f'dpwh_{stage}', 'DPWH', stage, n['id'], n['label'], n['printed_amount_php'], path)
                def last(kind):
                    return next((p['label'] for p in reversed(ancestors) if p['kind'] == kind), '')
                r.update(record_kind=n['kind'] if n['kind'] in {'project', 'fap_project'} else 'allocation',
                         source_kind=n['kind'], source_region=last('region'),
                         implementing_office=last('office'), program=last('program'),
                         subprogram=last('pap'), source=n['source'],
                         source_path=[{'kind': a['kind'], 'label': a['label']} for a in ancestors],
                         source_pdf=next((k for k in data['provenance_sha256'] if k.endswith('.pdf')), None))
                if n['kind'] == 'fap_project':
                    r['funding_php'] = {c['label']: c['printed_amount_php'] for c in kids}
                yield r
                return
            for child in kids:
                yield from walk(child, ancestors + [n])
        yield from walk(data['root'], [])

    path = 'dpwh-transparency-nep-data/json/fy2027-combined.json'
    data = read(path)['data']
    inputs[path] = {'sha256': sha(ROOT / path), 'scope': 'DPWH Transparency NEP listing; overlaps PDF observations'}
    for p in data['data']:
        amount = Decimal(str(p['amount'])) * 1000
        if amount != amount.to_integral_value():
            raise ValueError('API amount cannot be represented in integer PHP')
        r = base('dpwh_nep_api', 'DPWH', 'nep_api', p['code'], p['projectName'], int(amount), path)
        r.update(source_region=p['region'], implementing_office=p['office'], program=p['pap1'],
                 subprogram=p['pap3'], source={'api_id': p['id'], 'project_code': p['code']},
                 source_amount=p['amount'], source_amount_unit='thousand_php',
                 document_count=p.get('documentCount'), source_pap2=p['pap2'])
        yield r

    for sector, folder, agency in [('fmr', 'other-analysis', 'DA'),
                                    ('hfep', 'analysis-hfep', 'DOH'),
                                    ('nia', 'analysis-nia', 'NIA')]:
        for prefix, stage in [('nep', 'nep'), ('hgab', 'house_working_copy')]:
            if sector == 'nia' and prefix == 'nep':
                path = 'analysis-nia/data/nep_nia_dataset.json'
                data = read(path)
                inputs[path] = {'sha256': sha(ROOT / path), 'scope': 'NEP NIA project annex'}
                for p in data['projects']:
                    r = base('nia_nep', agency, stage, p['id'], p['label'], p['amount_php'], path)
                    r.update(program=p['program'], subprogram=p['sub_program'], source=p['provenance'],
                             source_pdf=data['meta']['source_pdf'], source_flags=p['flags'])
                    yield r
                continue
            path = f'{folder}/data/{prefix}_{sector}_tree.json'
            data = read(path)
            inputs[path] = {'sha256': sha(ROOT / path), 'scope': data['metadata']['scope'],
                            'legislative_stage': data['metadata']['legislative_stage']}
            nodes = {n['id']: n for n in data['nodes']}
            normalized = {}
            if sector == 'fmr':
                normalized_path = f'{folder}/data/{prefix}_fmr_coordinates_normalized.json'
                layer = read(normalized_path)
                if layer['metadata']['source_tree_sha256'] != sha(ROOT / path):
                    raise ValueError(f'Stale normalized coordinate layer: {normalized_path}')
                inputs[normalized_path] = {'sha256': sha(ROOT / normalized_path),
                                          'scope': 'Retained FMR coordinate interpretation; not a new geocode'}
                normalized = {p['project_id']: p for p in layer['projects']}
            for p in data['nodes']:
                if p['kind'] not in {'project', 'facility'}:
                    continue
                amounts = p.get('printed_amounts_php', {})
                amount = p.get('printed_amount_php', amounts.get('total'))
                r = base(f'{sector}_{prefix}', agency, stage, p['id'], p.get('title', p['label']), amount, path)
                parents = [nodes[k] for k in p['path_ids'][:-1]]
                r.update(record_kind=p['kind'], source=p['source'], source_path=p['path_labels'],
                         source_evidence_status=p.get('source_evidence_status'),
                         program=p['path_labels'][0], subprogram=p.get('subprogram_label', ''),
                         source_region=next((n['label'] for n in parents if n['kind'] == 'region_control'), ''),
                         structured_localities=[n['label'] for n in parents if n['kind'] == 'province_control'])
                if amounts:
                    r['amount_components_php'] = amounts
                if sector == 'fmr':
                    r['coordinates_raw'] = p.get('coordinates_raw')
                    r['coordinate_observations'] = p.get('coordinate_observations', [])
                    r['coordinate_review_flags'] = p.get('coordinate_review_flags', [])
                    norm = normalized[p['id']]
                    r['coordinate_interpretation'] = {k: norm.get(k) for k in
                        ['coordinates', 'status', 'review_flags', 'normalization_rules',
                         'coordinate_text_basis', 'image_review', 'points']}
                    r['coordinate_interpretation']['source_dataset'] = normalized_path
                    r['coordinate_interpretation']['coordinate_order'] = 'longitude_latitude'
                yield r


CSV_FIELDS = ['record_id', 'dataset', 'agency', 'stage', 'fiscal_year', 'record_kind',
              'title', 'amount_php', 'program', 'subprogram', 'source_region',
              'implementing_office', 'location_status', 'psgc_codes', 'psgc_names',
              'psgc_levels', 'region_codes', 'province_codes', 'municipality_city_codes',
              'barangay_codes', 'location_score', 'score_method',
              'needs_review', 'review_flags', 'candidate_codes',
              'coordinate_status', 'coordinate_point_count', 'coordinate_points',
              'source_dataset', 'source_record_id', 'pdf_page']


def flat(r):
    match = r['location']
    locations = match['locations']
    result = {k: r.get(k, '') for k in CSV_FIELDS}
    result.update(location_status=match['status'], location_score=match['score'],
                  score_method=match['score_method'], needs_review=match['needs_review'],
                  review_flags='|'.join(match['review_flags']),
                  candidate_codes='|'.join(match['candidate_codes']),
                  pdf_page=r['source'].get('pdf_page', r['source'].get('page', '')))
    for field, key in [('psgc_codes', 'psgc_code'), ('psgc_names', 'name'), ('psgc_levels', 'level')]:
        result[field] = '|'.join(l[key] for l in locations)
    for field, levels in [('region_codes', ['region']), ('province_codes', ['province']),
                          ('municipality_city_codes', ['city', 'municipality', 'sub_municipality']),
                          ('barangay_codes', ['barangay'])]:
        result[field] = '|'.join(sorted({l['ancestry'][level]['code'] for l in locations
                                         for level in levels if level in l['ancestry']}))
    result['coordinate_points'] = json.dumps(r['coordinate_summary']['points'], separators=(',', ':'))
    result['coordinate_status'] = r['coordinate_summary']['status']
    result['coordinate_point_count'] = r['coordinate_summary']['point_count']
    return result


def compressed_text(path):
    return io.TextIOWrapper(gzip.GzipFile(filename='', mode='wb', fileobj=path.open('wb'), mtime=0),
                            encoding='utf-8', newline='')


def build(out):
    catalog_rows = [json.loads(s) for s in (ROOT / CATALOG).read_text().splitlines()]
    matcher = Matcher(catalog_rows)
    inputs = {p: {'sha256': sha(ROOT / p)} for p in [CATALOG, CATALOG_SUMMARY,
              'gps-analysis/scan_gps_inventory.py', 'gps-analysis/coordinate_parse.py']}
    counts, sums, statuses, score_counts, kinds, review = Counter(), Counter(), {}, {}, {}, Counter()
    coordinate_counts = Counter()
    examples, seen = {}, set()
    with compressed_text(out / 'projects.jsonl.gz') as js, \
            compressed_text(out / 'projects.csv.gz') as cs, \
            compressed_text(out / 'location_review.csv.gz') as rs:
        writer, review_writer = [csv.DictWriter(s, fieldnames=CSV_FIELDS) for s in (cs, rs)]
        writer.writeheader()
        review_writer.writeheader()
        for r in observations(inputs):
            if r['record_id'] in seen:
                raise ValueError(f'Duplicate source record: {r["record_id"]}')
            seen.add(r['record_id'])
            # Allocations carry no site assertion; retain them in the ledger.
            is_allocation = r['record_kind'] not in {'project', 'facility', 'fap_project'}
            region_hint = matcher.region_code(r['source_region'])
            # An office province hint orders review suggestions only; it is
            # never assigned as a project site and never scores the record.
            office_hint = matcher.province_code(r['implementing_office'])
            match = json.loads(json.dumps(matcher.match(
                r['title'], tuple(r['structured_localities']), region_hint, office_hint)))
            if is_allocation:
                match = dict(status='allocation_not_site', method=None, verification_status=None,
                             locations=[], candidate_codes=[], suggestions=[], suggestion_method=None,
                             evidence=[],
                             review_flags=['allocation_is_not_a_project_site'], needs_review=False)
            r['location'] = match
            title_gps = title_coordinates(r['title']) if not is_allocation else None
            r['title_coordinate_evidence'] = title_gps
            coord = r.get('coordinate_interpretation') or title_gps or {}
            points = [{key: p.get(key) for key in ('longitude', 'latitude', 'role', 'issues')}
                      for p in coord.get('points', [])]
            r['coordinate_summary'] = {'status': coord.get('status', 'no_coordinates'),
                'source_field': 'coordinate_interpretation' if 'coordinate_interpretation' in r else
                                'title' if title_gps else None,
                'points': points, 'point_count': sum(p['longitude'] is not None and p['latitude'] is not None
                                                   for p in points)}
            inferred_regions = {l['ancestry']['region']['code'] for l in match['locations']
                                if 'region' in l['ancestry']}
            r['source_region_psgc_hint'] = region_hint
            if region_hint and inferred_regions and region_hint not in inferred_regions:
                match['review_flags'].append('source_region_differs_from_title_location')
                match['needs_review'] = True
            elif region_hint and inferred_regions:
                match['evidence'].append({'field': 'source_region',
                    'candidate_codes': [region_hint], 'locality_syntax': True,
                    'resolution_rule': 'source_region_agreement'})
            # Re-score after contextual flags (especially source-region
            # disagreement) have been added by the record builder.
            score_location(match)
            # Office names are retained as weak context only, never project codes.
            r['office_location_candidates'] = sorted({c for hit in matcher.find(r['implementing_office'])
                                                        for c in hit['codes']})
            r['office_province_hint'] = office_hint
            r['title_key'] = normalize(r['title'])
            dataset = r['dataset']
            counts[dataset] += 1
            if r['coordinate_summary']['point_count']:
                coordinate_counts[dataset] += 1
            sums[dataset] += r['amount_php']
            statuses.setdefault(dataset, Counter())[match['status']] += 1
            score_counts.setdefault(dataset, Counter())[match['score']] += 1
            kinds.setdefault(dataset, Counter())[r['record_kind']] += 1
            if match['needs_review']:
                review[dataset] += 1
                review_writer.writerow(flat(r))
            if len(examples.setdefault(match['status'], [])) < 4:
                examples[match['status']].append({'record_id': r['record_id'], 'title': r['title'],
                                                 'location': match})
            writer.writerow(flat(r))
            js.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    # Financial controls are independent of name matching. All House additive
    # leaves are included, including GAS/S2O, unlike the NEP operations-only PDF.
    expected = {
        'dpwh_nep_pdf': read('analysis/data/nep_2027_source_projects.json')['summary']['operations_php'],
        'dpwh_house_second': read('analysis/data/hb_dpwh_native_ic_projects.json')['root']['printed_amount_php'],
        'dpwh_house_third': read('analysis/data/hb_dpwh_native_ic_projects_3rd_reading.json')['root']['printed_amount_php'],
        'dpwh_nep_api': int(Decimal(str(read('dpwh-transparency-nep-data/json/fy2027-combined.json')['data']['summary']['totalAmount'])) * 1000),
        'nia_nep': read('analysis-nia/data/nep_nia_dataset.json')['meta']['grand_total'],
    }
    for prefix in ('nep', 'hgab'):
        data = read(f'other-analysis/data/{prefix}_fmr_tree.json')
        expected[f'fmr_{prefix}'] = next(n['printed_amount_php'] for n in data['nodes'] if n['parent_id'] is None)
    for dataset, path, field in [
        ('hfep_nep', 'analysis-hfep/data/nep_hfep_audit.json', 'facility_ledger_total_php'),
        ('hfep_hgab', 'analysis-hfep/data/hgab_hfep_audit.json', 'facility_ledger_total_php'),
        ('nia_hgab', 'analysis-nia/data/hgab_nia_audit.json', 'project_ledger_total_php'),
    ]:
        audit = read(path)
        inputs[path] = {'sha256': sha(ROOT / path), 'scope': 'Retained extraction ledger control'}
        if not audit['passed']:
            raise ValueError(f'Source extraction audit has not passed: {path}')
        expected[dataset] = audit['summary'][field]
    for dataset, amount in expected.items():
        if sums[dataset] != amount:
            raise ValueError(f'{dataset}: sum differs from source control')
    audit = {'schema_version': 3, 'scope': 'Retained FY2027 project and allocation observations; source/stage ledgers overlap. Never sum across datasets.',
             'identity_policy': 'One row per source observation; no cross-source project identity asserted.',
             'amount_checks': {key: {'expected_ledger_php': val, 'actual_php': sums[key],
                                     'difference_php': sums[key] - val} for key, val in expected.items()},
             'source_discrepancies': {'hfep_nep': read('analysis-hfep/data/nep_hfep_audit.json')['summary']['ledger_vs_grand_total_gap_php']},
             'psgc_foundation': read(CATALOG_SUMMARY),
             'location_policy': 'Provisional exact name inference only. Printed office/region context is not a project site. No generated coordinates or fuzzy matching.',
             'location_score_rules': {'method': SCORE_METHOD,
                                      'interpretation': 'Uncapped additive evidence score; not normalized and not a probability.',
                                      'bases': SCORE_BASES, 'bonuses': SCORE_BONUSES,
                                      'penalties': SCORE_PENALTIES},
             'input_files': inputs,
             'builder_sha256': {name: sha(Path(__file__).parent / name)
                               for name in ['build_master_list.py', 'locations.py']},
             'records': len(seen), 'datasets': {key: {'records': counts[key], 'amount_php': sums[key],
                 'record_kinds': dict(kinds[key]), 'location_status': dict(statuses[key]),
                 'location_score_distribution': {str(score): count for score, count in
                                                 sorted(score_counts[key].items())},
                 'records_with_coordinate_pairs': coordinate_counts[key],
                 'review_records': review[key]} for key in counts},
             'examples': examples,
             'output_sha256': {p.name: sha(p) for p in out.glob('*.gz')}}
    (out / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    lines = ['# Master list build report', '',
             f"{len(seen):,} source observations across {len(counts)} datasets. Records overlap across sources and budget stages; totals must be read within one dataset.", '',
             '| Dataset | Rows | PHP | Assigned | Review | Score min | Score max | Score mean |',
             '|---|---:|---:|---:|---:|---:|---:|---:|']
    for key in counts:
        distribution = score_counts[key]
        assigned = counts[key] - statuses[key]['unresolved'] - statuses[key]['allocation_not_site']
        mean = sum(score * n for score, n in distribution.items()) / counts[key]
        lines.append(f'| {key} | {counts[key]:,} | {sums[key]:,} | {assigned:,} | {review[key]:,} | '
                     f'{min(distribution)} | {max(distribution)} | {mean:.2f} |')
    total_scores = sum((counter for counter in score_counts.values()), Counter())
    lines += ['', f'Location evidence uses the uncapped additive `{SCORE_METHOD}` rules. Scores are raw evidence totals, not normalized values or probabilities. See the [scoring methodology and roadmap](../docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).',
              '', '## Raw location-score distribution', '', '| Score | Records |', '|---:|---:|']
    lines += [f'| {score} | {count:,} |' for score, count in sorted(total_scores.items())]
    lines += [
              '', 'All location inferences remain provisional. Codes use the retained PSGC2LEG catalog, whose foundation is a community mirror pending official PSA replacement. No title inference certifies an actual project site.',
              '', 'All ten ledgers reproduce their retained source controls. The NEP HFEP facility ledger remains PHP 140,000 below its printed grand total, as recorded in the source audit; collation preserves that discrepancy.',
              '', 'See `audit.json` for source hashes, exact examples, coverage, and output checksums. `location_review.csv.gz` contains the review queue.']
    (out / 'REPORT.md').write_text('\n'.join(lines) + '\n')
    return audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Rebuild and compare without modifying outputs')
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # Build all outputs before replacing a retained artifact.
    with tempfile.TemporaryDirectory(prefix='master-list-') as temp:
        out = Path(temp)
        audit = build(out)
        if args.check:
            stale = [p.name for p in out.iterdir() if not (OUTPUT / p.name).exists()
                     or sha(p) != sha(OUTPUT / p.name)]
            if stale:
                raise SystemExit('Stale master list outputs: ' + ', '.join(stale))
            print(f'Check passed: {audit["records"]:,} observations; all inputs and outputs match.')
        else:
            import shutil
            for p in out.iterdir():
                shutil.copyfile(p, OUTPUT / p.name)
            print((OUTPUT / 'REPORT.md').read_text())


if __name__ == '__main__':
    main()
