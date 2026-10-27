"""Administrative office context scopes title candidates without district feedback."""
from copy import deepcopy
import unittest

from master_list.tests.test_location_interpretations import catalog
from master_list.tests import test_context_scoring as fixtures
from build_location_interpretations import Interpreter
from office_context import OfficeResolver, office_assessment, office_key


class OfficeContext(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ContextScoring()
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.resolver = self.engine.offices

    def test_deo_abbreviation_ordinals_prefix_and_unicode_are_exact_aliases(self):
        self.assertEqual(office_key('a. Iloilo First District Engineering Office'), office_key('Iloilo 1st DEO'))
        self.assertEqual(office_key('Las Pi ñ as-Muntinlupa District Engineering Office'),
                         office_key('Las Piñas Muntinlupa DEO'))

    def test_explicit_city_and_province_deos_remain_distinct(self):
        city = self.resolver.resolve({'DEO':'Iloilo City DEO'})
        province = self.resolver.resolve({'DEO':'Iloilo 1st DEO'})
        self.assertEqual([p['code'] for p in city['named_locations']], ['hc'])
        self.assertEqual([p['code'] for p in province['named_locations']], ['pi'])
        self.assertEqual(office_assessment('bh',city,self.engine.matcher)['state'], 'agrees')
        self.assertEqual(office_assessment('bh',province,self.engine.matcher)['state'], 'no_province_parent')

    def test_reversed_province_modifiers_and_mountain_abbreviation_are_catalog_aliases(self):
        rows=catalog()+[dict(code='pm1',name='Oriental Mindoro',level='province',parent_code='r1'),
                        dict(code='pm2',name='Occidental Mindoro',level='province',parent_code='r1'),
                        dict(code='pm3',name='Mountain Province',level='province',parent_code='r1')]
        engine=Interpreter(rows)
        for label,code in [('Mindoro Oriental DEO','pm1'),('Mindoro Occidental DEO','pm2'),('Mt. Province DEO','pm3')]:
            office=engine.offices.resolve({'DEO':label})
            self.assertEqual([p['code'] for p in office['named_locations']],[code])
            self.assertTrue(office['sources'][0]['geographic_aliases'])
            self.assertEqual(office['sources'][0]['raw'],label)
        aliases=engine.offices.resolve({'DEO':'Mindoro Oriental DEO',
            'implementing_office':'Oriental Mindoro District Engineering Office'})
        self.assertEqual(aliases['resolution'],'resolved')
        self.assertNotIn('source_office_labels_disagree',aliases['warnings'])

    def test_source_document_province_misspellings_are_reviewed_aliases(self):
        """Province names are misspelled in DPWH office labels (Siguijor,
        Marindugue, Occidenatal, Batagas, Ilolilo). The repair list is the
        repo's single label-normalization home, applied at join time only;
        the source label itself is retained unchanged."""
        rows=catalog()+[dict(code='ps1',name='Siquijor',level='province',parent_code='r1'),
                        dict(code='pm4',name='Marinduque',level='province',parent_code='r1'),
                        dict(code='pm5',name='Misamis Occidental',level='province',parent_code='r1'),
                        dict(code='pm6',name='Batangas',level='province',parent_code='r1')]
        engine=Interpreter(rows)
        for label,code in [('Siguijor District Engineering Office','ps1'),
                           ('Marindugue District Engineering Office','pm4'),
                           ('Misamis Occidenatal 2nd District Engineering Office','pm5'),
                           ('Batagas 2nd District Engineering Office','pm6'),
                           ('Ilolilo 2nd District Engineering Office','pi')]:
            office=engine.offices.resolve({'DEO':label})
            self.assertEqual([p['code'] for p in office['named_locations']],[code])
            self.assertEqual(office['sources'][0]['raw'],label)
            self.assertTrue(office['sources'][0]['geographic_aliases'])
        clean=engine.offices.resolve({'DEO':'Siquijor District Engineering Office'})
        self.assertEqual(clean['resolution'],'resolved')

    def test_nested_same_city_alias_is_one_administrative_association(self):
        rows=catalog()+[dict(code='hc_inner',name='City of Iloilo',level='city',parent_code='hc')]
        office=Interpreter(rows).offices.resolve({'DEO':'Iloilo City DEO'})
        self.assertEqual(office['resolution'],'resolved')
        self.assertEqual([p['code'] for p in office['named_locations']],['hc'])

    def test_codebook_name_normalization_has_provenance(self):
        engine = Interpreter(catalog(), {'X':{'region_name':'Region I','districts':{'A':'Iloilo City DEO'}}})
        office = engine.offices.resolve({'implementing_office':'b. Iloilo City District Engineering Office'})
        self.assertEqual(office['sources'][0]['canonical_names'], ['Iloilo City DEO'])
        self.assertEqual(office['sources'][0]['codebook_match'], 'exact_normalized')

    def test_source_aliases_are_one_context_contribution(self):
        record = self.fixture.record('Works, Barangay Javellana',region='',office='Iloilo City District Engineering Office')
        record['DEO']='Iloilo City DEO'
        record['analysis_record']={'office':'Iloilo City DEO','office_canonical':'Iloilo City District Engineering Office'}
        profile=self.engine.assess(record)
        candidate=next(c for c in profile['candidates'] if c['code']=='bh')
        self.assertEqual(candidate['office_context'],'agrees')
        self.assertIn('bh',set(profile['review_suggestion_codes']) | {
            c['code'] for c in profile['candidates'] if c['master_selected']})
        self.assertEqual(candidate['score_assessment']['dimensions']['context'],1)
        self.assertEqual(len(profile['context']['office']['sources']),4)
        self.assertIsNone(profile['context_scoring']['proposed_code'])

    def test_raw_deo_can_scope_barangay_review_without_coordinates(self):
        record=self.fixture.record('Road, Barangay Poblacion',region='')
        record['source']={'DEO':'North Province DEO'}
        profile=self.engine.assess(record)
        self.assertIn('b1',profile['review_suggestion_codes'])
        self.assertNotIn('b2',profile['review_suggestion_codes'])
        candidate=next(c for c in profile['candidates'] if c['code']=='b1')
        self.assertEqual(candidate['score_assessment']['dimensions']['context'],1)
        self.assertIsNone(profile['context_scoring']['proposed_code'])

    def test_office_only_does_not_create_a_site(self):
        record=self.fixture.record('Road widening',office='Iloilo City DEO')
        profile=self.engine.assess(record)
        self.assertEqual(profile['candidates'],[])
        self.assertIsNone(profile['context_scoring']['best_candidate_code'])

    def test_ambiguous_non_deo_label_does_not_supply_numeric_evidence(self):
        office=self.resolver.resolve({'implementing_office':'Iloilo Office'})
        self.assertEqual(office['resolution'],'ambiguous')
        self.assertEqual(office_assessment('bh',office,self.engine.matcher)['state'],'possible_agreement')

    def test_conflicting_source_labels_are_preserved_and_unscored(self):
        record=self.fixture.record('Road, Barangay Poblacion',region='',office='North Province DEO')
        record['DEO']='South Province DEO'
        profile=self.engine.assess(record)
        self.assertEqual(profile['context']['office']['resolution'],'source_conflict')
        self.assertTrue(profile['context_scoring']['has_office_review'])
        self.assertTrue(all(c['office_context']=='not_assessed' for c in profile['candidates']))
        self.assertEqual(len(profile['context']['office']['sources']),2)

    def test_unknown_office_remains_reviewable_even_without_site_candidates(self):
        record=self.fixture.record('Road widening',office='Uncatalogued DEO')
        profile=self.engine.assess(record)
        self.assertEqual(profile['candidates'],[])
        self.assertTrue(profile['context_scoring']['has_office_review'])

    def test_central_and_regional_offices_do_not_create_specific_hints(self):
        for label,state in [('Central Office','central_office'),('Regional Office I','broad_region_only')]:
            office=self.resolver.resolve({'DEO':label})
            self.assertEqual(office['resolution'],state)
            self.assertEqual(office['named_locations'],[])
            self.assertNotEqual(office_assessment('b1',office,self.engine.matcher)['state'],'agrees')

    def test_metropolitan_label_is_not_misread_as_manila_city(self):
        rows=catalog()+[{'code':'rn','name':'National Capital Region (NCR)','level':'region','parent_code':None},
                        {'code':'manila','name':'City of Manila','level':'city','parent_code':'rn'}]
        engine=Interpreter(rows)
        office=engine.offices.resolve({'DEO':'Metro Manila 1st DEO'})
        self.assertEqual(office['resolution'],'broad_region_only')
        self.assertEqual(office['named_locations'],[])
        self.assertEqual(office['region_codes'],['rn'])

    def test_compact_regional_label_keeps_a_broad_region_hint(self):
        engine=Interpreter(catalog()+[{'code':'r4','name':'Region IV-A (CALABARZON)',
                                      'level':'region','parent_code':None}])
        office=engine.offices.resolve({'DEO':'Regional Office IVA'})
        self.assertEqual(office['resolution'],'broad_region_only')
        self.assertEqual(office['region_codes'],['r4'])
        self.assertEqual(office['named_locations'],[])

    def test_two_city_names_are_retained_as_administrative_associations(self):
        rows=catalog()+[{'code':'hc2','name':'City of Another','level':'city','parent_code':'r1'}]
        engine=Interpreter(rows)
        office=engine.offices.resolve({'DEO':'Iloilo City-Another City DEO'})
        self.assertEqual(office['resolution'],'multiple_named_places')
        self.assertEqual({p['code'] for p in office['named_locations']},{'hc','hc2'})
        self.assertEqual(office_assessment('bh',office,engine.matcher)['state'],'agrees')

    def test_old_codebook_region_does_not_relocate_or_drop_a_named_place(self):
        engine=Interpreter(catalog(),{'X':{'region_name':'Region II','districts':{'A':'Iloilo City DEO'}}})
        office=engine.offices.resolve({'DEO':'Iloilo City DEO'})
        self.assertEqual(office['named_locations'][0]['code'],'hc')
        self.assertIn('codebook_region_differs_from_current_catalog',office['warnings'])
        self.assertEqual(office_assessment('bh',office,engine.matcher)['state'],'agrees')

    def test_legislative_fields_cannot_change_candidates_scores_or_office_context(self):
        record=self.fixture.record('Road, Barangay Poblacion',office='North Province DEO')
        before=self.engine.assess(record)
        changed=deepcopy(record)
        changed['CONG_DIST']='Unrelated district'
        changed['legislative_district']={'leg_id':'unrelated'}
        changed['analysis_record']={'CONG_DIST':'Another district'}
        changed['source']={'CONG_DIST':'A third district'}
        self.assertEqual(self.engine.assess(changed),before)


if __name__=='__main__':
    unittest.main()
