import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DRAFT = HERE / 'data' / 'da_fmr_draft.json'


class DaFmrDraftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DRAFT.read_text())

    def test_committed_draft_controls_and_excel_rows(self):
        data = self.data
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


class DaFmrCoordParseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('extract_da_fmr', HERE / 'extract_da_fmr.py')
        cls.extract = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.extract)

    def test_numbered_start_end_lists_pair_into_segments(self):
        # Villa Teresita (R2-0055) and siblings use numbered multi-segment lists.
        text = (
            'Construction of Brgy. Villa Teresita FMR, Brgy. Villa Teresita, San Guillermo, Isabela\n'
            'START: (1) 16.7598517, 121.8570901, (2) 16.7548787, 121.8595580\n'
            'END: (1) 16.7603738, 121.8674364, (2) 16.7509336, 121.8661148'
        )
        title, coordinates, raw, retain = self.extract.parse_title_coords(text)
        self.assertFalse(retain)
        self.assertIn('Villa Teresita', title)
        self.assertEqual(len(coordinates), 2)
        self.assertEqual(coordinates[0][0], [121.8570901, 16.7598517])
        self.assertEqual(coordinates[0][1], [121.8674364, 16.7603738])
        self.assertEqual(coordinates[1][0], [121.8595580, 16.7548787])
        self.assertEqual(coordinates[1][1], [121.8661148, 16.7509336])
        self.assertIn('START:', raw)

    def test_simple_pair_still_parses_and_ocr_digit_gaps_collapse(self):
        text = 'Some FMR\nSTART: 14.239481, 121.611718\nEND: 14. 233296, 121.601841'
        title, coordinates, raw, retain = self.extract.parse_title_coords(text)
        self.assertFalse(retain)
        self.assertEqual(title, 'Some FMR')
        self.assertEqual(len(coordinates), 1)
        self.assertEqual(coordinates[0][0], [121.611718, 14.239481])
        self.assertEqual(coordinates[0][1], [121.601841, 14.233296])

    def test_s_section_modifiers_pair_into_segments(self):
        # Sapangan (R4A-0038): S1-/S2- are section labels, not separate schemas.
        text = (
            'Construction of Brgy. Sapangan FMR, Brgy. Sapangan, San Juan, Batangas\n'
            'START: S1-13.7861519, 121.3636771 S2-13.7059722, 121.3570456\n'
            'END: S1-13.78862752, 121.3582386 S2-13.7868393, 121.3552979'
        )
        title, coordinates, raw, retain = self.extract.parse_title_coords(text)
        self.assertFalse(retain)
        self.assertIn('Sapangan', title)
        self.assertEqual(len(coordinates), 2)
        self.assertEqual(coordinates[0][0], [121.3636771, 13.7861519])
        self.assertEqual(coordinates[0][1], [121.3582386, 13.78862752])
        self.assertEqual(coordinates[1][0], [121.3570456, 13.7059722])
        self.assertEqual(coordinates[1][1], [121.3552979, 13.7868393])
        self.assertIn('S1-', raw)

    def test_interleaved_sec_blocks_pair_by_section(self):
        text = (
            'Some FMR\n'
            'START (SEC 1): 16.464822, 121.783702\n'
            'END (SEC 1): 16.466869, 121.805868\n'
            'START (SEC 2): 16.467103, 121.809653\n'
            'END (SEC 2): 16.468489, 121.810549'
        )
        title, coordinates, raw, retain = self.extract.parse_title_coords(text)
        self.assertFalse(retain)
        self.assertEqual(title, 'Some FMR')
        self.assertEqual(len(coordinates), 2)
        self.assertEqual(coordinates[0][0], [121.783702, 16.464822])
        self.assertEqual(coordinates[1][1], [121.810549, 16.468489])


@unittest.skipUnless(importlib.util.find_spec('openpyxl'), 'openpyxl required for live Excel extract')
class DaFmrLiveExtractTests(unittest.TestCase):
    def test_extract_matches_committed_draft(self):
        spec = importlib.util.spec_from_file_location('extract_da_fmr', HERE / 'extract_da_fmr.py')
        extract = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(extract)
        live = extract.extract()
        committed = json.loads(DRAFT.read_text())
        self.assertEqual(live['summary'], committed['summary'])
        self.assertEqual(len(live['projects']), len(committed['projects']))
        self.assertEqual(live['projects'][0]['id'], committed['projects'][0]['id'])


if __name__ == '__main__':
    unittest.main()
