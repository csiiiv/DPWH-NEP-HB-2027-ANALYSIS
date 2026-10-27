"""Readable-title regressions and independent conservation of source ledgers."""
import copy
import gzip
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from build_processing_dataset import ProcessingDataset, add_annex, hydrate_side, outside_scope
from readable_titles import annotate_titles, readable_title


def observation(rid, title='Road A', amount=10):
    return {'record_id': rid, 'title': title, 'amount_php': amount}


class ReadableTitles(unittest.TestCase):
    def test_split_enye_with_unicode_spaces_entities_and_case(self):
        cases = {'Las Pi ñ as': 'Las Piñas', 'Osme ñ a': 'Osmeña', 'DASMARI Ñ AS': 'DASMARIÑAS',
                 'Ni\xa0ñ\xa0o': 'Niño', 'Ni&#xA0;ñ&#160;o': 'Niño',
                 'Construction of Pin\u0303a Road': 'Construction of Piña Road'}
        for source, expected in cases.items():
            with self.subTest(source=source):
                result = readable_title(source)
                self.assertEqual(result['title_source'], source)
                self.assertEqual(result['title_clean'], expected)
                self.assertTrue(result['title_clean_rules'])
                self.assertEqual(readable_title(expected)['title_clean'], expected)
                self.assertEqual(readable_title(expected)['title_clean_rules'], [])

    def test_readability_preserves_identifiers_numbers_punctuation_units_and_wording(self):
        title = 'Brgy. Sta. Maria: B00008LB; K0021 + 910 - K0022 + 102, 20 m²; 15.123, 120.456'
        self.assertEqual(readable_title(title)['title_clean'], title)
        self.assertEqual(readable_title(title)['title_clean_rules'], [])
        self.assertEqual(readable_title('B000 ñ 12')['title_clean'], 'B000 ñ 12')
        self.assertEqual(readable_title('Para ñ ague')['title_clean'], 'Parañague')
        self.assertEqual(readable_title('Al Monitoring System')['title_clean'], 'Al Monitoring System')

    def test_suggestions_gain_readable_titles_without_mutating_evidence(self):
        original = {'title': 'Las Pi ñ as', 'title_match_key': 'laspias', 'amount_php': 10,
                    'suggestions': [{'nep': {'title': 'Osme ñ a', 'amount_php': 20}}],
                    'chainages': [{'from': 'K0001+000', 'length_review': 'repaired_km_ocr'}]}
        snapshot = copy.deepcopy(original)
        result = annotate_titles(original)
        self.assertEqual(original, snapshot)
        self.assertEqual(result['title'], original['title'])
        self.assertEqual(result['title_match_key'], original['title_match_key'])
        self.assertEqual(result['chainages'], original['chainages'])
        self.assertEqual(result['suggestions'][0]['nep']['title_clean'], 'Osmeña')


class Membership(unittest.TestCase):
    def test_compact_inheritance_is_hydrated_with_explicit_overrides(self):
        row = {'id': 'r', 'title': 'Shared', 'region': 'R',
               'nep': {'inherit': ['title', 'region'], 'title': 'Explicit', 'amount_php': 0}}
        self.assertEqual(hydrate_side(row, 'nep'), {'title': 'Explicit', 'region': 'R', 'amount_php': 0})
        self.assertIsNone(hydrate_side(row, 'third'))
        with self.assertRaisesRegex(ValueError, 'Missing inherited'):
            hydrate_side({'id': 'bad', 'nep': {'inherit': ['missing']}}, 'nep')

    def test_fuzzy_suggestion_does_not_consume_nep_only_observation(self):
        result = ProcessingDataset([observation('h'), observation('n')])
        result.add_group('dpwh', {'id': 'h', 'house_match': 'fuzzy_candidate',
                                  'suggestions': [{'nep': {'id': 'n', 'title': 'Road A'}}]},
                         {'third': {'title': 'Road A', 'amount_php': 10}}, {'third': ['h']}, 'input.json')
        self.assertIsNone(result.records['n']['comparison_group_id'])
        result.add_group('dpwh', {'id': 'n'}, {'nep': {'title': 'Road A', 'amount_php': 10}},
                         {'nep': ['n']}, 'input.json')
        self.assertEqual([g['partition'] for g in result.groups], ['house_only', 'nep_only'])

    def test_grouped_members_keep_individual_amounts_and_scope_review_metadata(self):
        result = ProcessingDataset([observation('h1'), observation('h2', amount=20),
                                    observation('n', amount=25)])
        result.add_group('dpwh', {'id': 'group', 'reading_status': 'repeated_key',
                                  'house_match': 'segment_scope_candidate'},
                         {'third': {'title': 'Road A', 'amount_php': 30, 'chainages': [{'length_m': 100}]},
                          'nep': {'title': 'Road A', 'amount_php': 25}},
                         {'third': ['h1', 'h2'], 'nep': ['n']}, 'input.json')
        self.assertEqual(result.groups[0]['partition'], 'matched')
        self.assertEqual(result.groups[0]['upstream']['house_match'], 'segment_scope_candidate')
        self.assertEqual(result.groups[0]['stages']['third']['observation_ids'], ['h1', 'h2'])
        self.assertEqual(result.records['h2']['amount_php'], 20)
        self.assertNotIn('analysis_record', result.records['h1'])
        self.assertEqual(result.groups[0]['presence_by_house_reading'],
                         {'second': 'nep_only', 'third': 'both'})

    def test_unknown_reused_duplicate_and_wrong_amount_members_are_rejected(self):
        payload = {'third': {'title': 'Road A', 'amount_php': 10}}
        for ids, message in [(['missing'], 'Unknown source'), (['h', 'h'], 'Duplicate stage')]:
            result = ProcessingDataset([observation('h')])
            with self.assertRaisesRegex(ValueError, message):
                result.add_group('dpwh', {'id': 'r'}, payload, {'third': ids}, 'input.json')
        result = ProcessingDataset([observation('h', amount=5)])
        with self.assertRaisesRegex(ValueError, 'amount differs'):
            result.add_group('dpwh', {'id': 'r'}, payload, {'third': ['h']}, 'input.json')
        result = ProcessingDataset([observation('h')])
        result.add_group('dpwh', {'id': 'r'}, payload, {'third': ['h']}, 'input.json')
        with self.assertRaisesRegex(ValueError, 'Reused source'):
            result.add_group('dpwh', {'id': 'r2'}, payload, {'third': ['h']}, 'input.json')

    def test_hfep_pair_array_is_supplemented_with_both_unmatched_sides(self):
        result = ProcessingDataset([observation(f'hfep_{s}:{i}')
                                    for s, i in [('hgab', 'h1'), ('hgab', 'h2'), ('nep', 'n1'), ('nep', 'n2')]])
        data = {'stages': {stage: {'facilities': [
                    {'id': f'{prefix}{i}', 'title': f'Facility {i}', 'amounts_php': {'total': 10}}
                    for i in (1, 2)]} for stage, prefix in [('house', 'h'), ('nep', 'n')]},
                'comparison': {'pairs': [{'house_id': 'h1', 'nep_id': 'n1', 'similarity': .99}]}}
        add_annex(result, 'hfep', data)
        self.assertEqual(Counter(g['partition'] for g in result.groups),
                         {'matched': 1, 'house_only': 1, 'nep_only': 1})
        self.assertTrue(all(r['comparison_group_id'] for r in result.records.values()))

    def test_only_house_gas_s2o_records_are_not_compared(self):
        record = {'record_id': 'h', 'dataset': 'dpwh_house_third', 'record_kind': 'allocation',
                  'source_path': [{'kind': 'section', 'label': 'SUPPORT TO OPERATIONS'}]}
        self.assertEqual(outside_scope(record)['partition'], 'not_compared')
        with self.assertRaisesRegex(ValueError, 'Unexplained comparison exclusion'):
            outside_scope({**record, 'source_path': [{'kind': 'section', 'label': 'OPERATIONS'}]})
        with self.assertRaisesRegex(ValueError, 'Unexpected source'):
            outside_scope({**record, 'dataset': 'dpwh_nep_pdf'})


