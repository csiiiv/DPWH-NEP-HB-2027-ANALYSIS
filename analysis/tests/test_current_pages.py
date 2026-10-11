"""Accounting/freshness checks and conservative source matching regressions."""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import DATA
import sys
import unittest
import json
from pathlib import Path

from build_current_pages import project_matches, region, normalized, scope_key
from house_native import office_from_region_parent, regional_office_label

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from validate_current_pages import validate_current_pages


def allocation(id, title='Construction of Road at Barangay Mabini, Sample City', amount=10000000, reg='Region III', zone='local'):
    return {'id': id, 'title': title, 'amount_php': amount, 'region': reg,
            'zone': zone, 'program': 'Network Development Program', 'pap_id': 'p262:r1'}


class CurrentPageTests(unittest.TestCase):
    def test_committed_pages_have_current_inputs_and_valid_accounting(self):
        data = validate_current_pages()
        self.assertEqual(data['summary']['house_balanced_paps'], 44)
        self.assertEqual(data['summary']['reviewed_pairs'], 0)
        from normalize_labels import strip_stage_qualifier
        for row in data['projects']:
            if row['status'] == 'exact_candidate':
                # Stage-qualifier bridges keep the printed (Completion) token in
                # title_match_key; identity is the stripped key instead.
                if row.get('reason') and 'stage qualifier' in row['reason']:
                    self.assertEqual(
                        strip_stage_qualifier(row['house']['title']),
                        strip_stage_qualifier(row['nep']['title']))
                else:
                    self.assertEqual(normalized(row['house']['title']), normalized(row['nep']['title']))
                # FAP loans may sit under different program sections in I-C
                # and the NEP; the audited cross-program pass pairs them by
                # unique title + region + funding zone instead of program.
                if not (row['house']['zone'] == 'fap' and row.get('reason')
                        and 'different program sections' in row['reason']):
                    self.assertEqual(scope_key(row['house']), scope_key(row['nep']))
            for suggestion in row.get('candidates', []):
                self.assertEqual(scope_key(row['house']), scope_key(suggestion['nep']))

    def test_native_house_replaces_v5_and_preserves_funding_scope(self):
        data = json.loads((DATA / 'source_comparison_2027.json').read_text())
        house = [r['house'] for r in data['projects'] if r.get('house')]
        self.assertEqual(data['manifest']['house_version'], 'native_ic_v2')
        self.assertFalse(data['manifest']['comparison_ready'])
        self.assertTrue(all(r['id'].startswith('hb:ic:') for r in house))
        self.assertNotIn('hb_dpwh_leaves_corrected_v5.json', data['manifest']['inputs'])
        self.assertEqual(set(data['summary']['api']),
                         {'api_rows', 'api_php', 'unpaired_source_rows', 'unpaired_source_php'})
        self.assertEqual(sum(r['amount_php'] for r in house), 586_941_661_000)
        self.assertEqual(data['summary']['house_operations_gap_php'], 0)
        self.assertEqual(data['unresolved_paps'], [])
        self.assertEqual(len([r for r in house if r['zone'] == 'fap']), 29)
        self.assertTrue(all(r['record_kind'] != 'funding' for r in house))
        self.assertTrue(any(r['record_kind'] == 'region' for r in house))
        self.assertTrue(any(r['record_kind'] == 'allocation' for r in house))
        self.assertTrue(any(r['funding_php'].get('Loan Proceeds') == 0 for r in house if r['zone'] == 'fap'))

    def test_pap_totals_include_fap_once_and_reconcile_to_operations(self):
        data = json.loads((DATA / 'source_comparison_2027.json').read_text())
        faps = [p for p in data['paps'] if p.get('zone') == 'fap']
        self.assertEqual(len(faps), 1)
        fap = faps[0]
        self.assertEqual(fap['house_printed_php'], 44_749_011_000)
        self.assertEqual(fap['nep_printed_php'], 117_749_011_000)
        self.assertEqual(fap['delta_php'], -73_000_000_000)
        self.assertIsNone(fap['api_coverage_php'])
        self.assertIsNone(fap['source_api_gap_php'])
        self.assertEqual(sum(p['house_printed_php'] or 0 for p in data['paps']), data['summary']['house_operations_printed_php'])
        self.assertEqual(sum(p['nep_printed_php'] for p in data['paps']), data['summary']['nep_operations_printed_php'])
        self.assertEqual(sum(p['api_coverage_php'] or 0 for p in data['paps']), data['summary']['api']['api_php'])
        for side in ('house', 'nep'):
            self.assertEqual(sum(r[f'{side}_' + ('extracted_php' if side == 'house' else 'source_php')] for r in fap['regions']), fap[f'{side}_printed_php'])

    def test_title_tampering_fails_even_when_every_amount_still_balances(self):
        from house_native import validate_native_detail, walk
        ic = json.loads((DATA / 'hb_dpwh_native_ic_projects.json').read_text())
        audit = json.loads((DATA / 'hb_dpwh_native_ic_rollup_audit.json').read_text())
        n = next(n for n in walk(ic['root']) if 'Pangpang to Del Rosario' in n['label'])
        n['label'] = 'Wrong project with the same amount'
        with self.assertRaisesRegex(ValueError, 'title/source mismatch'):
            validate_native_detail(ic, audit, DATA.parents[1])

    def test_unique_title_pair_does_not_require_equal_amount(self):
        rows = project_matches([allocation('h', amount=12000000)], [allocation('n')])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['status'], 'exact_candidate')
        self.assertEqual(rows[0]['delta_php'], 2000000)

    def test_duplicate_exact_keys_are_not_greedily_consumed(self):
        rows = project_matches([allocation('h1'), allocation('h2')], [allocation('n')])
        self.assertEqual([r['status'] for r in rows].count('exact_candidate'), 0)
        self.assertEqual([r['status'] for r in rows].count('ambiguous'), 2)
        self.assertEqual([r['status'] for r in rows].count('nep_unmatched'), 1)

    def test_region_and_local_fap_boundaries_are_preserved(self):
        for other in [allocation('n', reg='Region IV-A'), allocation('n', zone='fap')]:
            rows = project_matches([allocation('h')], [other])
            self.assertEqual({r['status'] for r in rows}, {'house_unmatched', 'nep_unmatched'})
        self.assertEqual(region('Region Ⅳ-A'), 'Region IV-A')
        self.assertEqual(region('Nationwide'), 'Nationwide')
        self.assertEqual(region('BARMM'), 'Nationwide')

    def test_fuzzy_shortlist_ties_are_ordered_by_source_id(self):
        h = allocation('h', title='Construction of Road at Barangay Mabini, Sample City Segment A')
        ns = [allocation(f'n{i:02}', title=f'Construction of Road at Barangay Mabini, Sample City Segment {i}') for i in range(30)]
        def suggestions(source):
            row = next(r for r in project_matches([h], source) if r['status'] == 'fuzzy_candidate')
            return [c['nep']['id'] for c in row['candidates']]
        self.assertEqual(suggestions(ns), suggestions(list(reversed(ns))))

    def test_fuzzy_suggestions_do_not_consume_or_certify_source_rows(self):
        rows = project_matches([allocation('h', title='Construction of Road at Barangay Mabini, Sample City Alpha Segment')],
                               [allocation('n', title='Construction of Road at Barangay Mabini, Sample City Beta Segment')])
        self.assertEqual({r['status'] for r in rows}, {'fuzzy_candidate', 'nep_unmatched'})
        suggestion = next(r for r in rows if r['status'] == 'fuzzy_candidate')
        self.assertGreaterEqual(suggestion['candidates'][0]['confidence'], .85)
        self.assertNotIn('delta_php', suggestion)

    def test_abbreviation_variants_and_repeated_tokens_match_exactly(self):
        # Brgy./Barangay spellings and doubled "Sta. Sta." (OCR/spacing) normalize alike.
        h = allocation('h', title='Reconstruction of Road, Brgy. Mabini, Sta. Sta. Maria')
        n = allocation('n', title='Reconstruction of Road, Barangay Mabini, Sta. Maria')
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['exact_candidate'])
        self.assertEqual(normalized('Brgy. Mabini, Sta. Sta. Maria'), normalized('Barangay Mabini, Sta. Maria'))
        self.assertNotEqual(normalized('Sta. 1+000 - Sta. 2+000'), '')

    def test_same_road_with_different_chainage_attaches_as_a_match(self):
        # Digit-only title differences attach as coverage amendments, not insertions.
        h = allocation('h', title='Manila-Batangas Rd - K0097 + 788 - K0098 + 000', amount=10)
        n = allocation('n', title='Manila-Batangas Rd - K0097 + 777 - K0098 + 000', amount=8)
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['chainage_candidate'])
        self.assertEqual(rows[0]['nep']['id'], 'n')
        self.assertEqual(rows[0]['delta_php'], 2)
        self.assertIn('amendment', rows[0]['reason'])
        self.assertNotIn('candidates', rows[0])
        # Letter differences stay fuzzy; no-suggestion rows stay unmatched.
        n2 = allocation('n2', title='Manila-Batangas Rd - K0097 + 788 - K0098 + 900 Segment B')
        self.assertEqual(project_matches([h], [n2])[0]['status'], 'fuzzy_candidate')
        self.assertEqual(project_matches([h], [allocation('n3', title='Unrelated seawall')])[0]['status'],
                         'house_unmatched')

    def test_location_reassignment_attaches_as_an_amendment(self):
        h = allocation(
            'h',
            title='Construction of Multi-Purpose Building (Covered Court), Barangay Poblacion, Carmen, Agusan del Norte',
            amount=8_000_000)
        n = allocation(
            'n',
            title='Construction of Multi-Purpose Building (Covered Court ), Barangay Poblacion, Carmen, Lanao del Norte',
            amount=8_000_000)
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['location_amendment_candidate'])
        self.assertEqual(rows[0]['delta_php'], 0)
        self.assertIn('location reassignment', rows[0]['reason'])
        self.assertIn('location_reassignment', rows[0]['diff_tags'])
        self.assertNotIn('candidates', rows[0])

    def test_point_to_point_barangay_attaches_as_an_amendment(self):
        h = allocation(
            'h',
            title='Construction of Road, Barangay Singay to Barangay Mina East, Mina, Iloilo',
            amount=10_000_000)
        n = allocation(
            'n',
            title='Construction of Road, Barangay Singay, Mina, Iloilo',
            amount=10_000_000)
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['location_amendment_candidate'])
        self.assertIn('point-to-point', rows[0]['reason'])
        self.assertIn('point_to_point_barangay', rows[0]['diff_tags'])

    def test_point_to_point_prefers_equal_amount_among_corridor_hits(self):
        # House corridor can shortlist both the reassigned endpoint and a
        # shorter single-barangay NEP; equal amount selects the amendment.
        h = allocation(
            'h',
            title='Construction of Road, Barangay Agmanaphao to Barangay Singay, Mina, Iloilo',
            amount=20_000_000)
        n_end = allocation(
            'n_end',
            title='Construction of Road, Barangay Agmanaphao to Barangay Badiangan, Mina, Iloilo',
            amount=20_000_000)
        n_short = allocation(
            'n_short',
            title='Construction of Road, Barangay Singay, Mina, Iloilo',
            amount=10_000_000)
        rows = project_matches([h], [n_end, n_short])
        attached = [r for r in rows if r['status'] == 'location_amendment_candidate']
        self.assertEqual(len(attached), 1)
        self.assertEqual(attached[0]['nep']['id'], 'n_end')
        self.assertIn('point_to_point_barangay', attached[0]['diff_tags'])

    def test_soft_ocr_attach_keeps_provenance(self):
        h = allocation(
            'h',
            title='Construction of Drainage System, Barangay San Roque, San Jacinto, Pangasinan',
            amount=5_000_000)
        n = allocation(
            'n',
            title='Construction of Drainage System, Barangay San Rogue, San Jacinto, Pangasinan',
            amount=5_000_000)
        rows = project_matches([h], [n])
        # LIVE abbrev may fold Roque/Rogue into exact; soft attach is the
        # fallback when residual OCR remains after normalize.
        status = rows[0]['status']
        self.assertIn(status, ('exact_candidate', 'soft_match_candidate'))
        if status == 'soft_match_candidate':
            self.assertIn('spelling_ocr', rows[0]['diff_tags'])
            self.assertIn('soft-attached after review', rows[0]['reason'])
            self.assertIsNotNone(rows[0].get('identity_score'))
        else:
            self.assertIn('normalization', rows[0]['reason'] or '')

    def test_facility_qualifier_soft_attach_keeps_provenance(self):
        h = allocation(
            'h',
            title='Construction of Multi-Purpose Building, Barangay Poblacion East, Calasiao, Pangasinan',
            amount=5_000_000)
        n = allocation(
            'n',
            title='Construction of Multi-Purpose Building (Gym), Barangay Poblacion East, Calasiao, Pangasinan',
            amount=5_000_000)
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['soft_match_candidate'])
        self.assertEqual(rows[0]['diff_tags'], ['facility_qualifier'])
        self.assertIn('facility_qualifier', rows[0]['reason'])
        self.assertIn('Soft-attached after review', rows[0]['reason'])
        self.assertIsNotNone(rows[0].get('identity_score'))
        self.assertNotIn('candidates', rows[0])

    def test_scope_amendment_gps_pair_attaches_with_amount_delta(self):
        # Tier-3: same GPS coordinates, unit-count scope change, unequal
        # amounts — attaches as a scope amendment with flagged delta.
        h = allocation(
            'h',
            title='Construction (Completion) of 2 units Multi-Purpose Building, Barangay Buenaflor Embarkadero, Dumangas, Iloilo, 10.819806, 122.712086',
            amount=40_000_000)
        n = allocation(
            'n',
            title='Construction (Completion) of Multi-Purpose Building, Barangay Buenaflor Embarkadero, Dumangas, Iloilo, 10.819806, 122.712086',
            amount=11_000_000)
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['scope_amendment_candidate'])
        self.assertEqual(rows[0]['delta_php'], 29_000_000)
        self.assertIn('scope amendment', rows[0]['reason'])
        self.assertIn('Amount delta', rows[0]['reason'])
        self.assertIn('same_gps_coordinates', rows[0]['diff_tags'])
        self.assertIsNotNone(rows[0].get('identity_score'))
        self.assertNotIn('candidates', rows[0])

    def test_scope_amendment_work_scope_wording_attaches(self):
        # Tier-3: Water Supply → Solar Water Supply with equal amounts.
        h = allocation(
            'h',
            title='Construction of Water Supply System at Sitio Banalo, Barangay San Isidro, Tingloy, Batangas',
            amount=10_000_000)
        n = allocation(
            'n',
            title='Construction of Solar Water Supply System at Sitio Banalo, Barangay San Isidro, Tingloy, Batangas',
            amount=10_000_000)
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['scope_amendment_candidate'])
        self.assertIn('work_descriptor_change', rows[0]['diff_tags'])
        self.assertIn('scope amendment', rows[0]['reason'])

    def test_hard_place_mismatch_never_scope_attaches(self):
        # Unrelated barangays (hard mismatch) must stay fuzzy even at high
        # text similarity — Tier-3 only attaches soft tags.
        h = allocation(
            'h',
            title='Construction (Completion) of Multi-Purpose Building (Covered Court), Barangay Natunuan South, San Pascual, Batangas',
            amount=5_000_000)
        n = allocation(
            'n',
            title='Construction of Multi-Purpose Building (Covered Court), Barangay Banaba, San Pascual, Batangas',
            amount=5_000_000)
        rows = project_matches([h], [n])
        self.assertEqual(rows[0]['status'], 'fuzzy_candidate')

    def test_normalization_dependent_exact_matches_carry_an_audit_reason(self):
        # Identical raw titles stay unflagged; abbreviation-only matches are flagged.
        plain = project_matches([allocation('h')], [allocation('n')])
        self.assertIsNone(plain[0].get('reason'))
        flagged = project_matches(
            [allocation('h', title='Reconstruction of Road, Brgy. Mabini, Sample City')],
            [allocation('n', title='Reconstruction of Road, Barangay Mabini, Sample City')])
        self.assertEqual(flagged[0]['status'], 'exact_candidate')
        self.assertIn('normalization', flagged[0]['reason'])

    def test_construction_completion_qualifier_bridges_unique_pairs(self):
        # Unique Construction (Completion) ↔ Construction pairs attach as exact
        # with a review reason; dual line items in the same scope stay unmatched.
        h = allocation('h', title='Construction (Completion) of Bridge, Barangay Biga I, Silang')
        n = allocation('n', title='Construction of Bridge, Barangay Biga I, Silang', amount=8000000)
        rows = project_matches([h], [n])
        self.assertEqual([r['status'] for r in rows], ['exact_candidate'])
        self.assertEqual(rows[0]['delta_php'], 2000000)
        self.assertIn('stage qualifier', rows[0]['reason'])
        # Reverse direction (House plain, NEP qualified).
        rev = project_matches(
            [allocation('h', title='Construction of Bridge, Barangay Biga I, Silang')],
            [allocation('n', title='Construction (Completion) of Bridge, Barangay Biga I, Silang')])
        self.assertEqual(rev[0]['status'], 'exact_candidate')
        self.assertIn('stage qualifier', rev[0]['reason'])
        # Both variants already exist on each side → exact-key pairs keep them
        # distinct (no stage-qualifier fusion).
        dual = project_matches(
            [allocation('h1', title='Construction (Completion) of Building, Barangay Luna', amount=10_000_000),
             allocation('h2', title='Construction of Building, Barangay Luna', amount=50_000_000)],
            [allocation('n1', title='Construction (Completion) of Building, Barangay Luna', amount=10_000_000),
             allocation('n2', title='Construction of Building, Barangay Luna', amount=50_000_000)])
        exact = [r for r in dual if r['status'] == 'exact_candidate']
        self.assertEqual(len(exact), 2)
        self.assertTrue(all(r.get('reason') is None for r in exact))
        # House keeps both variants but NEP has only the plain title → stripped
        # key is not unique on the House side; do not greedily attach either.
        blocked = project_matches(
            [allocation('h1', title='Construction (Completion) of Building, Catigbian', amount=60_000_000),
             allocation('h2', title='Construction of Building, Catigbian', amount=5_000_000)],
            [allocation('n', title='Construction of Building, Catigbian', amount=5_000_000)])
        self.assertEqual([r['status'] for r in blocked].count('exact_candidate'), 1)
        attached = next(r for r in blocked if r['status'] == 'exact_candidate')
        self.assertEqual(attached['house']['id'], 'h2')  # full-key exact, not the qualifier
        self.assertIsNone(attached.get('reason'))
        leftover = next(r for r in blocked if r['house']['id'] == 'h1')
        self.assertIn(leftover['status'], ('fuzzy_candidate', 'house_unmatched', 'ambiguous'))

    def test_region_direct_leaves_inherit_regional_or_central_office(self):
        self.assertEqual(regional_office_label('Region I'), 'Regional Office I')
        self.assertEqual(regional_office_label('Region IV-A'), 'Regional Office IV-A')
        self.assertEqual(regional_office_label('NCR'), 'NCR Regional Office')
        self.assertEqual(regional_office_label('MIMAROPA'), 'Regional Office MIMAROPA Region')
        self.assertEqual(regional_office_label('Nationwide'), '')
        self.assertEqual(office_from_region_parent('', 'Region X'), 'Regional Office X')
        self.assertEqual(office_from_region_parent('', 'Region X', central_office=True), 'Central Office')
        self.assertEqual(office_from_region_parent('', 'Nationwide', central_office=True), 'Central Office')
        # Outer NCR wrapping Region I (House path without a CO node) → CO.
        self.assertEqual(office_from_region_parent('', 'Region I', central_office=True), 'Central Office')
        self.assertEqual(office_from_region_parent('La Union 1st District Engineering Office', 'Region I',
                                                   central_office=True),
                         'La Union 1st District Engineering Office')


if __name__ == '__main__':
    unittest.main()
