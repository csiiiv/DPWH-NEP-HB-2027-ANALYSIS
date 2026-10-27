#!/usr/bin/env python3
"""Generate a plain CSV and a standalone HTML table from the retained master list."""
import argparse
import base64
from collections import Counter
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import shutil

from locations import SCORE_METHOD
from processing_release import load_release, read_jsonl, DIRECTORY as PROCESSING
from build_location_interpretations import load_profiles
from cleaned_release import load_cleaned, DIRECTORY as CLEANED


def compressed_text(path):
    return io.TextIOWrapper(gzip.GzipFile(filename='', mode='wb', fileobj=path.open('wb'), mtime=0),
                            encoding='utf-8', newline='')

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / 'master_list'
RECORDS = MASTER / 'data/projects.jsonl.gz'
TEMPLATE = MASTER / 'viewer/template.html'
CATALOG = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
DATASETS = {
    'dpwh_nep_pdf': 'DPWH · NEP PDF',
    'dpwh_house_second': 'DPWH · House second reading',
    'dpwh_house_third': 'DPWH · House third reading',
    'dpwh_nep_api': 'DPWH · NEP Transparency API',
    'fmr_nep': 'FMR · NEP', 'fmr_hgab': 'FMR · House working copy',
    'hfep_nep': 'HFEP · NEP', 'hfep_hgab': 'HFEP · House working copy',
    'nia_nep': 'NIA · NEP', 'nia_hgab': 'NIA · House working copy',
}
# The extraction stores an old absolute path for DPWH and the OCR JSON path
# for HFEP. These are the corresponding retained PDFs, with the same page basis.
PDF_ALIASES = {
    'dpwh_nep_pdf': 'dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf',
    'hfep_nep': 'dbm-other-nep-line-data/HFEP_2.pdf',
}
CSV_FIELDS = ['record_id', 'dataset', 'title', 'title_source', 'title_clean_method',
              'comparison_group_id', 'comparison_stage', 'category', 'value_php',
              'source_region', 'implementing_office', 'structured_localities',
              'office_province_hint', 'source_region_psgc_hint',
              'psgc_locations', 'psgc_codes', 'location_score', 'score_method',
              'location_status', 'needs_review', 'candidate_psgc_locations',
              'candidate_psgc_codes', 'suggested_psgc_locations',
              'suggested_psgc_codes', 'suggestion_support_scores',
              'reference_pdf', 'pdf_page', 'printed_page', 'record_kind', 'source_dataset',
              'leg_district', 'leg_district_label', 'leg_district_derivation',
              'interpretation_method', 'interpretation_state', 'location_candidate_count',
              'location_context_conflict', 'candidate_score_method', 'candidate_support_score',
              'candidate_score_psgc_code', 'candidate_score_dimensions',
              'candidate_evidence_quality', 'candidate_scope_fit', 'candidate_resolution',
              'location_ambiguity',
              'office_context_evidence', 'candidate_office_context',
              'trial_proposal_code', 'trial_proposal_status', 'trial_proposal_scope']


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def reference(row):
    if row['dataset'] == 'dpwh_nep_api':
        return None, None, None
    source = row['source']
    pdf = PDF_ALIASES.get(row['dataset']) or row.get('source_pdf') or source.get('source_pdf')
    page = source.get('pdf_page', source.get('page'))
    if not pdf or not pdf.endswith('.pdf') or not (ROOT / pdf).is_file():
        raise ValueError(f'Missing retained PDF: {row["record_id"]}: {pdf}')
    if not isinstance(page, int) or page < 1:
        raise ValueError(f'Invalid PDF page: {row["record_id"]}: {page}')
    return pdf, page, source.get('printed_page')


def category(row):
    if row['dataset'].startswith('hfep_'):
        path = row.get('source_path', [])
        if len(path) > 3:
            # Some categories go directly to region without a subcategory.
            labels = [path[1]]
            if re.match(r'^\d+\.', path[2]):
                labels.append(path[2])
            return ' / '.join(labels)
    if row['subprogram'] or row['program']:
        return row['subprogram'] or row['program']
    for ancestor in reversed(row.get('source_path', [])):
        if isinstance(ancestor, dict) and ancestor['kind'] in {'activity', 'section', 'expense_class'}:
            return ancestor['label']
    return 'Other allocation'


