"""Smoke tests for Program of Works availability artifact."""
import json
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ANALYSIS = os.path.dirname(HERE)
POW = os.path.join(ANALYSIS, 'data', 'program_of_works')


class TestPowAvailability(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(POW, 'pow_availability.json')) as f:
            cls.ds = json.load(f)

    def test_schema_and_counts(self):
        self.assertEqual(self.ds['schema_version'], 1)
        self.assertTrue(self.ds['source_drive_url'].startswith('https://drive.google.com/'))
        self.assertIn('PROGRAM OF WORKS', self.ds['source_subfolder'])
        s = self.ds['summary']
        self.assertGreater(s['packages'], 0)
        self.assertGreater(s['total_docs'], 0)
        self.assertEqual(s['total_docs'], s['total_pdfs'] + s['total_images'])
        self.assertEqual(len(self.ds['packages']), s['packages'])
        self.assertEqual(len(self.ds['projects']), s['senate_projects_with_docs'])
        self.assertEqual(len(self.ds['coverage']), s['senate_projects'])
        self.assertEqual(
            s['senate_projects_with_docs'] + s['senate_projects_unsupported'],
            s['senate_projects'])

    def test_project_doc_counts_sum_parts(self):
        for p in self.ds['projects']:
            self.assertEqual(p['doc_count'], p['pdf_count'] + p['image_count'], p['senate_id'])
            self.assertGreaterEqual(p['doc_count'], 1)

    def test_coverage_supported_flag(self):
        supported = [r for r in self.ds['coverage'] if r['supported']]
        unsupported = [r for r in self.ds['coverage'] if not r['supported']]
        self.assertEqual(len(supported), self.ds['summary']['senate_projects_with_docs'])
        self.assertEqual(len(unsupported), self.ds['summary']['senate_projects_unsupported'])
        self.assertTrue(all(r['doc_count'] >= 1 for r in supported))
        self.assertTrue(all(r['doc_count'] == 0 for r in unsupported))

    def test_region_rows_cover_packages(self):
        total = sum(r['packages'] for r in self.ds['by_region'])
        self.assertEqual(total, self.ds['summary']['packages'])
        for r in self.ds['by_region']:
            if r.get('senate_projects'):
                self.assertEqual(
                    r['projects_with_docs'] + r['unsupported'], r['senate_projects'],
                    r['region_folder'])

    def test_strong_matches_dominate_current_drop(self):
        strength = self.ds['summary']['match_strength']
        self.assertGreaterEqual(strength.get('strong', 0), strength.get('weak', 0))

    def test_support_scale_bars(self):
        scale = self.ds['summary']['support_scale']
        self.assertEqual([r['id'] for r in scale], ['pow', 'photos', 'none'])
        self.assertEqual(scale[0]['count'], self.ds['summary']['senate_projects_with_pow'])
        self.assertEqual(scale[1]['count'], self.ds['summary']['senate_projects_with_photos'])
        self.assertEqual(scale[2]['count'], self.ds['summary']['senate_projects_unsupported'])
        self.assertGreaterEqual(scale[0]['count'], scale[1]['count'])
        self.assertEqual(
            sum(1 for r in self.ds['coverage'] if r.get('has_pow')),
            scale[0]['count'])
        self.assertEqual(
            sum(1 for r in self.ds['coverage'] if r.get('has_photos')),
            scale[1]['count'])

    def test_former_weak_packages_pdf_confirmed(self):
        # Acronym / picture packages that were weak on filename alone
        want = {
            'REPAIRPIS-LARPIS-300M': 'sen:r1456',
            'RESTONIS-BBRIS-18M': 'sen:r569',
            '1. REPAIRNIS-LABRIS-200M': 'sen:r414',
            '2027-D3-EXTENSIONNIS-QUIRINO': 'sen:r2451',
            'PENRIS SPIP': 'sen:r1874',
        }
        by_name = {p['name']: p for p in self.ds['packages']}
        for name, sid in want.items():
            pkg = by_name[name]
            self.assertEqual(pkg['match_strength'], 'strong', name)
            self.assertEqual(pkg['best_match']['senate_id'], sid, name)
            self.assertTrue(pkg['best_match'].get('pdf_confirmed'), name)
            self.assertTrue(pkg.get('pdf_evidence', {}).get('confirmed'), name)


if __name__ == '__main__':
    unittest.main()
