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
    strip_stage_qualifier,
    title_match_key,
    title_tokens,
    diff_tags,
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

    def test_blvd_ocr_slip_bivd(self):
        # NEP OCR reads "Bivd" for printed "Blvd" (l→i); mined pair was stuck
        # in review because both tokens are 4 chars (promote needs ≥5).
        self.assertEqual(
            title_match_key('Arellano-Palma Br. (B00422CB) along Arellano Blvd'),
            title_match_key('Arellano-Palma Br . (B00422CB) along Arellano Bivd'))
        self.assertEqual(LIVE_TITLE_ABBREVIATIONS['bivd'], 'blvd')
        self.assertEqual(classify_title_substitution(('blvd',), ('bivd',)), 'promote')
        self.assertNotEqual(raw_normalized('Arellano Bivd'), raw_normalized('Arellano Blvd'))

    def test_promoted_abbrev_and_ocr_slips_are_live(self):
        self.assertEqual(LIVE_TITLE_ABBREVIATIONS['bldg'], 'building')
        self.assertEqual(LIVE_TITLE_ABBREVIATIONS['bidg'], 'building')
        self.assertEqual(
            title_tokens('Multi-Purpose Bldg.'),
            title_tokens('Multi-Purpose Building'))
        self.assertEqual(
            title_match_key('Dipolog-Oroguieta National Rd'),
            title_match_key('Dipolog-Oroquieta National Rd'))
        self.assertEqual(
            title_match_key('Coverd Court, Barangay San Enrigue'),
            title_match_key('Covered Court, Barangay San Enrique'))
        self.assertEqual(PENDING_TITLE_ABBREVIATIONS, {})

    def test_spaced_n_tilde_and_optional_barangay_in_titles(self):
        self.assertEqual(
            title_match_key('Las Pi ñ as City'),
            title_match_key('Las Piñas City'))
        self.assertEqual(
            title_tokens('Las Pi ñ as City'),
            title_tokens('Las Piñas City'))
        self.assertEqual(
            title_match_key(
                'Rehabilitation of Road and Drainage, Aratan Blvd. Brgy Pulo '
                'Santa Cruz, City of Santa Rosa, Laguna'),
            title_match_key(
                'Rehabilitation of Road and Drainage, Aratan Blvd. Pulo '
                'Santa Cruz, City of Santa Rosa, Laguna'))
        # Tokens still surface the expanded label for mining/alignment.
        self.assertIn('barangay', title_tokens('Brgy Pulo Santa Cruz'))
        self.assertNotIn('barangay', title_match_key('Brgy Pulo Santa Cruz'))

    def test_stage_qualifier_strip_not_live_match_key(self):
        # Construction (Completion) / Construction/Completion share a stripped
        # key with plain Construction, but title_match_key keeps the token so
        # dual line items (completion + fresh start) stay distinct.
        with_q = 'Construction (Completion) of Bridge, Barangay Biga I, Silang, Cavite'
        slash = 'Construction/Completion of Bridge, Barangay Biga I, Silang, Cavite'
        plain = 'Construction of Bridge, Barangay Biga I, Silang, Cavite'
        self.assertEqual(strip_stage_qualifier(with_q), strip_stage_qualifier(plain))
        self.assertEqual(strip_stage_qualifier(slash), strip_stage_qualifier(plain))
        self.assertNotEqual(title_match_key(with_q), title_match_key(plain))
        # Bare "Completion of …" (no leading work type) keeps its token.
        self.assertNotEqual(
            strip_stage_qualifier('Completion of Multi-Purpose Building, Barangay X'),
            strip_stage_qualifier('Construction of Multi-Purpose Building, Barangay X'))
        # Work-type swaps stay rejected for mining triage.
        self.assertEqual(
            classify_title_substitution(('completion',), ('construction',)), 'reject')

    def test_diff_tags_classify_residual_fuzzy_differences(self):
        t = diff_tags
        self.assertEqual(t('Construction of Multi-Purpose Building, Barangay Poblacion, Manaoag, Pangasinan',
                           'Construction of Multi-Purpose Building (Gym), Barangay Poblacion, Manaoag, Pangasinan'),
                         ['facility_qualifier'])
        self.assertEqual(t('Construction of Multi-Purpose Building at Barangay Peñabatan, Pulilan, Bulacan',
                           'Construction of Multi-Purpose Building, Barangay Pe ñ abatan, Pulilan, Bulacan'),
                         ['connector_word'])
        self.assertEqual(t('Construction of Multi-Purpose Building, Barangay San Roque, San Jacinto',
                           'Construction of Multi-Purpose Building, Barangay San Rogue, San Jacinto'),
                         ['spelling_ocr'])
        self.assertEqual(t('Construction (Completion) of Bridge, Barangay Biga I, Silang',
                           'Construction of Bridge, Barangay Biga I, Silang'),
                         ['identical'])
        self.assertEqual(t('Rehabilitation of Road, Barangay Mabini',
                           'Construction of Road, Barangay Mabini'),
                         ['work_type_change'])
        self.assertEqual(t('Construction (Completion) of Multi-Purpose Building, Sentro Komunidad de Santa Cruz, Manila',
                           'Construction (Completion) of Multi-Purpose Building, Sentro Komunidad de Santa Cruz, Manila City'),
                         ['city_suffix'])
        self.assertEqual(t('Construction of Road, Barangay Wakas, Tayabas City',
                           'Construction of Road, Barangay Opias, Tayabas City'),
                         ['location_subname'])
        # Chainage context (K-prefix marker before the digit) → chainage, not ID.
        self.assertIn('chainage_digit', t('Manila-Batangas Rd - K0097 + 788 - K0098 + 000',
                                          'Manila-Batangas Rd - K0097 + 787 - K0098 + 000'))
        self.assertIn('unit_count', t('Construction of 2-units Multi-Purpose Building, Barangay 1, Jones',
                                      'Construction of Multi-Purpose Building, Barangay 1, Jones'))
        # Identical titles produce the explicit 'identical' marker.
        self.assertEqual(t('Construction of Bridge, Barangay Biga I, Silang',
                           'Construction of Bridge, Barangay Biga I, Silang'), ['identical'])

    def test_diff_tags_location_and_gps_subflags(self):
        t = diff_tags
        # Different barangay, same municipality/province tail → sub-name
        # (the stray "at" also tags as connector phrasing).
        self.assertEqual(t('Construction of Multi-Purpose Building at Barangay Wakas, Tayabas City, Quezon',
                           'Construction of Multi-Purpose Building, Barangay Opias, Tayabas City, Quezon'),
                         ['connector_word', 'location_subname'])
        # Zone III vs Zone IV inside the same city/province tail (both a city
        # suffix and a sub-name change; opcode order decides tag order).
        self.assertEqual(t('Construction (Completion) of Multi-Purpose Building, Barangay Zone III, Koronadal, South Cotabato',
                           'Construction of Multi-Purpose Building, Barangay Zone IV, Koronadal City, South Cotabato'),
                         ['location_subname', 'city_suffix'])
        # Same GPS coordinates (to 4 decimals), different words.
        self.assertEqual(t('Construction (Completion) of Bridge along Malasag River, Barangay Cugman, Cagayan de Oro City (8.452176, 124.689299)',
                           'Construction (Completion) of Bridge along Malasag River, Barangay Cugman, Cagayan de Oro City (8.452176°, 124.689299°)'),
                         ['same_gps_coordinates'])
        # Different coordinates.
        self.assertEqual(t('Construction of Building, Barangay X (8.452176, 124.689299)',
                           'Construction of Building, Barangay X (8.999999, 125.111111)'),
                         ['different_gps_coordinates'])
        # Parenthetical-only difference.
        self.assertEqual(t('Construction of Flood Mitigation Facilities in Lingayen-Binmaley, Pangasinan',
                           'Construction of Flood Mitigation Facilities in Lingayen-Binmaley, Pangasinan (Aplaya Floodgate)'),
                         ['parenthetical_modifier'])
        # Work phrase present on one side around the same road.
        self.assertIn('work_phrase_modifier',
                      t('Calapan North Road - K0046+570 - K0048+063',
                        'Preventive Maintenance along Calapan North Road - K0046+570 - K0048+187'))

    def test_substitution_triage(self):
        self.assertEqual(classify_title_substitution(('building',), ('bldg',)), 'promote')
        self.assertEqual(classify_title_substitution(('buidling',), ('building',)), 'promote')
        self.assertEqual(classify_title_substitution(('oroquieta',), ('oroguieta',)), 'promote')
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