def place_view(loc):
    ancestry = loc['ancestry']
    parent_names = [ancestry[level]['name'] for level in
                    ['barangay', 'sub_municipality', 'municipality', 'city', 'province', 'region']
                    if level in ancestry and ancestry[level]['code'] != loc['psgc_code']]
    return {'name': loc['name'], 'code': loc['psgc_code'],
            'level': loc['level'], 'parents': ' · '.join(parent_names)}


def catalog_place(code, catalog):
    row = catalog[code]
    ancestry, parent = {}, code
    while parent:
        item = catalog[parent]
        ancestry[item['level']] = {'code': parent, 'name': item['name']}
        parent = item['parent_code']
    return place_view({'psgc_code': code, 'name': row['name'],
                       'level': row['level'], 'ancestry': ancestry})


def table_row(row, catalog, applied=None, coordinate=None):
    pdf, page, printed = reference(row)
    locations = []
    for loc in row['location']['locations']:
        locations.append(place_view(loc))
    assigned = {loc['code'] for loc in locations}
    candidates = [catalog_place(code, catalog) for code in row['location']['candidate_codes']
                  if code not in assigned]
    suggestions = []
    for suggestion in row['location'].get('suggestions', []):
        view = place_view(suggestion['location'])
        view.update(supportScore=suggestion['support_score'],
                    factors=suggestion['factors'], conflicts=suggestion['conflicts'])
        suggestions.append(view)
    applied_view = None
    # The applied-layer score is a complete ledger: a pinned applied score for
    # gate-passing rows, and the master evidence score carried over otherwise.
    applied_score = row['location']['score']
    applied_carry = True
    if applied:
        chain = applied['applied']
        view = place_view(chain)
        view.update(supportScore=chain['support_score'],
                    margin=chain['margin_over_second'],
                    method=chain['method'], score=chain['score'],
                    scoreFactors=chain['score_factors'],
                    gate=chain['gate'])
        applied_view = view
        applied_score, applied_carry = chain['score'], False
    gps_view = None
    if coordinate:
        points = []
        for point in coordinate['points']:
            chain_view = None
            if point.get('chain'):
                names = [v['name'] for v in point['chain'].values() if v['name']]
                chain_view = {'name': point['chain'].get('barangay', {}).get('name'),
                              'code': point['chain'].get('barangay', {}).get('code'),
                              'parents': ' · '.join(
                                  v['name'] for lvl, v in reversed(list(point['chain'].items()))
                                  if lvl != 'barangay' and v['name']) or None,
                              'levels': {lvl: v['code'] for lvl, v in point['chain'].items()}}
            points.append({'role': point.get('role'), 'chain': chain_view,
                           'matched': point.get('matched')})
        gps_view = {'method': coordinate['method'], 'agreement': coordinate['agreement'],
                    'pointCount': coordinate['point_count'], 'points': points}
    return {'id': row['record_id'], 'dataset': row['dataset'], 'title': row['title_clean'],
            'titleSource': row['title_source'], 'titleMethod': row['title_clean_method'],
            'titleRules': row['title_clean_rules'],
            'groupId': row['comparison_group_id'], 'comparisonStage': row['comparison_stage'],
            'scopeReason': row.get('scope_reason'),
            'coordinates': row['coordinate_summary'],
            'district': row.get('legislative_district'),
            'category': category(row), 'value': row['amount_php'], 'locations': locations,
            'candidates': candidates, 'suggestions': suggestions, 'applied': applied_view,
            'appliedScore': applied_score, 'appliedCarry': applied_carry,
            'gps': gps_view,
            'score': row['location']['score'],
            'scoreMethod': row['location']['score_method'],
            'scoreFactors': row['location']['score_factors'],
            'status': row['location']['status'], 'review': row['location']['needs_review'],
            'flags': row['location']['review_flags'], 'pdf': pdf, 'page': page, 'printed': printed,
            'kind': row['record_kind'], 'source': row['source_dataset'],
            'office': row.get('implementing_office', ''), 'sourceRegion': row.get('source_region', '')}


