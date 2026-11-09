import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('extract_da_fmr', HERE / 'extract_da_fmr.py')
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)


class DaFmrExtractTests(unittest.TestCase):
    def test_extract_controls_and_excel_rows(self):
        data = extract.extract()
        self.assertEqual(data['summary']['original_rows'], 704)
        self.assertEqual(data['summary']['proposed_project_rows'], 775)
        self.assertEqual(data['summary']['from_amount_php'], 16_000_000_000)
        self.assertEqual(data['summary']['proposed_amount_php'], 16_000_000_000)
        first = data['projects'][0]
        self.assertEqual(first['excel_row'], 5)
        self.assertEqual(first['id'], 'da_fmr:r5')
        self.assertEqual(first['control_no'], 'R1-0001')
        self.assertTrue(all(p['excel_row'] >= 2 for p in data['projects']))
        self.assertEqual(len({p['excel_row'] for p in data['projects']}), len(data['projects']))


if __name__ == '__main__':
    unittest.main()
