"""Alternative readings retain valid candidates despite source contradictions."""
from copy import deepcopy
import gzip
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from build_location_interpretations import Interpreter, load_profiles, METHOD, sha


def catalog():
    def row(code, name, level, parent=None):
        return dict(code=code, name=name, level=level, parent_code=parent)
    return [row('r1', 'Region I (North)', 'region'),
            row('r2', 'Region II (South)', 'region'),
            row('p1', 'North Province', 'province', 'r1'),
            row('p2', 'South Province', 'province', 'r2'),
            row('pi', 'Iloilo', 'province', 'r1'),
            row('t1', 'Carmen', 'municipality', 'p1'),
            row('t2', 'Carmen', 'municipality', 'p2'),
            row('t3', 'Santa Maria', 'municipality', 'p2'),
            row('b1', 'Poblacion', 'barangay', 't1'),
            row('b2', 'Poblacion', 'barangay', 't2'),
            row('b3', 'Santa Maria', 'barangay', 't1'),
            row('hc', 'City of Iloilo', 'city', 'r1'),
            row('bh', 'Javellana', 'barangay', 'hc')]


class Interpretations(unittest.TestCase):
    def setUp(self):
        self.engine = Interpreter(catalog())

    def record(self, title, region='', office='', headings=(), kind='project'):
        m = self.engine.matcher
        return dict(record_id='test:1', dataset='test', record_kind=kind,
                    title_clean=title, source_region=region, implementing_office=office,
                    location=deepcopy(m.match(title, headings, m.region_code(region), m.province_code(office))))

    def candidates(self, result):
        return {c['code']: c for c in result['candidates']}

    def point(self, code):
        m = self.engine.matcher
        return {'matched': True, 'chain': {k: {'code': c, 'name': m.rows[c]['name']}
                                          for k, c in m.ancestry(code).items()}}

    def test_wrong_province_and_region_retain_both_barangay_chains(self):
        r = self.record('Road, Barangay Poblacion, Carmen, South Province', 'Region I')
        before = deepcopy(r)
        cs = self.candidates(self.engine.assess(r))
        self.assertIn('b1', cs)
        self.assertIn('b2', cs)
        self.assertEqual(cs['b1']['named_parent'], 'agrees')
        self.assertEqual(cs['b1']['printed_province'], 'conflicts')
        self.assertEqual(cs['b1']['region'], 'agrees')
        self.assertEqual(cs['b2']['printed_province'], 'agrees')
        self.assertEqual(cs['b2']['region'], 'conflicts')
        self.assertEqual(before, r)

    def test_unmarked_barangay_and_homonym_town_remain_distinct(self):
        result = self.engine.assess(self.record('Road, Santa Maria, Carmen, North Province'))
        cs = self.candidates(result)
        self.assertIn('b3', cs)
        self.assertIn('t3', cs)
        self.assertEqual(cs['b3']['named_parent'], 'agrees')
        self.assertTrue(any(x['kind'] == 'candidate_parent_chain' and x['codes'] == ['b3']
                            for x in result['readings']))

    def test_province_scoped_barangay_suggestions_reach_profiles_without_parent(self):
        rows = catalog()
        # North Province has two identically named barangays under different towns.
        rows.append(dict(code='t4', name='Second Town', level='municipality', parent_code='p1'))
        rows.append(dict(code='b5', name='Poblacion', level='barangay', parent_code='t4'))
        self.engine = Interpreter(rows)
        r = self.record('Road, Barangay Poblacion, North Province Station 0+000 - Station 1+000',
                        'Region I', 'North Province Office')
        result = self.engine.assess(r)
        self.assertIn('b1', result['review_suggestion_codes'])
        c = self.candidates(result)['b1']
        self.assertEqual(c['named_parent'], 'not_assessed')
        self.assertEqual(c['printed_province'], 'agrees')
        self.assertEqual(c['office_context'], 'agrees')

    def test_fully_compact_barangay_without_town_homonym_resolves(self):
        result = self.record('Road, Poblacion Carmen North Province')
        self.assertEqual([p['psgc_code'] for p in result['location']['locations']], ['b1'])
        self.assertFalse(result['location']['review_flags'])
        c = self.candidates(self.engine.assess(result))['b1']
        self.assertEqual(c['named_parent'], 'agrees')

    def test_compact_conflicting_parent_reaches_review_suggestions(self):
        result = self.engine.assess(self.record('Road, Santa Maria, Carmen South Province', 'Region I'))
        c = self.candidates(result)['b3']
        self.assertEqual(c['named_parent'], 'agrees')
        self.assertEqual(c['printed_province'], 'conflicts')
        self.assertIn('b3', result['review_suggestion_codes'])

    def test_coordinate_review_suggestion_keeps_spatial_dimensions(self):
        result = self.engine.assess(self.record('Widening works Phase 2'), {'points': [self.point('b1')]})
        self.assertIn('b1', result['review_suggestion_codes'])
        self.assertEqual(self.candidates(result)['b1']['spatial']['barangay']['state'], 'agrees')

    def test_unscoped_barangay_homonyms_stay_in_profiles_without_suggestions(self):
        result = self.engine.assess(self.record('Road, Barangay Poblacion'))
        self.assertIn('b1', self.candidates(result))
        self.assertIn('b2', self.candidates(result))
        self.assertEqual(result['review_suggestion_codes'], [])

    def test_reference_mentions_do_not_become_review_suggestions(self):
        result = self.engine.assess(self.record('Road works (Carmen-Santa Maria Road)'))
        self.assertEqual(result['review_suggestion_codes'], [])

    def test_independent_city_does_not_gain_a_province_parent(self):
        cs = self.candidates(self.engine.assess(self.record('Road, Brgy. Javellana, Iloilo City, Iloilo')))
        self.assertEqual(cs['bh']['printed_province'], 'no_province_parent')
        self.assertNotIn('province', self.engine.matcher.ancestry('bh'))

    def test_office_context_does_not_create_a_site_candidate(self):
        result = self.engine.assess(self.record('Road widening Phase 2', office='North Province Office'))
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['state'], 'unresolved')

    def test_parenthetical_road_references_do_not_become_site_assertions(self):
        cs = self.candidates(self.engine.assess(self.record('Road works (Carmen-Santa Maria Road)')))
        self.assertTrue(cs)
        self.assertTrue(all(c['title'] == 'reference_only' for c in cs.values()))

    def test_missing_gps_is_unassessed_not_conflicting(self):
        cs = self.candidates(self.engine.assess(self.record('Road, Carmen, North Province')))
        self.assertEqual(cs['t1']['spatial']['municipality_city']['state'], 'not_assessed')

    def test_mapped_points_offer_candidates_when_title_names_no_place(self):
        result = self.engine.assess(self.record('Widening works Phase 2'), {'points': [self.point('b1')]})
        c = self.candidates(result)['b1']
        self.assertTrue(c['coordinate_candidate'])
        self.assertEqual(c['title'], 'not_assessed')
        self.assertEqual(c['spatial']['barangay']['state'], 'agrees')

    def test_partial_point_mapping_reports_unassessed_coverage(self):
        coord = {'points': [self.point('b1'), {'matched': False, 'chain': None}]}
        result = self.engine.assess(self.record('Road, Carmen, North Province'), coord)
        c = self.candidates(result)['t1']
        self.assertEqual(c['spatial']['municipality_city'],
                         {'state': 'agrees', 'agree': 1, 'compared': 1, 'unassessed': 1})
        self.assertEqual(result['context']['coordinate_unmapped_points'], 1)

    def test_multitown_points_keep_mixed_evidence_by_level(self):
        result = self.engine.assess(self.record('Road, Carmen, North Province'),
                                    {'points': [self.point('b1'), self.point('b2')]})
        c = self.candidates(result)['t1']
        self.assertEqual(c['spatial']['municipality_city']['state'], 'mixed')
        self.assertEqual(c['spatial']['municipality_city']['agree'], 1)
        self.assertTrue(result['has_conflict'])

    def test_internally_conflicting_spatial_chain_is_not_corroboration(self):
        point = self.point('b2')
        point['chain']['region'] = {'code': 'r1', 'name': 'Region I (North)'}
        result = self.engine.assess(self.record('Road, Carmen, North Province'), {'points': [point]})
        self.assertEqual(result['context']['coordinate_unmapped_points'], 1)

    def test_points_in_different_named_towns_are_not_an_overall_conflict(self):
        r = self.record('Road, Carmen, North Province, Santa Maria, South Province')
        # An explicit whole-record scope spanning both named towns.
        r['location']['locations'] = [self.engine.matcher.describe(c) for c in ('t1', 't3')]
        result = self.engine.assess(r, {'points': [self.point('b1'), self.point('t3')]})
        self.assertFalse(result['has_conflict'])

    def test_allocation_has_no_site_profile(self):
        result = self.engine.assess(self.record('North Province allocation', kind='allocation'))
        self.assertEqual(result['state'], 'not_applicable')
        self.assertEqual(result['candidates'], [])