def review_suggestions_view(profile, legacy, catalog):
    """Join legacy support and all eligible context profiles by PSGC code."""
    by_code = {s['code']: dict(s) for s in legacy}
    eligible = set(profile.get('review_suggestion_codes', [])) | set(by_code)
    for candidate in profile['candidates']:
        code = candidate['code']
        if code not in eligible:
            continue
        view = by_code.setdefault(code, {**catalog_place(code, catalog),
                                        'supportScore': None, 'factors': [], 'conflicts': []})
        view['scoreAssessment'] = candidate.get('score_assessment')
        view['assessment'] = {k: candidate[k] for k in
            ('title', 'named_parent', 'printed_province', 'region', 'headings',
             'office_context', 'registry', 'spatial')}
        view['origins'] = [label for key, label in
            [('suggested', 'title hierarchy candidate'), ('coordinate_candidate', 'mapped coordinates'),
             ('registry_candidate', 'registry evidence')]
            if candidate[key]]
        if candidate['title'] == 'asserted' and candidate['named_parent'] == 'agrees':
            view['origins'].append('named locality and parent')
        elif candidate['title'] == 'asserted':
            view['origins'].append('named locality alternative')
        view['wording'] = [m['text'] for m in profile['mentions']
                           if m['id'] in candidate['evidence_ids']]
    return list(by_code.values())


def context_score_view(profile, catalog):
    summary = dict(profile['context_scoring'])
    by_code = {c['code']: c for c in profile['candidates']}
    best = by_code.get(summary['best_candidate_code'])
    summary['dimensions'] = best['score_assessment']['dimensions'] if best else None
    summary['bestAssessment'] = best['score_assessment'] if best else None
    summary['bestPlace'] = catalog_place(best['code'], catalog) if best else None
    summary['proposal'] = None
    if summary['proposed_code']:
        candidate = by_code[summary['proposed_code']]
        summary['proposal'] = {**catalog_place(candidate['code'], catalog),
                               'scoreAssessment': candidate['score_assessment']}
    return summary


def cleaned_row_view(row):
    """Compact display fields; full cleaned source remains in record packets."""
    resolution = row['location_resolution']
    selected = resolution['selected_locations']
    scores = [p['candidate_support']['support_score'] if p['candidate_support'] else None for p in selected]
    return {
        'status': resolution['status'], 'decision': resolution['decision'],
        'verification': resolution['verification_status'],
        'unresolvedLevels': resolution['unresolved_levels'],
        'extent': resolution['whole_project_extent'],
        'flags': row['review_flags'],
        'selectedSupport': min(scores) if scores and all(s is not None for s in scores) else None,
        'locations': [{**place_view(p), 'scope': p['claim_scope'],
                       'support': p['candidate_support'], 'assessmentRef': p['assessment_ref'],
                       'quality': p['evidence_quality'], 'scopeFit': p['scope_fit'],
                       'warnings': p['warnings'], 'origin': p['selection_origin']} for p in selected],
    }


def cleaned_bundle_evidence(bundle):
    """Reconstruct exact record-local evidence from shared packet objects."""
    profile = bundle['location_interpretation']
    items = {'master_location': bundle['record']['location'],
             'interpretation': {k: v for k, v in profile.items() if k != 'candidates'},
             'comparison': bundle['cleaned_comparison'],
             **{'candidate:' + c['code']: c for c in profile['candidates']}}
    if bundle['coordinate_psgc']:
        items['coordinate_psgc'] = bundle['coordinate_psgc']
    return {'record_id': bundle['record']['record_id'], 'items': items}


def compact_assessments(row):
    """Encode each candidate assessment once; the browser restores shared refs."""
    result = {**row, 'contextScore': dict(row['contextScore']),
              'suggestions': [dict(s) for s in row['suggestions']],
              'interpretation': {**row['interpretation'],
                  'candidates': [dict(c) for c in row['interpretation']['candidates']]}}
    if 'cleaned' in row:
        result['cleaned'] = {**row['cleaned'], 'locations': [dict(p) for p in row['cleaned']['locations']]}
    scores = {}

    def reference(code, assessment):
        if assessment is None:
            return None
        if code in scores and scores[code] != assessment:
            raise ValueError('Conflicting candidate assessments in one viewer observation')
        scores[code] = assessment
        return code

    context = result['contextScore']
    context['bestAssessment'] = reference(context['best_candidate_code'], context['bestAssessment'])
    if context['proposal']:
        context['proposal'] = dict(context['proposal'])
        proposal = context['proposal']
        proposal['scoreAssessment'] = reference(proposal['code'], proposal['scoreAssessment'])
    for suggestion in result['suggestions']:
        suggestion['scoreAssessment'] = reference(suggestion['code'], suggestion.get('scoreAssessment'))
    for candidate in result['interpretation']['candidates']:
        if 'score_assessment' in candidate:
            candidate['score_assessment'] = reference(candidate['code'], candidate['score_assessment'])
    for place in result.get('cleaned', {}).get('locations', []):
        place['scoreAssessment'] = reference(place['code'], place.get('scoreAssessment'))
    result['scoreAssessments'] = scores
    return result


