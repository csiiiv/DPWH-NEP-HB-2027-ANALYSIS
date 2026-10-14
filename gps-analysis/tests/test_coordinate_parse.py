"""Parse-core regressions (mirrors FMR coordinate format coverage)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import coordinate_parse as cp  # noqa: E402


class ParseCoreTests(unittest.TestCase):
    def test_decimal_lat_lon_and_reorder(self):
        p = cp.parse_pairs("18.284622, 120.625421")[0]
        self.assertEqual(p["latitude"], 18.284622)
        self.assertEqual(p["longitude"], 120.625421)
        self.assertFalse(p["issues"])

        reordered = cp.parse_pairs("120.625421, 18.284622")[0]
        self.assertEqual(reordered["latitude"], 18.284622)
        self.assertEqual(reordered["longitude"], 120.625421)
        self.assertIn("longitude_first_reordered", reordered["rules"])

    def test_dms_and_spacing(self):
        p = cp.parse_pairs("13°08'05\"N, 121°08'05\"E")[0]
        self.assertAlmostEqual(p["latitude"], 13 + 8 / 60 + 5 / 3600, places=6)
        self.assertAlmostEqual(p["longitude"], 121 + 8 / 60 + 5 / 3600, places=6)
        spaced = cp.parse_pairs("16. 259313, 120. 123456")[0]
        self.assertEqual(spaced["latitude"], 16.259313)

    def test_spaced_ocr_dms_is_one_pair_not_four_points(self):
        # NEP OCR prints degree/minute/second symbols with surrounding spaces.
        pts = cp.parse_pairs("11 ° 46 ' 32.00 \" N, 124 ° 53 ' 6.04 \" E")
        self.assertEqual(len(pts), 1)
        self.assertAlmostEqual(pts[0]["latitude"], 11 + 46 / 60 + 32 / 3600, places=9)
        self.assertAlmostEqual(pts[0]["longitude"], 124 + 53 / 60 + 6.04 / 3600, places=9)
        self.assertNotIn("outside_philippines_orientation_bounds", pts[0]["issues"])

    def test_endpoint_observations(self):
        points = cp.endpoint_observations(
            "START: 18.284622, 120.625421\nEND: 18.287494, 120.628232"
        )
        self.assertEqual([p["role"] for p in points], ["start", "end"])
        self.assertEqual(points[0]["longitude"], 120.625421)

    def test_invalid_residue(self):
        p = cp.parse_pairs("13.123, 121.123 garbage")[0]
        self.assertIn("unparsed_coordinate_fragment", p["issues"])
        self.assertIsNone(p["latitude"])


if __name__ == "__main__":
    unittest.main()
