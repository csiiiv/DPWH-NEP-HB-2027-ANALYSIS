import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DATASET = HERE / 'data/nia_geolocation_map.json'
GEOLOCATION = HERE / 'data/nia_geolocation.json'


class NiaGeolocationMapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATASET.read_text())
        cls.geolocation = json.loads(GEOLOCATION.read_text())

    def test_every_located_row_has_coordinates(self):
        records = self.data['records']
        self.assertEqual(self.data['summary']['with_coordinates'],
                         sum(1 for r in records if r['located']))
        for record in records:
            if record['located']:
                self.assertIsNotNone(record['coordinates'], record['id'])
            else:
                self.assertIsNone(record['coordinates'])

    def test_coordinates_within_philippine_bounds(self):
        for record in self.data['records']:
            coordinate = record['coordinates']
            if coordinate:
                lon, lat = coordinate
                self.assertTrue(117 <= lon <= 127 and 4 <= lat <= 19, record['id'])

    def test_anchors_and_flags_consistent(self):
        for record in self.data['records']:
            anchor = record['coordinate_anchor']
            if record['coordinates']:
                self.assertIn(anchor, ('barangay', 'municipality'))
                if anchor == 'municipality':
                    self.assertIn('municipality_level_anchor', record['flags'])
            else:
                self.assertIsNone(anchor)

    def test_rows_mirror_geolocation_layer(self):
        by_id = {r['id']: r for r in self.geolocation['records']}
        self.assertEqual(len(self.data['records']), len(by_id))
        for record in self.data['records']:
            source = by_id[record['id']]
            self.assertEqual(record['located'], source['located'])
            self.assertEqual(record['psgc'], source['psgc'])


if __name__ == '__main__':
    unittest.main()