class RecordPacketWriter:
    """Bounded companion packets, loaded only when a record modal opens."""
    def __init__(self, directory):
        self.directory = directory / 'record_details'
        self.directory.mkdir()
        self.lines, self.size, self.count, self.records = [], 0, 0, 0

    def add(self, bundle):
        line = json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n'
        size = len(line.encode('utf-8'))
        if size > 16 * 1024 * 1024:
            raise ValueError('Record details exceed the per-record loading bound')
        if self.lines and (len(self.lines) >= 64 or self.size + size > 4 * 1024 * 1024):
            self.flush()
        key = f'{self.count:04d}'
        self.lines.append(line)
        self.size += size
        self.records += 1
        return key

    def flush(self):
        if not self.lines:
            return
        binary = io.BytesIO()
        with gzip.GzipFile(filename='', mode='wb', fileobj=binary, compresslevel=6, mtime=0) as stream:
            stream.write(''.join(self.lines).encode('utf-8'))
        packed = base64.b64encode(binary.getvalue()).decode('ascii')
        key = f'{self.count:04d}'
        (self.directory / f'{key}.js').write_text(
            f'window.masterRecordPacketLoaded("{key}","{packed}");\n', encoding='utf-8')
        self.count += 1
        self.lines, self.size = [], 0


def comparison_groups(rows, groups):
    """Join by source identity, checking membership and stage amounts again."""
    by_id = {row['id']: row for row in rows}
    seen, group_ids, result = set(), set(), []
    for group in groups:
        gid = group['id']
        if gid in group_ids:
            raise ValueError(f'Duplicate viewer group: {gid}')
        group_ids.add(gid)
        for stage, side in group['stages'].items():
            ids = side['observation_ids']
            if not ids or len(ids) != len(set(ids)) or seen.intersection(ids):
                raise ValueError(f'Empty or reused viewer membership: {gid}:{stage}')
            members = [by_id[rid] for rid in ids]
            if any(r['groupId'] != gid or r['comparisonStage'] != stage for r in members):
                raise ValueError(f'Viewer group link differs: {gid}:{stage}')
            if sum(r['value'] for r in members) != side['amount_php']:
                raise ValueError(f'Viewer group amount differs: {gid}:{stage}')
            seen.update(ids)
        result.append(group)
    if seen != {r['id'] for r in rows if r['groupId']}:
        raise ValueError('Viewer comparison coverage differs from master observations')
    return result


def load_applied():
    """Load the derived applied-suggestions layer, pinned by its audit.

    The layer is optional at runtime only in the sense that it must be built
    (the same build chain regenerates it); a missing or stale file is an
    error, keeping viewer rows and the applied overlay in lockstep.
    """
    layer = MASTER / 'data/applied_suggestions.jsonl.gz'
    audit_path = MASTER / 'data/applied_suggestions_audit.json'
    audit = json.loads(audit_path.read_text())
    if audit['input']['sha256'] != digest(RECORDS):
        raise ValueError('Applied-suggestions layer was built from a different '
                         'master build; regenerate it before the viewer.')
    if audit['output_sha256']['applied_suggestions.jsonl.gz'] != digest(layer):
        raise ValueError('Applied-suggestions layer differs from its audit; regenerate it.')
    rows = {}
    with gzip.open(layer, 'rt', encoding='utf-8') as stream:
        for line in stream:
            row = json.loads(line)
            rows[row['record_id']] = row
    if len(rows) != audit['applied']:
        raise ValueError('Applied-suggestions row count differs from its audit.')
    return rows, audit


