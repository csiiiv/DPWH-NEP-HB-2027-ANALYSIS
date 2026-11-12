"""Senate workbook layer: extraction invariants and the one-to-one ledger join."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'analysis-nia' / 'data'

spec = importlib.util.spec_from_file_location('nia_senate', ROOT / 'analysis-nia/extract_nia_senate_workbook.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class SenateWorkbookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = extractor.build()

    def test_printed_amounts_reconcile_with_both_annexes(self):
        projects = self.dataset['projects']
        nep_rows = [p for p in projects if (p['nep_amount'] or 0) > 0]
        house_rows = [p for p in projects if (p['hgab_amount'] or 0) > 0]
        self.assertEqual(len(nep_rows), 791)
        self.assertEqual(sum(p['nep_amount'] for p in nep_rows), 17_598_181_000)
        self.assertEqual(len(house_rows), 828)
        self.assertEqual(sum(p['hgab_amount'] for p in house_rows), 17_999_305_000)

    def test_subprogram_controls_match_the_printed_nep_annex(self):
        controls = {c['key']: c for c in self.dataset['subprogram_controls']}
        self.assertEqual(set(controls), set(extractor.EXPECTED_NEP_CONTROLS))
        for key, want in extractor.EXPECTED_NEP_CONTROLS.items():
            self.assertEqual(controls[key]['nep_amount'], want, key)
        # House controls equal the House annex controls.
        self.assertEqual(sum(c['hgab_amount'] for c in controls.values()), 17_999_305_000)

    def test_every_funded_row_joins_one_to_one_to_both_ledgers(self):
        for side, funded in (('nep', 791), ('house', 828)):
            joined = [p for p in self.dataset['projects'] if p.get(f'{side}_join')]
            self.assertEqual(len(joined), funded, side)
            ids = [p[f'{side}_join']['id'] for p in joined]
            self.assertEqual(len(ids), len(set(ids)), f'{side} join is not one-to-one')

    def test_joined_amounts_always_agree(self):
        workbench = json.loads((DATA / 'nia_workbench.json').read_text())
        ledgers = {side: {p['id']: p for p in workbench['stages'][side]['projects']}
                   for side in ('nep', 'house')}
        for p in self.dataset['projects']:
            for side, field in (('nep', 'nep_amount'), ('house', 'hgab_amount')):
                join = p.get(f'{side}_join')
                if not join:
                    continue
                ledger_amount = ledgers[side][join['id']]['amount_php']
                self.assertEqual(ledger_amount, p[field],
                                 f'{p["id"]} joins {side} row with a different amount')

    def test_official_insertions_have_house_money_and_no_nep_line(self):
        insertions = [p for p in self.dataset['projects'] if p['status'] == 'house_insertion']
        self.assertEqual(len(insertions), 145)
        for p in insertions:
            # The workbook prints 0 (not blank) on inserted rows' NEP column.
            self.assertIn(p['nep_amount'], (None, 0))
            self.assertGreater(p['hgab_amount'], 0)
            self.assertTrue(p['house_join'], 'insertion rows must join the House ledger')
        self.assertEqual(sum(p['hgab_amount'] for p in insertions), 5_742_500_000)

    def test_zeroed_rows_carry_nep_money_and_no_house_money(self):
        zeroed = [p for p in self.dataset['projects'] if p['status'] == 'house_zeroed']
        self.assertEqual(len(zeroed), 108)
        for p in zeroed:
            self.assertGreater(p['nep_amount'], 0)
            self.assertTrue(p['nep_join'], 'zeroed rows must join the NEP ledger')

    def test_justifications_and_edit_acknowledgements_are_retained(self):
        justified = [p for p in self.dataset['projects'] if p['justification']]
        edited = [p for p in self.dataset['projects'] if p['submission_edited']]
        self.assertEqual(len(justified), 94)
        self.assertEqual(len(edited), 782)
        # Justified rows almost always acknowledge the edit; a handful carry
        # only the written reason.
        unflagged = [p for p in justified if not p['submission_edited']]
        self.assertLessEqual(len(unflagged), 12)

    def test_hierarchy_is_complete_on_every_project_row(self):
        for p in self.dataset['projects']:
            self.assertTrue(p['program'])
            self.assertTrue(p['subprogram_key'])
            self.assertTrue(p['region'], p['id'])
            # categories exist on all rows; province may be absent on
            # region-direct groupings (MARIIS/UPRIIS print no province).

    def test_region_labels_canonicalized_for_grouping(self):
        regions = {p['region_canonical'] for p in self.dataset['projects']}
        self.assertNotIn('REGION 3', regions)
        self.assertNotIn('Region IV-A', regions)
        self.assertIn('Region 3', regions)
        self.assertIn('Region 4A', regions)

    def test_workbench_payload_carries_the_senate_layer(self):
        workbench = json.loads((DATA / 'nia_workbench.json').read_text())
        senate = workbench.get('senate')
        self.assertTrue(senate)
        self.assertEqual(senate['audit_summary']['house_insertions'], 145)
        self.assertEqual(senate['audit_summary']['nep_joined'], 791)
        self.assertEqual(senate['audit_summary']['house_joined'], 828)
        # Every comparison row references its senate workbook rows.
        with_senate = [r for r in workbench['comparison'] if r.get('senate_ids')]
        self.assertEqual(len(with_senate), len(workbench['comparison']))
        # Senate references resolve to real workbook rows.
        ids = {p['id'] for p in senate['projects']}
        for row in workbench['comparison'][:200]:
            for sid in row.get('senate_ids', []):
                self.assertIn(sid, ids)

    def test_official_insertions_corroborate_unmatched_house_candidates(self):
        """The workbook's official insertions should overlap our unmatched
        House candidates: each official insertion row's House ledger row must
        be house_only in the corrected comparison."""
        workbench = json.loads((DATA / 'nia_workbench.json').read_text())
        house_only = {r['house_id'] for r in workbench['comparison'] if r['status'] == 'house_only'}
        insertions = [p for p in self.dataset['projects'] if p['status'] == 'house_insertion']
        corroborated = [p for p in insertions if p['house_join']['id'] in house_only]
        self.assertGreater(len(corroborated), 120,
                           'official insertions should overwhelmingly corroborate house_only candidates')

    def test_title_parses_prefer_fixed_title_and_annotate_without_rewrite(self):
        counts = self.dataset['meta']['counts']
        self.assertGreaterEqual(counts['with_coordinates'], 400)
        self.assertGreaterEqual(counts['with_chainage'], 300)
        with_coords = [p for p in self.dataset['projects']
                       if (p.get('title_parse') or {}).get('coordinates', {})
                       and (p['title_parse']['coordinates'] or {}).get('points')]
        with_chain = [p for p in self.dataset['projects']
                      if (p.get('title_parse') or {}).get('chainage')]
        self.assertEqual(len(with_coords), counts['with_coordinates'])
        self.assertEqual(len(with_chain), counts['with_chainage'])
        for p in self.dataset['projects']:
            parse = p.get('title_parse') or {}
            self.assertIn(parse.get('source'), ('submission_label', 'label'))
            if p.get('submission_label'):
                self.assertEqual(parse['source'], 'submission_label')
            else:
                self.assertEqual(parse['source'], 'label')
            coords = (parse.get('coordinates') or {}).get('points') or []
            for pt in coords:
                self.assertIsInstance(pt['latitude'], (int, float))
                self.assertIsInstance(pt['longitude'], (int, float))
            chain = parse.get('chainage')
            if chain:
                self.assertTrue(chain['spans'])
                self.assertTrue(isinstance(chain['length_m'], (int, float))
                                or chain['length_m'] is None)


if __name__ == '__main__':
    unittest.main()
