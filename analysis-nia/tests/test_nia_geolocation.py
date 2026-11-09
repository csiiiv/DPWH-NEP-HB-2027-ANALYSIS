import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DATASET = HERE / 'data/nia_geolocation.json'


class NiaGeolocationDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATASET.read_text())

    def test_summary_matches_records(self):
        records = self.data['records']
        located = [r for r in records if r['located']]
        summary = self.data['summary']
        self.assertEqual(summary['records'], len(records))
        self.assertEqual(summary['located'], len(located))
        self.assertEqual(summary['unlocated'], len(records) - len(located))
        self.assertEqual(summary['psgc_valid'], len(located))
        # Every located row carries a catalog-valid 10-digit PSGC.
        self.assertTrue(all(r['psgc_status'] == 'valid' for r in located))
        self.assertTrue(all(r['barangay'] and r['municipality'] and r['province'] for r in located
                            if 'incomplete_names' not in r['flags']))

    def test_ids_unique_and_joinable_to_workbench(self):
        ids = [r['id'] for r in self.data['records']]
        self.assertEqual(len(ids), len(set(ids)))
        workbench = json.loads((HERE / 'data/nia_workbench.json').read_text())
        comparison_ids = {row['id'] for row in workbench['comparison']}
        self.assertEqual(set(ids), comparison_ids)

    def test_flag_rows_are_retained_not_dropped(self):
        records = self.data['records']
        self.assertEqual(sum(1 for r in records if 'psgc_malformed' in r['flags']), 3)
        self.assertEqual(sum(1 for r in records if 'psgc_unknown' in r['flags']), 1)
        self.assertEqual(sum(1 for r in records if 'deo_province_mismatch' in r['flags']), 4)
        # Flagged PSGC rows are never counted as located.
        for record in records:
            if 'psgc_malformed' in record['flags'] or 'psgc_unknown' in record['flags']:
                self.assertFalse(record['located'])


@unittest.skipUnless(importlib.util.find_spec('openpyxl'), 'openpyxl required for live workbook extract')
class NiaGeolocationLiveExtractTests(unittest.TestCase):
    def test_extract_matches_committed_dataset(self):
        spec = importlib.util.spec_from_file_location('extract_nia_geolocation', HERE / 'extract_nia_geolocation.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        live = module.extract()
        committed = json.loads(DATASET.read_text())
        self.assertEqual(live['summary'], committed['summary'])
        self.assertEqual([r['id'] for r in live['records']], [r['id'] for r in committed['records']])


if __name__ == '__main__':
    unittest.main()
