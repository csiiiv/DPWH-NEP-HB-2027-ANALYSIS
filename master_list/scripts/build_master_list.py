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

from locations import (SCORE_BASES, SCORE_BONUSES, SCORE_FLAG_BONUSES, SCORE_METHOD,
                       SCORE_PENALTIES, Matcher, normalize, score_location)

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
              'barangay_codes', 'leg_district', 'leg_district_label', 'leg_district_derivation',
              'location_score', 'score_method',
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
    district = r.get('legislative_district') or {}
    result['leg_district'] = district.get('leg_id') or ''
    result['leg_district_label'] = (f"{district.get('jurisdiction', '')} "
                                    f"({district.get('district_label', '')})").strip(' ()')
    result['leg_district_derivation'] = district.get('derivation') or ''
    return result


def load_leg_assignments():
    """Verified municipality/city -> legislative district assignments (PSGC2LEG).

    The 2025/20th Congress baseline; municipality-level is the committed
    target, split cities carry multi_district_city records.
    """
    path = ROOT / 'PSGC2LEG/data/psgc_leg_assignments.jsonl'
    districts = json.loads((ROOT / 'PSGC2LEG/data/legislative_districts.json').read_text())['districts']
    by_code = {}
    for line in path.read_text().splitlines():
        row = json.loads(line)
        by_code[row['psgc_code']] = row
    return by_code, {d['leg_id']: d for d in districts}, path


def attach_legislative_district(record, location, by_code, districts):
    """Record the verified district for the assigned municipality-level locations.

    This is a lookup of the already-assigned location, not new location
    evidence: it adds no score and changes no status. Registry-matched
    records carry the bridge's coordinate-derived district when available.
    """
    municipal = sorted({l['ancestry'][level]['code'] for l in location['locations']
                        for level in ('city', 'municipality', 'sub_municipality')
                        if level in l['ancestry']})
    if not municipal:
        return None
    assignments = [by_code.get(code) for code in municipal]
    assignments = [a for a in assignments if a and a.get('leg_id')]
    if not assignments:
        return None
    leg_ids = sorted({a['leg_id'] for a in assignments})
    if len(leg_ids) != 1:
        return None
    assignment = next(a for a in assignments if a['leg_id'] == leg_ids[0])
    district = districts.get(leg_ids[0])
    if not district:
        return None
    return {
        'leg_id': district['leg_id'],
        'jurisdiction': district['jurisdiction'],
        'district_label': district['district_label'],
        'district_no': district['district_no'],
        'assignment_type': assignment['assignment_type'],
        'derivation': 'assigned_municipality_join',
    }


def compressed_text(path):
    return io.TextIOWrapper(gzip.GzipFile(filename='', mode='wb', fileobj=path.open('wb'), mtime=0),
                            encoding='utf-8', newline='')


def load_bridge_registry():
    """Join evidence from the retained DPWH bridge inventory archive.

    The inventory module matches budget observations to inventory bridges by
    exact BRIDGE_ID and derives current-PSGC chains from 2023 barangay
    polygon hits. This build consumes that retained evidence read-only: a
    stable registry identifier is independent location evidence (roadmap
    item 3), recorded as its own factors so agreement and conflict stay
    auditable. The inventory snapshot stays pinned by its own audit.
    """
    matches_path = ROOT / 'bridge_inventory/data/bridge_project_matches.jsonl.gz'
    spatial_path = ROOT / 'bridge_inventory/data/bridge_spatial_evidence.jsonl.gz'
    registry = {}
    spatial = {}
    with gzip.open(spatial_path, 'rt') as stream:
        for line in stream:
            row = json.loads(line)
            spatial[row['bridge_id']] = row
    with gzip.open(matches_path, 'rt') as stream:
        for line in stream:
            row = json.loads(line)
            chains = []
            districts = []
            for m in row.get('matches', []):
                evidence = spatial.get(m['bridge_id'])
                candidates = evidence.get('current_psgc_candidates', []) if evidence else []
                if len(candidates) == 1:
                    chains.append(candidates[0])
                district = evidence.get('legislative_district') if evidence else None
                if district:
                    districts.append(district)
            unique_districts = {d['leg_id']: d for d in districts}
            registry[row['record_id']] = {
                'status': row['status'],
                'bridge_ids': row.get('bridge_ids', []),
                'chains': chains,
                'districts': sorted(unique_districts.values(), key=lambda d: d['leg_id']),
            }
    return registry, [matches_path, spatial_path]


