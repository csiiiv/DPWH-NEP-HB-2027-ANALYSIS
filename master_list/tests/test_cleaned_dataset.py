"""Provisional selection, actionable questions and source-ledger conservation."""
from copy import deepcopy
import csv
import gzip
import json
from pathlib import Path
import tempfile
import unittest

from master_list.tests import test_context_scoring as fixtures
from master_list.tests.test_location_interpretations import catalog
from build_location_interpretations import Interpreter
from build_cleaned_dataset import materialize, read_rows, sha
from cleaned_policy import clean_observation
from review_catalog import load_catalog


class CleanedDataset(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ContextScoring()
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.catalog = load_catalog()

    def record(self, title='Completion of Food Service Management Building', **kwargs):
        result = self.fixture.record(title, **kwargs)
        result.update(title=title, title_source=title, title_clean_method='readable_title_v1',
                      title_clean_rules=[], amount_php=100, fiscal_year=2027,
                      comparison_group_id='g1', comparison_stage='house', stage='house',
                      source={'pdf_page': 1}, source_record_id='1', source_pdf='test.pdf')
        return result

    def coordinate(self, *codes, **kwargs):
        return dict(record_id='test:1', coordinate_status='parsed',
                    point_count=len(codes), points=[self.fixture.point(c) for c in codes], **kwargs)

    def clean(self, record=None, coordinate=None, profile=None):
        record = record or self.record()
        profile = profile or self.engine.assess(record, coordinate)
        return clean_observation(record, profile, coordinate,
                                 {'partition': 'house_only', 'group_id': 'g1', 'stage': 'house'},
                                 self.engine.matcher, self.catalog)

    def test_gps_adoption_preserves_zero_master_score_and_limits_scope(self):
        record, coordinate = self.record(), self.coordinate('b1')
        profile = self.engine.assess(record, coordinate)
        originals = deepcopy((record, coordinate, profile))
        row, evidence = self.clean(record, coordinate, profile)
        loc = row['location_resolution']
        self.assertEqual(loc['decision'], 'adopted_candidate')
        self.assertEqual(loc['status'], 'resolved')
        self.assertEqual(loc['verification_status'], 'provisional')
        self.assertEqual(loc['whole_project_extent'], 'not_assessed')
        selected = loc['selected_locations'][0]
        self.assertEqual(selected['psgc_code'], 'b1')
        self.assertEqual(selected['claim_scope'], 'observed_coordinate_points')
        self.assertEqual(selected['candidate_support']['support_score'], 7)
        self.assertEqual(row['original_master_score'], 0)
        self.assertEqual(evidence['items']['master_location'], record['location'])
        self.assertEqual(row['review_flags'], [])
        self.assertEqual((record, coordinate, profile), originals)

    def test_blocked_high_scoring_candidate_is_not_adopted(self):
        record = self.record(region='Region II')
        coordinate = self.coordinate('b1')
        row, _ = self.clean(record, coordinate)
        self.assertEqual(row['location_resolution']['selected_locations'], [])
        self.assertEqual(row['location_resolution']['decision'], 'review_required')
        self.assertEqual([f['code'] for f in row['review_flags']], ['location_unclear'])

    def test_cannot_adopt_over_incompatible_or_multiple_master_locations(self):
        for codes in (['t2'], ['t1', 't2']):
            record = self.record()
            record['location']['locations'] = [self.engine.matcher.describe(c) for c in codes]
            row, _ = self.clean(record, self.coordinate('b1'))
            self.assertEqual([p['psgc_code'] for p in row['location_resolution']['selected_locations']], codes)
            self.assertEqual(row['location_resolution']['decision'], 'retained_master')

    def test_title_gate_adoption_carries_its_own_score(self):
        record = self.record('Works, Barangay Poblacion, Carmen, North Province')
        record['location']['locations'] = []
        record['location']['suggestions'] = [{'location': self.engine.matcher.describe('b1'),
            'support_score': 11, 'factors': [], 'conflicts': [], 'review_only': False}]
        profile = self.engine.assess(record)
        row, _ = self.clean(record, profile=profile)
        selected = row['location_resolution']['selected_locations'][0]
        self.assertEqual(row['location_resolution']['decision'], 'adopted_candidate')
        self.assertEqual(selected['claim_scope'], 'title_locality_claim')
        expected = next(c['score_assessment']['support_score'] for c in profile['candidates'] if c['code'] == 'b1')
        self.assertEqual(selected['candidate_support']['support_score'], expected)

    def test_tampered_proposal_gate_or_scope_is_rejected(self):
        record, coordinate = self.record(), self.coordinate('b1')
        for mutation in ('blocked', 'scope', 'status'):
            profile = self.engine.assess(record, coordinate)
            candidate = next(c for c in profile['candidates'] if c['code'] == 'b1')
            if mutation == 'blocked':
                candidate['score_assessment']['application']['blockers'] = ['test_conflict']
            elif mutation == 'scope':
                profile['context_scoring']['proposal_scope'] = 'whole_project'
            else:
                profile['context_scoring']['trial_status'] = 'blocked'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.clean(record, coordinate, profile)

    def test_city_without_coordinates_or_barangay_needs_no_question(self):
        row, _ = self.clean(self.record('Works, Carmen, North Province'))
        self.assertEqual(row['location_resolution']['status'], 'resolved')
        self.assertEqual(row['location_resolution']['unresolved_levels'], ['barangay'])
        self.assertEqual(row['review_flags'], [])

    def test_independent_city_has_no_fabricated_province(self):
        row, _ = self.clean(self.record('Works', region='Region I'), self.coordinate('bh'))
        selected = row['location_resolution']['selected_locations'][0]
        self.assertEqual(selected['ancestry']['city']['code'], 'hc')
        self.assertNotIn('province', selected['ancestry'])
        self.assertEqual(row['review_flags'], [])

    def test_city_plus_province_association_does_not_create_a_clarification_question(self):
        record = self.record('Works')
        record['location']['locations'] = [self.engine.matcher.describe(c) for c in ('bh', 'pi')]
        row, _ = self.clean(record)
        self.assertEqual(row['location_resolution']['status'], 'partially_resolved')
        self.assertEqual(len(row['location_resolution']['selected_locations']), 2)
        self.assertEqual(row['review_flags'], [])

    def test_province_only_is_retained_with_one_useful_question(self):
        row, _ = self.clean(self.record('Works, North Province'))
        self.assertEqual(row['location_resolution']['status'], 'partially_resolved')
        self.assertEqual([f['code'] for f in row['review_flags']], ['location_unclear'])

    def test_competing_province_supported_barangays_ask_one_question(self):
        rows = catalog() + [dict(code='t4', name='Other Town', level='municipality', parent_code='p1'),
                            dict(code='b4', name='Poblacion', level='barangay', parent_code='t4')]
        self.engine = self.fixture.engine = Interpreter(rows)
        record = self.record('Road, Barangay Poblacion, North Province')
        row, _ = self.clean(record)
        self.assertEqual(row['location_resolution']['status'], 'ambiguous')
        self.assertEqual([f['code'] for f in row['review_flags']], ['location_alternatives'])

    def test_title_conflicting_homonyms_are_not_presented_as_supported_alternatives(self):
        rows = catalog() + [dict(code='t4', name='Other Town', level='municipality', parent_code='p1'),
                            dict(code='b4', name='Poblacion', level='barangay', parent_code='t4')]
        self.engine = self.fixture.engine = Interpreter(rows)
        record = self.record('Road, Barangay Poblacion, North Province')
        profile = self.engine.assess(record)
        rival = next(c for c in profile['candidates'] if c['code'] == 'b4')
        rival['score_assessment']['application']['blockers'].append('asserted_title_conflict')
        row, _ = self.clean(record, profile=profile)
        self.assertEqual([f['code'] for f in row['review_flags']], ['location_unclear'])

    def test_single_title_locality_and_disjoint_points_request_clarification(self):
        row, _ = self.clean(self.record('Works, Carmen, North Province'), self.coordinate('b2'))
        self.assertEqual([f['code'] for f in row['review_flags']], ['location_conflict'])
        self.assertEqual(row['location_resolution']['decision'], 'retained_master')

    def test_multiple_title_sites_and_mixed_points_are_not_competing_alternatives(self):
        record = self.record('Works')
        record['location']['locations'] = [self.engine.matcher.describe(c) for c in ('t1', 't2')]
        row, _ = self.clean(record, self.coordinate('b1', 'b2'))
        self.assertEqual(row['location_resolution']['status'], 'resolved')
        self.assertEqual(row['review_flags'], [])

    def test_allocation_and_legacy_district_are_preserved_without_new_derivation(self):
        record = self.record('Equipment allocation')
        record['record_kind'] = 'allocation'
        record['location']['locations'] = []
        record['legislative_district'] = {'status': 'legacy_reference'}
        row, _ = self.clean(record)
        self.assertEqual(row['location_resolution']['status'], 'not_applicable')
        self.assertEqual(row['review_flags'], [])
        self.assertNotIn('legislative_district', row)
        self.assertEqual(row['legacy_legislative_district'], record['legislative_district'])

    def materialize(self, directory, masters=None, source_mutation=None, extra_profile=False, extra_coordinates=False):
        master = self.record('Works, Carmen, North Province')
        source = {k: deepcopy(v) for k, v in master.items() if k != 'location'}
        if source_mutation:
            source.update(source_mutation)
        profile = self.engine.assess(master)
        coordinates = {'orphan': self.coordinate('b1')} if extra_coordinates else {}
        groups = [{'id': 'g1', 'partition': 'house_only', 'upstream': {'house_match': 'retained'},
                   'stages': {'house': {'observation_ids': ['test:1'], 'amount_php': 100}}}]
        return materialize(directory, [source], [master] if masters is None else masters,
                           [profile] * (2 if extra_profile else 1), coordinates, groups,
                           self.engine.matcher, self.catalog)

    def test_streaming_release_is_reproducible_with_readable_csv_and_full_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / 'a', Path(tmp) / 'b'
            a.mkdir(); b.mkdir()
            first = self.materialize(a)
            self.assertEqual(first, self.materialize(b))
            self.assertEqual(first['datasets']['test'], {'records': 1, 'amount_php': 100})
            for name in ('observations.jsonl.gz', 'observations.csv.gz', 'evidence.jsonl.gz'):
                self.assertEqual(sha(a / name), sha(b / name))
            row = next(read_rows(a / 'observations.jsonl.gz'))
            companion = next(read_rows(a / 'evidence.jsonl.gz'))
            self.assertEqual(row['record_id'], companion['record_id'])
            self.assertNotIn('upstream', row['comparison'])
            self.assertEqual(companion['items']['comparison']['upstream']['house_match'], 'retained')
            with gzip.open(a / 'observations.csv.gz', 'rt') as stream:
                exported = next(csv.DictReader(stream))
            self.assertEqual(json.loads(exported['city_municipality_codes']), ['t1'])
            self.assertEqual(json.loads(exported['review_flag_labels']), [])

    def test_streaming_join_rejects_changed_source_amounts_coverage_and_orphans(self):
        for kwargs in ({'source_mutation': {'amount_php': 101}}, {'masters': []},
                       {'extra_profile': True}, {'extra_coordinates': True}):
            with self.subTest(kwargs=kwargs), tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(ValueError):
                    self.materialize(Path(tmp), **kwargs)


if __name__ == '__main__':
    unittest.main()
