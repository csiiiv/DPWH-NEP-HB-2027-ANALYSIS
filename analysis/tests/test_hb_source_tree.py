"""Regression checks for the document-native House tree."""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import DATA
import copy
import json
import unittest
from pathlib import Path

import build_hb_source_tree as B


class HbSourceTreeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = json.loads((DATA / 'hb_2027_source_tree.json').read_text())
        cls.by_id = {n['id']: n for n in cls.tree['nodes']}

    def nodes(self):
        return {n['id']: copy.deepcopy(n) for n in self.tree['nodes']}

    def test_root_and_sections_balance(self):
        root = self.by_id['n1']
        self.assertEqual(root['printed_amount_php'], B.GRAND)
        self.assertEqual(root['difference_php'], 0)
        ops = self.by_id[root['children'][2]]
        self.assertEqual(ops['label'], 'Operations (VOL I-C details)')
        for section in ops['children']:
            self.assertEqual(self.by_id[section]['difference_php'], 0, self.by_id[section]['label'])
        self.assertEqual(ops['children_sum_php'], B.OPS_PRINTED)

    def test_document_anchor_arithmetic(self):
        # OO1 = APP + NDP + Bridge controls; Convergence = exact residual
        ops = self.by_id[self.by_id['n1']['children'][2]]
        oo1, oo2, lfp, fap, conv = (self.by_id[c] for c in ops['children'])
        self.assertEqual(oo1['printed_amount_php'], B.OO1)
        self.assertEqual(oo2['printed_amount_php'], B.OO2)
        self.assertEqual(lfp['printed_amount_php'], B.LFP_TOTAL)
        self.assertEqual(fap['printed_amount_php'], B.FAP_TOTAL)
        self.assertEqual(conv['printed_amount_php'], B.CONVERGENCE)
        self.assertEqual(B.OO1 + B.OO2 + B.LFP_TOTAL + B.FAP_TOTAL + B.CONVERGENCE, B.OPS_PRINTED)

    def test_projects_reproduce_v5(self):
        leaves = json.loads((DATA / 'hb_dpwh_leaves_corrected_v5.json').read_text())['leaves']
        self.assertEqual(sum(n['amount_php'] for n in self.tree['nodes'] if n['kind'] == 'project'),
                         sum(l['amount_php'] for l in leaves))
        self.assertEqual(sum(1 for n in self.tree['nodes'] if n['kind'] == 'project'), len(leaves))

    def test_only_documented_mismatches(self):
        mismatches = [n for n in self.tree['nodes'] if n['validation'] == 'mismatch']
        self.assertEqual({n['label'] for n in mismatches}, B.KNOWN_MISMATCH_PAPS)
        self.assertTrue(all(n['kind'] == 'pap' for n in mismatches))

    def test_all_printed_controls_carry_sources(self):
        for n in self.tree['nodes']:
            if n['kind'] == 'pap' and n['printed_amount_php'] is not None:
                self.assertTrue(n.get('source_row') is not None or n.get('pdf_pages'),
                                f'PAP control without source: {n["label"]}')

    def test_funding_partitions_balance(self):
        projects = [n for n in self.tree['nodes'] if n['kind'] == 'project' and n['children']]
        self.assertEqual(len(projects), 29)
        for p in projects:
            kids = [self.by_id[c] for c in p['children']]
            self.assertEqual(sum(k['amount_php'] for k in kids), p['amount_php'], p['label'])

    def test_attached_subtotals_validated(self):
        attached = self.tree['attached_office_subtotals']
        regions = self.tree['attached_region_subtotals']
        self.assertEqual(len(attached), 399)
        self.assertEqual(len(regions), 15)
        offices = [n for n in self.tree['nodes'] if n['kind'] == 'office' and n['printed_amount_php'] is not None]
        self.assertTrue(all(n['validation'] == 'balanced' for n in offices))

    def test_perturbing_a_balanced_pap_fails_validation(self):
        t = B.Tree()
        # rebuild via module build (fast enough at ~2s)
        t2, root, ctx = B.build()
        B.rollup(t2)
        known = {p['pap'] for p in ctx['repairs']['pap_controls'] if p['difference_php']}
        target = next(n for n in t2.nodes if n['kind'] == 'pap' and n['validation'] == 'balanced')
        target['printed_amount_php'] += 1000
        B.rollup(t2)
        with self.assertRaises(AssertionError):
            B.validate(t2, known)

    def test_missing_project_is_detected(self):
        t2, root, ctx = B.build()
        B.rollup(t2)
        leaf = next(n for n in t2.nodes if n['kind'] == 'project')
        parent = t2.by_id[leaf['parent_id']]
        parent['children'].remove(leaf['id'])
        t2.nodes.remove(leaf)
        del t2.by_id[leaf['id']]
        B.rollup(t2)
        known = {p['pap'] for p in ctx['repairs']['pap_controls'] if p['difference_php']}
        with self.assertRaises(AssertionError):
            B.validate(t2, known)  # unreachable node check trips


if __name__ == '__main__':
    unittest.main()
