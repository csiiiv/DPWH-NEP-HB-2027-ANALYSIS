"""Scope-aware provisional selection and conservative clarification questions."""
from copy import deepcopy
import math

from review_catalog import validate_location_status, validate_review_flags

SCHEMA = 'cleaned_observations_v1'
ADOPTION = 'candidate_trial_adoption_v1'
FLAG_POLICY = 'review_questions_v1'
TARGET = 'municipality_city'
PROJECT_KINDS = {'project', 'facility', 'fap_project'}
ENABLED_FLAGS = ('location_unclear', 'location_alternatives', 'location_conflict')


def candidate_ref(code):
    return 'candidate:' + code


def town(code, matcher):
    chain = matcher.ancestry(code)
    return chain.get('city') or chain.get('municipality')


def related(a, b, matcher):
    return a in matcher.ancestry(b).values() or b in matcher.ancestry(a).values()


def selection(code, origin, scope, candidates, matcher):
    candidate = candidates.get(code, {})
    assessment = candidate.get('score_assessment')
    return {
        **matcher.describe(code), 'selection_origin': origin, 'claim_scope': scope,
        'assessment_ref': candidate_ref(code) if assessment else None,
        'candidate_support': ({'support_score': assessment['support_score'],
                               'dimensions': deepcopy(assessment['dimensions'])} if assessment else None),
        'evidence_quality': assessment['evidence_quality']['state'] if assessment else 'not_assessed',
        'scope_fit': assessment['scope_fit']['state'] if assessment else 'not_assessed',
        'warnings': deepcopy(assessment['application']['warnings']) if assessment else [],
    }


def proposal(profile, original_codes, candidates, matcher):
    """Consume only a pinned, coherent trial proposal; never choose by total."""
    summary = profile['context_scoring']
    if summary['trial_status'] != 'ready_for_trial':
        if summary.get('proposed_code') is not None:
            raise ValueError('Non-ready profile has a trial proposal')
        return None
    code = summary.get('proposed_code')
    if code not in candidates or code not in matcher.rows:
        raise ValueError('Trial proposal is missing its candidate')
    assessment = candidates[code].get('score_assessment', {})
    application = assessment.get('application', {})
    if (application.get('eligible_for_trial') is not True or application.get('blockers') != []
            or application.get('route') not in {'mapped_coordinates', 'existing_title_gate'}
            or application.get('scope') != summary.get('proposal_scope')):
        raise ValueError('Trial proposal does not pass its retained application gate')
    eligible = [c['code'] for c in candidates.values()
                if c.get('score_assessment', {}).get('application', {}).get('eligible_for_trial')]
    if any(not related(a, b, matcher) for a in eligible for b in eligible):
        raise ValueError('Trial proposal has rival eligible candidates')
    if any(c not in matcher.ancestry(code).values() for c in eligible):
        raise ValueError('Trial proposal is not the deepest eligible candidate')
    if original_codes and not set(original_codes) <= set(matcher.ancestry(code).values()):
        raise ValueError('Trial proposal would replace or erase an existing location scope')
    return code


def title_point_conflict(profile, coordinate, matcher):
    """Two disjoint single-locality readings, not mixed-point coverage or DEO."""
    if not coordinate or coordinate.get('coordinate_status') not in {'parsed', 'normalized'}:
        return False
    if profile.get('context', {}).get('coordinate_unmapped_points'):
        return False
    if any(c.get('score_assessment', {}).get('evidence_quality', {}).get('coordinates', {}).get('state') == 'requires_review'
           for c in profile.get('candidates', [])):
        return False
    points = coordinate.get('points', [])
    if not points or coordinate.get('point_count', len(points)) != len(points):
        return False
    chains = []
    for point in points:
        lat, lon = point.get('latitude'), point.get('longitude')
        if (point.get('matched') is not True or point.get('issues')
                or type(lat) not in (int, float) or type(lon) not in (int, float)
                or not math.isfinite(lat) or not math.isfinite(lon)
                or not -90 <= lat <= 90 or not -180 <= lon <= 180):
            return False
        units = (point.get('chain') or {}).values()
        codes = [p['code'] for p in units if p.get('code') in matcher.rows]
        if not codes or len(codes) != len(point.get('chain', {})):
            return False
        deepest = max(codes, key=lambda c: len(matcher.ancestry(c)))
        chain = matcher.ancestry(deepest)
        if any(c not in chain.values() for c in codes):
            return False
        chains.append(chain)
    readings = [r for r in profile.get('readings', []) if r['kind'] == 'title_only']
    if len(readings) != 1 or len(readings[0]['codes']) != 1:
        return False
    code = readings[0]['codes'][0]
    level = matcher.rows[code]['level']
    # An independent city's absent province is not a conflicting province.
    comparable = [chain.get(level) for chain in chains]
    return None not in comparable and len(set(comparable)) == 1 and comparable[0] != code


def competing_candidates(candidates, matcher):
    """Only actionable asserted title alternatives spanning different towns."""
    viable = []
    for c in candidates.values():
        assessment = c.get('score_assessment')
        if not assessment or c.get('title') != 'asserted' or not town(c['code'], matcher):
            continue
        if set(assessment['application']['blockers']) & {
                'asserted_title_conflict', 'conflicts_with_existing_title_application', 'spatial_scope_conflict'}:
            continue
        if any(c.get(key) in {'conflicts', 'mixed'} for key in
               ('printed_province', 'region', 'headings', 'registry')):
            continue
        if any(c.get(key) == 'agrees' for key in
               ('named_parent', 'printed_province', 'office_context', 'headings')):
            viable.append(c['code'])
    return sorted(viable) if len({town(c, matcher) for c in viable}) > 1 else []


