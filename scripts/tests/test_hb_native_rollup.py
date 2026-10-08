"""Arithmetic and source-coverage regressions for the Native I-B rollup."""
import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hb_native_rollup as rollup
from hb_native_extract3 import amount_columns, extract_rows


class NativeRollupTests(unittest.TestCase):
    def test_complete_additive_budget(self):
        artifact, audit = rollup.build()
        s = audit['summary']
        self.assertEqual(s['additive_leaf_total_php'], 654_102_015_000)
        self.assertEqual(s['internal_nodes'], 660)
        self.assertEqual(s['unexplained_amount_rows'], 0)
        self.assertFalse(audit['failures'])
        self.assertEqual(s['leaf_columns_php'], dict(ps=14_922_297_000,
                         mooe=24_685_746_000, co=614_493_972_000,
                         total=654_102_015_000))
        root = artifact['root']
        self.assertEqual(root['progressive_rollup'][-1]['remaining_php'], 0)
        self.assertEqual([n['label'] for n in root['children']], ['Regular Programs', 'Projects'])
        s2o = root['children'][0]['children'][1]
        self.assertEqual(s2o['children'][-1]['printed_amount_php'], 27_150_000)
        self.assertEqual(s2o['children'][-1]['source']['pdf_page'], 26)

    def test_equal_column_amounts_are_preserved(self):
        self.assertEqual(amount_columns([(320, '1,000'), (395, '1,000'),
                                         (470, '1,000'), (545, '3,000')]),
                         dict(ps=1000, mooe=1000, co=1000, total=3000))

    def altered_build(self, alter):
        def extraction(doc, start, end, **kwargs):
            rows = copy.deepcopy(extract_rows(doc, start, end, **kwargs))
            if start == 12:
                alter(rows)
            return rows
        with patch.object(rollup, 'extract_rows', side_effect=extraction):
            return rollup.build()

    def test_offsetting_errors_do_not_hide_under_balanced_root(self):
        def alter(rows):
            offices = [r for r in rows if r['page'] == 13 and
                       'District Engineering Office' in r['text'] and r['vals']]
            for r, change in zip((offices[0], offices[-1]), (1000, -1000)):
                r['columns_php']['ps'] += change
                r['columns_php']['total'] += change
        artifact, audit = self.altered_build(alter)
        self.assertEqual(artifact['root']['difference_php'], 0)
        self.assertTrue(audit['failures'])
        self.assertTrue(any(any(c.get('direct_differences_php', {}).values())
                            for c in audit['failures']))

    def test_column_shift_detected_even_when_all_total_sums_match(self):
        def alter(rows):
            r = next(r for r in rows if r['page'] == 13 and
                     'District Engineering Office' in r['text'] and r['vals'])
            r['columns_php']['ps'] -= 1000
            r['columns_php']['mooe'] += 1000
        artifact, audit = self.altered_build(alter)
        self.assertEqual(artifact['root']['difference_php'], 0)
        self.assertTrue(audit['failures'])
        root_check = next(c for c in audit['checks'] if c['node_id'] == artifact['root']['id'])
        self.assertEqual(root_check['recursive_differences_php']['total'], 0)
        self.assertEqual(root_check['recursive_differences_php']['mooe'], 1000)

    def test_out_of_band_amount_row_is_reported(self):
        def alter(rows):
            r = next(r for r in rows if r['page'] == 13 and
                     'District Engineering Office' in r['text'] and r['vals'])
            r['x'] = 200.0
        _, audit = self.altered_build(alter)
        self.assertEqual(audit['summary']['unexplained_amount_rows'], 1)
        self.assertTrue(audit['failures'])

    def test_closing_control_mismatch_is_reported(self):
        def alter(rows):
            r = next(r for r in rows if r['text'] == 'TOTAL NEW APPROPRIATIONS')
            r['columns_php']['co'] += 1000
            r['columns_php']['total'] += 1000
        _, audit = self.altered_build(alter)
        self.assertEqual(audit['summary']['failed_closing_controls'], 1)


if __name__ == '__main__':
    unittest.main()
