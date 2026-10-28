"""Regression checks for geography ambiguity, source arithmetic and provenance."""
import csv
import gzip
import hashlib
import json
from pathlib import Path
import sys
import unittest
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'master_list/scripts'))
from locations import SCORE_METHOD, Matcher
from build_master_list import title_coordinates


class TitleLocations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.matcher = Matcher([json.loads(s) for s in
            (ROOT / 'PSGC2LEG/data/psgc_locations.jsonl').read_text().splitlines()])

    def test_coordinate_psgc_layer_is_derived_and_pinned(self):
        """The coordinate-PSGC dataset derives from the processing
        observations' GPS points through the local shapefiles and never
        mutates its input."""
        data = ROOT / 'master_list/data'
        audit_path = data / 'coordinate_psgc_audit.json'
        self.assertTrue(audit_path.exists(), 'coordinate layer must be built')
        audit = json.loads(audit_path.read_text())
        self.assertEqual(audit['method'], 'coordinate_psgc_v1')
        self.assertEqual(audit['input']['path'],
                         'master_list/data/processing/observations.jsonl.gz')
        self.assertEqual(hashlib.sha256(
            (ROOT / 'master_list/data/processing/observations.jsonl.gz').read_bytes()).hexdigest(),
            audit['input']['sha256'])
        rows = [json.loads(s) for s in gzip.open(
            data / 'coordinate_psgc.jsonl.gz', 'rt', encoding='utf-8')]
        self.assertEqual(len(rows), audit['records_with_points'])
        self.assertEqual(sum(audit['agreement_counts'].values()), len(rows))
        self.assertEqual(audit['points']['resolved'] + audit['points']['unresolved'],
                         sum(r['point_count'] for r in rows))
        # Every resolved point carries a catalog-true chain; the reorg
        # bridges must hold (pre-reorg provinces resolve to current codes).
        for row in rows:
            for point in row['points']:
                if point['chain']:
                    self.assertIn('region', point['chain'])
                    prov = point['chain'].get('province')
                    if prov:
                        self.assertNotIn(prov['code'],
                                         ('0604500000', '0704600000', '0706100000',
                                          '1906600000', '0630200000'),
                                         f"unbridged pre-reorg province in {row['record_id']}")
        # The flagship source-error case: Talakag, Palawan title whose GPS
        # points sit in San Isidro, Talakag, Bukidnon.
        talakag = next(r for r in rows if r['record_id'] == 'fmr_hgab:ib:p701:r10')
        self.assertEqual(talakag['agreement'], 'single_barangay')
        codes = {p['chain']['barangay']['code'] for p in talakag['points'] if p['chain']}
        self.assertEqual(codes, {'1001320027'})

    def test_applied_suggestions_layer_is_derived_and_pinned(self):
        """The applied-suggestions dataset derives from the master list with
        the documented gate and never mutates its input."""
        import subprocess, sys
        data = ROOT / 'master_list/data'
        audit_path = data / 'applied_suggestions_audit.json'
        self.assertTrue(audit_path.exists(), 'applied layer must be built')
        audit = json.loads(audit_path.read_text())
        self.assertEqual(audit['method'], 'applied_suggestion_v1')
        # input pin matches the retained master build
        self.assertEqual(hashlib.sha256((ROOT / 'master_list/data/projects.jsonl.gz').read_bytes()).hexdigest(),
                         audit['input']['sha256'])
        rows = [json.loads(s) for s in gzip.open(
            data / 'applied_suggestions.jsonl.gz', 'rt', encoding='utf-8')]
        self.assertEqual(len(rows), audit['applied'])
        self.assertEqual(sum(audit['blocked_by_reason'].values()) + audit['applied'],
                         audit['records_with_suggestions'])
        for row in rows:
            a = row['applied']
            # gate invariants on every applied row
            self.assertGreaterEqual(a['support_score'], audit['gate']['min_support_score'])
            self.assertFalse(set(audit['gate']['blocking_conflicts'])
                             & {c for c in a.get('conflicts', ())}, row['record_id'])
            self.assertEqual(a['verification_status'], 'provisional_applied_suggestion')
            # the parent town is genuinely named in the title
            sys.path.insert(0, str(ROOT / 'master_list/scripts'))
            from build_applied_suggestions import _normalize, town_named_in_title
            self.assertTrue(town_named_in_title(
                {'location': a}, _normalize(row['title'])), row['record_id'])
        # the bad-application class stays blocked: a barangay suggestion
        # under a town homonym riding a province pool (Lipa City title with
        # a Batangas City chain) must never be applied.
        lipa = [r for r in rows if 'Lipa' in r['title']]
        self.assertFalse(any(r['applied']['ancestry'].get('city', {}).get('name')
                             == 'Batangas City' for r in lipa))
        # a barangay under a town whose ancestry CONTAINS the master's
        # province-only assignment is a refinement and must apply
        # (Magsaysay, Misamis Oriental bypass: support 11, no conflicts).
        magsaysay = [r for r in rows if r['record_id'] == 'dpwh_house_second:c2962']
        self.assertEqual(len(magsaysay), 1, 'Magsaysay bypass record must be applied')
        self.assertEqual(magsaysay[0]['applied']['psgc_code'], '1004317016')
        # blocked rows still count exactly; rivals remain only where the
        # chain's town genuinely differs from the master assignment.
        blocked = audit['blocked_by_reason']
        self.assertLessEqual(blocked.get('rivals_master_assignment', 0), 18)


    def test_town_disambiguated_by_province(self):
        result = self.matcher.match('Construction of Road, San Jose, Occidental Mindoro')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['score'], 6)
        self.assertEqual(result['locations'][0]['ancestry']['province']['name'], 'Occidental Mindoro')

    def test_homonyms_are_not_arbitrarily_chosen(self):
        result = self.matcher.match('Construction of Road, San Jose')
        self.assertEqual(result['status'], 'ambiguous')
        self.assertEqual(result['score'], 1)
        self.assertEqual(result['locations'], [])
        self.assertGreater(len(result['candidate_codes']), 1)

    def test_river_name_is_not_a_province_assertion(self):
        result = self.matcher.match('Abra River Irrigation System: Construction of Service Road')
        self.assertEqual(result['status'], 'unresolved')
        self.assertEqual(result['score'], 0)
        self.assertEqual(result['locations'], [])
        self.assertIn('1400100000', result['candidate_codes'])

    def test_misspelled_office_still_yields_its_province_hint(self):
        """Office labels carry OCR slips (Misamis Occidenatal, 106 records)
        while the printed label must stay untouched. The hint is computed
        through the shared place-spelling home so the repair reaches this
        weak context path too, and homonym-guarded names (Siquijor is also
        a municipality) still yield no hint."""
        from build_master_list import apply_place_spellings
        self.assertEqual(
            self.matcher.province_code(apply_place_spellings(
                'Misamis Occidenatal 2nd District Engineering Office')),
            '1004200000')
        self.assertEqual(
            self.matcher.province_code(apply_place_spellings(
                'Marindugue District Engineering Office')),
            '1704000000')
        # Raw label stays what the source printed; the repair is join-time.
        self.assertEqual(apply_place_spellings('Misamis Occidenatal 2nd District Engineering Office'),
                         'Misamis Occidental 2nd District Engineering Office')
        # The hint is ordering context only: it never appears as a location.
        result = self.matcher.match('Preventive Maintenance along Gapan-Fort Magsaysay Rd',
                                    (), None,
                                    self.matcher.province_code(apply_place_spellings(
                                        'Nueva Ecija 2nd District Engineering Office')))
        self.assertEqual(result['status'], 'unresolved')
        self.assertEqual(result['locations'], [])

    def test_province_name_does_not_assert_same_named_city(self):
        result = self.matcher.match('Construction of Road, Cebu')
        self.assertEqual(result['status'], 'province_only')
        self.assertEqual(result['score'], 2)
        self.assertEqual(result['locations'][0]['level'], 'province')

    def test_city_suffix_is_specific(self):
        result = self.matcher.match('Construction of Road, Batangas City')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['score'], 4)
        self.assertEqual(result['locations'][0]['level'], 'city')

    def test_city_word_order_alias_is_explicit_inside_title(self):
        for title in ['Construction of drainage in Bacolod City along National Road',
                      'Construction of drainage in City of Bacolod along National Road']:
            result = self.matcher.match(title)
            self.assertEqual(result['status'], 'name_matched')
            self.assertEqual(result['locations'][0]['name'], 'City of Bacolod')

    def test_barangay_marker_does_not_cross_a_comma(self):
        town = self.matcher.index['bacarra'].copy().pop()
        barangays = [self.matcher.rows[c]['name'] for c in self.matcher.children[town]
                     if self.matcher.rows[c]['level'] == 'barangay' and self.matcher.rows[c]['name'] != 'Tubburan']
        result = self.matcher.match(f'Construction of Sitio {barangays[0]}, Brgy. Tubburan, Bacarra, Ilocos Norte')
        self.assertEqual([l['name'] for l in result['locations']], ['Tubburan'])

    def test_province_homonym_can_be_a_town_in_another_province(self):
        result = self.matcher.match('Construction of Road, Aurora, Zamboanga del Sur')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['locations'][0]['ancestry']['province']['name'], 'Zamboanga del Sur')

    def test_independent_city_is_not_assigned_to_province(self):
        result = self.matcher.match('Construction of Road, Bacolod City, Negros Occidental')
        city = next(l for l in result['locations'] if l['level'] == 'city')
        self.assertEqual(city['name'], 'City of Bacolod')
        self.assertNotIn('province', city['ancestry'])
        self.assertTrue(result['needs_review'])

    def test_huc_barangay_survives_adjacent_province_mention(self):
        # Cagayan de Oro City is an HUC: Macabalan has no province ancestor.
        # A same-region province (Misamis Oriental, also Region X) is soft
        # context mirroring the town-level Bacolod rule, not a hard conflict;
        # the uniquely resolved barangay must be kept alongside the province.
        result = self.matcher.match(
            'Construction of Multi-Purpose Building, Barangay Macabalan, '
            'Cagayan de Oro City, Misamis Oriental', (), '1000000000')
        self.assertEqual(result['status'], 'multiple_locations')
        self.assertEqual({(l['name'], l['level']) for l in result['locations']},
                         {('Macabalan', 'barangay'), ('Misamis Oriental', 'province')})
        self.assertIn('independent_city_with_separate_province_context', result['review_flags'])
        self.assertNotIn('title_or_heading_province_conflict', result['review_flags'])

    def test_huc_barangay_conflict_is_hard_across_regions(self):
        # Quezon City (NCR) with a non-NCR province stays a hard conflict.
        result = self.matcher.match(
            'Construction of Road, Barangay Bagumbayan, Quezon City, Palawan')
        self.assertEqual(result['status'], 'ambiguous')
        self.assertIn('title_or_heading_province_conflict', result['review_flags'])
        self.assertFalse(any(l['level'] == 'barangay' for l in result['locations']))

    def test_wrong_province_does_not_force_a_town_match(self):
        result = self.matcher.match('Construction of Road, San Pascual, Ilocos Norte')
        self.assertEqual(result['status'], 'ambiguous')
        self.assertEqual(result['score'], -4)
        self.assertFalse(any(l['level'] == 'municipality' for l in result['locations']))

    def test_one_compatible_town_does_not_hide_another_conflicting_town(self):
        result = self.matcher.match('Construction of Road, Bacarra, Alaminos City, Ilocos Norte')
        self.assertEqual(result['status'], 'ambiguous')
        self.assertIn('title_or_heading_province_conflict', result['review_flags'])

    def test_one_matching_barangay_does_not_hide_an_unmatched_marker(self):
        result = self.matcher.match('Construction of Road, Brgy. Tubburan, Brgy. Unknownxyz, Bacarra, Ilocos Norte')
        self.assertIn('barangay_mentioned_but_unmatched', result['review_flags'])
        self.assertTrue(result['needs_review'])

    def test_multiple_towns_remain_multiple(self):
        result = self.matcher.match('Construction of Road, Bacarra, Adams, Ilocos Norte')
        self.assertEqual(result['status'], 'multiple_locations')
        self.assertEqual({l['name'] for l in result['locations']}, {'Bacarra', 'Adams'})
        self.assertEqual(result['score'], 5)

    def test_structured_heading_may_itself_be_a_municipality(self):
        result = self.matcher.match('Municipality of Sagada, Nacagang Barangay Health Station', ('Sagada',))
        self.assertEqual(result['locations'][0]['name'], 'Nacagang')
        self.assertEqual(result['locations'][0]['level'], 'barangay')
        self.assertEqual(result['locations'][0]['ancestry']['municipality']['name'], 'Sagada')
        self.assertEqual(result['score'], 10)

    def test_barangay_requires_explicit_marker_and_parent(self):
        result = self.matcher.match('Construction of Road, Brgy. Tubburan, Bacarra, Ilocos Norte')
        self.assertEqual(result['locations'][0]['level'], 'barangay')
        weak = self.matcher.match('Construction of Tubburan Road, Bacarra, Ilocos Norte')
        self.assertEqual(weak['locations'][0]['level'], 'municipality')

    def test_unique_explicit_barangay_can_supply_its_parent_chain(self):
        result = self.matcher.match(
            'Construction of FMR Leading to Ilocos Sur Provincial Trading Center, '
            'Brgy. Danuman West,')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['score'], 8)
        self.assertEqual(result['locations'][0]['name'], 'Danuman West')
        self.assertEqual(result['locations'][0]['ancestry']['municipality']['name'], 'Santa Maria')

    def test_compact_town_province_chain_scopes_explicit_barangay(self):
        result = self.matcher.match(
            'Construction of Purok 5 to Purok 6 Brgy. Wangke FMR, '
            'Brgy. Wangke, Claver Surigao del Norte')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['score'], 11)
        self.assertEqual(result['locations'][0]['name'], 'Wangke')
        self.assertEqual(result['locations'][0]['ancestry']['municipality']['name'], 'Claver')

    def test_unmarked_barangay_requires_full_parent_chain(self):
        result = self.matcher.match(
            'Construction of Sitio Guiringan FMR, Sta. Maria, Piddig, Ilocos Norte')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['score'], 12)
        self.assertEqual(result['locations'][0]['name'], 'Santa Maria')
        self.assertEqual(result['locations'][0]['ancestry']['municipality']['name'], 'Piddig')
        weak = self.matcher.match('Construction of Road, Santa Maria')
        self.assertNotEqual(weak['locations'][0].get('level') if weak['locations'] else None,
                            'barangay')

    def test_ocr_spaced_enye_is_a_candidate_but_conflict_is_not_forced(self):
        result = self.matcher.match(
            'Construction, Barangay Santo Ni ñ o, Magallanes, Lanao del Norte',
            (), '1600000000')
        self.assertIn('1600208010', result['candidate_codes'])
        self.assertNotIn('1600208010', {l['psgc_code'] for l in result['locations']})
        self.assertIn('title_or_heading_province_conflict', result['review_flags'])
        self.assertEqual(result['suggestions'][0]['location']['psgc_code'], '1600208010')
        # No Magallanes exists in Lanao del Norte, so this is a repair case:
        # the chain-combination rules add stated_chain_absent_from_catalog and,
        # because Santo Niño/Magallanes is the two-district Agusan del Norte's
        # only Region XIII fit, the unique_region_compatible_repair promotion.
        self.assertEqual(result['suggestions'][0]['support_score'], 10)
        rules = {f['rule'] for f in result['suggestions'][0]['factors']}
        self.assertIn('unique_region_compatible_repair', rules)
        self.assertIn('stated_chain_absent_from_catalog', rules)

    def test_honorific_city_prefix_resolves_through_bare_name(self):
        # DPWH titles drop the official "Science City of" honorific. With the
        # parent named, the homonym barangays must chain through the bare
        # name to the official catalog unit.
        result = self.matcher.match(
            'Construction of Multi-Purpose Building, Barangay Bantug, '
            'Muñoz, Nueva Ecija')
        self.assertEqual(result['status'], 'name_matched')
        codes = {l['psgc_code'] for l in result['locations']}
        self.assertEqual(codes, {'0304917003'})  # Bantug, Science City of Muñoz
        ancestry = result['locations'][0]['ancestry']
        self.assertEqual(ancestry['city']['name'], 'Science City of Muñoz')
        self.assertEqual(ancestry['province']['name'], 'Nueva Ecija')

    def test_honorific_city_prefix_also_accepts_official_form(self):
        # The official form keeps working and resolves to the same unit.
        result = self.matcher.match(
            'Construction of Water System, Barangay Bagong Sikat, '
            'Science City of Muñoz, Nueva Ecija')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual({l['psgc_code'] for l in result['locations']},
                         {'0304917001'})  # Bagong Sikat, Science City of Muñoz

    def test_bare_honorific_name_still_needs_parent_to_assign(self):
        # A bare "Muñoz" mention alone must not silently assign the city;
        # the homonym barangay rule keeps context-free names unassigned.
        weak = self.matcher.match('Improvement of Muñoz Access Road')
        self.assertTrue(not weak['locations'] or
                        all(l['level'] != 'city' for l in weak['locations']) or
                        len({l['psgc_code'] for l in weak['locations']}) > 1)

    def test_honorific_prefix_bare_alias_collides_only_where_real(self):
        # "Samal" alone is genuinely two units (Samal, Bataan municipality;
        # Island Garden City of Samal); the bare alias must surface both as
        # candidates and assign neither without parent-chain context.
        result = self.matcher.match('Construction of Multi-Purpose Building, Samal')
        self.assertEqual(result['status'], 'ambiguous')
        self.assertEqual({l['psgc_code'] for l in result['locations']}, set())
        samal_codes = {c for hit in self.matcher.find('Samal')
                       for c in hit['codes']}
        self.assertIn('0300812000', samal_codes)    # Samal, Bataan
        self.assertIn('1102317000', samal_codes)    # Island Garden City of Samal

    def test_conflicting_poblacion_chain_has_ranked_review_suggestions(self):
        result = self.matcher.match(
            'Construction, Barangay Poblacion, Carmen, Lanao del Norte',
            (), '1600000000')
        suggestions = result['suggestions']
        self.assertEqual(suggestions[0]['location']['psgc_code'], '1600204009')
        self.assertEqual(suggestions[0]['location']['ancestry']['province']['name'],
                         'Agusan del Norte')
        # Repair promoted by chain-combination rules: no Carmen exists in
        # Lanao del Norte, and exactly one Region XIII chain is compatible.
        self.assertEqual(suggestions[0]['support_score'], 10)
        self.assertIn('named_province_conflict', suggestions[0]['conflicts'])
        self.assertEqual(
            {(s['location']['ancestry']['province']['name'], s['support_score'])
             for s in suggestions[1:]},
            {('Cebu', 3), ('Cotabato', 3)})

    def test_office_province_hint_orders_suggestions_without_assigning(self):
        # The printed Lanao del Norte conflicts with every candidate, but the
        # implementing office names Agusan del Norte. That is ordering
        # evidence only: status, assigned codes, and score stay untouched.
        plain = self.matcher.match(
            'Construction, Barangay Poblacion, Carmen, Lanao del Norte',
            (), '1600000000')
        hinted = self.matcher.match(
            'Construction, Barangay Poblacion, Carmen, Lanao del Norte',
            (), '1600000000', '1600200000')
        self.assertEqual(plain['status'], hinted['status'])
        self.assertEqual(plain['score'], hinted['score'])
        self.assertEqual(plain['locations'], hinted['locations'])
        self.assertEqual(hinted['suggestions'][0]['location']['psgc_code'], '1600204009')
        self.assertEqual(hinted['suggestions'][0]['support_score'], 12)
        self.assertIn('office_province_agreement',
                      {f['rule'] for f in hinted['suggestions'][0]['factors']})
        self.assertTrue(all('office_province_conflict' in s['conflicts']
                            for s in hinted['suggestions'][1:]))

    def test_province_code_extracts_only_unambiguous_provinces(self):
        self.assertEqual(self.matcher.province_code(
            'Agusan del Norte District Engineering Office'), '1600200000')
        self.assertIsNone(self.matcher.province_code('Central Office'))
        # 'Manila' is a city, not a province; 'Isabela' names municipalities.
        self.assertIsNone(self.matcher.province_code(
            'Metro Manila 3rd District Engineering Office'))
        self.assertIsNone(self.matcher.province_code(
            'Isabela 4th District Engineering Office'))

    def test_numbered_town_alias_is_scoped_by_province(self):
        result = self.matcher.match(
            'Construction, Barangay Kingan - Barangay Kianibong, '
            'Tagoloan, Lanao del Sur')
        self.assertEqual({l['name'] for l in result['locations']}, {'Kingan', 'Kianibong'})
        self.assertTrue(all(l['ancestry']['municipality']['name'] == 'Tagoloan II'
                            for l in result['locations']))

    def test_trailing_coordinates_do_not_break_locality_chain(self):
        result = self.matcher.match(
            'Construction, Rizal, Lopez Jaena, Misamis Occidental '
            '(8.529804, 123.726436)')
        self.assertEqual(result['locations'][0]['psgc_code'], '1004208024')
        self.assertEqual(result['locations'][0]['ancestry']['municipality']['name'],
                         'Lopez Jaena')

    def test_no_locality_does_not_invent_coordinates(self):
        result = self.matcher.match('Rehabilitation of National Road - K0026 + 000 - K0027 + 000')
        self.assertEqual(result['status'], 'unresolved')
        self.assertEqual(result['locations'], [])

    def test_north_cotabato_alias_resolves_the_cotabato_province(self):
        result = self.matcher.match(
            'Construction (Completion) of Water System, Barangay Leboce, Makilala, North Cotabato',
            (), '1200000000')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['score'], 10)
        self.assertEqual(result['locations'][0]['name'], 'Leboce')
        self.assertEqual(result['locations'][0]['ancestry']['province']['name'], 'Cotabato')

    def test_compostela_valley_alias_resolves_davao_de_oro(self):
        result = self.matcher.match(
            'Bukidnon-Compostela Valley Road, Namnam, San Fernando, Bukidnon-Laak, '
            'Compostela Valley, Sta. 1 + 200', (), '1000000000')
        self.assertEqual({l['name'] for l in result['locations']},
                         {'San Fernando', 'Laak'})
        self.assertEqual({l['ancestry']['province']['name'] for l in result['locations']},
                         {'Bukidnon', 'Davao de Oro'})

    def test_pob_abbreviation_backs_off_to_the_town_s_actual_barangay(self):
        result = self.matcher.match(
            'Construction of Flood Mitigation Structure along Bicol River, '
            'Barangay San Roque Pob ., Bula, Camarines Sur', (), '0500000000')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual(result['locations'][0]['name'], 'San Roque')
        self.assertEqual(result['locations'][0]['ancestry']['municipality']['name'], 'Bula')
        self.assertEqual(result['review_flags'], [])

    def test_station_syntax_is_not_the_santa_municipality(self):
        # "Sta. 126 + 151" is road chainage, never Santa, Ilocos Sur.
        result = self.matcher.match(
            'Malaybalay-Gingoog Road (Gingoog City-Kalhaan, Claveria-Bulonay-Malaybalay City ), '
            'Hindangon Bridge, Sta. 126 + 151 - Sta. 126 + 211, Gingoog City, Misamis Oriental',
            (), '1000000000')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual({(l['name'], l['level']) for l in result['locations']},
                         {('City of Gingoog', 'city')})
        self.assertEqual(result['review_flags'], [])
        self.assertFalse(any('santa' in ev['text'] for ev in result['evidence']))

    def test_parenthesized_road_spec_does_not_assert_locality(self):
        # The road-segment paren names Claveria (a Misamis Occidental
        # municipality) and Malaybalay City (Bukidnon); neither may enter the
        # town pool against the explicit Gingoog City, Misamis Oriental chain.
        result = self.matcher.match(
            'Malaybalay-Gingoog Road (Gingoog City-Kalhaan, Claveria-Bulonay-Malaybalay City ), '
            'Hindangon Bridge, Sta. 126 + 151 - Sta. 126 + 211, Gingoog City, Misamis Oriental',
            (), '1000000000')
        self.assertNotIn('title_or_heading_province_conflict', result['review_flags'])
        # An unbalanced paren (PDF artifact) still parses as text.
        unbalanced = self.matcher.match(
            'Jct Bukidnon-Davao City Rd (Sayre Highway Section, Omonay Br . (B01378MN)', (), '1000000000')
        self.assertIsInstance(unbalanced['status'], str)

    def test_road_head_name_does_not_become_a_suffix_town(self):
        # The leading "Malaybalay-Gingoog Road" is a road name; Malaybalay
        # must not borrow assertion strength from the Gingoog City suffix.
        result = self.matcher.match(
            'Malaybalay-Gingoog Road, Sta. 1 + 000 - Sta. 3 + 000, Gingoog City, Misamis Oriental',
            (), '1000000000')
        self.assertNotIn('title_or_heading_province_conflict', result['review_flags'])

    def test_province_anchored_enumeration_attaches_all_members(self):
        # Ten listed names under "Umingan, Pangasinan" are all Umingan
        # barangays; homonyms (San Vicente, Cadiz) must resolve under the
        # anchor town, not poison the town pool.
        result = self.matcher.match(
            'Rehabilitation of Roads, s. Flores, Sinabaan, Cabalitian, Tanggal Sawang, '
            'San Vicente, Cadiz, Poblacion West, Nancalabasaan, Barat and Esperanza, '
            'Umingan, Pangasinan, Sta. 0+000 - Sta. 5+229', (), '0100000000')
        self.assertEqual(result['status'], 'multiple_locations')
        names = {l['name'] for l in result['locations'] if l['level'] == 'barangay'}
        self.assertEqual(names, {'Flores', 'Sinabaan', 'Cabalitian', 'Tanggal Sawang',
                                 'San Vicente', 'Cadiz', 'Poblacion West',
                                 'Nancalabasaan', 'Barat', 'Esperanza'})
        for loc in result['locations']:
            if loc['level'] == 'barangay':
                self.assertEqual(loc['ancestry']['municipality']['name'], 'Umingan')
        self.assertEqual(result['review_flags'], [])
        self.assertIn('evidence:province_anchored_enumeration',
                      {f['rule'] for f in result['score_factors']})

    def test_enumeration_area_families_stay_candidates(self):
        # "s. Pindangan - Poblacion - San Juan" under Alcala: Pindangan and
        # Poblacion name area families (Pindangan Centro/East/West...), not
        # single barangays; the four exact members attach, the families stay
        # suggestions without being assigned.
        result = self.matcher.match(
            'Reconstruction/Improvement of Roads, s. Pindangan - Poblacion - San Juan, '
            'San Vicente, Laoac and Anulid, Alcala, Pangasinan, K0176+200 - K0186+000',
            (), '0100000000')
        assigned = {l['name'] for l in result['locations'] if l['level'] == 'barangay'}
        self.assertEqual(assigned, {'San Juan', 'San Vicente', 'Laoac', 'Anulid'})
        suggested = {s['location']['name'] for s in result['suggestions']}
        self.assertEqual(suggested, {'Pindangan Centro', 'Pindangan East', 'Pindangan West',
                                     'Poblacion East', 'Poblacion West'})
        self.assertNotIn('title_or_heading_province_conflict', result['review_flags'])

    def test_enumeration_requires_complete_segmentation(self):
        # "Bacarra, Adams, Ilocos Norte" is two towns, not an enumeration:
        # Bacarra is not an Adams barangay, so no run completes.
        result = self.matcher.match('Construction of Road, Bacarra, Adams, Ilocos Norte')
        self.assertEqual(result['status'], 'multiple_locations')
        self.assertEqual({l['name'] for l in result['locations']}, {'Bacarra', 'Adams'})

    def test_city_anchored_enumeration_with_qualifiers(self):
        # Twelve barangays of Cauayan City under a plural "Barangays" part:
        # parenthetical purok qualifiers drop out ("Minante 2 (Purok 2)"), the
        # Arabic numeral alias matches official "Minante II", and the San Luis
        # barangay mention must not assert the four San Luis municipalities.
        result = self.matcher.match(
            'Construction of Public Water Supply System (Level II) at Barangays Buena Suerte, '
            'Carabatan Bacareno, Dabburab, Disimuray, Gappal, Guayabal, Linglingay, '
            'Minante 2 (Purok 2), Santa Luciana, San Luis, Tagaran (Purok 3), '
            'Villa Luna (Purok 12), City of Cauayan, Isabela', (), '0200000000')
        names = {l['name'] for l in result['locations'] if l['level'] == 'barangay'}
        self.assertEqual(names, {'Buena Suerte', 'Carabatan Bacareno', 'Dabburab',
                                 'Disimuray', 'Gappal', 'Guayabal', 'Linglingay',
                                 'Minante II', 'Santa Luciana', 'San Luis',
                                 'Tagaran', 'Villa Luna'})
        self.assertNotIn('title_or_heading_province_conflict', result['review_flags'])
        for loc in result['locations']:
            if loc['level'] == 'barangay':
                self.assertEqual(loc['ancestry']['city']['name'], 'City of Cauayan')

    def test_adjacent_town_province_pair_scopes_numbered_markers(self):
        # "Barangay 1 - Barangay 5, Catanauan, Quezon": the Arabic numeral
        # alias ("Barangay 1" for official "Barangay I") collides between
        # Catanauan and the municipality named Quezon inside Quezon province;
        # the adjacent Town, Province pair must decide for Catanauan.
        result = self.matcher.match(
            'Construction of Road with Approach of Kaibayo Bridge, '
            'Barangay 1 - Barangay 5, Catanauan, Quezon', (), '0400000000')
        self.assertEqual(result['status'], 'multiple_locations')
        self.assertEqual({l['name'] for l in result['locations']}, {'Barangay 1', 'Barangay 5'})
        self.assertTrue(all(l['ancestry']['municipality']['name'] == 'Catanauan'
                            for l in result['locations']))
        self.assertNotIn('ambiguous_barangay_name', result['review_flags'])

    def test_bagacay_province_and_office_offer_all_supported_review_chains(self):
        title = ('Construction of Road, Barangay Bagacay, San Jose-Partido, '
                 'Camarines Sur Sta. 0+706 - Sta. 1+256')
        result = self.matcher.match(title, (), '0500000000', '0501700000')
        self.assertEqual([l['psgc_code'] for l in result['locations']], ['0501700000'])
        self.assertEqual({s['location']['psgc_code'] for s in result['suggestions']},
                         {'0501718003', '0501733002', '0501737003'})
        self.assertEqual({s['support_score'] for s in result['suggestions']}, {10})
        for suggestion in result['suggestions']:
            self.assertTrue(suggestion['review_only'])
            self.assertNotIn('named_parent_town', [f['rule'] for f in suggestion['factors']])
        san_jose = [e for e in result['evidence'] if e.get('text') == 'san jose']
        self.assertTrue(san_jose)
        self.assertFalse(any(e.get('locality_syntax') for e in san_jose))

    def test_office_can_scope_explicit_barangay_review_without_assigning_site(self):
        result = self.matcher.match('Road, Barangay Bagacay', (), None, '0501700000')
        self.assertEqual(result['locations'], [])
        self.assertEqual(len(result['suggestions']), 3)
        self.assertTrue(all(s['review_only'] for s in result['suggestions']))

    def test_station_trimming_preserves_later_comma_localities(self):
        result = self.matcher.match('Road Sta. 0+100 - Sta. 1+200, Baliangao, Misamis Occidental')
        self.assertEqual([l['psgc_code'] for l in result['locations']], ['1004202000'])

    def test_missing_commas_preserve_mabini_barangay_parent_chain(self):
        for suffix in ('Mabini, Baliangao Misamis Occidental',
                       'Mabini Baliangao, Misamis Occidental',
                       'Mabini Baliangao Misamis Occidental'):
            with self.subTest(suffix=suffix):
                result = self.matcher.match('Construction of Road, Sitio Bigaan, ' + suffix,
                                            (), '1000000000')
                self.assertEqual([l['psgc_code'] for l in result['locations']], ['1004202005'])
                self.assertEqual(result['review_flags'], [])
                self.assertFalse(any(e.get('text') == 'bigaan' for e in result['evidence']
                                     if e['field'] == 'title_barangay'))

    def test_unmarked_conflicting_chain_is_suggested_for_review(self):
        from build_applied_suggestions import gate_pass
        for suffix in ('Mabini, Baliangao, Palawan', 'Mabini, Baliangao Palawan'):
            result = self.matcher.match('Road, ' + suffix, (), '1000000000', '1004200000')
            candidate = next(s for s in result['suggestions']
                             if s['location']['psgc_code'] == '1004202005')
            self.assertIn('named_province_conflict', candidate['conflicts'])
            self.assertTrue(candidate['review_only'])
            # Even strong administrative context cannot auto-apply an
            # unmarked review reading.
            self.assertIsNone(gate_pass([{**candidate, 'support_score': 100, 'conflicts': []}]))

    def test_road_qualifiers_do_not_supply_missing_comma_parent_chain(self):
        result = self.matcher.match('Construction of Mabini Baliangao Road, Misamis Occidental')
        self.assertNotIn('1004202005', [l['psgc_code'] for l in result['locations']])
        self.assertFalse(self.matcher.parent_chain_mentions(
            'Road (Mabini Baliangao Misamis Occidental)'))

    def test_numbered_manila_bridge_endpoints_resolve_without_city_guess(self):
        title = ('Construction of Cable Bridge from Punta Barangay 898 to Beata St. '
                 'Barangay 839 Sta. 0 - Sta. 180')
        result = self.matcher.match(title, (), '1300000000')
        self.assertEqual(result['status'], 'multiple_locations')
        self.assertEqual({l['psgc_code'] for l in result['locations']},
                         {'1380614091', '1380612007'})
        self.assertEqual({l['ancestry']['sub_municipality']['name'] for l in result['locations']},
                         {'Santa Ana', 'Pandacan'})
        for loc in result['locations']:
            self.assertEqual(loc['ancestry']['city']['name'], 'City of Manila')
            self.assertNotIn('province', loc['ancestry'])
        self.assertFalse(result['review_flags'])
        mentions = [e['text'] for e in result['evidence'] if e['field'] == 'title_barangay']
        self.assertEqual(mentions, ['barangay 898', 'barangay 839'])
        self.assertNotIn('santa', mentions)

    def test_numbered_barangay_scopes_through_manila_submunicipality(self):
        for label in ('Barangay 898', 'Brgy. 898', 'Brgy. No. 898'):
            with self.subTest(label=label):
                result = self.matcher.match(f'Road, {label}, City of Manila')
                self.assertEqual([l['psgc_code'] for l in result['locations']], ['1380614091'])
                self.assertNotIn('barangay_mentioned_but_unmatched', result['review_flags'])

    def test_shared_number_is_not_automatically_manila(self):
        result = self.matcher.match('Road, Barangay 180')
        self.assertEqual(result['locations'], [])
        self.assertIn('ambiguous_barangay_name', result['review_flags'])
        self.assertEqual(len([e for e in result['evidence'] if e['field'] == 'title_barangay']), 1)
        scoped = self.matcher.match('Road, Barangay 180, City of Caloocan')
        self.assertEqual([l['psgc_code'] for l in scoped['locations']], ['1380100180'])

    def test_station_and_unmarked_numbers_do_not_become_barangays(self):
        for title in ('Works at Sta. 898 - Sta. 839', 'Construction between 898 and 839'):
            result = self.matcher.match(title)
            self.assertEqual(result['locations'], [])
            self.assertFalse(any(e['field'] == 'title_barangay' for e in result['evidence']))

    def test_numbered_suffix_is_kept_and_missing_label_does_not_reverse_to_punta(self):
        result = self.matcher.match('Road, Barangay 18-A, Gingoog City, Misamis Oriental')
        self.assertEqual([l['name'] for l in result['locations']], ['Barangay 18-A'])
        for title in ('Bridge from Punta Barangay 99999', 'Bridge from Punta Barangay 898-Z'):
            unknown = self.matcher.match(title)
            self.assertEqual(unknown['locations'], [])
            self.assertIn('barangay_mentioned_but_unmatched', unknown['review_flags'])
            self.assertFalse(any(e['field'] == 'title_barangay' and e['text'] == 'punta'
                                 for e in unknown['evidence']))

    def test_marker_part_before_city_of_phrase_is_not_a_town(self):
        # "Barangay Sta. Cruz, City of San Jose Del Monte": the barangay
        # mention must not assert the seven Santa Cruz municipalities; the
        # city stands alone and the unmatched family is suggested, assigned
        # nowhere.
        result = self.matcher.match(
            'Rehabilitation of Road, Area D, Barangay Sta. Cruz, '
            'City of San Jose Del Monte, Bulacan (121.052012, 14.855548)', (), '0300000000')
        self.assertEqual({(l['name'], l['level']) for l in result['locations']},
                         {('City of San Jose Del Monte', 'city')})
        self.assertIn('barangay_mentioned_but_unmatched', result['review_flags'])
        self.assertNotIn('title_or_heading_province_conflict', result['review_flags'])
        suggested = {s['location']['name'] for s in result['suggestions']}
        self.assertEqual(suggested, {'Santa Cruz I', 'Santa Cruz II', 'Santa Cruz III',
                                     'Santa Cruz IV', 'Santa Cruz V'})


    def test_descriptor_backoff_does_not_hijack_numbered_barangay(self):
        # Sariaya has no Poblacion-series barangay; "Poblacion 6" belongs to
        # six other towns. The mention must stay unmatched rather than being
        # rewritten to a bare "poblacion" under some other context town.
        result = self.matcher.match(
            'Construction of Line Canal, Barangay Poblacion 6, Sariaya, Quezon',
            (), '0400000000')
        self.assertEqual(result['status'], 'name_matched')
        self.assertEqual([l['name'] for l in result['locations']], ['Sariaya'])
        self.assertIn('barangay_mentioned_but_unmatched', result['review_flags'])
        mention = [ev for ev in result['evidence'] if ev['field'] == 'title_barangay']
        self.assertEqual(mention[0]['text'], 'poblacion 6')

    def test_region_labels(self):
        self.assertEqual(self.matcher.region_code('REGION I - ILOCOS'), '0100000000')
        self.assertEqual(self.matcher.region_code('Region IX'), '0900000000')
        self.assertEqual(self.matcher.region_code('NCR'), '1300000000')
        self.assertIsNone(self.matcher.region_code('Nationwide'))

    def test_embedded_coordinate_orientation_and_chainage(self):
        result = title_coordinates('Construction of Road, Cebu City (10.3, 123.9)')
        self.assertEqual(result['points'][0]['latitude'], 10.3)
        self.assertEqual(result['points'][0]['longitude'], 123.9)
        self.assertIsNone(title_coordinates('Road rehabilitation - K0026 + 000 - K0027 + 000'))


