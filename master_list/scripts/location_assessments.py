"""Qualitative location assessments; none of these descriptors adds points."""
from collections import Counter
import math
from office_context import office_assessment

METHOD = 'location_assessments_v2'
LEVELS = ('region', 'province', 'municipality_city', 'sub_municipality', 'barangay')


def tier(level):
    return 'municipality_city' if level in {'city', 'municipality'} else level


def number_pair(point):
    return all(type(point.get(k)) in (int, float) and math.isfinite(point[k])
               and -limit <= point[k] <= limit
               for k, limit in [('latitude', 90), ('longitude', 180)])


def pool_at_level(codes, level, own, matcher):
    values = [next((c for l, c in matcher.ancestry(code).items() if tier(l) == level), None)
              for code in codes]
    values = [v for v in values if v is not None]
    if not values:
        return 'not_assessed'
    return 'agrees' if all(v == own for v in values) else 'mixed' if own in values else 'conflicts'


def coordinate_quality(profile, record, coordinate):
    coordinate = coordinate or {}
    points = coordinate.get('points', [])
    interpretation = record.get('coordinate_interpretation') or {}
    summary = record.get('coordinate_summary') or {}
    title_coordinates = record.get('title_coordinate_evidence') or {}
    source = coordinate.get('coordinate_source')
    extraction = interpretation if source == 'coordinate_interpretation' else title_coordinates
    flags = set(extraction.get('review_flags') or [])
    if source == 'coordinate_interpretation':
        flags.update(record.get('coordinate_review_flags') or [])
    for point in [*extraction.get('points', []), *summary.get('points', [])]:
        flags.update(point.get('issues') or [])
    if points and not all(number_pair(p) for p in points):
        flags.add('invalid_or_missing_coordinate_numbers')
    declared = coordinate.get('point_count')
    if declared is not None and declared != len(points):
        flags.add('coordinate_point_count_mismatch')
    expected = summary.get('point_count')
    if expected is not None and points and expected != len(points):
        flags.add('source_point_count_mismatch')
    status = coordinate.get('coordinate_status')
    if points and status not in {'parsed', 'normalized'}:
        flags.add('coordinate_status_requires_review')
    rules = set(extraction.get('normalization_rules') or [])
    for point in extraction.get('points', []):
        rules.update(point.get('rules') or [])
    unmapped = profile['context'].get('coordinate_unmapped_points', 0)
    state = ('not_assessed' if not points else 'requires_review' if flags else
             'partial' if unmapped else 'normalized' if status == 'normalized' else 'parsed')
    return {'state': state, 'source': source, 'status': status,
            'point_count': len(points), 'catalog_mapped_points': len(points) - unmapped,
            'normalization_rules': sorted(rules), 'review_flags': sorted(flags),
            'image_review_recorded': bool(extraction.get('image_review')),
            'reference_freshness': profile['context'].get('coordinate_reference_freshness', 'not_assessed'),
            'positional_accuracy': 'not_assessed'}


def registry_link(record):
    evidence = [e for e in record['location']['evidence'] if e['field'] == 'bridge_registry']
    statuses = sorted({e['registry_status'] for e in evidence if e.get('registry_status')})
    identifiers = sorted({b for e in evidence for b in e.get('bridge_ids', [])})
    exact = any(e.get('registry_status') == 'exact_id_match'
                or e.get('resolution_rule') == 'bridge_registry_id_match' for e in evidence)
    return {'identity': 'exact_id_match' if exact else 'unassessed_link' if
            any(e.get('candidate_codes') for e in evidence) else 'no_matched_asset' if evidence else 'not_assessed',
            'identifiers': identifiers, 'recorded_statuses': statuses,
            'reference_freshness': 'not_assessed'}


