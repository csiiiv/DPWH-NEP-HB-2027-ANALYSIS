"""Browser payload accounting, provenance, and conservative identity rules."""
import copy
import importlib.util
from collections import Counter
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
        # Corrected classification is the emitted default; the strict
        # classification is retained side by side.
        self.assertEqual(summary['counts'], {'paired': 606, 'house_only': 222, 'nep_only': 185})
        self.assertEqual(self.data['comparison_summaries']['strict']['counts'],
                         {'paired': 509, 'house_only': 319, 'nep_only': 282})
        self.assertEqual(self.data['comparison_summaries']['ai_corrected']['counts'],
                         {'paired': 606, 'house_only': 222, 'nep_only': 185})
        for method_summary in self.data['comparison_summaries'].values():
            self.assertEqual(method_summary['paired_delta_php'], -830000000)
            self.assertEqual(method_summary['house_only_php'] - method_summary['nep_only_php'],
                             method_summary['delta_php'] + 830000000)
            # DPWH-style candidate splits reconcile and share the invariant:
            # the validated (no-counterpart) pools are identical under both
            # methods; only unresolved rows shift between them.
            for key, count_key, php_key in (('house_only_split', 'house_only', 'house_only_php'),
                                            ('nep_only_split', 'nep_only', 'nep_only_php')):
                split = method_summary[key]
                self.assertEqual(split['unresolved']['count'] + split['no_counterpart']['count'],
                                 method_summary['counts'][count_key])
                self.assertEqual(split['unresolved']['amount_php'] + split['no_counterpart']['amount_php'],
                                 method_summary[php_key])
        strict_split = self.data['comparison_summaries']['strict']
        corrected_split = self.data['comparison_summaries']['ai_corrected']
        self.assertEqual(strict_split['house_only_split']['no_counterpart'],
                         corrected_split['house_only_split']['no_counterpart'])
        self.assertEqual(strict_split['nep_only_split']['no_counterpart'],
                         corrected_split['nep_only_split']['no_counterpart'])
        self.assertEqual(summary['changed_pairs'], 4)
        for control in self.data['subprogram_controls']:
            rows = [r for r in self.data['comparison'] if r['subprogram_key'] == control['key']]
            amounts = {}
            for side in ('nep', 'house'):
                lookup = {p['id']: p for p in self.data['stages'][side]['projects']}
                amounts[side] = sum(lookup[r[f'{side}_id']]['amount_php'] for r in rows if r[f'{side}_id'])
            self.assertEqual(amounts['house'] - amounts['nep'], control['delta_php'])

    def test_ai_monitoring_summaries_reproduce_both_reading_notes(self):
        strict = self.data['ai_monitoring_summaries']['strict']
        corrected = self.data['ai_monitoring_summaries']['ai_corrected']
        self.assertEqual(strict['paired_count'], 176)
        self.assertEqual(strict['paired_house_php'], 3715000000)
        self.assertEqual(strict['house_only_count'], 123)
        self.assertEqual(strict['house_only_php'], 2626950000)
        self.assertEqual(strict['nep_only_count'], 151)
        self.assertEqual(strict['nep_only_php'], 3300950000)
        self.assertEqual(corrected['paired_count'], 273)
        self.assertEqual(corrected['paired_house_php'], 5785950000)
        self.assertEqual(corrected['paired_nep_php'], 5785950000)
        self.assertEqual(corrected['house_only_count'], 26)
        self.assertEqual(corrected['house_only_php'], 556000000)
        self.assertEqual(corrected['nep_only_count'], 54)
        self.assertEqual(corrected['nep_only_php'], 1230000000)
        for summary in (strict, corrected):
            self.assertEqual(summary['nep_php'], 7015950000)
            self.assertEqual(summary['house_php'], 6341950000)
            self.assertEqual(summary['net_delta_php'], -674000000)
            marks = summary['unmatched_marks']
            total_house = sum(v['house_only']['amount_php'] for v in marks.values())
            total_nep = sum(v['nep_only']['amount_php'] for v in marks.values())
            self.assertEqual(total_house, summary['house_only_php'])
            self.assertEqual(total_nep, summary['nep_only_php'])
            # DPWH-style split: validated no-counterpart candidates are
            # method-independent; OCR fixes only move rows between paired
            # and unresolved, never in or out of the validated pool.
            split = summary['candidate_split']['house_only']
            self.assertEqual(split['no_counterpart']['count'], 13)
            self.assertEqual(split['no_counterpart']['amount_php'], 295000000)
            self.assertEqual(split['unresolved']['count'] + split['no_counterpart']['count'],
                             summary['house_only_count'])
            self.assertEqual(split['unresolved']['amount_php'] + split['no_counterpart']['amount_php'],
                             summary['house_only_php'])
            nep_split = summary['candidate_split']['nep_only']
            self.assertEqual(nep_split['no_counterpart']['count'], 40)
            self.assertEqual(nep_split['no_counterpart']['amount_php'], 954000000)
        # Corrected AI marks: 5 repeated / 5 spelling / 3 location / 13 none.
        corrected_marks = corrected['unmatched_marks']
        self.assertEqual(corrected_marks['repeated_title']['house_only']['count'], 5)
        self.assertEqual(corrected_marks['spelling_variant']['house_only']['count'], 5)
        self.assertEqual(corrected_marks['spelling_variant']['house_only']['amount_php'], 121000000)
        self.assertEqual(corrected_marks['location_variant']['house_only']['count'], 3)
        self.assertEqual(corrected_marks['location_variant']['house_only']['amount_php'], 40000000)
        self.assertEqual(corrected_marks['no_counterpart']['house_only']['count'], 13)
        self.assertEqual(corrected_marks['no_counterpart']['house_only']['amount_php'], 295000000)

    def test_variant_marks_stay_one_to_one_and_symmetric(self):
        marks = [r for r in self.data['comparison']
                 if r.get('variant_mark_kind') and r['variant_mark_kind'] != 'no_counterpart']
        self.assertTrue(marks)
        seen = Counter(cid for r in marks for cid in r['variant_mark']['counterpart_ids'])
        self.assertEqual(set(seen.values()), {1})
        by_source_id = {r['house_id'] or r['nep_id']: r for r in self.data['comparison'] if r['house_id'] or r['nep_id']}
        for row in marks:
            for cid in row['variant_mark']['counterpart_ids']:
                other = by_source_id[cid]
                self.assertEqual(other['variant_mark']['counterpart_ids'],
                                 [row['house_id'] or row['nep_id']])
                self.assertEqual(other['variant_mark_kind'], row['variant_mark_kind'])
        # Marks only exist on unmatched rows, and only the corrected residual.
        self.assertTrue(all(r['status'] != 'paired' for r in marks))
        # Named anchors from the residual review.
        by_house = {r['house_id']: r for r in self.data['comparison'] if r['house_id']}
        self.assertEqual(by_house['ib:p926:r8']['variant_mark_kind'], 'spelling_variant')  # RM5 vs RMS
        self.assertEqual(by_house['ib:p922:r17']['variant_mark_kind'], 'no_counterpart')  # Zaragosa satellite
        self.assertEqual(by_house['ib:p920:r11']['variant_mark_kind'], 'repeated_title')  # San Juan
        alibad = next(r for r in self.data['comparison'] if r.get('house_id') == 'ib:p924:r10')
        self.assertEqual((alibad['status'], alibad['strict_status']), ('paired', 'split_pair'))

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

    def test_corrected_method_pairs_ocr_and_wording_variants_without_rewriting_titles(self):
        house_row = lambda pid, title: {'id': pid, 'stage': 'house', 'subprogram_key': 's',
                                        'title': title, 'amount_php': 50}
        nep_row = lambda pid, title: {'id': pid, 'stage': 'nep', 'subprogram_key': 's',
                                      'title': title, 'amount_php': 50}
        rows_house = [house_row('h1', 'SPIP with AI Monitoring System'),
                      house_row('h2', 'CPIP: Conversion with AI Monitoring')]
        rows_nep = [nep_row('n1', 'SPIP with Al Monitoring System'),
                    nep_row('n2', 'CPIP: Conversion with AI Monitoring System')]
        strict_pairs, strict_h, strict_n = builder.match_projects(rows_house, rows_nep)
        self.assertEqual(strict_pairs, [])
        self.assertEqual((len(strict_h), len(strict_n)), (2, 2))
        corrected_pairs, corrected_h, corrected_n = builder.match_projects(rows_house, rows_nep, method='ai_corrected')
        self.assertEqual(len(corrected_pairs), 2)
        self.assertFalse(corrected_h or corrected_n)
        # Stored titles are never rewritten by the corrected method.
        self.assertEqual(rows_nep[0]['title'], 'SPIP with Al Monitoring System')
        self.assertEqual(rows_house[1]['title'], 'CPIP: Conversion with AI Monitoring')
        # Non-AI titles are untouched by both normalizations.
        plain_house = [house_row('h3', 'Canal Repair Works')]
        plain_nep = [nep_row('n3', 'Canal Repair Works System')]
        self.assertEqual(builder.match_projects(plain_house, plain_nep, method='ai_corrected')[0], [])
        with self.assertRaises(ValueError):
            builder.match_projects(rows_house, rows_nep, method='bogus')

    def test_variant_marks_require_unique_same_amount_counterparts(self):
        house_row = lambda pid, title, amount: {'id': pid, 'stage': 'house', 'subprogram_key': 's',
                                                'title': title, 'amount_php': amount}
        nep_row = lambda pid, title, amount: {'id': pid, 'stage': 'nep', 'subprogram_key': 's',
                                              'title': title, 'amount_php': amount}
        # One-to-one spelling variant pairs by equal amount.
        marks, pools = builder.mark_unmatched_variants(
            [house_row('h1', 'Camencita SPIP', 15)],
            [nep_row('n1', 'Carmencita SPIP', 15), nep_row('n2', 'Other SPIP', 15)])
        self.assertEqual(marks['h1']['mark'], 'spelling_variant')
        self.assertEqual(marks['h1']['counterpart_ids'], ['n1'])
        self.assertEqual(marks['n2']['mark'], 'no_counterpart')
        # Amount collision with equal keys marks repeated_title instead.
        marks, _ = builder.mark_unmatched_variants(
            [house_row('h1', 'Same SPIP', 15), house_row('h2', 'Same SPIP', 15)],
            [nep_row('n1', 'Same SPIP', 15), nep_row('n2', 'Same SPIP', 15)])
        self.assertTrue(all(m['mark'] == 'repeated_title' for m in marks.values()))
        # House-only location suffix against a NEP base title.
        marks, _ = builder.mark_unmatched_variants(
            [house_row('h1', 'Sta. Cruz RIS in Brgy. San Miguel', 15)],
            [nep_row('n1', 'Sta. Cruz RIS', 15)])
        self.assertEqual(marks['h1']['mark'], 'location_variant')
        # Different amounts never mark.
        marks, _ = builder.mark_unmatched_variants(
            [house_row('h1', 'Same SPIP', 15)], [nep_row('n1', 'Same SPIP', 20)])
        self.assertEqual(marks['h1']['mark'], 'no_counterpart')

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
