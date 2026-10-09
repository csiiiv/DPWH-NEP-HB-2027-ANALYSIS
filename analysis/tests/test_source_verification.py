"""Independent hierarchy, API identities, unit conversion and static-page gates."""
from decimal import Decimal
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'analysis/builders'), str(ROOT / 'scripts')]
from build_source_verification import audit_hierarchy, prepare_reviews
from build_dpwh_nep_api_tree import pesos, validate_records
from validate_current_pages import validate_source_verification


def node(id, amount, parent=None, children=(), additive=True, printed=None):
    return dict(id=id, amount=amount, parent=parent, children=list(children), additive=additive, printed=printed)


class HierarchyTests(unittest.TestCase):
    def test_offsetting_errors_cannot_hide_below_balanced_root(self):
        nodes = [node('root', 300, children=['a','b'], printed=300),
                 node('a',150,'root',['x'],printed=150), node('b',150,'root',['y'],printed=150),
                 node('x',100,'a'), node('y',200,'b')]
        audit = audit_hierarchy(nodes,'root')
        self.assertEqual(audit['total'],300)
        self.assertEqual({c['id'] for c in audit['failures']},{'a','b'})

    def test_references_remain_reachable_but_do_not_add(self):
        nodes = [node('root',100,children=['x','ref']),node('x',100,'root'),node('ref',999,'root',additive=False)]
        a = audit_hierarchy(nodes,'root')
        self.assertEqual(a['total'],100)
        self.assertEqual(a['leaf_count'],1)
        self.assertEqual(nodes[-1]['status'],'reference')

    def test_invalid_links_are_rejected(self):
        cases = [
            [node('root',1,children=['x','x']),node('x',1,'root')],
            [node('root',1,children=['x']),node('x',1,'wrong')],
            [node('root',1),node('orphan',1)],
            [node('root',1,children=['root'])],
            [node('root',1),node('root',2)],
        ]
        for nodes in cases:
            with self.subTest(nodes=nodes), self.assertRaises(ValueError):
                audit_hierarchy(nodes,'root')

    def test_terminal_totals_are_checked_against_external_ledger(self):
        nodes = [node('root',100,children=['office']),node('office',100,'root')]
        a = audit_hierarchy(nodes,'root',{'office':(99,2)})
        self.assertEqual(a['total'],99)
        self.assertEqual(a['leaf_count'],2)
        self.assertEqual({c['id'] for c in a['failures']},{'root','office'})


class ReviewTests(unittest.TestCase):
    def test_derived_context_is_not_an_actionable_source_error(self):
        nodes = [node('root',100,children=['amount','alignment','derived'],printed=100),
                 node('amount',60,'root',printed=60),node('alignment',40,'root',printed=40),
                 node('derived',0,'root')]
        for n,e in zip(nodes,['not_checked','native_text_review','nearby_alignment_candidate','not_checked']):
            n['evidence']=e
        summary=prepare_reviews(nodes)
        self.assertEqual(summary['needs_source_check'],3)
        self.assertEqual(nodes[0]['source_checks_below'],2)
        self.assertEqual(nodes[0]['source_checks_in_branch'],3)
        self.assertEqual(nodes[-1]['review_kind'],'derived_context')
        self.assertFalse(nodes[-1]['review_actionable'])
        with self.assertRaisesRegex(ValueError,'Stale review evidence'):
            prepare_reviews(nodes,{'amount':{'status':'native_text_review','printed_amount_php':61}})


class NEPAPITests(unittest.TestCase):
    def record(self, **extra):
        return dict(dict(id=1,code='2027DPWH-Proposal-00001',fiscalYear=2027,amount=33000),**extra)

    def test_duplicate_codes_and_ids_fail(self):
        r=self.record()
        for other in [self.record(id=2), self.record(code='2027DPWH-Proposal-00002')]:
            with self.subTest(other=other), self.assertRaisesRegex(ValueError,'duplicate'):
                validate_records([r,other])

    def test_wrong_year_fails(self):
        with self.assertRaisesRegex(ValueError,'fiscal year'):
            validate_records([self.record(fiscalYear=2026)])

    def test_thousands_to_pesos_conversion_is_exact(self):
        self.assertEqual(pesos(Decimal('445378063')),445378063000)
        self.assertEqual(pesos(Decimal('12.345')),12345)
        for v in [Decimal('0.0001'), Decimal('-1'), Decimal('NaN')]:
            with self.subTest(value=v), self.assertRaises(ValueError):pesos(v)


class CommittedPageTests(unittest.TestCase):
    def test_current_pages_gate_comparisons_and_recompute_three_ledgers(self):
        overview = validate_source_verification()
        self.assertFalse(overview['comparison_ready'])
        self.assertEqual(len(overview['sources']),3)
        sources = {s['key']:s for s in overview['sources']}
        self.assertEqual(sources['hb']['audit']['internal_checks'],660)
        ic = json.loads((ROOT/'analysis/data/hb_dpwh_native_ic_projects.json').read_text())
        self.assertEqual(sources['hb']['project_detail_summary'], ic['audit_summary'])
        self.assertEqual(sources['hb']['project_detail_summary']['named_project_leaves'],15972)
        self.assertEqual(sources['hb']['project_detail_summary']['additive_leaf_total_php'],639179718000)
        self.assertNotIn('project_detail_summary',sources['nep'])

        self.assertEqual(sources['nep']['audit']['internal_checks'],2552)
        self.assertEqual(sources['dpwh_nep_api']['audit']['leaf_count'],11372)
        for s in sources.values():
            self.assertFalse(s['comparison_ready'])
            self.assertFalse(s['audit']['failures'])
        audit = json.loads((ROOT/'analysis/data/dpwh_transparency_nep_tree_validation.json').read_text())
        self.assertEqual(audit['summary']['total_php'],445378063000)
        self.assertEqual(audit['summary']['rollup_checks'],2662)
        self.assertEqual(len(audit['original_listing_pages']),23)
        self.assertEqual(audit['detail_files']['successful_files'],11372)
        self.assertFalse(audit['detail_files']['listing_detail_mismatches'])



if __name__ == '__main__': unittest.main()
