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
        for row in data['projects']:
            if row['status'] == 'exact_candidate':
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

    def test_same_road_with_different_chainage_is_an_amendment_candidate(self):
        # Digit-only title differences are re-segmentation candidates, not insertions.
        h = allocation('h', title='Manila-Batangas Rd - K0097 + 788 - K0098 + 000')
        n = allocation('n', title='Manila-Batangas Rd - K0097 + 777 - K0098 + 000')
        rows = project_matches([h], [n])
        self.assertEqual(rows[0]['status'], 'chainage_candidate')
        self.assertIn('amendment', rows[0]['reason'])
        # Letter differences stay fuzzy; no-suggestion rows stay unmatched.
        n2 = allocation('n2', title='Manila-Batangas Rd - K0097 + 788 - K0098 + 900 Segment B')
        self.assertEqual(project_matches([h], [n2])[0]['status'], 'fuzzy_candidate')
        self.assertEqual(project_matches([h], [allocation('n3', title='Unrelated seawall')])[0]['status'],
                         'house_unmatched')

    def test_normalization_dependent_exact_matches_carry_an_audit_reason(self):
        # Identical raw titles stay unflagged; abbreviation-only matches are flagged.
        plain = project_matches([allocation('h')], [allocation('n')])
        self.assertIsNone(plain[0].get('reason'))
        flagged = project_matches(
            [allocation('h', title='Reconstruction of Road, Brgy. Mabini, Sample City')],
            [allocation('n', title='Reconstruction of Road, Barangay Mabini, Sample City')])
        self.assertEqual(flagged[0]['status'], 'exact_candidate')
        self.assertIn('normalization', flagged[0]['reason'])

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
