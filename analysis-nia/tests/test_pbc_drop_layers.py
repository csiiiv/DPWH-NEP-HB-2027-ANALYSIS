"""Smoke tests for the PBC drop layers (RDC endorsement + PBC presentation).

These validate the generated JSON artifacts: structure, invariants, and the
cross-dataset checks documented in the READMEs.  They do not re-OCR (the
external drop must be mounted for full rebuilds).
"""
import json
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ANALYSIS = os.path.dirname(HERE)
RDC = os.path.join(ANALYSIS, 'data', 'rdc_endorsement')
PBC = os.path.join(ANALYSIS, 'data', 'pbc_presentation')


class TestRDCEndorsementLayer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ds = json.load(open(os.path.join(RDC, 'rdc_endorsement_dataset.json')))
        cls.xr = json.load(open(os.path.join(RDC, 'rdc_insertion_crossref.json')))

    def test_documents_cover_all_16_region_folders(self):
        regions = {d['region'] for d in self.ds['documents']}
        expected = {'CAR', 'Region 1', 'Region 2', 'MARIIS', 'Region 3',
                    'UPRIIS', 'Region 4A', 'Region 4B', 'Region 5', 'Region 6',
                    'Region 7', 'Region 8', 'Region 9', 'Region 10',
                    'Region 11', 'Region 12'}
        self.assertEqual(regions, expected)

    def test_r2_and_mariis_files_are_identical(self):
        docs = {d['source_file']: d for d in self.ds['documents']}
        r2 = docs['03 REGION II/RDC2 RESO NO. 02-57 S 2026 -R2& MARIIS.pdf']
        mm = docs['04 MARIIS/RDC2 RESO NO. 02-57 S 2026 -R2& MARIIS.pdf']
        self.assertEqual(r2['sha1'], mm['sha1'])

    def test_verified_totals_are_complete_and_sum(self):
        vt = self.ds['verified_totals']
        self.assertEqual(len(vt), 16)
        # 15 monetary + Region 12 (no single total)
        monetary = [v for v in vt.values() if v.get('total')]
        self.assertEqual(len(monetary), 15)
        total = sum(v['total'] for v in monetary)
        self.assertEqual(total, 185_984_241_447)
        # every entry cites a resolution and reading basis
        for region, v in vt.items():
            self.assertIn('resolution', v, region)
            self.assertIn('reading', v, region)

    def test_upriis_rows_are_flagged_review_only(self):
        upr = [d for d in self.ds['documents'] if d['region'] == 'UPRIIS'][0]
        # parsed rows deliberately do NOT sum to the printed control
        s = sum(r['amount'] or 0 for r in upr['project_rows'])
        self.assertNotEqual(s, 5_341_860_310)
        self.assertTrue(any('review' in n.lower() or 'heuristic' in n.lower()
                            for n in self.ds['notes']))

    def test_rdc_xii_lists(self):
        top30 = self.ds['rdc_xii_lists']['top30_nia_projects']
        fs = self.ds['rdc_xii_lists']['top3_fs_nia_proposals']
        self.assertEqual(len(top30), 4)
        self.assertEqual(len(fs), 2)
        titles = ' '.join(p['title'] for p in top30)
        for stem in ('Kabulnan', 'Malitubog', 'Lebak', 'Sepaka'):
            self.assertIn(stem, titles)
        # no Notes rows leaked
        self.assertTrue(all('Notes' not in p['title'] for p in fs))

    def test_crossref_matches_senate_counts(self):
        senate = json.load(open(os.path.join(ANALYSIS, 'data',
                                             'senate_nia_dataset.json')))
        insertions = [p for p in senate['projects']
                      if p.get('status') == 'house_insertion']
        self.assertEqual(self.xr['house_insertions_total'], len(insertions))
        self.assertEqual(self.xr['house_insertions_total'], 145)
        self.assertEqual(self.xr['house_insertions_amount'], 5_742_500_000)
        # all UPRIIS matches require exact amounts
        for m in self.xr['upriis_amount_matches']:
            for r in m['rdc_rows']:
                self.assertEqual(m['amount'], r['amount'])


class TestPBCPresentationLayer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ds = json.load(open(os.path.join(PBC, 'pbc_budget_comparison.json')))

    def test_16_budget_rows_with_bboxes(self):
        rows = self.ds['budget_comparison']
        self.assertEqual(len(rows), 16)
        for r in rows:
            self.assertTrue(r['label'])
            self.assertIsNotNone(r['proposal_p000'])
            self.assertIn('bboxes', r)

    def test_column_totals(self):
        t = self.ds['column_totals_p000']
        self.assertEqual(t['gaa_2026'], 49_923_323)
        self.assertEqual(t['proposal'], 209_335_298)
        self.assertEqual(t['nep'], 33_724_893)

    def test_nep_crosschecks_pass(self):
        for c in self.ds['nep_annex_crosschecks']:
            self.assertTrue(c['match'], c)

    def test_known_controls(self):
        rows = {r['label']: r for r in self.ds['budget_comparison']}
        self.assertEqual(rows[
            'Establishment of Pump Irrigation Projects']['nep_p000'] * 1000,
            7_915_950_000)
        self.assertEqual(rows[
            'Comprehensive Agrarian Reform Program - IC']['nep_p000'] * 1000,
            698_067_000)
        # CIS category rows reconcile to the NEP annex CIS control
        cis = sum(rows[k]['nep_p000'] for k in (
            'Repair of Communal Irrigation Systems',
            'Restoration of Communal Irrigation Systems',
            'Improvement of Service Roads in Communal Irrigation Systems',
            'Climate Change Adaptation Works (Communal Systems)'))
        self.assertEqual(cis * 1000, 1_620_000_000)

    def test_proposal_vs_rdc_vs_nep_magnitude(self):
        # the documented chain: RDC 185.98B < corporate proposal 209.34B,
        # NEP annex 17.6B
        prop = self.ds['column_totals_p000']['proposal'] * 1000
        self.assertGreater(prop, 185_984_241_447)
        self.assertLess(prop, 220_000_000_000)


if __name__ == '__main__':
    unittest.main()
