#!/usr/bin/env python3
"""Arithmetic and source-coverage regressions for the Native I-C rollup.

Runs against analysis/data/hb_dpwh_native_ic_projects.json and the live
extractor; guards the four artifact-title recoveries, the 2,686 recursive
control checks, the 15,972 named-project leaves plus 29 FAP projects, the
204 retained second-observation echo wrappers plus 2 non-additive FAP
GOP/Loan funding-summary references, and the cross-volume agreement with
the Native I-B baseline. Tampering tests mutate extracted rows before the
outline is built and assert the audit catches it.
"""
import copy
import json
from pathlib import Path
import sys
import unittest
import tempfile
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hb_native_ic_rollup as rollup

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / 'analysis/data/hb_dpwh_native_ic_projects.json'
AUDIT = ROOT / 'analysis/data/hb_dpwh_native_ic_rollup_audit.json'


def setUpModule():
    # Extract once from the actual PDF; each mutation uses a separate copy.
    import pymupdf
    global SOURCE_ROWS
    with pymupdf.open(rollup.PDF) as doc:
        SOURCE_ROWS = rollup.extract_rows(doc, 8, len(doc))


def load(path):
    return json.loads(path.read_text())


class NativeICRollupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.object(rollup, 'extract_rows', return_value=SOURCE_ROWS):
            cls.artifact, cls.audit = rollup.build()
        cls.summary = cls.audit['summary']

    def test_complete_additive_budget(self):
        self.assertEqual(self.summary['additive_leaf_total_php'], 639_179_718_000)
        self.assertEqual(self.summary['recursive_checks'], 2_686)
        self.assertEqual(self.summary['failed_nodes'], 0)
        self.assertEqual(self.summary['unexplained_amount_rows'], 0)
        self.assertEqual(self.summary['unexplained_title_rows'], 0)
        self.assertEqual(self.summary['failed_closing_controls'], 0)
        # formerly suppressed rollup echoes: now retained in the hierarchy
        self.assertEqual(self.summary['retained_second_observations'], 204)
        self.assertEqual(self.summary['retained_reference_nodes'], 2)

    def test_cross_volume_agreement_with_ib(self):
        self.assertEqual(self.summary['shared_controls_with_ib'], 56)
        self.assertEqual(self.summary['crossvolume_disagreements'], 0)
        checks = {c['label']: c for c in self.audit['crossvolume_controls']}
        ops = checks['Operations core (OO1+OO2+CSSP) vs I-B Operations']
        self.assertEqual(ops['ic_php'], 528_316_707_000)
        self.assertEqual(ops['difference_php'], 0)
        self.assertEqual(self.audit['implied_personnel_services_php'],
                         14_922_297_000)

    def test_named_project_leaves(self):
        self.assertEqual(self.summary['named_project_leaves'], 15_972)
        self.assertEqual(self.summary['region_nodes'], 1_490)
        self.assertEqual(self.summary['office_nodes'], 3_570)
        self.assertEqual(self.summary['funding_leaves'], 51)

    def test_artifact_title_recovery(self):
        """The \\x00 first-line row on p490 recovers the full Paliueg title
        and the following Dacque/Annaronan row keeps its own title."""
        pal = [n for n in self._walk() if 'Paliueg' in n['label']]
        ann = [n for n in self._walk() if 'Annaronan' in n['label']]
        self.assertEqual(len(pal), 1)
        self.assertEqual(len(ann), 1)
        self.assertEqual(pal[0]['printed_amount_php'], 10_000_000)
        self.assertEqual(pal[0]['source']['pdf_page'], 490)
        self.assertTrue(pal[0]['label'].startswith('Construction of Concrete Road'))
        self.assertTrue(pal[0]['label'].endswith('City of Ilagan, Isabela'))
        self.assertIn('title_recovered_from_wraps', pal[0])
        self.assertEqual(ann[0]['printed_amount_php'], 5_000_000)
        self.assertTrue(ann[0]['label'].startswith('Concreting of Road with RCBC'))
        self.assertNotIn('Paliueg', ann[0]['label'])

    def test_continuations_stay_with_their_printed_project(self):
        page = [n for n in self._walk() if n['source']['pdf_page'] == 561]
        pangpang = next(n for n in page if 'Construction of Pangpang' in n['label'])
        agustin = next(n for n in page if 'San Agustin' in n['label'])
        self.assertEqual(pangpang['label'], 'Construction of Pangpang to Del Rosario Road, Barangay Pangpang, Dinaga and Del Rosario, Canaman, Camarines Sur')
        self.assertEqual(pangpang['printed_amount_php'], 20_000_000)
        self.assertEqual(agustin['label'], 'Construction of Road, Barangay San Agustin, Canaman, Camarines Sur')
        self.assertEqual(agustin['printed_amount_php'], 10_000_000)
        bridges = [n for n in page if n['label'].startswith('San Antonio Road along')]
        self.assertEqual(len(bridges), 2)
        self.assertIn('San Antonio Bridge 1', bridges[0]['label'])
        self.assertNotIn('San Antonio Bridge 1', bridges[1]['label'])
        self.assertIn('Sta. 1+214.10', bridges[1]['label'])

    def test_exact_echo_chain_nests_under_parent_with_same_level_detail(self):
        """Pre-Feasibility reprints NCR → Central Office at the same indent as
        its numbered activities. The echo chain must nest and own that detail
        so Regionwide traces Pre-Feasibility → NCR → CO → Regionwide."""
        pf = next(n for n in self._walk()
                  if n['label'].startswith('a. Pre-Feasibility Study / Feasibility Study'))
        self.assertEqual(len(pf['children']), 1)
        ncr = pf['children'][0]
        self.assertEqual(ncr['label'], 'National Capital Region')
        self.assertTrue(ncr.get('second_observation'))
        self.assertEqual(len(ncr['children']), 1)
        co = ncr['children'][0]
        self.assertEqual(co['label'], 'Central Office')
        self.assertTrue(co.get('second_observation'))
        labels = [c['label'] for c in co['children']]
        self.assertTrue(any(l.startswith('7. Regionwide / Nationwide') for l in labels))
        regionwide = next(c for c in co['children'] if c['label'].startswith('7. Regionwide'))
        self.assertEqual(regionwide['printed_amount_php'], 6_742_243_000)

    def test_mooe_s2o_banner_echo_owns_abc_under_central_office(self):
        """MOOE S2O reprints NCR → CO at a deeper indent than a/b/c; the
        parent-equal banner rule still nests a/b/c under Central Office."""
        mooe = next(n for n in self.artifact['root']['children']
                    if n['label'].startswith('MAINTENANCE'))
        s2o = next(n for n in mooe['children'] if n['label'] == 'SUPPORT TO OPERATIONS')
        self.assertEqual(len(s2o['children']), 1)
        ncr = s2o['children'][0]
        self.assertEqual(ncr['label'], 'National Capital Region')
        self.assertTrue(ncr.get('second_observation'))
        co = ncr['children'][0]
        self.assertEqual(co['label'], 'Central Office')
        self.assertTrue(co.get('second_observation'))
        labels = [c['label'] for c in co['children']]
        self.assertEqual(len(labels), 3)
        self.assertTrue(labels[0].startswith('a. Infrastructure Planning'))
        self.assertTrue(labels[1].startswith('b. Regional Support'))
        self.assertTrue(labels[2].startswith('c. Testing Materials'))
        self.assertEqual(sum(c['printed_amount_php'] for c in co['children']),
                         s2o['printed_amount_php'])

    def test_page_break_continuation_keeps_source_pages_and_amount(self):
        """p936–937 regression: 'Rehabilitation of DPWH Building, Iloilo 2nd
        District Engineering Office, …' is a PROJECT whose title contains the
        office designation — it must never be mistaken for an office echo.
        The office heading keeps its own row; the project keeps its
        page-breaking continuation line."""
        office = next(n for n in self._walk() if n['label'] == 'Iloilo 2nd District Engineering Office'
                      and n['source']['pdf_page'] == 936)
        self.assertEqual(office['kind'], 'office')
        self.assertEqual(office['printed_amount_php'], 25_075_000)
        self.assertEqual(len(office['children']), 1)
        project = office['children'][0]
        self.assertEqual(project['kind'], 'project')
        self.assertTrue(project['label'].startswith('Rehabilitation of DPWH Building'))
        self.assertTrue(project['label'].endswith('(10.844063, 122.657222)'))
        self.assertEqual(project['printed_amount_php'], 25_075_000)
        self.assertEqual(project['source']['pdf_page'], 937)
        self.assertEqual([r['pdf_page'] for r in project['source']['title_rows']], [937, 937])

    def test_school_and_coordinate_tails_do_not_cross_project_boundaries(self):
        page = [n for n in self._walk() if n['source']['pdf_page'] == 800]
        odicon = next(n for n in page if 'Odicon Elementary School' in n['label'])
        casureco = next(n for n in page if 'CASURECO' in n['label'])
        pablo = next(n for n in page if 'Barangay San Pablo' in n['label'])
        self.assertTrue(odicon['label'].startswith('Construction of Multi-Purpose Building'))
        self.assertIn('School I.D: 112910', odicon['label'])
        self.assertNotIn('112872', odicon['label'])
        self.assertTrue(casureco['label'].endswith('13.61931, 123.23213'))
        self.assertNotIn('123.23213', pablo['label'])
        self.assertEqual(pablo['label'], 'Construction of Multi-Purpose Building (Covered Court), Barangay San Pablo, Calabanga, Camarines Sur')
        self.assertEqual(sum(n.get('null_glyph_cleanup', False) for n in self._walk()), 4)
        self.assertEqual(sum(n.get('title_recovered_from_wraps', False) for n in self._walk()), 1)

    def test_classification_separates_controls_projects_and_funding(self):
        projects = [n for n in self._walk() if n['kind'] == 'project']
        self.assertTrue(all(not n['children'] for n in projects))
        self.assertEqual(len(projects), self.summary['named_project_leaves'])
        fap = [n for n in self._walk() if n['kind'] == 'fap_project']
        self.assertEqual(len(fap), 29)
        self.assertEqual(sum(n['printed_amount_php'] for n in fap), 44_749_011_000)
        self.assertTrue(all(n['children'] and all(c['kind'] == 'funding' for c in n['children']) for n in fap))
        self.assertTrue(all(n['label'] in ('GOP', 'Loan Proceeds') for n in self._walk() if n['kind'] == 'funding'))
        self.assertEqual(self.summary['zero_funding_observations'], 9)
        self.assertTrue(any(n['kind'] == 'region' and n['label'].startswith('10.') for n in self._walk()))

    def test_no_artifact_glyphs_in_labels(self):
        bad = [n for n in self._walk() if '\x00' in n['label']]
        self.assertEqual(bad, [])

    def test_written_artifact_matches_fresh_build(self):
        self.maxDiff = None
        self.assertEqual(json.dumps(self.artifact, sort_keys=True),
                         json.dumps(load(ARTIFACT), sort_keys=True))
        self.assertEqual(json.dumps(self.audit, sort_keys=True),
                         json.dumps(load(AUDIT), sort_keys=True))

    def _walk(self):
        def rec(n):
            yield n
            for c in n['children']:
                yield from rec(c)
        yield from rec(self.artifact['root'])