def candidate_assessments(candidate, profile, record, coordinate, matcher):
    code = candidate['code']
    ancestry = {tier(k): c for k, c in matcher.ancestry(code).items()}
    mentions = [m for m in profile['mentions'] if code in m['codes']]
    title_mentions = [m for m in mentions if m['field'] != 'source_locality_heading']
    roles = set()
    for mention in title_mentions:
        roles.add('reference_only' if not mention['asserted'] else
                  'explicit_locality' if mention['field'] == 'title_barangay' else
                  'inferred_locality' if mention['field'] == 'unmarked_parent_chain' else 'locality_reading')
    cq = coordinate_quality(profile, record, coordinate)
    link = registry_link(record)
    office = office_assessment(code, profile['context']['office'], matcher)
    source = record.get('source') or {}
    source = source if isinstance(source, dict) else {}
    page = source.get('pdf_page')
    locator = ('pdf_page' if (record.get('source_pdf') or source.get('source_pdf')) and page else
               'source_snapshot' if record.get('source_dataset') and record.get('source_record_id') else
               'source_reference' if record.get('source_dataset') else 'not_assessed')
    quality_state = ('requires_review' if cq['state'] == 'requires_review' or office['resolution']=='source_conflict' else 'partial' if
                     locator != 'pdf_page' or cq['state'] in {'partial', 'normalized'} or
                     (cq['point_count'] and cq['reference_freshness'] == 'not_assessed') or
                     link['identity'] in {'exact_id_match', 'unassessed_link'} else 'recorded_evidence')
    quality = {'method': METHOD, 'state': quality_state,
               'source': {'locator': locator, 'source_dataset': record.get('source_dataset'),
                          'source_pdf': record.get('source_pdf') or source.get('source_pdf'), 'pdf_page': page,
                          'source_accuracy': 'not_assessed'},
               'title': {'state': 'transformed' if record.get('title_clean_rules') else
                                  'retained' if 'title_source' in record else 'not_assessed',
                         'cleanup_rules': record.get('title_clean_rules', []), 'ocr_accuracy': 'not_assessed'},
               'coordinates': cq, 'registry': link,
               'office': {'resolution': office['resolution'], 'jurisdiction_boundaries': 'not_assessed'}}
    points = (coordinate or {}).get('points', [])
    valid_pairs = {(p['latitude'], p['longitude']) for p in points if number_pair(p)}
    roles_count = dict(sorted(Counter(p.get('role') or 'unspecified' for p in points).items()))
    own = candidate['spatial'].get(tier(matcher.rows[code]['level']), {})
    asserted = [m for m in profile['mentions'] if m['asserted'] and m['field'] != 'source_locality_heading']
    compatible = sum(any(c in matcher.ancestry(code).values() or code in matcher.ancestry(c).values()
                         for c in m['codes']) for m in asserted)
    title_scope = ('not_assessed' if not asserted else 'compatible' if compatible == len(asserted)
                   else 'partial' if compatible else 'conflicts')
    if points:
        scope_state = ('requires_review' if cq['state'] == 'requires_review' else
                       'conflicts' if own.get('state') == 'conflicts' else
                       'partial' if own.get('state') != 'agrees' or own.get('unassessed') else 'supported')
        claim_scope = 'observed_coordinate_points'
    else:
        scope_state = ('supported' if candidate['title'] == 'asserted' else
                       'supported' if candidate['registry_candidate'] and candidate['registry'] == 'agrees'
                       and link['identity'] == 'exact_id_match' else
                       'partial' if candidate['registry_candidate'] else 'not_assessed')
        claim_scope = 'title_locality_claim' if candidate['title'] == 'asserted' else (
            'registry_asset_location' if candidate['registry_candidate'] else 'not_assessed')
    notes = ['whole_project_extent_not_assessed']
    if 'start' in roles_count or 'end' in roles_count:
        notes.append('endpoints_do_not_establish_alignment')
    if len(points) > len(valid_pairs) and all(number_pair(p) for p in points):
        notes.append('repeated_points_are_not_independent')
    scope = {'state': scope_state, 'claim_scope': claim_scope,
             'whole_project_extent': 'not_assessed', 'title_scope': title_scope,
             'point_count': len(points), 'unique_point_count': len(valid_pairs),
             'point_roles': roles_count, 'candidate_level_coverage': own,
             'notes': notes}
    context = {k: candidate[k] for k in ('printed_province', 'region', 'headings', 'office_context')}
    levels = []
    for level in LEVELS:
        unit = ancestry.get(level)
        if unit is None:
            levels.append({'level': level, 'code': None, 'name': None,
                           'state': 'not_applicable' if level == 'sub_municipality' or
                           (level == 'province' and 'municipality_city' in ancestry) else 'not_assessed'})
            continue
        text_pools = [pool_at_level(m['codes'], level, unit, matcher) for m in asserted]
        text_state = ('mixed' if 'agrees' in text_pools and 'conflicts' in text_pools else
                      'agrees' if 'agrees' in text_pools else 'possible_reading' if 'mixed' in text_pools else
                      'conflicts' if 'conflicts' in text_pools else 'not_assessed')
        spatial = candidate['spatial'].get(level, {})
        local_context = {
            'printed_province': pool_at_level(profile['context']['printed_province_codes'], level, unit, matcher)
                if level == 'province' else 'not_assessed',
            'region': ('agrees' if profile['context']['region_code'] == unit else 'conflicts')
                if level == 'region' and profile['context']['region_code'] else 'not_assessed',
            'headings': pool_at_level(profile['context']['heading_codes'], level, unit, matcher),
            'office_context': office_assessment(unit, profile['context']['office'], matcher,
                                                level='city' if level=='municipality_city' and matcher.rows[unit]['level']=='city' else level)['state']}
        reg_state = pool_at_level(profile['context']['registry_codes'], level, unit, matcher)
        signals = [text_state, spatial.get('state'), reg_state, *local_context.values()]
        state = ('mixed' if 'mixed' in signals else 'conflicting_evidence' if 'conflicts' in signals else
                 'supported' if text_state == 'agrees' or reg_state == 'agrees' or
                 (spatial.get('state') == 'agrees' and not spatial.get('unassessed') and cq['state'] != 'requires_review') or
                 any(v == 'agrees' for k, v in local_context.items() if k != 'office_context') else
                 'partial_support' if text_state == 'possible_reading' or spatial.get('state') == 'agrees' else
                 'context_only' if local_context['office_context'] == 'agrees' else 'not_assessed')
        levels.append({'level': level, 'code': unit, 'name': matcher.rows[unit]['name'], 'state': state,
                       'text': text_state, 'spatial': spatial, 'context': local_context, 'registry': reg_state})
    return {'evidence_quality': quality, 'scope_fit': scope, 'resolution': levels,
            'dimension_details': {'text': {'roles': sorted(roles) or ['not_assessed'],
                                           'mention_ids': [m['id'] for m in title_mentions]},
                                 'spatial': {'level': tier(matcher.rows[code]['level']),
                                             'coverage': own, 'point_roles': roles_count},
                                 'context': context,
                                 'office': office,
                                 'registry': {'link': link, 'location_agreement': candidate['registry']}}}


