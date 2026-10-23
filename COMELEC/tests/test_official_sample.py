import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class OfficialSample(unittest.TestCase):
    def test_page_sample_is_explicitly_partial_and_traceable(self):
        x=json.loads((ROOT/'data/2025/samples/nueva_ecija_page14.json').read_text())
        self.assertIn('comelec.gov.ph',x['sourceUrl'])
        self.assertIn('partial',x['completeness'])
        self.assertEqual(x['districtType'],'house_legislative')
        self.assertEqual(x['pdfPage'],14)
        self.assertEqual(sum(len(d['members']) for d in x['districts']),28)
        self.assertFalse(x['districts'][-1]['pageComplete'])
        self.assertEqual(len({m for d in x['districts'] for m in d['members']}),28)

    def test_sample_seats_identified_but_psgc_unassigned(self):
        x=json.loads((ROOT/'data/2025/samples/nueva_ecija_page14.json').read_text())
        self.assertTrue(x['requiresPsgcReconciliation'])
        self.assertEqual([d['districtId'] for d in x['districts']],
           ['leg:nueva-ecija:1st','leg:nueva-ecija:2nd','leg:nueva-ecija:3rd','leg:nueva-ecija:4th'])

if __name__=='__main__':
    unittest.main()
