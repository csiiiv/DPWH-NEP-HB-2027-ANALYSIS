"""Browser payload accounting, provenance, and conservative identity rules."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('nia_workbench', ROOT / 'analysis-nia/build_nia_workbench.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class WorkbenchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = builder.build(write_output=False)

    def test_every_source_row_is_partitioned_once(self):
        for side in ('nep', 'house'):
            ids = [r[f'{side}_id'] for r in self.data['comparison'] if r[f'{side}_id']]
            self.assertEqual(len(ids), len(set(ids)))
            self.assertEqual(set(ids), {p['id'] for p in self.data['stages'][side]['projects']})

    def test_money_identity_and_every_subprogram(self):
        summary = self.data['comparison_summary']
        self.assertEqual(summary['delta_php'], 401124000)
        self.assertEqual(summary['paired_delta_php'] + summary['house_only_php'] - summary['nep_only_php'], summary['delta_php'])
        self.assertEqual(summary['counts'], {'paired': 509, 'house_only': 319, 'nep_only': 282})
        self.assertEqual(summary['changed_pairs'], 4)
        for control in self.data['subprogram_controls']:
            rows = [r for r in self.data['comparison'] if r['subprogram_key'] == control['key']]
            amounts = {}
            for side in ('nep', 'house'):
                lookup = {p['id']: p for p in self.data['stages'][side]['projects']}
                amounts[side] = sum(lookup[r[f'{side}_id']]['amount_php'] for r in rows if r[f'{side}_id'])
            self.assertEqual(amounts['house'] - amounts['nep'], control['delta_php'])

    def test_duplicate_titles_do_not_pair_even_when_amounts_agree(self):
        def row(pid, title='Same title', key='National Irrigation System'):
            return {'id': pid, 'title': title, 'subprogram_key': key, 'amount_php': 100}
        pairs, house, nep = builder.match_projects([row('h1'), row('h2')], [row('n1')])
        self.assertEqual(pairs, [])
        self.assertEqual(len(house), 2)
        self.assertEqual(len(nep), 1)
        pairs, _, _ = builder.match_projects([row('h')], [row('n', key='Communal Irrigation System')])
        self.assertEqual(pairs, [])

    def test_punctuation_only_normalization_pairs_unique_titles(self):
        h = {'id': 'h', 'subprogram_key': 's', 'title': 'Canal - Phase II', 'amount_php': 100}
        n = {'id': 'n', 'subprogram_key': 's', 'title': 'CANAL, Phase II', 'amount_php': 90}
        pairs, house, nep = builder.match_projects([h], [n])
        self.assertEqual(pairs[0]['delta_php'], 10)
        self.assertFalse(house or nep)
        n['title'] = 'Canal Phase III'
        self.assertFalse(builder.match_projects([h], [n])[0])

    def test_ids_are_local_to_each_source(self):
        h = [{'id': 'same', 'subprogram_key': 's', 'title': 'Unmatched', 'amount_php': 100},
             {'id': 'house-pair', 'subprogram_key': 's', 'title': 'Paired', 'amount_php': 100}]
        n = [{'id': 'same', 'subprogram_key': 's', 'title': 'Paired', 'amount_php': 100}]
        pairs, house_remaining, nep_remaining = builder.match_projects(h, n)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(house_remaining, [h[0]])
        self.assertEqual(nep_remaining, [])

    def test_hierarchy_preserves_only_printed_house_heading(self):
        stage = self.data['stages']['house']
        for p in stage['projects']:
            subprogram = next(s for s in stage['subprograms'] if s['key'] == p['subprogram_key'])
            self.assertEqual(p['group_heading'], subprogram['group_heading'])
            if 'RESTORATION' in p['program_group']:
                self.assertIsNone(p['group_heading'])
            else:
                self.assertEqual(p['group_heading'], 'IRRIGATION SYSTEMS DEVELOPMENT PROGRAM')

    def test_nep_flags_and_evidence_crops_survive_packaging(self):
        flagged = [p for p in self.data['stages']['nep']['projects'] if p['extraction_flags']]
        self.assertTrue(flagged)
        for p in flagged:
            self.assertTrue(p['source']['pdf_page'])
            self.assertTrue(p['provenance']['word_indices'])
            for flag in p['flag_details']:
                if flag.get('evidence_crop'):
                    self.assertTrue((ROOT / 'analysis-nia/data/evidence_crops' / flag['evidence_crop']).is_file())

    def test_offsetting_control_errors_are_rejected(self):
        stage = copy.deepcopy(self.data['stages']['nep'])
        stage['subprograms'][0]['amount_php'] += 1
        stage['subprograms'][1]['amount_php'] -= 1
        with self.assertRaisesRegex(ValueError, 'sub-program control'):
            builder.validate_stage(stage)

    def test_duplicate_source_ids_are_rejected(self):
        stage = copy.deepcopy(self.data['stages']['house'])
        stage['projects'][1]['id'] = stage['projects'][0]['id']
        with self.assertRaisesRegex(ValueError, 'duplicate source IDs'):
            builder.validate_stage(stage)


if __name__ == '__main__':
    unittest.main()
