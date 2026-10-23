"""Reading comparisons preserve allocations and never pair duplicate identities."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'analysis/builders'), str(ROOT / 'scripts')]
from build_house_readings import compare_readings
from validate_current_pages import validate_house_readings


def allocation(id, amount, title='Road', office='DEO A'):
    return {'id': id, 'native_node_id': id, 'title': title, 'amount_php': amount,
            'zone': 'local', 'pap_id': 'p1', 'pap': 'PAP', 'program': 'Program',
            'region': 'NCR', 'office': office, 'record_kind': 'project', 'pdf_page': 20}


class HouseReadingsTests(unittest.TestCase):
    def test_paired_changes_use_identity_not_amount_or_node_number(self):
        rows = compare_readings([allocation('a', 10)], [allocation('b', 15)])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['trace'], 'amount_changed')
        self.assertEqual(rows[0]['delta_php'], 5)
        self.assertNotEqual(rows[0]['second']['id'], rows[0]['third']['id'])

    def test_presence_differences_keep_both_sources_without_inventing_pair(self):
        rows = compare_readings([allocation('a', 10)], [allocation('b', 10, 'Other road')])
        self.assertEqual({r['trace'] for r in rows}, {'second_only', 'third_only'})
        self.assertEqual(sorted(r['delta_php'] for r in rows), [-10, 10])

    def test_third_only_row_with_nep_twin_is_annotated_not_reclassified(self):
        # A 3rd-reading-only row whose exact title+region+zone exists in the
        # NEP schedule carries a nep_twin annotation (likely restoration of
        # a 2nd-reading drop) while keeping its third_only status.
        nep_rows = [{'source_id': 'p9:r0', 'pap3': 'BIP Access Roads', 'pdf_page': 458,
                     'amount_php': 25_000_000, 'zone': 'non_fap', 'region': 'NCR',
                     'title': 'Rehabilitation of Drainage including Pathwalk along 1st St'}]
        rows = compare_readings(
            [], [allocation('b', 25_000_000,
                            title='Rehabilitation of Drainage including Pathwalk along 1st St')],
            source_rows=nep_rows)
        self.assertEqual(rows[0]['trace'], 'third_only')
        twin = rows[0]['nep_twin']
        self.assertEqual(twin['source_id'], 'p9:r0')
        self.assertEqual(twin['pdf_page'], 458)
        self.assertIn('restoration', twin['note'])
        # Without NEP context there is no annotation.
        bare = compare_readings([], [allocation('b', 25_000_000, title='Unrelated seawall')])
        self.assertNotIn('nep_twin', bare[0])

    def test_different_office_does_not_establish_identity(self):
        rows = compare_readings([allocation('a', 10)], [allocation('b', 10, office='DEO B')])
        self.assertEqual(len(rows), 2)

    def test_repeated_titles_are_grouped_without_arbitrary_individual_pairing(self):
        rows = compare_readings([allocation('a', 10), allocation('b', 20)],
                                [allocation('c', 15), allocation('d', 20)])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['trace'], 'repeated_key')
        self.assertEqual(rows[0]['delta_php'], 5)
        self.assertEqual(len(rows[0]['second']['records']), 2)
        self.assertEqual(len(rows[0]['third']['records']), 2)

    def test_committed_readings_reconcile_all_controls_and_each_source_allocation(self):
        data = validate_house_readings()
        self.assertFalse(data['manifest']['comparison_ready'])
        s = data['summary']
        self.assertEqual(s['control_deltas_php']['new_appropriations'], 0)
        self.assertEqual(s['allocation_delta_php'], 134_000_000)
        self.assertEqual(s['control_deltas_php']['s2o_total'], -134_000_000)
        self.assertEqual(s['status_counts']['third_only'], 5)
        third_only = [r for r in data['projects'] if r['trace'] == 'third_only']
        self.assertEqual(sum(r['delta_php'] for r in third_only), 134_000_000)
        self.assertTrue(all(r['third']['office'] == 'Metro Manila 3rd District Engineering Office' for r in third_only))
        self.assertEqual(sum(r['delta_php'] for r in data['paps']), 134_000_000)
        fap = next(r for r in data['paps'] if r['label'] == 'Foreign-assisted projects (FAP)')
        self.assertEqual((fap['second_php'], fap['third_php'], fap['delta_php']),
                         (44_749_011_000, 44_749_011_000, 0))
        for side in ('second', 'third'):
            self.assertEqual(sum(r[side + '_php'] or 0 for r in data['paps']), s[side]['operations_including_projects'])
        for side in ('second', 'third'):
            # Single-leaf sides carry no records[]; the merged side is the leaf.
            rows = [leaf for r in data['projects'] if r[side]
                    for leaf in (r[side].get('records') or [r[side]])]
            self.assertEqual(len(rows), s[side]['allocations'])
            self.assertEqual(sum(r['amount_php'] for r in rows), s[side]['operations_including_projects'])


if __name__ == '__main__':
    unittest.main()