class BridgeRegistry(unittest.TestCase):
    """Registry evidence joins after title parsing and never overrides it."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(ROOT / 'master_list/scripts'))
        from build_master_list import apply_bridge_registry, load_bridge_registry
        cls.apply = staticmethod(apply_bridge_registry)
        cls.registry, _ = load_bridge_registry()
        cls.matcher = Matcher([json.loads(s) for s in
            (ROOT / 'PSGC2LEG/data/psgc_locations.jsonl').read_text().splitlines()])

    def base_match(self, title, region_hint=None):
        return self.matcher.match(title, (), region_hint)

    def test_unresolved_title_adopts_unique_registry_chain(self):
        # "Usugan Br. (B00995MN) along Bonifacio-Don Victoriano Rd" carries no
        # title locality; the exact registry ID supplies one unique chain.
        entry = self.registry['dpwh_nep_pdf:p312:r5']
        match = self.base_match('Usugan Br . (B00995MN) along Bonifacio-Don Victoriano Rd')
        self.assertEqual(match['status'], 'unresolved')
        self.apply(match, entry, self.matcher)
        self.assertEqual(match['status'], 'registry_matched')
        self.assertEqual(match['locations'][0]['psgc_code'], '1004203017')
        self.assertEqual(match['locations'][0]['name'], 'Mapurog')
        self.assertFalse(match['needs_review'])
        rules = {f['rule'] for f in match['score_factors']} if 'score_factors' in match else set()
        # evidence records the three registry rules
        recorded = {ev['resolution_rule'] for ev in match['evidence']
                    if ev['field'] == 'bridge_registry'}
        self.assertEqual(recorded, {'bridge_registry_id_match',
                                    'bridge_registry_unique_chain'})

    def test_title_location_is_never_overridden_by_registry(self):
        # A title that assigns its own location keeps it; registry agreement
        # is only an evidence factor.
        entry = self.registry['dpwh_nep_pdf:p312:r5']
        match = self.base_match('Usugan Br . (B00995MN) along Bonifacio-Don Victoriano Rd, Bonifacio, Misamis Occidental')
        self.assertEqual(match['status'], 'name_matched')
        self.apply(match, entry, self.matcher)
        self.assertEqual(match['status'], 'name_matched')
        self.assertEqual(match['locations'][0]['ancestry']['municipality']['name'],
                         'Bonifacio')
        recorded = {ev['resolution_rule'] for ev in match['evidence']
                    if ev['field'] == 'bridge_registry'}
        self.assertIn('bridge_registry_agreement', recorded)

    def test_registry_conflict_flags_review_without_overriding(self):
        # Sayre Highway bridge titled with a Davao City road endpoint but
        # physically in Bukidnon: title answer stays, conflict is flagged.
        entry = self.registry['dpwh_nep_pdf:p314:r29']
        match = self.base_match('Omonay Br . (B01378MN) along Sayre Highway (Jct Bukidnon-Davao City Rd')
        self.assertTrue(match['locations'])
        self.apply(match, entry, self.matcher)
        self.assertIn('bridge_registry_conflicts_with_title_location', match['review_flags'])
        self.assertTrue(match['needs_review'])

    def test_registry_carries_coordinate_derived_district(self):
        # NCR records resolve through the region-validated chain and carry the
        # bridge's coordinate-derived district.
        entry = self.registry['dpwh_nep_pdf:p320:r5']  # Malibay Br, Pasay
        match = self.base_match('Malibay Br . (SB ) (B01859LZ) along Epifanio Delos Santos Ave (EDSA)')
        self.assertEqual(match['status'], 'unresolved')
        self.apply(match, entry, self.matcher)
        self.assertEqual(match['status'], 'registry_matched')
        self.assertEqual(entry['districts'][0]['leg_id'], 'leg:ph:pasay:lone:2025')
        self.assertEqual(entry['districts'][0]['derivation'], 'municity_polygon_code_join')

    def test_non_exact_mentions_attach_id_match_factor_only(self):
        # bridge_mention_without_id: no chains, no assignment change, and no
        # scored registry factor (an unscored audit note is retained).
        entry = next(e for e in self.registry.values()
                     if e['status'] == 'bridge_mention_without_id' and not e['chains'])
        match = self.base_match('Construction of Bridge somewhere unnamed')
        status_before = match['status']
        self.apply(match, entry, self.matcher)
        self.assertEqual(match['status'], status_before)
        scored = [ev for ev in match['evidence']
                  if ev['field'] == 'bridge_registry' and 'resolution_rule' in ev]
        self.assertEqual(scored, [])


class RetainedArtifacts(unittest.TestCase):
    def test_ledger_arithmetic_ids_and_psgc_integrity(self):
        data = ROOT / 'master_list/data'
        audit = json.loads((data / 'audit.json').read_text())
        catalog = {r['code']: r for r in (json.loads(s) for s in
            (ROOT / 'PSGC2LEG/data/psgc_locations.jsonl').read_text().splitlines())}
        ids, counts, sums = set(), Counter(), Counter()
        with gzip.open(data / 'projects.jsonl.gz', 'rt') as stream:
            for line in stream:
                row = json.loads(line)
                self.assertNotIn(row['record_id'], ids)
                ids.add(row['record_id'])
                counts[row['dataset']] += 1
                sums[row['dataset']] += row['amount_php']
                self.assertIsInstance(row['amount_php'], int)
                self.assertTrue(row['source_record_id'])
                self.assertTrue(row['source_dataset'])
                score = row['location']['score']
                self.assertIsInstance(score, int)
                self.assertEqual(row['location']['score_method'], SCORE_METHOD)
                self.assertTrue(row['location']['score_factors'])
                for location in row['location']['locations']:
                    code = location['psgc_code']
                    self.assertIsInstance(code, str)
                    self.assertEqual(len(code), 10)
                    self.assertEqual(location['name'], catalog[code]['name'])
                    parent = code
                    expected = {}
                    while parent:
                        expected[catalog[parent]['level']] = parent
                        parent = catalog[parent]['parent_code']
                    self.assertEqual({k: v['code'] for k, v in location['ancestry'].items()}, expected)
                if row['location']['status'] == 'allocation_not_site':
                    self.assertEqual(row['location']['locations'], [])
                    self.assertEqual(score, 0)
        self.assertEqual(len(ids), audit['records'])
        self.assertEqual(len(counts), 10)
        for name, entry in audit['datasets'].items():
            self.assertEqual(counts[name], entry['records'])
            self.assertEqual(sums[name], entry['amount_php'])
            self.assertEqual(sums[name], audit['amount_checks'][name]['expected_ledger_php'])
        with gzip.open(data / 'projects.csv.gz', 'rt', newline='') as stream:
            self.assertEqual(sum(1 for _ in csv.DictReader(stream)), len(ids))

    def test_recorded_inputs_and_outputs_are_current(self):
        data = ROOT / 'master_list/data'
        audit = json.loads((data / 'audit.json').read_text())
        for name, meta in audit['input_files'].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), meta['sha256'], name)
        for name, digest in audit['output_sha256'].items():
            self.assertEqual(hashlib.sha256((data / name).read_bytes()).hexdigest(), digest, name)

    def test_scoring_rules_doc_matches_code_and_audit(self):
        """SCORING_RULES.md tables, code constants, and audit.json stay in sync."""
        import sys
        sys.path.insert(0, str(ROOT / 'master_list/scripts'))
        from locations import (SCORE_BASES, SCORE_BONUSES, SCORE_FLAG_BONUSES,
                               SCORE_PENALTIES, SCORE_METHOD)
        audit = json.loads((ROOT / 'master_list/data/audit.json').read_text())
        rules = audit['location_score_rules']
        self.assertEqual(rules['method'], SCORE_METHOD)
        self.assertEqual(rules['bases'], SCORE_BASES)
        self.assertEqual(rules['bonuses'], SCORE_BONUSES)
        self.assertEqual(rules['flag_bonuses'], SCORE_FLAG_BONUSES)
        self.assertEqual(rules['penalties'], SCORE_PENALTIES)
        # Every numeric point value in the doc tables matches the constants.
        doc = (ROOT / 'master_list/docs/SCORING_RULES.md').read_text()
        doc_ascii = doc.replace('−', '-')  # typographic minus -> ASCII
        for table in (SCORE_BASES, SCORE_BONUSES, SCORE_FLAG_BONUSES, SCORE_PENALTIES):
            for rule, points in table.items():
                sign = f'+{points}' if points > 0 else str(points)
                self.assertIn(f'`{rule}` | {sign}', doc_ascii,
                              f'{rule} row missing/stale in SCORING_RULES.md')
        self.assertIn(SCORE_METHOD, doc)


if __name__ == '__main__':
    unittest.main()
