"""Quality, scope and hierarchy explain evidence without manufacturing points."""
from copy import deepcopy
import unittest

from master_list.tests import test_context_scoring as scoring_fixtures


class LocationAssessments(unittest.TestCase):
    def setUp(self):
        self.fixture = scoring_fixtures.ContextScoring()
        self.fixture.setUp()

    def assess(self, record=None, points=None, **coordinate):
        record = record or self.fixture.record()
        coordinate = dict(coordinate_status='parsed', **coordinate)
        coordinate['points'] = [self.fixture.point('b1')] if points is None else points
        profile = self.fixture.engine.assess(record, coordinate)
        candidate = next(c for c in profile['candidates'] if c['code'] == 'b1')
        return profile, candidate['score_assessment']

    def test_point_support_does_not_certify_accuracy_or_whole_project_extent(self):
        record = self.fixture.record()
        record.update(source_pdf='test.pdf', source={'pdf_page': 4}, title_source=record['title_clean'])
        before = deepcopy(record)
        profile, assessment = self.assess(record, coordinate_source='title')
        self.assertEqual(record, before)
        self.assertEqual(assessment['support_score'], 7)
        self.assertEqual(assessment['evidence_quality']['coordinates']['state'], 'parsed')
        self.assertEqual(assessment['evidence_quality']['coordinates']['positional_accuracy'], 'not_assessed')
        self.assertEqual(assessment['evidence_quality']['source']['locator'], 'pdf_page')
        self.assertEqual(assessment['scope_fit']['state'], 'supported')
        self.assertEqual(assessment['scope_fit']['whole_project_extent'], 'not_assessed')
        self.assertEqual(assessment['scope_fit']['claim_scope'], 'observed_coordinate_points')
        self.assertEqual(profile['context_scoring']['proposed_code'], 'b1')

    def test_coordinate_repairs_are_visible_without_adding_points(self):
        record = self.fixture.record()
        record['coordinate_interpretation'] = {'normalization_rules': ['swap_axes'],
                                               'points': [], 'image_review': {'page': 4}}
        coordinate = {'coordinate_source': 'coordinate_interpretation', 'coordinate_status': 'normalized',
                      'points': [self.fixture.point('b1')]}
        profile = self.fixture.engine.assess(record, coordinate)
        assessment = self.fixture.candidate(profile)
        quality = assessment['evidence_quality']['coordinates']
        self.assertEqual(quality['state'], 'normalized')
        self.assertEqual(quality['normalization_rules'], ['swap_axes'])
        self.assertTrue(quality['image_review_recorded'])
        self.assertEqual(assessment['support_score'], 7)
        self.assertTrue(assessment['application']['eligible_for_trial'])

    def test_recorded_coordinate_review_flags_block_trial(self):
        record = self.fixture.record()
        record['coordinate_interpretation'] = {'review_flags': ['unconsumed_coordinate_text']}
        profile, assessment = self.assess(record, coordinate_source='coordinate_interpretation')
        self.assertEqual(assessment['evidence_quality']['state'], 'requires_review')
        self.assertIn('coordinate_quality_requires_review', assessment['application']['blockers'])
        self.assertTrue(profile['context_scoring']['has_quality_review'])
        self.assertIsNone(profile['context_scoring']['proposed_code'])

    def test_missing_declared_point_cannot_be_presented_as_complete(self):
        profile, assessment = self.assess(point_count=2)
        self.assertIn('coordinate_point_count_mismatch', assessment['evidence_quality']['coordinates']['review_flags'])
        self.assertFalse(assessment['application']['eligible_for_trial'])
        self.assertIsNone(profile['context_scoring']['proposed_code'])

    def test_partial_mapping_retains_partial_quality_and_scope(self):
        profile, assessment = self.assess(points=[self.fixture.point('b1'),
            {'latitude': 15.0, 'longitude': 121.0, 'matched': False, 'chain': None}])
        self.assertEqual(assessment['evidence_quality']['coordinates']['state'], 'partial')
        self.assertEqual(assessment['scope_fit']['state'], 'partial')
        self.assertEqual(assessment['evidence_quality']['coordinates']['catalog_mapped_points'], 1)
        self.assertTrue(profile['context_scoring']['has_partial_scope'])

    def test_cross_barangay_endpoints_keep_supported_city_and_multiple_place_scope(self):
        profile, assessment = self.assess(points=[self.fixture.point('b1', role='start'),
                                                 self.fixture.point('b3', role='end')])
        levels = {l['level']: l for l in assessment['resolution']}
        self.assertEqual(levels['barangay']['state'], 'mixed')
        self.assertEqual(levels['municipality_city']['state'], 'supported')
        self.assertEqual(assessment['scope_fit']['point_roles'], {'start': 1, 'end': 1})
        self.assertIn('endpoints_do_not_establish_alignment', assessment['scope_fit']['notes'])
        self.assertEqual(profile['context_scoring']['ambiguity']['state'], 'multiple_locations')
        self.assertFalse(profile['context_scoring']['has_competing_candidates'])

    def test_duplicate_occurrences_do_not_imply_more_independent_points(self):
        _, assessment = self.assess(points=[self.fixture.point('b1')]*3)
        self.assertEqual(assessment['scope_fit']['point_count'], 3)
        self.assertEqual(assessment['scope_fit']['unique_point_count'], 1)
        self.assertIn('repeated_points_are_not_independent', assessment['scope_fit']['notes'])
        self.assertEqual(assessment['dimensions']['spatial'], 6)

    def test_facility_name_reference_keeps_its_reference_role(self):
        record = self.fixture.record('Completion of Carmen College Building')
        profile = self.fixture.engine.assess(record, {'coordinate_status':'parsed', 'points':[self.fixture.point('t1')]})
        assessment = self.fixture.candidate(profile, 't1')
        self.assertIn('reference_only', assessment['dimension_details']['text']['roles'])
        self.assertEqual(assessment['dimensions']['text'], 0)

    def test_exact_registry_identity_can_coexist_with_location_conflict(self):
        record = self.fixture.record()
        record['location']['evidence'] += [
            {'field':'bridge_registry', 'candidate_codes':[], 'registry_status':'exact_id_match', 'bridge_ids':['X1']},
            {'field':'bridge_registry', 'candidate_codes':['b2']}]
        _, assessment = self.assess(record)
        registry = assessment['dimension_details']['registry']
        self.assertEqual(registry['link']['identity'], 'exact_id_match')
        self.assertEqual(registry['location_agreement'], 'conflicts')
        self.assertEqual(assessment['dimensions']['registry'], -4)

    def test_registry_geography_does_not_fabricate_an_exact_identity_match(self):
        record = self.fixture.record()
        record['location']['evidence'].append({'field':'bridge_registry','candidate_codes':['b1']})
        _, assessment = self.assess(record)
        self.assertEqual(assessment['dimension_details']['registry']['link']['identity'], 'unassessed_link')

    def test_catalog_ancestry_without_evidence_does_not_certify_a_level(self):
        record = self.fixture.record(region='')
        record['location']['locations'] = [self.fixture.engine.matcher.describe('b1')]
        profile = self.fixture.engine.assess(record)
        assessment = self.fixture.candidate(profile)
        self.assertEqual(assessment['support_score'], 0)
        self.assertTrue(all(l['state'] in {'not_assessed','not_applicable'} for l in assessment['resolution']))
        self.assertEqual(assessment['evidence_quality']['title']['ocr_accuracy'], 'not_assessed')

    def test_opposing_context_factors_remain_visible_separately_from_net_total(self):
        record = self.fixture.record(region='Region II',office='North Province Office')
        _, assessment = self.assess(record)
        self.assertEqual(assessment['support_balance']['context'], {'support':1, 'contradictions':-2})
        self.assertEqual(assessment['dimension_details']['context']['region'], 'conflicts')
        self.assertEqual(assessment['dimension_details']['context']['office_context'], 'agrees')

    def test_unresolved_barangay_alternatives_retain_shared_supported_province(self):
        from master_list.tests.test_location_interpretations import catalog
        from build_location_interpretations import Interpreter
        self.fixture.engine = Interpreter(catalog()+[
            dict(code='t4',name='Other Town',level='municipality',parent_code='p1'),
            dict(code='b4',name='Poblacion',level='barangay',parent_code='t4')])
        record = self.fixture.record('Works, Barangay Poblacion, North Province')
        profile = self.fixture.engine.assess(record)
        assessment = self.fixture.candidate(profile)
        ambiguity = {l['level']:l for l in profile['context_scoring']['ambiguity']['by_level']}
        self.assertEqual(ambiguity['province']['state'], 'single_candidate')
        self.assertEqual(ambiguity['barangay']['state'], 'competing_candidates')
        self.assertEqual(next(l for l in assessment['resolution'] if l['level']=='province')['state'], 'supported')
        self.assertIsNone(profile['context_scoring']['proposed_code'])


if __name__ == '__main__':
    unittest.main()