def apply_bridge_registry(match, registry_entry, matcher):
    """Attach registry evidence factors; assign only when the title gave none.

    An exact BRIDGE_ID match means the project works on that existing bridge,
    so the inventory position is strong evidence. It still cannot override a
    title-asserted location: agreements add a factor, disagreements keep the
    title answer with a review penalty, and an empty title parse adopts the
    registry chain as registry_matched, subject to its single-chain rule.
    """
    if not registry_entry:
        return
    if registry_entry['status'] != 'exact_id_match':
        # A title that only mentions a bridge, or names an ID absent from the
        # inventory, carries no registry location evidence. Retain an unscored
        # note for auditability only.
        match.setdefault('evidence', []).append({
            'field': 'bridge_registry', 'candidate_codes': [],
            'registry_status': registry_entry['status'],
        })
        return
    match.setdefault('evidence', []).append({
        'field': 'bridge_registry', 'candidate_codes': [],
        'resolution_rule': 'bridge_registry_id_match',
        'bridge_ids': registry_entry['bridge_ids'],
        'registry_status': registry_entry['status'],
    })
    chains = registry_entry['chains']
    assigned_scope = {loc['psgc_code'] for loc in match['locations']}
    for loc in match['locations']:
        assigned_scope.update(v['code'] for v in loc['ancestry'].values())
    chain_codes = {step['code'] for chain in chains for step in chain['chain']}
    if len({chain['code'] for chain in chains}) == 1:
        match['evidence'].append({
            'field': 'bridge_registry', 'candidate_codes': [chains[0]['code']],
            'resolution_rule': 'bridge_registry_unique_chain',
        })
    if assigned_scope and chain_codes:
        if assigned_scope & chain_codes:
            match['evidence'].append({
                'field': 'bridge_registry', 'candidate_codes': sorted(chain_codes),
                'resolution_rule': 'bridge_registry_agreement',
            })
        elif len({step['code'] for chain in chains for step in chain['chain']
                   if step['level'] in {'municipality', 'city', 'sub_municipality'}}) == 1:
            match['review_flags'].append('bridge_registry_conflicts_with_title_location')
            match['needs_review'] = True
    elif not assigned_scope and len({chain['code'] for chain in chains}) == 1:
        chain = chains[0]
        match.update(status='registry_matched',
                     method='bridge_registry_exact_id',
                     verification_status='provisional_registry_match',
                     locations=[matcher.describe(chain['code'])],
                     needs_review=False)
        match['evidence'].append({
            'field': 'bridge_registry', 'candidate_codes': [chain['code']],
            'resolution_rule': 'bridge_registry_unique_chain',
        })


def build(out):
    catalog_rows = [json.loads(s) for s in (ROOT / CATALOG).read_text().splitlines()]
    matcher = Matcher(catalog_rows)
    inputs = {p: {'sha256': sha(ROOT / p)} for p in [CATALOG, CATALOG_SUMMARY,
              'gps-analysis/scan_gps_inventory.py', 'gps-analysis/coordinate_parse.py']}
    bridge_registry, registry_paths = load_bridge_registry()
    for path in registry_paths:
        inputs[str(path.relative_to(ROOT))] = {'sha256': sha(path),
            'scope': 'Retained DPWH bridge inventory exact-ID match and spatial PSGC evidence (read-only)'}
    leg_by_code, leg_districts, leg_path = load_leg_assignments()
    inputs[str(leg_path.relative_to(ROOT))] = {'sha256': sha(leg_path),
        'scope': 'Verified PSGC2LEG municipality-to-legislative-district assignments (read-only)'}
    counts, sums, statuses, score_counts, kinds, review = Counter(), Counter(), {}, {}, {}, Counter()
    district_counts = {}
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
            # Bridge-registry evidence joins after title parsing: independent
            # factors for agreement/conflict, registry_matched only when the
            # title parse asserted no location at all.
            apply_bridge_registry(match, bridge_registry.get(r['record_id']), matcher)
            # Re-score after contextual flags (especially source-region
            # disagreement and registry evidence) have been added.
            score_location(match)
            # Legislative district is a lookup of the final assignment, not new
            # location evidence: unscored, recorded for every assigned record.
            registry_entry = bridge_registry.get(r['record_id'])
            if match['status'] == 'registry_matched' and registry_entry and len(registry_entry['districts']) == 1:
                district = dict(registry_entry['districts'][0])
                district['derivation'] = 'bridge_coordinate_join'
                r['legislative_district'] = district
            else:
                r['legislative_district'] = attach_legislative_district(
                    r, match, leg_by_code, leg_districts)
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
            if r.get('legislative_district'):
                district_counts.setdefault(dataset, Counter())[r['legislative_district']['derivation']] += 1
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
             'legislative_district_policy': 'Lookup of the final assigned location through the verified PSGC2LEG municipality-to-district assignments; unscored and never new location evidence. Bridge-registry records carry the bridge coordinate-derived district.',
             'amount_checks': {key: {'expected_ledger_php': val, 'actual_php': sums[key],
                                     'difference_php': sums[key] - val} for key, val in expected.items()},
             'source_discrepancies': {'hfep_nep': read('analysis-hfep/data/nep_hfep_audit.json')['summary']['ledger_vs_grand_total_gap_php']},
             'psgc_foundation': read(CATALOG_SUMMARY),
             'location_policy': 'Provisional exact name inference only. Printed office/region context is not a project site. No generated coordinates or fuzzy matching.',
             'location_score_rules': {'method': SCORE_METHOD,
                                      'interpretation': 'Uncapped additive evidence score; not normalized and not a probability.',
                                      'bases': SCORE_BASES, 'bonuses': SCORE_BONUSES,
                                      'flag_bonuses': SCORE_FLAG_BONUSES,
                                      'penalties': SCORE_PENALTIES},
             'input_files': inputs,
             'builder_sha256': {name: sha(Path(__file__).parent / name)
                               for name in ['build_master_list.py', 'locations.py']},
             'records': len(seen), 'datasets': {key: {'records': counts[key], 'amount_php': sums[key],
                 'record_kinds': dict(kinds[key]), 'location_status': dict(statuses[key]),
                 'location_score_distribution': {str(score): count for score, count in
                                                 sorted(score_counts[key].items())},
                 'records_with_coordinate_pairs': coordinate_counts[key],
                 'review_records': review[key],
                 'legislative_districts': dict(district_counts.get(key, {}))} for key in counts},
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
