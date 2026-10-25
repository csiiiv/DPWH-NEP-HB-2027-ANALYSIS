"""Identity, observation-grain, and spatial ambiguity regression cases."""
import importlib.util
from pathlib import Path
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'match_projects.py'
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location('match_projects', SCRIPT)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def project(title, kind='project'):
    return {'record_id': 'test:1', 'dataset': 'test', 'title': title, 'record_kind': kind,
            'amount_php': 123, 'source_dataset': 'retained.json', 'source': {'pdf_page': 5}}


def bridge(code):
    return {'attributes': {'BRIDGE_ID': code, 'OBJECTID': 7, 'BR_NAME': 'Test Br.',
                           'ROAD_NAME': 'Test Rd'}, 'longitude': 120.5, 'latitude': 15.5}


class MatchTests(unittest.TestCase):
    def test_multiple_ids_preserve_missing_references_and_observation(self):
        title = 'Repair Test Br. (b00001lz), B00002LZ and B00001LZ'
        row = module.match_project(project(title), {'B00001LZ': bridge('B00001LZ')})
        self.assertEqual(row['status'], 'partial_id_match')
        self.assertEqual(row['bridge_ids'], ['B00001LZ', 'B00002LZ'])
        self.assertEqual(row['missing_bridge_ids'], ['B00002LZ'])
        self.assertEqual(len(row['matches']), 1)
        self.assertEqual(row['title'], title)
        self.assertEqual(row['amount_php'], 123)
        self.assertEqual(row['matches'][0]['longitude'], 120.5)
        self.assertEqual(row['matches'][0]['latitude'], 15.5)

    def test_bridge_name_alone_does_not_create_identity(self):
        row = module.match_project(project('Repair Test Bridge'), {'B00001LZ': bridge('B00001LZ')})
        self.assertEqual(row['status'], 'bridge_mention_without_id')
        self.assertEqual(row['matches'], [])

    def test_unknown_id_does_not_create_coordinates(self):
        row = module.match_project(project('Test Br. (B99999LZ)'), {})
        self.assertEqual(row['status'], 'id_not_in_inventory')
        self.assertEqual(row['matches'], [])

    def test_allocation_has_no_site_assignment(self):
        self.assertIsNone(module.match_project(project('Bridge Program B00001LZ', 'allocation'),
                                               {'B00001LZ': bridge('B00001LZ')}))

    def test_partial_id_substrings_are_not_accepted(self):
        self.assertEqual(module.candidate_ids('AB00001LZ B00001LZ0 B0001LZ'), [])

    def test_inventory_spatial_disagreement_is_retained(self):
        row = {'inventory_locality': {'BRGY': 'Estancia', 'MUNICIPAL': 'Pasuquin',
                                     'PROVINCE': 'Ilocos Norte', 'REGION': 'Region I'},
               'polygon_hits': {k: [{'name': name}] for k, name in
                   [('barangay', 'Susugaen'), ('municipality_city', 'Pasuquin'),
                    ('province', 'Ilocos Norte'), ('region', 'Region I (Ilocos Region)')]},
               'review_flags': []}
        comparison = module.compare_inventory(row)
        self.assertEqual(comparison['barangay']['status'], 'name_differs')
        self.assertEqual(comparison['region']['status'], 'normalized_name_agreement')
        self.assertIn('inventory_barangay_name_differs_from_polygon', row['review_flags'])
        self.assertEqual(row['inventory_locality']['BRGY'], 'Estancia')

    def test_catalog_candidates_follow_parent_links_and_keep_current_codes(self):
        catalog = module.Catalog([
            {'code': '0100000000', 'name': 'Region I', 'level': 'region', 'parent_code': None},
            {'code': '0102800000', 'name': 'Ilocos Norte', 'level': 'province', 'parent_code': '0100000000'},
            {'code': '0102817000', 'name': 'Pasuquin', 'level': 'municipality', 'parent_code': '0102800000'},
            {'code': '0102817032', 'name': 'Susugaen', 'level': 'barangay', 'parent_code': '0102817000'},
            {'code': '0102818000', 'name': 'Other Town', 'level': 'municipality', 'parent_code': '0102800000'},
            {'code': '0102818001', 'name': 'Susugaen', 'level': 'barangay', 'parent_code': '0102818000'},
        ])
        row = {'polygon_hits': {k: [{'name': name, 'source_code': 'unrelated-historical-code', 'relation': 'within'}]
                               for k, name in [('barangay', 'Susugaen'), ('municipality_city', 'Pasuquin'),
                                               ('province', 'Ilocos Norte')]}}
        candidates = catalog.candidates(row)
        self.assertEqual([c['code'] for c in candidates], ['0102817032'])
        row['polygon_hits']['province'][0]['name'] = 'Other Province'
        self.assertEqual(catalog.candidates(row), [])
        row['polygon_hits']['province'][0]['name'] = 'Ilocos Norte'
        row['polygon_hits']['barangay'][0]['relation'] = 'boundary_touch'
        self.assertEqual(catalog.candidates(row), [])

    def test_polygon_touches_overlaps_and_gaps_remain_distinct(self):
        import geopandas as gpd
        from shapely.geometry import Point, box
        polygons = gpd.GeoDataFrame({'code': [1, 2], 'name': ['West', 'East']},
                                   geometry=[box(120, 15, 121, 16), box(121, 15, 122, 16)], crs=4326)
        points = gpd.GeoDataFrame(index=['inside', 'boundary', 'outside'],
                                 geometry=[Point(120.5, 15.5), Point(121, 15.5), Point(123, 15.5)], crs=4326)
        hits = module.locate(points, polygons, 'code', 'name')
        self.assertEqual(hits['inside'], [{'source_code': '1', 'name': 'West', 'relation': 'within'}])
        self.assertEqual(len(hits['boundary']), 2)
        self.assertEqual({h['relation'] for h in hits['boundary']}, {'boundary_touch'})
        self.assertNotIn('outside', hits)
        projected = module.locate(points, polygons.to_crs(32651), 'code', 'name')
        self.assertEqual(projected['inside'][0]['name'], 'West')


if __name__ == '__main__':
    unittest.main()
