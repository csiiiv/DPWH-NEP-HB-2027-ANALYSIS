import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fmr_workbench', HERE / 'build_fmr_workbench.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def project(identifier, title='Road A', region='I', coordinates=None, status='normalized'):
    return {'id':identifier,'title':title,'region_key':region,'coordinates':coordinates or [[[120.1,18.1],[120.2,18.2]]],
            'status':status,'review_flags':[] if status=='normalized' else ['source_numeric_repair_candidate'],'amount_php':10}


class FmrWorkbenchTests(unittest.TestCase):
    def test_different_region_never_pairs(self):
        rows = builder.match_projects([project('n')],[project('h',region='II')])
        self.assertEqual({r['status'] for r in rows},{'nep_only','house_only'})

    def test_duplicate_keys_are_retained_without_forcing_pair(self):
        rows = builder.match_projects([project('n1'),project('n2')],[project('h1'),project('h2')])
        self.assertEqual(len(rows),4)
        self.assertTrue(all(r['ambiguous_title'] for r in rows))

    def test_review_coordinates_cannot_pair_renamed_projects(self):
        rows = builder.match_projects([project('n',status='needs_review')],[project('h',title='Different road')])
        self.assertEqual(len(rows),2)

    def test_title_candidate_stays_distinct_from_coordinate_agreement(self):
        rows = builder.match_projects([project('n')],[project('h',coordinates=[[[120.3,18.1],[120.4,18.2]]])])
        self.assertEqual(rows[0]['method'],'title')

    def test_clean_coordinate_candidate_keeps_both_source_ids(self):
        rows = builder.match_projects([project('n')],[project('h',title='Renamed road')])
        self.assertEqual(rows[0]['method'],'coordinates')
        self.assertEqual((rows[0]['nep_id'],rows[0]['house_id']),('n','h'))

    def test_retained_ledgers_partition_and_reconcile(self):
        data = builder.build()
        summary = data['comparison_summary']
        self.assertEqual(summary['paired_delta_php'] + summary['house_only_php'] - summary['nep_only_php'],3628100000)
        self.assertEqual(sum(r['delta_php'] for r in data['regions']),summary['delta_php'])
        for stage,count,total,review in [('nep',704,16000000000,0),('house',964,19628100000,2)]:
            projects = data['stages'][stage]['projects']
            self.assertEqual(len(projects),count)
            self.assertEqual(sum(p['amount_php'] for p in projects),total)
            self.assertEqual(sum(p['status']=='needs_review' for p in projects),review)
            ids = [r[f'{stage}_id'] for r in data['comparison'] if r[f'{stage}_id']]
            self.assertEqual(len(ids),len(set(ids)))
            self.assertEqual(set(ids),{p['id'] for p in projects})

    def test_coordinate_provenance_survives_workbench_packaging(self):
        data = builder.build()
        nep = {p['id']: p for p in data['stages']['nep']['projects']}
        house = {p['id']: p for p in data['stages']['house']['projects']}
        # Pre-normalizer flag resolved by an explicit interpretation rule.
        typo = nep['nep_fmr:p1:r11']
        self.assertEqual(typo['status'], 'normalized')
        self.assertIn('nonstandard_endpoint_marker', typo['original_review_flags'])
        self.assertIn('endpoint_marker_typo_normalized', typo['normalization_rules'])
        self.assertEqual(typo['review_flags'], [])
        self.assertTrue(typo['points'])
        self.assertIn('endpoint_marker_typo_normalized', typo['points'][0]['rules'])
        # Longitude-first source values keep the original flag + reorder rule.
        reorder = house['ib:p669:r17']
        self.assertIn('out_of_range_or_reversed_decimal_pair', reorder['original_review_flags'])
        self.assertIn('longitude_first_reordered', reorder['normalization_rules'])
        self.assertEqual(reorder['points'][0]['longitude'], 120.58051)
        self.assertEqual(reorder['points'][0]['latitude'], 18.20349)

    def test_whole_corpus_psgc_attaches_to_every_project(self):
        data = builder.build()
        for stage in ('nep', 'house'):
            projects = data['stages'][stage]['projects']
            missing = [p['id'] for p in projects if not p.get('psgc') or not p.get('location_agreement')]
            self.assertEqual(missing, [], f'{stage} projects missing PSGC: {missing[:5]}')
        # Clean Bacarra row carries an AGREE printed point from the final dataset.
        clean = next(p for p in data['stages']['house']['projects'] if p['id'] == 'ib:p667:r5')
        self.assertEqual(clean['location_agreement'], 'ALL_POINTS_AGREE')
        self.assertEqual(clean['psgc'][0]['verdict'], 'AGREE')
        self.assertIn('Bacarra', clean['psgc'][0]['where'])
        # Remaining manual-review row still carries its candidate repair evidence.
        flagged = next(p for p in data['stages']['house']['projects'] if p['id'] == 'ib:p723:r3')
        self.assertEqual(flagged['status'], 'needs_review')
        self.assertTrue(any(pt.get('kind') == 'candidate_repair' for pt in flagged['psgc']))
        # Accepted off-by-one repair clears the Escoda distance flag.
        escoda = next(p for p in data['stages']['house']['projects'] if p['id'] == 'ib:p667:r7')
        self.assertEqual(escoda['status'], 'normalized')
        self.assertIn('off_by_one_digit_repair_accepted', escoda['normalization_rules'])


if __name__ == '__main__':
    unittest.main()