def clean_observation(record, profile, coordinate, comparison, matcher, catalog):
    """Return a consumer row and a complete, record-local evidence companion."""
    if profile['record_id'] != record['record_id'] or profile['dataset'] != record['dataset']:
        raise ValueError('Profile identity differs from source observation')
    if coordinate and coordinate['record_id'] != record['record_id']:
        raise ValueError('Coordinate identity differs from source observation')
    candidates = {c['code']: c for c in profile['candidates']}
    if len(candidates) != len(profile['candidates']):
        raise ValueError('Duplicate interpretation candidate')
    if any(c not in matcher.rows for c in candidates):
        raise ValueError('Unknown candidate PSGC code')
    items = {
        'master_location': deepcopy(record['location']),
        'interpretation': deepcopy({k: v for k, v in profile.items() if k != 'candidates'}),
        'comparison': deepcopy(comparison),
        **{candidate_ref(code): deepcopy(c) for code, c in candidates.items()},
    }
    if coordinate:
        items['coordinate_psgc'] = deepcopy(coordinate)
    summary = profile['context_scoring']
    original_codes = [p['psgc_code'] for p in record['location']['locations']]
    if len(set(original_codes)) != len(original_codes):
        raise ValueError('Duplicate original location')
    selected, flags = [], []
    applicable = record['record_kind'] in PROJECT_KINDS
    if applicable != (profile['state'] != 'not_applicable'):
        raise ValueError('Profile applicability differs from source record kind')
    code = proposal(profile, original_codes, candidates, matcher) if applicable else None
    if not applicable:
        if original_codes:
            raise ValueError('Non-site allocation unexpectedly has an assigned site')
        decision, status = 'not_applicable', 'not_applicable'
    else:
        if code:
            app = candidates[code]['score_assessment']['application']
            scope = ('observed_coordinate_points' if app['route'] == 'mapped_coordinates'
                     else 'title_locality_claim')
            selected = [selection(code, 'candidate_trial_gate', scope, candidates, matcher)]
            decision = 'adopted_candidate'
        else:
            scope = ('registry_asset_location' if record['location']['status'] == 'registry_matched'
                     else 'retained_master_interpretation')
            selected = [selection(c, 'retained_master', scope, candidates, matcher) for c in original_codes]
            decision = 'retained_master' if selected else 'unresolved'
        sufficiently_resolved = bool(selected) and all(town(p['psgc_code'], matcher) for p in selected)
        has_useful_locality = any(town(p['psgc_code'], matcher) for p in selected)
        status = 'resolved' if sufficiently_resolved else 'partially_resolved' if selected else 'unresolved'
        rivals = competing_candidates(candidates, matcher) if not has_useful_locality and not code else []
        conflict = title_point_conflict(profile, coordinate, matcher)
        if conflict:
            flags.append({'code': 'location_conflict', 'status': 'open',
                          'evidence_refs': ['interpretation', 'coordinate_psgc']})
            status = 'ambiguous'
        if rivals:
            flags.append({'code': 'location_alternatives', 'status': 'open',
                          'evidence_refs': [candidate_ref(c) for c in rivals]})
            status = 'ambiguous'
        if not has_useful_locality and not flags:
            flags.append({'code': 'location_unclear', 'status': 'open',
                          'evidence_refs': ['master_location', 'interpretation']})
        if not selected and flags:
            decision = 'review_required'
    row = deepcopy({k: v for k, v in record.items() if k not in {'location', 'legislative_district'}})
    if record.get('legislative_district') is not None:
        row['legacy_legislative_district'] = deepcopy(record['legislative_district'])
    row['comparison'] = {k: deepcopy(v) for k, v in comparison.items() if k != 'upstream'}
    row['comparison']['evidence_ref'] = 'comparison'
    row['original_location_ref'] = 'master_location'
    row['original_master_score'] = record['location']['score']
    row['original_master_score_method'] = record['location']['score_method']
    row['location_resolution'] = {
        'status': status, 'decision': decision,
        'verification_status': 'provisional' if applicable else 'not_applicable',
        'target_level': TARGET, 'selected_locations': selected,
        'unresolved_levels': ([] if not applicable else
                              [level for level, present in (
                                  ('municipality_city', bool(selected) and all(town(p['psgc_code'], matcher) for p in selected)),
                                  ('barangay', bool(selected) and all(matcher.rows[p['psgc_code']]['level'] == 'barangay' for p in selected)),
                              ) if not present]),
        'whole_project_extent': 'not_assessed',
        'alternative_refs': [candidate_ref(c) for c in sorted(candidates)
                             if candidates[c].get('score_assessment') and c not in {p['psgc_code'] for p in selected}],
        'evidence_refs': ['master_location', 'interpretation'] + ([candidate_ref(code)] if code else []),
    }
    best = candidates.get(summary.get('best_candidate_code'), {}).get('score_assessment')
    row['candidate_support'] = {
        'method': summary['method'], 'best_candidate_code': summary['best_candidate_code'],
        'best_support_score': summary['best_support_score'],
        'best_dimensions': deepcopy(best['dimensions']) if best else None,
        'trial_status': summary['trial_status'],
    }
    row['review_flags'] = flags
    validate_location_status(status, catalog)
    validate_review_flags(flags, catalog, evidence_ids=items, review_event_ids=())
    refs = [row['original_location_ref'], row['comparison']['evidence_ref'], *row['location_resolution']['evidence_refs'],
            *row['location_resolution']['alternative_refs'],
            *[p['assessment_ref'] for p in selected if p['assessment_ref']]]
    if any(ref not in items for ref in refs):
        raise ValueError('Dangling cleaned location evidence reference')
    return row, {'record_id': record['record_id'], 'items': items}
