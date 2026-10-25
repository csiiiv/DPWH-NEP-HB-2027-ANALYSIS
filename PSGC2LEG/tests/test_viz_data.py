import json
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class VisualizationDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads(
            (ROOT / "data" / "legislative_districts.json").read_text(encoding="utf-8")
        )["districts"]
        cls.geojson = json.loads(
            (ROOT / "viz" / "leg_districts.geojson").read_text(encoding="utf-8")
        )
        cls.report = json.loads(
            (ROOT / "viz" / "geometry_report.json").read_text(encoding="utf-8")
        )

    def test_one_nonempty_feature_per_catalog_district(self):
        features = self.geojson["features"]
        expected = {row["leg_id"] for row in self.catalog}
        actual = [feature["properties"]["leg_id"] for feature in features]
        self.assertEqual(254, len(features))
        self.assertEqual(254, len(set(actual)))
        self.assertEqual(expected, set(actual))
        for feature in features:
            self.assertIn(feature["geometry"]["type"], {"Polygon", "MultiPolygon"})
            self.assertTrue(feature["geometry"]["coordinates"])
            self.assertFalse(feature["properties"].get("split", False))

    def test_metro_manila_district_counts(self):
        counts = Counter(
            feature["properties"]["jurisdiction"]
            for feature in self.geojson["features"]
        )
        expected = {
            "Manila": 6,
            "Quezon City": 6,
            "Caloocan": 3,
            "Makati": 2,
            "Marikina": 2,
            "Parañaque": 2,
            "Taguig–Pateros": 2,
            "Valenzuela": 2,
        }
        self.assertEqual(expected, {name: counts[name] for name in expected})

    def test_split_city_assignments_and_geometry_are_complete(self):
        assignment_report = json.loads(
            (ROOT / "data" / "assignment_report.json").read_text(encoding="utf-8")
        )
        split = assignment_report["split_city_barangay_assignments"]
        self.assertEqual(13, len(split))
        self.assertEqual(1814, assignment_report["split_city_barangays_assigned"])
        for city in split.values():
            self.assertEqual(city["catalog_barangays"], city["assigned"])
            self.assertEqual([], city["missing"])

        self.assertEqual(254, self.report["district_features"])
        self.assertEqual(254, self.report["catalog_districts"])
        self.assertEqual(0, self.report["unresolved_split_cities"])
        self.assertEqual(13, len(self.report["split_city_coverage"]))


if __name__ == "__main__":
    unittest.main()
