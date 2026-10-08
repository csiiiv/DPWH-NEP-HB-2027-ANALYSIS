"""Regression checks for the House rollup tree: controls, coverage, and structure."""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import DATA
from paths import ARCHIVE_DATA
import copy
import json
import unittest
from pathlib import Path

from archive.builders.build_hb_tree import read, rollup, validate


def known_mismatches():
    repairs = read('hb_known_defect_repairs.json')
    return {p['pap']: p['difference_php'] for p in repairs['pap_controls'] if p['difference_php']}


class HbTreeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = json.loads((ARCHIVE_DATA / 'hb_2027_tree.json').read_text())

    def fresh(self):
        nodes = {n['id']: copy.deepcopy(n) for n in self.tree['nodes']}
        return nodes, nodes

    def test_printed_controls_reproduce_grand_total(self):
        s = self.tree['summary']
        self.assertEqual(s['gas_s2o_php'] + s['operations_php'], s['total_php'])
        by_id = {n['id']: n for n in self.tree['nodes']}
        self.assertEqual(by_id['root']['difference_php'], 0)
        self.assertEqual(by_id['local']['children_sum_php'], by_id['local']['printed_amount_php'])
        self.assertEqual(by_id['fap']['children_sum_php'], by_id['fap']['printed_amount_php'])

    def test_project_amounts_reproduce_v5_table(self):
        leaves = read('hb_dpwh_leaves_corrected_v5.json')['leaves']
        self.assertEqual(sum(n['amount_php'] for n in self.tree['nodes'] if n['kind'] == 'project'),
                         sum(r['amount_php'] for r in leaves))

    def test_only_documented_pap_mismatches(self):
        self.assertEqual({m['label'] for m in self.tree['summary']['mismatched_paps']},
                         set(known_mismatches()))
        mismatches = [c for c in self.tree['checks'] if c['status'] == 'mismatch']
        self.assertEqual(len(mismatches), 4)
        self.assertTrue(all(c['kind'] == 'pap' for c in mismatches))

    def test_fap_funding_partitions_balance(self):
        nodes = self.tree['nodes']
        by_id = {n['id']: n for n in nodes}
        projects = [n for n in nodes if n['kind'] == 'project' and n['zone'] == 'fap']
        self.assertEqual(len(projects), 29)
        for n in projects:
            kids = [by_id[c] for c in n['children']]
            self.assertEqual(sum(k['amount_php'] for k in kids), n['amount_php'], n['id'])
            self.assertEqual(len(kids), 2)

    def test_new_unlisted_mismatch_fails_the_build(self):
        nodes, _ = self.fresh()
        # Perturb one balanced PAP's printed control; validate must reject.
        target = next(n for n in nodes.values() if n['kind'] == 'pap' and n['validation'] == 'balanced')
        target['printed_amount_php'] += 1000
        rollup(list(nodes.values()), nodes)
        with self.assertRaises(AssertionError):
            validate(list(nodes.values()), nodes, known_mismatches())

    def test_coverage_gap_survives_documented_mismatch(self):
        nodes, _ = self.fresh()
        validate(list(nodes.values()), nodes, known_mismatches())  # Must not raise.
        ops = nodes['operations']
        self.assertEqual(ops['coverage_difference_php'], -self.tree['summary']['operations_gap_php'])

    def test_zone_root_balance_is_localized(self):
        nodes, _ = self.fresh()
        # Adding an allocation under a balanced local PAP must surface as a PAP mismatch, not zone imbalance.
        leaf = copy.deepcopy(next(n for n in nodes.values() if n['kind'] == 'project' and n['zone'] == 'pap'))
        leaf['id'] = 'project:test-extra'
        leaf['amount_php'] = 500
        nodes[leaf['parent_id']]['children'] = list(nodes[leaf['parent_id']]['children']) + [leaf['id']]
        nodes[leaf['id']] = leaf
        rollup(list(nodes.values()), nodes)
        with self.assertRaises(AssertionError):
            validate(list(nodes.values()), nodes, known_mismatches())
        # Programs keep their printed control, so the zone still balances while the PAP mismatches.
        self.assertEqual(nodes['local']['difference_php'], 0)
        # Coverage gap closes by exactly the injected 500; nothing else moves.
        self.assertEqual(nodes['local']['coverage_difference_php'],
                         -self.tree['summary']['operations_gap_php'] + 500)


if __name__ == '__main__':
    unittest.main()
