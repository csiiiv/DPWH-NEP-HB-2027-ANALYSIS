"""Regression checks for recursive reconciliation and offsetting OCR errors."""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import DATA
import copy
import json
import unittest
from pathlib import Path

import pymupdf

from build_nep_tree import GRAND, audit_native_amounts, indices, validate


class NepTreeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tree = json.loads((DATA / 'nep_2027_tree.json').read_text())

    def fresh(self):
        return {n['id']:copy.deepcopy(n) for n in self.tree['nodes']}

    def test_complete_ledger(self):
        nodes = self.fresh()
        checks = validate(nodes)
        self.assertEqual(len(checks),2552)
        self.assertEqual(sum(u['amount_php'] for u in indices(nodes)),GRAND)

    def test_leaf_error_is_localized_even_when_root_balances(self):
        nodes = self.fresh()
        leaf = nodes['p494:r27:split-Bertese']
        leaf['printed_amount_php'] += 1000
        checks = validate(nodes,strict=False)
        failures = [c for c in checks if c['status']=='mismatch']
        self.assertEqual([c['id'] for c in failures],[leaf['parent']])
        self.assertEqual(failures[0]['difference_php'],-1000)
        self.assertEqual(nodes['root']['validation'],'pass')
        with self.assertRaises(ValueError):
            validate(nodes)

    def test_missing_project_is_rejected(self):
        nodes = self.fresh()
        leaf = nodes.pop('p494:r27:split-Bertese')
        nodes[leaf['parent']]['children'].remove(leaf['id'])
        with self.assertRaises(ValueError):
            validate(nodes)

    def test_duplicate_reference_path_is_rejected(self):
        nodes = self.fresh()
        nodes['root']['children'].append('ps')
        with self.assertRaisesRegex(ValueError,'Multiple traversal'):
            validate(nodes)

    def test_offsetting_sibling_errors_need_independent_evidence(self):
        nodes = self.fresh()
        a,b = nodes['p494:r27'],nodes['p494:r27:split-Bertese']
        self.assertEqual(a['parent'],b['parent'])
        with pymupdf.open(self.tree['provenance']['inputs']['pdf']) as pdf:
            baseline = audit_native_amounts({a['id']:a,b['id']:b},pdf)
            self.assertEqual(baseline['summary']['status_counts'],{'within_bbox_agreement':2})
            a['printed_amount_php'] += 1000
            b['printed_amount_php'] -= 1000
            validate(nodes)  # Arithmetic cannot expose this cancellation.
            audit = audit_native_amounts({a['id']:a,b['id']:b},pdf)
            self.assertEqual(audit['summary']['status_counts'],{'native_text_review':2})


class AmountColumnTests(unittest.TestCase):
    def source_node(self, bbox):
        return {'id':'row', 'label':'Test operating unit', 'printed_amount_php':100,
                'amount_basis':'ps', 'source':{'table':'by_ou','pdf_page':1,'bbox':bbox,
                'amount_role':'Amount 1','amount_column_polygon':[[250,0],[330,0],[330,200],[250,200]]}}

    def test_audit_uses_page_column_instead_of_fixed_ps_window(self):
        with pymupdf.open() as pdf:
            p=pdf.new_page(width=720,height=200)
            p.insert_text((270,50),'100')
            p.insert_text((420,50),'200')  # Other expense column.
            n=self.source_node([0,30,720,55])
            audit=audit_native_amounts({'row':n},pdf)
            self.assertEqual(audit['summary']['status_counts'],{'within_bbox_agreement':1})
            n['printed_amount_php']=200
            audit=audit_native_amounts({'row':n},pdf)
            self.assertEqual(audit['summary']['status_counts'],{'native_text_review':1})

    def test_matching_number_in_multi_row_area_does_not_certify_identity(self):
        with pymupdf.open() as pdf:
            p=pdf.new_page(width=720,height=200)
            p.insert_text((270,50),'100');p.insert_text((270,80),'300')
            n=self.source_node([0,30,720,90])
            audit=audit_native_amounts({'row':n},pdf)
            self.assertEqual(audit['summary']['status_counts'],{'native_row_ambiguity':1})

    def test_operating_unit_row_total_remains_distinct_from_ps(self):
        from nep_amount_columns import column_roles
        self.assertEqual(column_roles([{'role':r} for r in ['Labels','Amount 1','Amount 2','Amount 3']]),
                         {'Amount 1':'ps','Amount 2':'mooe','Amount 3':'total'})
        tree=json.loads((DATA/'nep_2027_tree.json').read_text())
        row=next(n for n in tree['nodes'] if n['id']=='ps:p13:r4')
        self.assertEqual(row['amount_php'],78157000)
        self.assertEqual(row['amount_basis'],'ps')
        self.assertEqual(row['source_row_columns_php'],{'ps':78157000,'mooe':24732000,'co':None,'total':102889000})


if __name__=='__main__':
    unittest.main()