class RetainedProcessingDataset(unittest.TestCase):
    """Check the generated release against independent retained master controls."""
    @classmethod
    def setUpClass(cls):
        cls.directory = ROOT / 'master_list/data/processing'
        cls.audit = json.loads((cls.directory / 'audit.json').read_text())
        cls.master = json.loads((ROOT / 'master_list/data/audit.json').read_text())

    def test_all_ten_source_ledgers_keep_their_observations_and_amounts(self):
        rows, amounts, cleaned = Counter(), Counter(), Counter()
        with gzip.open(self.directory / 'observations.jsonl.gz', 'rt') as stream:
            for line in stream:
                r = json.loads(line)
                rows[r['dataset']] += 1
                amounts[r['dataset']] += r['amount_php']
                self.assertEqual(r['title'], r['title_source'])
                if re.search(r'[A-Za-z]\s+[ñÑ]\s+[A-Za-z]', r['title_source']):
                    self.assertNotRegex(r['title_clean'], r'[A-Za-z]\s+[ñÑ]\s+[A-Za-z]')
                    cleaned[r['dataset']] += 1
        self.assertEqual(sum(rows.values()), self.master['records'])
        for dataset, expected in self.master['datasets'].items():
            self.assertEqual(rows[dataset], expected['records'])
            self.assertEqual(amounts[dataset], expected['amount_php'])
        self.assertEqual(cleaned['dpwh_nep_pdf'], 270)
        self.assertEqual(self.audit['source_discrepancies'], self.master['source_discrepancies'])

    def test_group_members_partition_observations_without_dropping_source_only_rows(self):
        members = Counter()
        with gzip.open(self.directory / 'comparison_groups.jsonl.gz', 'rt') as stream:
            groups = 0
            for line in stream:
                g = json.loads(line)
                groups += 1
                self.assertIn(g['partition'], ('matched', 'house_only', 'nep_only', 'api_only'))
                for stage in g['stages'].values():
                    members.update(stage['observation_ids'])
                    self.assertIn('title_clean', stage)
        self.assertEqual(groups, 20321)
        self.assertEqual(len(members), 59601)
        self.assertTrue(all(n == 1 for n in members.values()))
        outside = set()
        with gzip.open(self.directory / 'outside_comparison.jsonl.gz', 'rt') as stream:
            for line in stream:
                r = json.loads(line)
                self.assertEqual(r['partition'], 'not_compared')
                self.assertEqual(r['record_kind'], 'allocation')
                self.assertIn(r['comparison_scope'], ('GENERAL ADMINISTRATIVE AND SUPPORT', 'SUPPORT TO OPERATIONS'))
                self.assertIsNone(r['comparison_group_id'])
                outside.add(r['record_id'])
        self.assertEqual(len(outside), 5044)
        self.assertFalse(outside & members.keys())
        self.assertEqual(len(outside) + len(members), self.master['records'])

    def test_recorded_inputs_and_output_checksums_are_current(self):
        for path, meta in self.audit['input_files'].items():
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), meta['sha256'], path)
        for name, expected in self.audit['output_sha256'].items():
            self.assertEqual(hashlib.sha256((self.directory / name).read_bytes()).hexdigest(), expected, name)


if __name__ == '__main__':
    unittest.main()
