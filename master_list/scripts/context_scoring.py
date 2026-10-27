"""Experimental candidate evidence scores and non-destructive trial proposals.

Scores describe available support, not probabilities. A positive total never
bypasses a contradictory or incomplete application gate. Master/applied data
remain unchanged; the GPS route proposes the locality of observed points.
"""
from __future__ import annotations

import math
from location_assessments import candidate_assessments, ambiguity_summary

from build_applied_suggestions import gate_pass, town_named_in_title, refines_master, _normalize, GATE, BLOCKING

METHOD = 'context_evidence_v3'
WEIGHTS = {
    'asserted_title': 4,
    'named_parent': 3,
    'spatial_complete_barangay': 6,
    'spatial_complete_town': 4,
    'spatial_complete_province': 2,
    'spatial_complete_region': 1,
    'printed_province_agreement': 2,
    'printed_province_conflict': -4,
    'source_region_agreement': 1,
    'source_region_conflict': -2,
    'heading_agreement': 2,
    'heading_conflict': -2,
    'office_agreement': 1,
    'office_conflict': -1,
    'registry_agreement': 4,
    'registry_conflict': -4,
}
TIERS = {'barangay': ('barangay', 'barangay'), 'sub_municipality': ('sub_municipality', 'town'),
         'city': ('municipality_city', 'town'), 'municipality': ('municipality_city', 'town'),
         'province': ('province', 'province'), 'region': ('region', 'region')}
PARTIAL_SPATIAL_FACTOR = 0.5



def legacy_ready(record):
    """Reuse the existing title gate; do not invent another title policy."""
    suggestions = record['location'].get('suggestions', [])
    top = gate_pass(suggestions)
    if not top or not town_named_in_title(top, _normalize(record['title_clean'])):
        return None
    if record['location']['locations'] and not refines_master(top, record['location']['locations']):
        return None
    return top['location']['psgc_code']


def related(code, other, matcher):
    return code in matcher.ancestry(other).values() or other in matcher.ancestry(code).values()


def valid_coordinate_numbers(points):
    return bool(points) and all(
        type(p.get('latitude')) in (int, float) and type(p.get('longitude')) in (int, float)
        and math.isfinite(p['latitude']) and math.isfinite(p['longitude'])
        and -90 <= p['latitude'] <= 90 and -180 <= p['longitude'] <= 180
        for p in points)


def title_gate_blockers(code, record):
    suggestions = record['location'].get('suggestions', [])
    candidate = next((s for s in suggestions if s['location']['psgc_code'] == code), None)
    if candidate is None:
        return ['no_title_application_route']
    reasons = []
    if candidate.get('review_only'):
        reasons.append('title_candidate_review_only')
    if candidate['support_score'] < GATE['min_support_score']:
        reasons.append('title_support_below_gate')
    if BLOCKING & set(candidate.get('conflicts', [])):
        reasons.append('title_gate_context_conflict')
    if suggestions[0] is not candidate:
        reasons.append('competing_title_candidate')
    elif len(suggestions) > 1 and candidate['support_score'] - suggestions[1]['support_score'] < GATE['required_margin']:
        reasons.append('insufficient_title_margin')
    if not town_named_in_title(candidate, _normalize(record['title_clean'])):
        reasons.append('named_parent_required_for_title_application')
    if record['location']['locations'] and not refines_master(candidate, record['location']['locations']):
        reasons.append('title_candidate_rivals_master')
    return reasons or ['existing_title_gate_not_passed']


