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
            rows = [leaf for r in data['projects'] if r[side] for leaf in r[side]['records']]
            self.assertEqual(len(rows), s[side]['allocations'])
            self.assertEqual(sum(r['amount_php'] for r in rows), s[side]['operations_including_projects'])


if __name__ == '__main__':
    unittest.main()