def load_coordinate_psgc():
    """Load the derived coordinate-PSGC layer, pinned by its audit.

    GPS points resolved through the local PSGC shapefiles; evidence for
    review, never an assignment. Built from the processing observations
    (readable_title_v1 discipline) so it stays independent of the master
    build; the pin here checks that upstream lineage.
    """
    layer = MASTER / 'data/coordinate_psgc.jsonl.gz'
    audit = json.loads((MASTER / 'data/coordinate_psgc_audit.json').read_text())
    observations = PROCESSING / 'observations.jsonl.gz'
    if audit['input']['path'] != str(observations.relative_to(ROOT)):
        raise ValueError('Coordinate-PSGC layer pins an unexpected input.')
    if audit['input']['sha256'] != digest(observations):
        raise ValueError('Coordinate-PSGC layer was built from a different '
                         'processing release; regenerate it before the viewer.')
    if audit['output_sha256']['coordinate_psgc.jsonl.gz'] != digest(layer):
        raise ValueError('Coordinate-PSGC layer differs from its audit; regenerate it.')
    rows = {}
    with gzip.open(layer, 'rt', encoding='utf-8') as stream:
        for line in stream:
            row = json.loads(line)
            rows[row['record_id']] = row
    if len(rows) != audit['records_with_points']:
        raise ValueError('Coordinate-PSGC row count differs from its audit.')
    return rows, audit


