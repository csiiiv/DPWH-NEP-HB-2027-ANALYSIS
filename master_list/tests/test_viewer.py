"""Verify reference resolution and the generated table ledger."""
from collections import Counter
import csv
import gzip
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from build_viewer import category, reference, digest


class Viewer(unittest.TestCase):
    def test_api_has_no_invented_pdf(self):
        self.assertEqual(reference({'dataset': 'dpwh_nep_api'}), (None, None, None))

    def test_hfep_ocr_file_resolves_to_pdf_with_same_page_basis(self):
        row = {'dataset': 'hfep_nep', 'source': {'source_pdf': 'HFEP.json', 'pdf_page': 2, 'printed_page': 720}}
        self.assertEqual(reference(row), ('dbm-other-nep-line-data/HFEP_2.pdf', 2, 720))

    def test_legacy_absolute_pdf_path_resolves_locally(self):
        row = {'dataset': 'dpwh_nep_pdf', 'source': {'source_pdf': '/old/server/file.pdf', 'pdf_page': 195}}
        self.assertEqual(reference(row), ('dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf', 195, None))

    def test_nia_uses_extraction_page_field(self):
        row = {'dataset': 'nia_nep', 'source_pdf': 'dbm-other-nep-line-data/NIA.pdf', 'source': {'page': 7}}
        self.assertEqual(reference(row), ('dbm-other-nep-line-data/NIA.pdf', 7, None))

    def test_hfep_region_is_not_a_category(self):
        row = {'dataset': 'hfep_nep', 'source_path': ['Annex', '2. LGU Hospitals', 'Region I', 'Facility']}
        self.assertEqual(category(row), '2. LGU Hospitals')

    def test_csv_preserves_records_and_source_totals(self):
        audit = json.loads((ROOT / 'master_list/data/audit.json').read_text())
        counts, totals, seen = Counter(), Counter(), set()
        with gzip.open(ROOT / 'master_list/data/project_list.csv.gz', 'rt', encoding='utf-8', newline='') as stream:
            for row in csv.DictReader(stream):
                self.assertNotIn(row['record_id'], seen)
                seen.add(row['record_id'])
                counts[row['dataset']] += 1
                totals[row['dataset']] += int(row['value_php'])
                score = int(row['location_score'])
                self.assertEqual(row['location_score'], str(score))
                self.assertEqual(row['score_method'], 'location_evidence_v2')
                for code in row['psgc_codes'].split('|'):
                    if code:
                        self.assertEqual(len(code), 10)
                        self.assertTrue(code.isdigit())
                if row['dataset'] == 'dpwh_nep_api':
                    self.assertEqual(row['reference_pdf'], '')
                    self.assertEqual(row['pdf_page'], '')
                else:
                    self.assertTrue((ROOT / row['reference_pdf']).is_file())
                    self.assertGreater(int(row['pdf_page']), 0)
        self.assertEqual(len(seen), audit['records'])
        for dataset, entry in audit['datasets'].items():
            self.assertEqual(counts[dataset], entry['records'])
            self.assertEqual(totals[dataset], entry['amount_php'])


if __name__ == '__main__':
    unittest.main()
