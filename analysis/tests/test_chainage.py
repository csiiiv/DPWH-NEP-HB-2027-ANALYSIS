#!/usr/bin/env python3
import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]),
                str(_Path(__file__).resolve().parents[1] / 'builders')]
import unittest

from chainage import classify_chainage_amendment, parse_chainage
from normalize_labels import annotate_source_labels


class ChainageParseTests(unittest.TestCase):
    def test_k_range_and_negative_offset(self):
        parsed = parse_chainage('Abbut-Conner Rd - K0564 + 150 - K0564 + 200')
        self.assertEqual(parsed['title_base'], 'Abbut-Conner Rd')
        self.assertEqual(len(parsed['chainages']), 1)
        ch = parsed['chainages'][0]
        self.assertEqual(ch['kind'], 'K')
        self.assertEqual(ch['from'], 'K0564+150')
        self.assertEqual(ch['to'], 'K0564+200')
        self.assertEqual(ch['length_m'], 50)

        neg = parse_chainage('C-5 Road - K0011 + (-975) - K0011 + 420')
        self.assertEqual(neg['title_base'], 'C-5 Road')
        self.assertEqual(neg['chainages'][0]['length_m'], 1395)

    def test_sta_c_and_chainage_families(self):
        sta = parse_chainage('Abra Cervantes Road - Sta. 17+340 -Sta. 18+200, Abra')
        self.assertIn('Abra Cervantes Road', sta['title_base'])
        self.assertEqual(sta['chainages'][0]['from'], '17+340')
        self.assertEqual(sta['chainages'][0]['to'], '18+200')
        self.assertEqual(sta['chainages'][0]['length_m'], 860)

        c = parse_chainage('Martinez St. (C0+000 to C0+220), Barangay Paso de Blas')
        self.assertEqual(c['chainages'][0]['kind'], 'C')
        self.assertEqual(c['chainages'][0]['length_m'], 220)

        ch = parse_chainage(
            'Agdangan By-Pass Road, Chainage 400 - Chainage 1860, Quezon')
        self.assertEqual(ch['chainages'][0]['kind'], 'Chainage')
        self.assertEqual(ch['chainages'][0]['length_m'], 1460)

    def test_multi_segment_k(self):
        parsed = parse_chainage(
            'Aklan East Rd - K0285 + 605 - K0285 + 714, K0285 + 877 - K0286 + 071')
        self.assertEqual(parsed['title_base'], 'Aklan East Rd')
        self.assertEqual(len(parsed['chainages']), 2)

    def test_amendment_classification(self):
        short = parse_chainage('Foo Rd - K0001 + 000 - K0001 + 950')['chainages']
        mid = parse_chainage('Foo Rd - K0001 + 000 - K0002 + 000')['chainages']
        long = parse_chainage('Foo Rd - K0001 + 000 - K0003 + 000')['chainages']
        self.assertEqual(
            classify_chainage_amendment(mid, short),
            'adjustment of station markers')
        self.assertEqual(
            classify_chainage_amendment(mid, long),
            'decreased project length')
        self.assertEqual(
            classify_chainage_amendment(long, mid),
            'increased project length')

    def test_annotate_attaches_chainage_fields(self):
        row = {
            'title': 'Abbut-Conner Rd - K0564 + 150 - K0564 + 200',
            'office': 'Abra District Engineering Office',
        }
        annotate_source_labels(row)
        self.assertEqual(row['title_base'], 'Abbut-Conner Rd')
        self.assertTrue(row['title_base_match_key'])
        self.assertEqual(len(row['chainages']), 1)
        self.assertFalse(row['chainage_incomplete'])
        # Printed title unchanged.
        self.assertIn('K0564', row['title'])

    def test_single_point_k_station(self):
        # Bridge markers often carry one station, not a from–to span.
        parsed = parse_chainage(
            'Libas Br. Along Tigwi-Dampulan-Lipata-Yook Buenavista Rd. K0095 + 075')
        self.assertEqual(
            parsed['title_base'],
            'Libas Br. Along Tigwi-Dampulan-Lipata-Yook Buenavista Rd.')
        self.assertEqual(len(parsed['chainages']), 1)
        ch = parsed['chainages'][0]
        self.assertTrue(ch['point'])
        self.assertEqual(ch['from'], 'K0095+075')
        self.assertEqual(ch['to'], 'K0095+075')
        self.assertIsNone(ch['length_m'])
        self.assertEqual(ch['meters_from'], 95075)
        # Ranges still win over nested point tokens.
        ranged = parse_chainage('Foo Rd - K0095 + 000 - K0095 + 100')
        self.assertEqual(len(ranged['chainages']), 1)
        self.assertFalse(ranged['chainages'][0]['point'])
        self.assertEqual(ranged['chainages'][0]['length_m'], 100)

    def test_absurd_km_ocr_is_repaired_and_flagged(self):
        # Printed K0220+328 vs K0020+513 → ~200 km abs; NEP peer is K0020+328.
        parsed = parse_chainage(
            'Quezon-Alabat-Perez Rd - K0003 + 230 - K0003 + 275, '
            'K0017 + 670 - K0017 + 800, K0220 + 328 - K0020 + 513')
        self.assertEqual(len(parsed['chainages']), 3)
        bad = parsed['chainages'][2]
        self.assertEqual(bad['from'], 'K0220+328')
        self.assertEqual(bad['to'], 'K0020+513')
        self.assertEqual(bad['length_review'], 'repaired_km_ocr')
        self.assertEqual(bad['length_from'], 'K0020+328')
        self.assertEqual(bad['length_to'], 'K0020+513')
        self.assertEqual(bad['length_m'], 185)
        self.assertTrue(parsed['incomplete'])
        row = {
            'title': (
                'Quezon-Alabat-Perez Rd - K0003 + 230 - K0003 + 275, '
                'K0017 + 670 - K0017 + 800, K0220 + 328 - K0020 + 513'),
            'office': 'Quezon 2nd District Engineering Office',
        }
        annotate_source_labels(row)
        self.assertEqual(row['chainage_length_review'], 'repaired_km_ocr')
        self.assertTrue(row['chainage_incomplete'])

    def test_plausible_reverse_span_keeps_abs_length_unflagged(self):
        parsed = parse_chainage(
            'Flood Control along Talisay River Sta. 4 + 700 - Sta. 4 + 264')
        ch = parsed['chainages'][0]
        self.assertEqual(ch['length_m'], 436)
        self.assertIsNone(ch['length_review'])


if __name__ == '__main__':
    unittest.main()