def build(out):
    audit = json.loads((MASTER / 'data/audit.json').read_text())
    processing = load_release()
    for name in ('audit.json', 'observations.jsonl.gz', 'comparison_groups.jsonl.gz'):
        path = PROCESSING / name
        if audit['input_files'].get(str(path.relative_to(ROOT)), {}).get('sha256') != digest(path):
            raise ValueError('Master uses a different processing release; rebuild the master list first.')
    catalog = {row['code']: row for row in
               (json.loads(line) for line in CATALOG.read_text().splitlines())}
    source_hash = digest(RECORDS)
    if source_hash != audit['output_sha256']['projects.jsonl.gz']:
        raise ValueError('Master records differ from the retained audit; rebuild the master list first.')
    applied_by_id, applied_audit = load_applied()
    coordinate_by_id, coordinate_audit = load_coordinate_psgc()
    profiles, profile_audit = load_profiles()
    cleaned_records, cleaned_manifest, review_catalog = load_cleaned()
    rows, counts, sums, references, scores = [], Counter(), Counter(), Counter(), Counter()
    record_packets = RecordPacketWriter(out)
    # The plain CSV exceeds Git's 100 MiB blob limit, so the retained export is
    # the deterministic project_list.csv.gz. The build still writes a plain
    # untracked copy for direct local spreadsheet use.
    plain = (out / 'project_list.csv').open('w', encoding='utf-8-sig', newline='')
    compressed = compressed_text(out / 'project_list.csv.gz')
    writer = csv.DictWriter(plain, fieldnames=CSV_FIELDS)
    writer.writeheader()
    compressed_writer = csv.DictWriter(compressed, fieldnames=CSV_FIELDS)
    compressed_writer.writeheader()
    with gzip.open(RECORDS, 'rt', encoding='utf-8') as stream:
        for line in stream:
            original = json.loads(line)
            r = table_row(original, catalog, applied_by_id.get(original['record_id']),
                          coordinate_by_id.get(original['record_id']))
            profile = next(profiles, None)
            if profile is None or profile['record_id'] != original['record_id']:
                raise ValueError('Location interpretation order/identity differs from master')
            cleaned_pair = next(cleaned_records, None)
            if cleaned_pair is None or cleaned_pair[0]['record_id'] != original['record_id']:
                raise ValueError('Cleaned observation order/identity differs from master')
            cleaned, cleaned_evidence = cleaned_pair
            if (cleaned['amount_php'] != original['amount_php'] or cleaned['title_source'] != original['title_source']
                    or cleaned['comparison_group_id'] != original['comparison_group_id']):
                raise ValueError('Cleaned source values differ from master')
            r['cleaned'] = cleaned_row_view(cleaned)
            profile_candidates = {c['code']: c for c in profile['candidates']}
            for place in r['cleaned']['locations']:
                place['scoreAssessment'] = profile_candidates.get(place['code'], {}).get('score_assessment')
            r['suggestions'] = review_suggestions_view(profile, r['suggestions'], catalog)
            r['contextScore'] = context_score_view(profile, catalog)
            r['support'] = r['contextScore']['best_support_score']
            bundle = {
                'record': original, 'location_interpretation': profile,
                'cleaned_record': cleaned, 'cleaned_comparison': cleaned_evidence['items']['comparison'],
                'candidate_locations': [catalog_place(c['code'], catalog) for c in profile['candidates']],
                'applied_suggestion': applied_by_id.get(original['record_id']),
                'coordinate_psgc': coordinate_by_id.get(original['record_id'])}
            if cleaned_bundle_evidence(bundle) != cleaned_evidence:
                raise ValueError('Cleaned evidence differs from shared master/profile evidence')
            r['detailsPacket'] = record_packets.add(bundle)
            # Embed a bounded preview for an affordable offline HTML file;
            # the separate JSONL retains every candidate without truncation.
            r['interpretation'] = {
                'method': profile['method'], 'state': profile['state'],
                'hasConflict': profile.get('has_conflict', False),
                'contextScoring': profile['context_scoring'],
                'count': len(profile['candidates']), 'context': profile['context'],
                'readings': [{**reading, 'places': [catalog_place(c, catalog) for c in reading['codes']]}
                             for reading in profile['readings'][:2]],
                'candidates': [{**c, 'place': catalog_place(c['code'], catalog),
                                'spatial': {k: v for k, v in c['spatial'].items()
                                            if v['compared'] or v['unassessed']}}
                               for c in profile['candidates'][:8]],
                'mentions': [{'id': m['id'], 'text': m['text'], 'field': m['field'],
                              'asserted': m['asserted']} for m in profile['mentions']]}
            rows.append(r)
            counts[r['dataset']] += 1
            sums[r['dataset']] += r['value']
            references['pdf' if r['pdf'] else 'api_without_pdf'] += 1
            scores[r['score']] += 1
            flat_row = dict(record_id=r['id'], dataset=r['dataset'], title=r['title'],
                title_source=r['titleSource'], title_clean_method=r['titleMethod'],
                comparison_group_id=r['groupId'] or '', comparison_stage=r['comparisonStage'] or '',
                category=r['category'], value_php=r['value'],
                source_region=original.get('source_region', ''),
                implementing_office=original.get('implementing_office', ''),
                structured_localities=' | '.join(original.get('structured_localities', [])),
                office_province_hint=original.get('office_province_hint') or '',
                source_region_psgc_hint=original.get('source_region_psgc_hint') or '',
                psgc_locations=' | '.join(l['name'] + ' (' + l['parents'] + ')' for l in r['locations']),
                psgc_codes='|'.join(l['code'] for l in r['locations']), location_status=r['status'],
                location_score=r['score'], score_method=r['scoreMethod'],
                needs_review=r['review'], reference_pdf=r['pdf'] or '', pdf_page=r['page'] or '',
                candidate_psgc_locations=' | '.join(
                    l['name'] + ' [' + l['level'] + '] (' + l['parents'] + ')' for l in r['candidates']),
                candidate_psgc_codes='|'.join(l['code'] for l in r['candidates']),
                suggested_psgc_locations=' | '.join(
                    l['name'] + ' [' + l['level'] + '] (' + l['parents'] + ')' for l in r['suggestions']),
                suggested_psgc_codes='|'.join(l['code'] for l in r['suggestions']),
                suggestion_support_scores='|'.join(str(l['supportScore']) if l['supportScore'] is not None else '' for l in r['suggestions']),
                printed_page=r['printed'] or '', record_kind=r['kind'], source_dataset=r['source'])
            district = r['district'] or {}
            flat_row.update(leg_district=district.get('leg_id') or '',
                leg_district_label=(f"{district.get('jurisdiction', '')} ({district.get('district_label', '')})").strip(' ()'),
                leg_district_derivation=district.get('derivation') or '')
            flat_row.update(interpretation_method=profile['method'],
                            interpretation_state=profile['state'],
                            location_candidate_count=len(profile['candidates']),
                            location_context_conflict=profile.get('has_conflict', False),
                            candidate_score_method=r['contextScore']['method'],
                            candidate_support_score=r['support'] if r['support'] is not None else '',
                            candidate_score_psgc_code=r['contextScore']['best_candidate_code'] or '',
                            candidate_score_dimensions=json.dumps(r['contextScore']['dimensions'], sort_keys=True),
                            candidate_evidence_quality=json.dumps(r['contextScore']['bestAssessment']['evidence_quality'] if r['contextScore']['bestAssessment'] else None, sort_keys=True),
                            candidate_scope_fit=json.dumps(r['contextScore']['bestAssessment']['scope_fit'] if r['contextScore']['bestAssessment'] else None, sort_keys=True),
                            candidate_resolution=json.dumps(r['contextScore']['bestAssessment']['resolution'] if r['contextScore']['bestAssessment'] else None, sort_keys=True),
                            location_ambiguity=json.dumps(r['contextScore']['ambiguity'], sort_keys=True),
                            office_context_evidence=json.dumps(profile['context'].get('office'), sort_keys=True),
                            candidate_office_context=json.dumps(r['contextScore']['bestAssessment']['dimension_details']['office'] if r['contextScore']['bestAssessment'] else None, sort_keys=True),
                            trial_proposal_code=r['contextScore']['proposed_code'] or '',
                            trial_proposal_status=r['contextScore']['trial_status'],
                            trial_proposal_scope=r['contextScore']['proposal_scope'] or '')
            writer.writerow(flat_row)
            compressed_writer.writerow(flat_row)
    record_packets.flush()
    plain.close()
    compressed.close()
    if next(profiles, None) is not None or next(cleaned_records, None) is not None or len(rows) != audit['records']:
        raise ValueError('Viewer count differs from master audit')
    for dataset, item in audit['datasets'].items():
        if counts[dataset] != item['records'] or sums[dataset] != item['amount_php']:
            raise ValueError(f'Viewer ledger differs from master: {dataset}')
    groups = comparison_groups(rows, read_jsonl('comparison_groups.jsonl.gz'))
    if len(groups) != processing['comparison_groups']:
        raise ValueError('Viewer comparison count differs from processing release')
    outside = sum(not r['groupId'] for r in rows)
    if outside != processing['not_compared_observations']:
        raise ValueError('Viewer outside-scope count differs from processing release')
    payload = {'datasets': DATASETS, 'rows': rows, 'groups': groups,
               'reviewCatalog': review_catalog,
               'cleanedRelease': {k: cleaned_manifest[k] for k in
                   ('schema_version', 'adoption_policy', 'flag_policy', 'counts', 'location_decisions', 'task')},
               'appliedSuggestion': {'method': applied_audit['method'],
                                     'applied': applied_audit['applied'],
                                     'minSupportScore': applied_audit['gate']['min_support_score'],
                                     'requiredMargin': applied_audit['gate']['required_margin']},
               'coordinatePsgc': {'method': coordinate_audit['method'],
                                  'records': coordinate_audit['records_with_points'],
                                  'resolvedPoints': coordinate_audit['points']['resolved'],
                                  'unresolvedPoints': coordinate_audit['points']['unresolved']}}
    # Stream bounded JSON packets through gzip. A single decompressed JSON
    # string can exceed browser fetch/string limits with the evidence layers.
    # Packets also keep temporary encoding memory bounded during generation.
    binary = io.BytesIO()
    with io.TextIOWrapper(gzip.GzipFile(filename='', mode='wb', fileobj=binary, mtime=0),
                          encoding='utf-8', newline='\n') as packed_stream:
        header = {k: v for k, v in payload.items() if k not in {'rows', 'groups'}}
        packed_stream.write(json.dumps(header, ensure_ascii=False, separators=(',', ':')) + '\n')
        for kind in ('rows', 'groups'):
            for offset in range(0, len(payload[kind]), 256):
                batch = payload[kind][offset:offset + 256]
                packet = {kind: [compact_assessments(r) for r in batch] if kind == 'rows' else batch}
                packed_stream.write(json.dumps(packet, ensure_ascii=False, separators=(',', ':')) + '\n')
    packed = base64.b64encode(binary.getvalue()).decode()
    template = TEMPLATE.read_text()
    if template.count('__MASTER_DATA_BASE64__') != 1:
        raise ValueError('Expected exactly one viewer data placeholder')
    (out / 'index.html').write_text(template.replace('__MASTER_DATA_BASE64__', packed), encoding='utf-8')
    manifest = {'schema_version': 7, 'records': len(rows), 'datasets': dict(counts),
                'cleaned_release': payload['cleanedRelease'],
                'assessment_encoding': 'psgc_code_references_v1',
                'record_details': {'records': record_packets.records, 'packets': record_packets.count,
                                   'max_records_per_packet': 64, 'loading': 'on_demand_companion_js_gzip'},
                'location_interpretations': {'method': profile_audit['method'],
                                            'states': profile_audit['states'],
                                            'review_suggestions': profile_audit['review_suggestions'],
                                            'preview_candidates_per_observation': 8},
                'comparison_groups': len(groups), 'not_compared_observations': outside,
                'title_clean_method': processing['title_clean_method'],
                'references': dict(references),
                'score_method': SCORE_METHOD,
                'context_scoring': profile_audit['context_scoring'],
                'applied_suggestions': {'method': applied_audit['method'],
                                        'applied': applied_audit['applied'],
                                        'by_master_status': applied_audit['applied_by_master_status'],
                                        'layer_sha256': digest(MASTER / 'data/applied_suggestions.jsonl.gz')},
                'coordinate_psgc': {'method': coordinate_audit['method'],
                                    'records': coordinate_audit['records_with_points'],
                                    'agreement_counts': coordinate_audit['agreement_counts'],
                                    'layer_sha256': digest(MASTER / 'data/coordinate_psgc.jsonl.gz')},
                'location_score_distribution': {str(score): count for score, count in sorted(scores.items())},
                'reference_policy': 'PDF pages are 1-based file pages. API records have no asserted PDF reference. HFEP OCR JSON points to the corresponding retained HFEP_2.pdf.',
                'input_sha256': {str(p.relative_to(ROOT)): digest(p) for p in
                    [RECORDS, MASTER / 'data/audit.json', MASTER / 'data/applied_suggestions.jsonl.gz',
                     MASTER / 'data/location_interpretations.jsonl.gz',
                     MASTER / 'data/location_interpretations_audit.json',
                     Path(__file__).with_name('build_location_interpretations.py'),
                     Path(__file__).with_name('context_scoring.py'),
                     Path(__file__).with_name('location_assessments.py'),
                     Path(__file__).with_name('office_context.py'),
                     MASTER / 'data/applied_suggestions_audit.json',
                     MASTER / 'data/coordinate_psgc.jsonl.gz',
                     MASTER / 'data/coordinate_psgc_audit.json',
                     PROCESSING / 'audit.json',
                     PROCESSING / 'comparison_groups.jsonl.gz', CATALOG, TEMPLATE, Path(__file__),
                     Path(__file__).with_name('processing_release.py'),
                     Path(__file__).with_name('cleaned_release.py'),
                     CLEANED / 'manifest.json',
                     *[CLEANED / name for name in cleaned_manifest['output_sha256']]]},
                'output_sha256': {str(p.relative_to(out)): digest(p) for p in
                    sorted(out.rglob('*')) if p.is_file() and p.name != 'project_list.csv'}}
    (out / 'viewer_manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='master-viewer-') as temp:
        out = Path(temp)
        manifest = build(out)
        targets = {'index.html': MASTER / 'index.html',
                   'project_list.csv.gz': MASTER / 'data/project_list.csv.gz',
                   'viewer_manifest.json': MASTER / 'data/viewer_manifest.json'}
        targets.update({name: MASTER / 'data' / name for name in manifest['output_sha256']
                        if name.startswith('record_details/')})
        if args.check:
            stale = [name for name, target in targets.items()
                     if not target.exists() or digest(target) != digest(out / name)]
            stale += [str(p.relative_to(MASTER / 'data'))
                      for p in (MASTER / 'data/record_details').glob('[0-9][0-9][0-9][0-9].js')
                      if str(p.relative_to(MASTER / 'data')) not in targets]
            if stale:
                raise SystemExit('Stale viewer outputs: ' + ', '.join(stale))
            print(f'Viewer check passed: {manifest["records"]:,} rows.')
        else:
            for name, target in targets.items():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(out / name, target)
            for old in (MASTER / 'data/record_details').glob('[0-9][0-9][0-9][0-9].js'):
                if str(old.relative_to(MASTER / 'data')) not in targets:
                    old.unlink()
            shutil.copyfile(out / 'project_list.csv', MASTER / 'data/project_list.csv')
            print(f'Generated {manifest["records"]:,} rows: master_list/index.html, '
                  'data/project_list.csv.gz (retained) and data/project_list.csv (local plain copy)')


if __name__ == '__main__':
    main()
