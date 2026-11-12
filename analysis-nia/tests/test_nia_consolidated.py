"""Consolidated NIA dataset: one Senate workbook row, complementary locations."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'analysis-nia' / 'data'

spec = importlib.util.spec_from_file_location(
    'nia_consolidated', ROOT / 'analysis-nia/build_nia_consolidated.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ConsolidatedDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = builder.build()
        cls.projects = cls.dataset['projects']
        cls.by_id = {p['id']: p for p in cls.projects}

    def test_one_row_per_senate_workbook_line(self):
        self.assertEqual(len(self.projects), 937)
        self.assertEqual(len(self.by_id), 937)
        self.assertEqual(self.dataset['unit'], 'senate_workbook_row')

    def test_money_reconciles_once_on_projects(self):
        nep = [p for p in self.projects if (p.get('nep_amount') or 0) > 0]
        house = [p for p in self.projects if (p.get('hgab_amount') or 0) > 0]
        self.assertEqual(len(nep), 791)
        self.assertEqual(sum(p['nep_amount'] for p in nep), 17_598_181_000)
        self.assertEqual(len(house), 828)
        self.assertEqual(sum(p['hgab_amount'] for p in house), 17_999_305_000)

    def test_matching_splits_are_flagged_not_duplicated(self):
        splits = [p for p in self.projects if p['matching']['split']]
        self.assertEqual(len(splits), 77)
        self.assertEqual(self.dataset['meta']['counts']['matching_split'], 77)
        for p in splits:
            self.assertIn('matching_split', p['flags'])
            self.assertEqual(len(p['comparison_ids']), 2)
            self.assertIn(p['matching']['split_reason'],
                          ('reworded_printing', 'repeated_title'))

    def test_location_coverage_partitions_projects(self):
        counts = self.dataset['meta']['counts']
        coverage = counts['coverage']
        self.assertEqual(sum(coverage.values()), 937)
        self.assertEqual(counts['with_title_gps'],
                         coverage.get('title_gps', 0) + coverage.get('title_gps+psgc', 0))
        self.assertEqual(counts['with_psgc_centroid'],
                         coverage.get('psgc', 0) + coverage.get('title_gps+psgc', 0))
        self.assertGreaterEqual(counts['with_title_gps'], 400)
        self.assertGreaterEqual(counts['with_psgc_centroid'], 700)

    def test_title_gps_points_do_not_inflate_project_count(self):
        maniana = next(p for p in self.projects if 'Maniana' in (p.get('submission_label') or ''))
        self.assertEqual(maniana['locations']['title_gps']['point_count'], 6)
        self.assertIn('multi_site_title_gps', maniana['flags'])
        # One project id, one House amount — six sites share it.
        self.assertEqual(maniana['hgab_amount'], 60_000_000)

    def test_chainage_php_per_m_is_allocation_proxy(self):
        # PRIS-SDC PH2: ₱2,450,000 over Sta 0+000 → 0+200 (200 m).
        row = self.by_id['sen:r73']
        chainage = row['locations']['chainage']
        self.assertEqual(chainage['length_m'], 200)
        self.assertEqual(chainage['php_per_m'], 12_250.0)
        self.assertEqual(chainage['php_per_m_basis'], 'hgab')
        self.assertEqual(chainage['nep_php_per_m'], 12_250.0)
        self.assertEqual(chainage['hgab_php_per_m'], 12_250.0)
        counts = self.dataset['meta']['counts']
        self.assertGreaterEqual(counts['with_chainage_length'], 400)
        self.assertEqual(counts['with_php_per_m'], counts['with_chainage_length'])
        # Point-only stations have no length → no rate.
        point_only = next(
            p for p in self.projects
            if (p['locations'].get('chainage') or {}).get('spans')
            and (p['locations']['chainage'].get('length_m') in (None, 0))
            and all(s.get('point') for s in p['locations']['chainage']['spans']))
        self.assertIsNone(point_only['locations']['chainage'].get('php_per_m'))

    def test_written_outputs_match_builder(self):
        if not builder.OUT_JSON.is_file():
            self.skipTest('nia_consolidated.json not written yet')
        written = json.loads(builder.OUT_JSON.read_text())
        self.assertEqual(written['meta']['counts'], self.dataset['meta']['counts'])
        self.assertEqual(len(written['projects']), 937)


if __name__ == '__main__':
    unittest.main()
