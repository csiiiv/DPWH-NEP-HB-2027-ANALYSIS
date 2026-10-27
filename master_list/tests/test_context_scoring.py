"""Candidate scores distinguish GPS support, uncertainty and application gates."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from build_location_interpretations import Interpreter
from context_scoring import METHOD, WEIGHTS
from master_list.tests.test_location_interpretations import catalog


class ContextScoring(unittest.TestCase):
    def setUp(self):
        self.engine = Interpreter(catalog())

    def record(self, title='Completion of Food Service Management Building', region='Region I', office=''):
        m = self.engine.matcher
        return dict(record_id='test:1', dataset='test', record_kind='project', title_clean=title,
                    source_region=region, implementing_office=office,
                    location=deepcopy(m.match(title, (), m.region_code(region), m.province_code(office))))

    def point(self, code, **extra):
        m = self.engine.matcher
        return dict(latitude=14.6, longitude=121.0, matched=True,
                    chain={k: {'code': c, 'name': m.rows[c]['name']} for k,c in m.ancestry(code).items()}, **extra)

    def run_score(self, record=None, points=None):
        record = record or self.record()
        return self.engine.assess(record, {'coordinate_status': 'parsed', 'points': [self.point('b1')] if points is None else points})

    def candidate(self, profile, code='b1'):
        return next(c for c in profile['candidates'] if c['code']==code)['score_assessment']

    def test_gps_receives_separate_support_and_point_scope_trial_proposal(self):
        record = self.record()
        before = deepcopy(record)
        p = self.run_score(record)
        a = self.candidate(p)
        self.assertEqual(record, before)
        self.assertEqual(record['location']['score'], 0)
        self.assertEqual(a['support_score'], 7)
        self.assertEqual(a['dimensions'], {'text': 0, 'spatial': 6, 'context': 1, 'registry': None})
        self.assertEqual(p['context_scoring']['proposed_code'], 'b1')
        self.assertEqual(p['context_scoring']['proposal_scope'], 'observed_coordinate_points')
        self.assertTrue(a['application']['eligible_for_trial'])
        self.assertFalse(a['application']['automatic_application'])
        self.assertIn('coordinate_reference_freshness_not_assessed', a['application']['warnings'])

    def test_repeated_points_do_not_add_independent_support(self):
        p = self.run_score(points=[self.point('b1')]*5)
        self.assertEqual(self.candidate(p)['support_score'], 7)
        self.assertEqual(self.candidate(p)['dimensions']['spatial'], 6)

    def test_ancestors_are_not_counted_as_additional_spatial_votes(self):
        p = self.run_score()
        spatial = [f for f in self.candidate(p)['factors'] if f['dimension']=='spatial']
        self.assertEqual(spatial, [{'dimension':'spatial','rule':'spatial_complete_barangay','impact':6}])

    def test_mixed_barangay_points_are_not_forced_into_one_barangay(self):
        p = self.run_score(points=[self.point('b1'),self.point('b3')])
        self.assertIsNone(p['context_scoring']['proposed_code'])
        self.assertEqual(self.candidate(p)['dimensions']['spatial'], 0)
        self.assertIn('points_do_not_all_support_candidate_scope', self.candidate(p)['application']['blockers'])

    def test_partial_mapping_is_scored_as_partial_and_blocks_trial(self):
        p = self.run_score(points=[self.point('b1'), {'matched':False,'chain':None}])
        a = self.candidate(p)
        self.assertEqual(a['dimensions']['spatial'], 3)
        self.assertIn('incomplete_point_mapping', a['application']['blockers'])
        self.assertFalse(a['application']['eligible_for_trial'])

    def test_positive_support_does_not_override_printed_province_conflict(self):
        p = self.run_score(self.record('Works, South Province', office='North Province Office'))
        a = self.candidate(p)
        self.assertGreater(a['support_score'], 0)
        self.assertIn('printed_province_conflict', a['application']['blockers'])
        self.assertIsNone(p['context_scoring']['proposed_code'])

    def test_region_conflict_blocks_trial_without_discarding_candidate(self):
        p = self.run_score(self.record(region='Region II'))
        self.assertIn('region_conflict', self.candidate(p)['application']['blockers'])
        self.assertFalse(self.candidate(p)['application']['eligible_for_trial'])

    def test_invalid_numbers_cannot_earn_spatial_points_or_trial_readiness(self):
        point = self.point('b1'); point['latitude']='bad'
        a = self.candidate(self.run_score(points=[point]))
        self.assertEqual(a['dimensions']['spatial'], 0)
        self.assertIn('invalid_or_missing_coordinate_numbers', a['application']['blockers'])

    def test_missing_gps_stays_unassessed(self):
        p = self.engine.assess(self.record('Road, Carmen, North Province'))
        candidate = next(c for c in p['candidates'] if c['master_selected'])
        self.assertIsNone(candidate['score_assessment']['dimensions']['spatial'])
        self.assertEqual(p['context_scoring']['trial_status'], 'already_selected')

    def test_office_alone_cannot_create_a_proposal(self):
        p = self.engine.assess(self.record('Completion works', office='North Province Office'))
        self.assertIsNone(p['context_scoring']['best_support_score'])
        self.assertIsNone(p['context_scoring']['proposed_code'])

    def test_existing_master_scope_is_not_replaced_by_incompatible_gps(self):
        p = self.run_score(self.record('Works, Carmen, South Province'))
        self.assertIn('rivals_or_coarsens_master_scope', self.candidate(p)['application']['blockers'])
        self.assertIsNone(p['context_scoring']['proposed_code'])

    def test_one_point_cannot_erase_part_of_a_multiple_location_assignment(self):
        record = self.record()
        record['location']['locations'] = [self.engine.matcher.describe(c) for c in ('t1','t3')]
        p = self.run_score(record)
        a = self.candidate(p)
        self.assertGreater(a['support_score'], 0)
        self.assertIn('rivals_or_coarsens_master_scope', a['application']['blockers'])
        self.assertIsNone(p['context_scoring']['proposed_code'])

    def test_asserted_names_must_fit_at_least_one_homonym_not_every_homonym(self):
        record = self.record('Works, Barangay Poblacion', region='')
        p = self.run_score(record)
        a = self.candidate(p)
        self.assertNotIn('asserted_title_conflict', a['application']['blockers'])
        self.assertTrue(a['application']['eligible_for_trial'])

    def test_coordinate_review_status_blocks_trial(self):
        p = self.engine.assess(self.record(), {'coordinate_status':'needs_review', 'points':[self.point('b1')]})
        self.assertIn('coordinate_status_requires_review', self.candidate(p)['application']['blockers'])
        self.assertIsNone(p['context_scoring']['proposed_code'])

    def test_existing_title_gate_remains_a_trial_route(self):
        record = self.record('Works, Barangay Poblacion, Carmen, North Province')
        record['location']['locations'] = []
        record['location']['status'] = 'ambiguous'
        record['location']['suggestions'] = [{'location': self.engine.matcher.describe('b1'),
            'support_score':11, 'factors':[], 'conflicts':[], 'review_only':False}]
        p = self.engine.assess(record)
        a = self.candidate(p)
        self.assertTrue(a['application']['eligible_for_trial'])
        self.assertEqual(a['application']['route'], 'existing_title_gate')
        self.assertEqual(p['context_scoring']['proposed_code'], 'b1')

    def test_province_only_barangay_support_does_not_bypass_title_review_only_gate(self):
        rows = catalog() + [dict(code='t4',name='Other Town',level='municipality',parent_code='p1'),
                            dict(code='b4',name='Poblacion',level='barangay',parent_code='t4')]
        self.engine = Interpreter(rows)
        record = self.record('Road, Barangay Poblacion, North Province',office='North Province Office')
        p = self.engine.assess(record)
        a = self.candidate(p)
        self.assertGreater(a['support_score'], 0)
        self.assertIn('title_candidate_review_only', a['application']['blockers'])
        self.assertIsNone(p['context_scoring']['proposed_code'])

    def test_conflicting_registry_context_is_not_a_positive_registry_vote(self):
        record = self.record()
        record['location']['evidence'].append({'field':'bridge_registry', 'candidate_codes':['b1','b2']})
        p = self.engine.assess(record)
        a = self.candidate(p)
        self.assertEqual(a['dimensions']['registry'], -4)
        self.assertIn('registry_conflict', a['application']['blockers'])
        self.assertFalse(a['application']['eligible_for_trial'])

    def test_scoring_definition_is_recorded_in_retained_audit(self):
        audit = json.loads((ROOT/'master_list/data/location_interpretations_audit.json').read_text())
        self.assertEqual(audit['context_scoring']['method'], METHOD)
        self.assertEqual(audit['context_scoring']['weights'], WEIGHTS)
