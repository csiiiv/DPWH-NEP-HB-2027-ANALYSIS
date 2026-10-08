"""Stage-trace join regressions for Transparency → Official NEP → House."""

import copy
import hashlib
import json
import re
import sys
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path[:0] = [
    str(Path(__file__).resolve().parents[1]),
    str(Path(__file__).resolve().parents[1] / 'builders'),
]
from paths import DATA, VIEWERS  # noqa: E402
from build_stage_trace import classify, build_rows  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import validate_current_pages as page_validation


class StageTraceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads((DATA / 'stage_trace_2027.json').read_text())
        cls.comparison = json.loads((DATA / 'source_comparison_2027.json').read_text())
        cls.reconciliation = json.loads((DATA / 'nep_2027_api_reconciliation.json').read_text())

    def test_embedded_viewer_matches_json(self):
        text = (VIEWERS / 'stage_trace_2027.html').read_text()
        match = re.search(
            r'<script id="traceData" type="application/json">(.*?)</script>', text, re.S)
        self.assertIsNotNone(match)
        self.assertEqual(json.loads(match[1]), self.payload)
        template = (VIEWERS / 'stage_trace.template.html').read_text()
        embedded = json.dumps(self.payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
        self.assertEqual(text, template.replace('__PAYLOAD__', embedded))

    def test_manifest_inputs_are_current(self):
        for name, expected in self.payload['manifest']['inputs'].items():
            digest = hashlib.sha256((DATA / name).read_bytes()).hexdigest()
            self.assertEqual(digest, expected, name)
        self.assertFalse(self.payload['manifest']['comparison_ready'])

    def test_record_count_matches_upstream_comparison(self):
        self.assertEqual(len(self.payload['projects']), len(self.comparison['projects']))
        self.assertEqual(sum(self.payload['summary']['trace_counts'].values()),
                         len(self.payload['projects']))

    def test_transparency_gaps_are_twenty_three(self):
        self.assertEqual(len(self.payload['transparency_gaps']), 23)
        self.assertEqual(
            self.payload['summary']['transparency_to_official']['nep_not_in_transparency_rows'], 23)
        gap_ids = {g['source_id'] for g in self.payload['transparency_gaps']}
        marked = [r for r in self.payload['projects']
                  if r['api_presence'] == 'nep_not_in_transparency']
        self.assertEqual({r['nep']['id'] for r in marked}, gap_ids)

    def test_no_unexpected_api_presence(self):
        self.assertFalse(any(r['api_presence'] == 'unexpected_missing_api'
                             for r in self.payload['projects']))

    def test_exact_deltas_reconcile(self):
        exact = [r for r in self.payload['projects'] if r['house_match'] == 'exact_candidate']
        up = [r for r in exact if r['house_minus_nep_php'] > 0]
        down = [r for r in exact if r['house_minus_nep_php'] < 0]
        same = [r for r in exact if r['house_minus_nep_php'] == 0]
        o2h = self.payload['summary']['official_to_house']
        self.assertEqual(o2h['exact_amount_same'], len(same))
        self.assertEqual(o2h['exact_candidate_increase_n'], len(up))
        self.assertEqual(o2h['exact_candidate_decrease_n'], len(down))
        self.assertEqual(o2h['exact_candidate_increase_php'],
                         sum(r['house_minus_nep_php'] for r in up))
        self.assertEqual(o2h['exact_candidate_decrease_php'],
                         sum(r['house_minus_nep_php'] for r in down))

    def test_classify_vocabulary(self):
        self.assertEqual(classify({
            'house_match': 'exact_candidate',
            'api_presence': 'paired',
            'house_minus_nep_php': -1_000_000,
        }), 'candidate_decrease')
        self.assertEqual(classify({
            'house_match': 'exact_candidate',
            'api_presence': 'nep_not_in_transparency',
            'house_minus_nep_php': 0,
        }), 'transparency_gap_then_amount_same')
        self.assertEqual(classify({
            'house_match': 'house_unmatched',
            'api_presence': 'no_nep_anchor',
            'house_minus_nep_php': 0,
        }), 'house_only_candidate')

    def test_packaging_validator_accepts_current_trace(self):
        self.assertEqual(page_validation.validate_stage_trace()['summary']['records'],
                         len(self.comparison['projects']))

    def validate_modified_trace(self, mutate, packaging=False):
        payload = copy.deepcopy(self.payload)
        mutate(payload)
        read = page_validation.read
        with patch.object(page_validation, 'read', side_effect=lambda name:
                          payload if name == 'stage_trace_2027.json' else read(name)):
            return page_validation.validate_current_pages() if packaging else page_validation.validate_stage_trace()

    def test_packaging_rejects_stale_trace_inputs(self):
        def mutate(payload):
            payload['manifest']['inputs']['source_comparison_2027.json'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Stale stage-trace input'):
            self.validate_modified_trace(mutate)

    def test_packaging_rejects_changed_trace_generator(self):
        def mutate(payload):
            payload['manifest']['generator']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Stage-trace generator changed'):
            self.validate_modified_trace(mutate)

    def test_packaging_recomputes_source_joins(self):
        def mutate(payload):
            row = next(r for r in payload['projects'] if r['api'])
            row['api']['amount_php'] += 1000
        with self.assertRaisesRegex(ValueError, 'projects differ from retained source joins'):
            self.validate_modified_trace(mutate)

    def test_packaging_rejects_source_headline_drift(self):
        def mutate(payload):
            payload['summary']['stages']['house']['extracted_php'] += 1000
        with self.assertRaisesRegex(ValueError, 'source headline differs: house'):
            self.validate_modified_trace(mutate)

    def test_packaging_entry_point_rejects_stale_trace(self):
        def mutate(payload):
            payload['manifest']['inputs']['source_comparison_2027.json'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Stale stage-trace input'):
            self.validate_modified_trace(mutate, packaging=True)

    def test_build_rows_preserves_api_pair_amount(self):
        rows = build_rows(self.comparison, self.reconciliation)
        paired = next(r for r in rows if r['api_presence'] == 'paired' and r['nep'])
        self.assertEqual(paired['api']['amount_php'], paired['nep']['amount_php'])


if __name__ == '__main__':
    unittest.main()
