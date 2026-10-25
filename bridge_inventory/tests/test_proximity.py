"""Nearest-edge ranking, distinct administrative units, and metric distance checks."""
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from analyze_proximity import nearest_units


class ProximityTests(unittest.TestCase):
    def polygons(self):
        import geopandas as gpd
        from shapely.geometry import box
        return gpd.GeoDataFrame({
            'adm1_psgc': [1] * 5, 'adm2_psgc': [2] * 5, 'adm3_psgc': [3] * 5,
            'adm4_psgc': [11, 11, 12, 13, 14],
            'adm4_en': ['Long polygon', 'Long polygon', 'West', 'East', 'North'],
        }, geometry=[box(1, 0, 1001, 1), box(50, 20, 60, 30), box(-5, -1, -4, 1),
                     box(10, -1, 11, 1), box(-1, 10, 1, 11)], crs=32651)

    def test_edge_distance_not_centroid_and_distinct_units(self):
        from shapely.geometry import Point
        polygons = self.polygons()
        before = list(polygons.geometry.to_wkb())
        candidates, search = nearest_units(Point(0, 0), polygons)
        self.assertEqual([c['source_code'] for c in candidates], ['11', '12', '13'])
        self.assertEqual([c['distance_to_edge_m'] for c in candidates], [1, 4, 10])
        self.assertEqual(candidates[0]['nearest_edge_xy'], [1, 0])
        self.assertEqual(search['last_selected_distance_tie_count'], 2)
        self.assertEqual(list(polygons.geometry.to_wkb()), before)

    def test_search_expands_for_farther_candidates(self):
        from shapely.geometry import Point
        candidates, search = nearest_units(Point(10000, 10000), self.polygons())
        self.assertEqual(len(candidates), 3)
        self.assertGreater(search['search_radius_m'], 25)
        self.assertGreater(candidates[0]['distance_to_polygon_m'], 1000)

    def test_reject_geographic_degree_distances(self):
        from shapely.geometry import Point
        with self.assertRaisesRegex(ValueError, 'projected metre'):
            nearest_units(Point(0, 0), self.polygons().to_crs(4326))


if __name__ == '__main__':
    unittest.main()
