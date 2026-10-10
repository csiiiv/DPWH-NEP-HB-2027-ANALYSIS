#!/usr/bin/env python3
import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]),
                str(_Path(__file__).resolve().parents[1] / 'builders')]
import unittest

from normalize_labels import (
    LIVE_TITLE_ABBREVIATIONS,
    PENDING_TITLE_ABBREVIATIONS,
    annotate_source_labels,
    canonical_office,
    classify_title_substitution,
    normalized,
    raw_normalized,
    title_match_key,
    title_tokens,
)


class NormalizeLabelsTests(unittest.TestCase):
    def test_las_pinas_office_variants_collapse(self):
        canon = 'Las Piñas Muntinlupa District Engineering Office'
        variants = [
            'Las Piñas Muntinlupa District Engineering Office',
            'Las Pi ñ as Muntinlupa District Engineering Office',
            'Las Piñas-Muntinlupa District Engineering Office',
            'Las Pi ñ as-Muntinlupa District Engineering Office',
        ]
        for office in variants:
            self.assertEqual(canonical_office(office), canon)

    def test_malabon_and_regional_office_variants(self):
        self.assertEqual(
            canonical_office('Malabon-Navotas District Engineering Office'),
            'Malabon Navotas District Engineering Office')
        self.assertEqual(canonical_office('Regional Office IVA'), 'Regional Office IV-A')
        self.assertEqual(canonical_office('Regional Office IV-A'), 'Regional Office IV-A')

    def test_live_brgy_and_repeat_rules_match_prior_behavior(self):
        # Same fixtures as test_current_pages abbreviation regressions.
        self.assertEqual(normalized('Brgy. Mabini, Sta. Sta. Maria'),
                         normalized('Barangay Mabini, Sta. Maria'))
        self.assertEqual(title_match_key('Brgy. Mabini'), title_match_key('Barangay Mabini'))
        self.assertNotEqual(raw_normalized('Brgy. Mabini'), raw_normalized('Barangay Mabini'))
        self.assertEqual(LIVE_TITLE_ABBREVIATIONS['brgy'], 'barangay')

    def test_place_name_ocr_slips_match(self):
        self.assertEqual(
            title_match_key('Marindugue Circumferential Rd'),
            title_match_key('Marinduque Circumferential Rd'))
        self.assertEqual(
            title_match_key('along Siguijor Circumferential Rd'),
            title_match_key('along Siquijor Circumferential Rd'))
        self.assertEqual(
            canonical_office('Marindugue District Engineering Office'),
            'Marinduque District Engineering Office')
        self.assertEqual(
            canonical_office('Siguijor District Engineering Office'),
            'Siquijor District Engineering Office')
        self.assertNotEqual(
            raw_normalized('Marindugue'), raw_normalized('Marinduque'))

    def test_structure_id_letter_o_becomes_zero(self):
        self.assertEqual(
            title_match_key('Agkawayan Br. (B00008LB) along Tagbac-Lubang-Looc Rd'),
            title_match_key('Agkawayan Br . (Bo0008LB) along Tagbac-Lubang-Looc Rd'))
        self.assertEqual(
            title_match_key('Construction of Bridge (FB60003LZ) along Daang Hari'),
            title_match_key('Construction of Bridge (FB6oo03LZ) along Daang Hari'))
        # Place names with oo must not become digits.
        self.assertEqual(title_tokens('Tagbac-Lubang-Looc Rd')[-2:], ['looc', 'rd'])
        self.assertNotEqual(raw_normalized('Bo0008LB'), raw_normalized('B00008LB'))

    def test_pending_bldg_not_live_until_merged(self):
        # Pending abbrevs must not change matching until explicitly promoted.
        self.assertIn('bldg', PENDING_TITLE_ABBREVIATIONS)
        self.assertNotEqual(
            title_tokens('Multi-Purpose Bldg.'),
            title_tokens('Multi-Purpose Building'))
        self.assertEqual(
            title_tokens('Multi-Purpose Bldg.', abbreviations=PENDING_TITLE_ABBREVIATIONS),
            title_tokens('Multi-Purpose Building', abbreviations=PENDING_TITLE_ABBREVIATIONS))

    def test_substitution_triage(self):
        self.assertEqual(classify_title_substitution(('building',), ('bldg',)), 'promote')
        self.assertEqual(classify_title_substitution(('buidling',), ('building',)), 'promote')
        self.assertEqual(
            classify_title_substitution(('rehabilitation',), ('construction',)), 'reject')
        self.assertEqual(classify_title_substitution(('k0097',), ('k0098',)), 'reject')
        self.assertEqual(classify_title_substitution(('granada',), ('alangilan',)), 'review')

    def test_annotate_source_labels_preserves_print(self):
        row = {
            'title': 'Rehab/Improvement of Road, Brgy. Mabini',
            'office': 'Las Pi ñ as-Muntinlupa District Engineering Office',
        }
        annotate_source_labels(row)
        self.assertEqual(row['title'], 'Rehab/Improvement of Road, Brgy. Mabini')
        self.assertEqual(
            row['office'], 'Las Pi ñ as-Muntinlupa District Engineering Office')
        self.assertEqual(
            row['office_canonical'],
            'Las Piñas Muntinlupa District Engineering Office')
        self.assertEqual(row['title_match_key'], title_match_key(row['title']))
        annotate_source_labels(row)  # idempotent
        self.assertEqual(
            row['office_canonical'],
            'Las Piñas Muntinlupa District Engineering Office')


if __name__ == '__main__':
    unittest.main()