def ambiguity_summary(assessed, record, matcher):
    """Count alternatives at each level; multiple selected sites are not rivals."""
    selected = [matcher.ancestry(p['psgc_code']) for p in record['location']['locations']]
    levels = []
    for level in LEVELS:
        codes = sorted({code for c in assessed for k, code in matcher.ancestry(c['code']).items() if tier(k) == level})
        master_codes = {code for a in selected for k, code in a.items() if tier(k) == level}
        observed = {code for c in assessed if c['coordinate_candidate']
                    for k, code in matcher.ancestry(c['code']).items() if tier(k) == level}
        basis = ('master_assignment' if set(codes) <= master_codes else
                 'mapped_points' if set(codes) <= observed else 'alternative_readings')
        state = ('not_assessed' if not codes else 'single_candidate' if len(codes) == 1 else
                 'multiple_locations' if basis != 'alternative_readings' else 'competing_candidates')
        levels.append({'level': level, 'state': state, 'codes': codes, 'basis': basis})
    best_score = max((c['score_assessment']['support_score'] for c in assessed), default=None)
    ties = [c['code'] for c in assessed if c['score_assessment']['support_score'] == best_score]
    return {'by_level': levels, 'top_tied_codes': sorted(ties) if len(ties) > 1 else [],
            'state': 'competing_candidates' if any(l['state'] == 'competing_candidates' for l in levels)
                     else 'multiple_locations' if any(l['state'] == 'multiple_locations' for l in levels)
                     else 'single_candidate' if assessed else 'not_assessed'}