def assess_candidate(candidate, profile, record, coordinate, matcher, legacy_code):
    factors = []
    assessments = candidate_assessments(candidate, profile, record, coordinate, matcher)
    dimensions = {'text': 0, 'spatial': None, 'context': None, 'registry': None}

    def add(dimension, rule, points):
        dimensions[dimension] = (dimensions[dimension] or 0) + points
        factors.append({'dimension': dimension, 'rule': rule, 'impact': points})

    if candidate['title'] == 'asserted':
        add('text', 'asserted_title', WEIGHTS['asserted_title'])
    if candidate['named_parent'] == 'agrees':
        add('text', 'named_parent', WEIGHTS['named_parent'])
    level = matcher.rows[candidate['code']]['level']
    tier, spatial_kind = TIERS[level]
    spatial_rule = 'spatial_complete_' + spatial_kind
    spatial_max = WEIGHTS[spatial_rule]
    spatial = candidate['spatial'].get(tier, {})
    points = (coordinate or {}).get('points', [])
    if spatial.get('compared'):
        dimensions['spatial'] = 0
        if not valid_coordinate_numbers([p for p in points if p.get('chain')]):
            add('spatial', 'spatial_invalid_coordinate_numbers', 0)
        elif spatial['state'] == 'agrees':
            partial = bool(spatial.get('unassessed'))
            points = spatial_max * PARTIAL_SPATIAL_FACTOR if partial else spatial_max
            add('spatial', spatial_rule.replace('complete', 'partial') if partial else spatial_rule, points)
        else:
            add('spatial', 'spatial_' + spatial.get('state', 'not_assessed'), 0)
    for field, agreement, conflict in [
            ('printed_province', 'printed_province_agreement', 'printed_province_conflict'),
            ('region', 'source_region_agreement', 'source_region_conflict'),
            ('headings', 'heading_agreement', 'heading_conflict'),
            ('office_context', 'office_agreement', 'office_conflict')]:
        if candidate[field] == 'agrees':
            add('context', agreement, WEIGHTS[agreement])
        elif candidate[field] in {'conflicts', 'mixed'}:
            add('context', conflict, WEIGHTS[conflict])
    if candidate['registry'] in {'conflicts', 'mixed'}:
        add('registry', 'registry_conflict', WEIGHTS['registry_conflict'])
    elif candidate['registry_candidate'] or candidate['registry'] == 'agrees':
        add('registry', 'registry_agreement', WEIGHTS['registry_agreement'])

    blockers, warnings = [], []
    office_detail = assessments['dimension_details']['office']
    if office_detail['resolution'] in {'source_conflict','ambiguous','unresolved'}:
        warnings.append('office_context_requires_review')
    if candidate['office_context'] in {'conflicts','mixed'}:
        warnings.append('administrative_office_conflict')
    selected = {p['psgc_code'] for p in record['location']['locations']}
    code = candidate['code']
    if code in selected:
        blockers.append('already_selected')
    elif selected and not selected <= set(matcher.ancestry(code).values()):
        blockers.append('rivals_or_coarsens_master_scope')
    route = ('mapped_coordinates' if candidate['coordinate_candidate'] else
             'registry_review' if candidate['registry_candidate'] else 'existing_title_gate')
    if route == 'mapped_coordinates':
        points = (coordinate or {}).get('points', [])
        if not points:
            blockers.append('no_coordinate_points')
        if (coordinate or {}).get('coordinate_status') not in {'parsed', 'normalized'}:
            blockers.append('coordinate_status_requires_review')
        if (coordinate or {}).get('coordinate_status') == 'normalized':
            warnings.append('normalized_coordinates_review')
        if profile['context']['coordinate_unmapped_points'] or any(p.get('matched') is False for p in points):
            blockers.append('incomplete_point_mapping')
        if spatial.get('state') != 'agrees' or spatial.get('unassessed') or spatial.get('compared') != len(points):
            blockers.append('points_do_not_all_support_candidate_scope')
        if not valid_coordinate_numbers(points):
            blockers.append('invalid_or_missing_coordinate_numbers')
        if any(p.get('issues') for p in record.get('coordinate_summary', {}).get('points', [])):
            blockers.append('coordinate_issues_require_review')
        if assessments['evidence_quality']['coordinates']['state'] == 'requires_review':
            blockers.append('coordinate_quality_requires_review')
        warnings.extend(['observed_coordinate_points_only', 'coordinate_reference_freshness_not_assessed'])
        if candidate['office_context'] in {'conflicts', 'mixed'}:
            warnings.append('administrative_office_conflict')
        if candidate['printed_province'] == 'no_province_parent':
            warnings.append('independent_city_province_association')
    elif route == 'registry_review':
        blockers.append('registry_trial_route_requires_review')
    elif code != legacy_code:
        blockers.extend(title_gate_blockers(code, record))
    for field in ('printed_province', 'region', 'headings', 'registry'):
        if candidate[field] in {'conflicts', 'mixed'}:
            blockers.append(field + '_conflict')
    # A name pool is an interpretation alternative: at least one code
    # must fit. Do not require every national homonym to fit the point.
    for mention in profile['mentions']:
        if not mention['asserted'] or mention['field'] not in {'title', 'title_barangay', 'unmarked_parent_chain'}:
            continue
        pool = mention['codes']
        if (pool and all(matcher.rows[c]['level'] == 'province' for c in pool)
                and 'province' not in matcher.ancestry(code)):
            continue  # independent-city province association, not parentage
        if pool and not any(related(code, c, matcher) for c in pool):
            blockers.append('asserted_title_conflict')
    if legacy_code and not related(code, legacy_code, matcher):
        blockers.append('conflicts_with_existing_title_application')
    if route != 'mapped_coordinates' and spatial.get('state') in {'conflicts', 'mixed'}:
        blockers.append('spatial_scope_conflict')
    return {'support_score': sum(v for v in dimensions.values() if v is not None),
            'dimensions': dimensions, 'factors': factors,
            **assessments,
            'support_balance': {d: {'support': sum(f['impact'] for f in factors if f['dimension'] == d and f['impact'] > 0),
                                    'contradictions': sum(f['impact'] for f in factors if f['dimension'] == d and f['impact'] < 0)}
                                for d in dimensions},
            'application': {'route': route, 'eligible_for_trial': not blockers,
                            'blockers': sorted(set(blockers)), 'warnings': sorted(set(warnings)),
                            'scope': 'observed_coordinate_points' if route == 'mapped_coordinates' else 'title_hierarchy',
                            'automatic_application': False}}