class NativeICExtractionTests(unittest.TestCase):
    """Tampering tests: mutate rows before outline construction; the audit
    must surface the damage rather than hiding it under a balanced root."""

    def altered_build(self, alter):
        rows = copy.deepcopy(SOURCE_ROWS)
        alter(rows)
        with patch.object(rollup, 'extract_rows', return_value=rows):
            return rollup.build()

    def test_project_amount_shift_breaks_office_control(self):
        def alter(rows):
            projs = [r for r in rows if r['page'] == 490 and r['x'] > 135
                     and r['amounts']]
            r = projs[0]
            r['amounts'] = [r['amounts'][-1] + 1_000_000]
        _, audit = self.altered_build(alter)
        self.assertGreater(audit['summary']['failed_nodes'], 0)

    def test_amount_row_moved_out_of_band_is_reported(self):
        def alter(rows):
            r = next(r for r in rows if r['page'] == 490 and r['x'] > 135
                     and r['amounts'])
            r['x'] = 200.0
        _, audit = self.altered_build(alter)
        self.assertGreater(audit['summary']['unexplained_amount_rows'], 0)

    def test_control_amount_tampering_fails_closing_check(self):
        def alter(rows):
            r = next(r for r in rows if r['text'] ==
                     'CONVERGENCE AND SPECIAL SUPPORT PROGRAM')
            r['amounts'] = [r['amounts'][-1] + 1_000]
        _, audit = self.altered_build(alter)
        self.assertGreater(audit['summary']['failed_nodes'], 0)
    def test_orphan_continuation_is_reported(self):
        def alter(rows):
            r = next(r for r in rows if r['page'] == 561 and 'Rosario, Canaman' in r['text'] and not r['amounts'])
            r['x'] = 20.0
        _, audit = self.altered_build(alter)
        self.assertEqual(audit['summary']['unexplained_title_rows'], 1)

    def altered_ib_build(self, alter):
        ib = load(rollup.IB_ROLLUP)
        alter(ib)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'ib.json'
            path.write_text(json.dumps(ib))
            # Keep provenance inside the repo while substituting read content.
            original = Path.read_text
            def read_text(p, *args, **kwargs):
                return path.read_text() if p == rollup.IB_ROLLUP else original(p, *args, **kwargs)
            with patch.object(rollup, 'extract_rows', return_value=SOURCE_ROWS), \
                    patch.object(Path, 'read_text', read_text):
                return rollup.build()

    def test_printed_ps_column_is_independent_of_implied_ps(self):
        _, audit = self.altered_ib_build(lambda ib: ib['root']['columns_php'].__setitem__('ps', 14_922_298_000))
        self.assertIn('Implied PS vs I-B PS column', {c['label'] for c in audit['crossvolume_failures']})

    def test_offsetting_pap_changes_do_not_hide_under_operations_total(self):
        def alter(ib):
            nodes = list(rollup._ib_control_iter(ib['root']))
            paps = [n for n in nodes if n['kind'] == 'pap']
            paps[0]['columns_php']['co'] += 1_000
            paps[1]['columns_php']['co'] -= 1_000
        _, audit = self.altered_ib_build(alter)
        self.assertEqual(len([c for c in audit['crossvolume_failures'] if c['label'].startswith('PAP/program:')]), 2)



if __name__ == '__main__':
    unittest.main()