class RetainedInterpretations(unittest.TestCase):
    def test_profiles_cover_every_master_observation_and_keep_catalog_candidates(self):
        profiles, audit = load_profiles()
        self.assertEqual(audit['method'], METHOD)
        codes = {json.loads(line)['code'] for line in
                 (ROOT / 'PSGC2LEG/data/psgc_locations.jsonl').read_text().splitlines()}
        counts = {}
        review_records = review_candidates = 0
        with gzip.open(ROOT / 'master_list/data/projects.jsonl.gz', 'rt') as stream:
            for line in stream:
                record = json.loads(line)
                profile = next(profiles)
                self.assertEqual(profile['record_id'], record['record_id'])
                self.assertEqual(profile['assignment_policy'], 'review_only')
                candidates = {c['code'] for c in profile['candidates']}
                self.assertTrue(candidates <= codes)
                review = set(profile.get('review_suggestion_codes', []))
                self.assertTrue(review <= candidates)
                review_records += bool(review)
                review_candidates += len(review)
                if record['record_kind'] in {'project', 'facility', 'fap_project'}:
                    self.assertTrue({l['psgc_code'] for l in record['location']['locations']} <= candidates)
                    # Every raw parser mention remains present, including
                    # candidates excluded from its final selected hierarchy.
                    original = {c for ev in record['location']['evidence']
                                if ev['field'] in {'title', 'title_barangay', 'source_locality_heading'}
                                for c in ev['candidate_codes']}
                    self.assertTrue(original <= candidates)
                    if record['record_id'] in {'dpwh_house_second:c12744','dpwh_house_third:c12749'}:
                        self.assertEqual(record['location']['score'], 0)
                        self.assertEqual(profile['context_scoring']['best_support_score'], 7)
                        self.assertEqual(profile['context_scoring']['proposed_code'], '1380700009')
                        self.assertEqual(profile['context_scoring']['trial_status'], 'ready_for_trial')
                counts[profile['state']] = counts.get(profile['state'], 0) + 1
        self.assertIsNone(next(profiles, None))
        self.assertEqual(audit['review_suggestions'],
                         {'records': review_records, 'candidates': review_candidates})
        for state, n in counts.items():
            self.assertEqual(n, audit['states'][state])


if __name__ == '__main__':
    unittest.main()