def score_profile(profile, record, coordinate, matcher):
    """Score actionable candidates and select a reversible dry-run proposal."""
    profile['context_scoring'] = {'method': METHOD, 'assessed_candidates': 0,
        'best_candidate_code': None, 'best_support_score': None,
        'trial_status': 'not_applicable' if profile['state'] == 'not_applicable' else 'no_candidate',
        'proposed_code': None, 'proposal_scope': None,
        'has_quality_review': False, 'has_partial_scope': False, 'has_competing_candidates': False,
        'has_office_review': False,
        'ambiguity': {'state': 'not_assessed', 'by_level': [], 'top_tied_codes': []}}
    if profile['state'] == 'not_applicable':
        return
    profile['context_scoring']['has_office_review'] = profile['context']['office']['resolution'] in {'source_conflict','ambiguous','unresolved'}
    active = set(profile['review_suggestion_codes']) | {c['code'] for c in profile['candidates'] if c['master_selected']}
    legacy_code = legacy_ready(record)
    assessed = []
    for candidate in profile['candidates']:
        if candidate['code'] not in active:
            continue
        candidate['score_assessment'] = assess_candidate(candidate, profile, record, coordinate, matcher, legacy_code)
        assessed.append(candidate)
    if not assessed:
        return
    best = min(assessed, key=lambda c: (-c['score_assessment']['support_score'],
                                      -len(matcher.ancestry(c['code'])), c['code']))
    summary = profile['context_scoring']
    summary['ambiguity'] = ambiguity_summary(assessed, record, matcher)
    summary['has_competing_candidates'] = summary['ambiguity']['state'] == 'competing_candidates'
    summary['has_quality_review'] = any(c['score_assessment']['evidence_quality']['state'] == 'requires_review' for c in assessed)
    summary['has_partial_scope'] = any(c['score_assessment']['scope_fit']['state'] == 'partial' for c in assessed)
    summary['has_office_review'] |= any(c['office_context'] in {'conflicts','mixed'} for c in assessed)
    summary.update(assessed_candidates=len(assessed), best_candidate_code=best['code'],
                   best_support_score=best['score_assessment']['support_score'], trial_status='blocked')
    eligible = [c for c in assessed if c['score_assessment']['application']['eligible_for_trial']]
    if eligible:
        # Compatible ancestor/child routes may converge on one chain. Rival
        # chains are not resolved by picking the larger uncalibrated total.
        if all(related(a['code'], b['code'], matcher) for a in eligible for b in eligible):
            proposal = max(eligible, key=lambda c: len(matcher.ancestry(c['code'])))
            summary.update(trial_status='ready_for_trial', proposed_code=proposal['code'],
                           proposal_scope=proposal['score_assessment']['application']['scope'])
        else:
            summary['trial_status'] = 'ambiguous_trial_candidates'
            for candidate in eligible:
                application = candidate['score_assessment']['application']
                application['eligible_for_trial'] = False
                application['blockers'].append('rival_trial_candidate')
    elif all(c['master_selected'] for c in assessed):
        summary['trial_status'] = 'already_selected'
