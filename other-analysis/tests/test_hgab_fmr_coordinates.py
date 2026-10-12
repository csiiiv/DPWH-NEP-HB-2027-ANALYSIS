"""Coordinate interpretation and full-ledger coverage regressions."""
import csv
import importlib.util
import io
import json
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "normalize_hgab_fmr_coordinates.py"
spec = importlib.util.spec_from_file_location("normalizer", SCRIPT)
normalizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(normalizer)


class CoordinateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.artifacts, cls.audit = normalizer.build()
        cls.data = json.loads(cls.artifacts["hgab_fmr_coordinates_normalized.json"])
        cls.projects = {p["project_id"]: p for p in cls.data["projects"]}

    def test_complete_projects_segments_points_and_unchanged_budget(self):
        self.assertTrue(self.audit["passed"])
        summary = self.audit["summary"]
        self.assertEqual(summary["projects"], 964)
        self.assertEqual(summary["segments"], 1004)
        self.assertEqual(summary["points"], 2007)
        self.assertEqual(summary["multi_segment_projects"], 26)
        self.assertEqual(summary["project_total_php"], 19_628_100_000)
        self.assertEqual(summary["normalized_projects"], 962)
        self.assertEqual(summary["projects_needing_review"], 2)
        self.assertEqual(summary["original_83_flagged_projects_resolved"], 81)
        self.assertEqual(summary["digit_repairs_accepted"], 13)
        original = json.loads(normalizer.INPUT.read_text())
        for source in original["nodes"]:
            if source["kind"] == "project":
                self.assertEqual(source["coordinates_raw"], self.projects[source["id"]]["coordinates_raw"])

    def test_decimal_longitude_first_and_spacing(self):
        p = self.projects["ib:p669:r17"]
        self.assertEqual(p["start_longitude"], 120.58051)
        self.assertEqual(p["start_latitude"], 18.20349)
        self.assertEqual(p["status"], "normalized")
        spaced = normalizer.parse_pairs("16. 259313, 119.971428")[0]
        self.assertEqual(spaced["latitude"], 16.259313)
        self.assertEqual(spaced["longitude"], 119.971428)

    def test_dms_smart_quotes_and_no_degree_or_hemisphere_symbols(self):
        smart = normalizer.parse_pairs('13°51’06.55”N, 121°08’43.75”E')[0]
        self.assertAlmostEqual(smart["latitude"], 13 + 51 / 60 + 6.55 / 3600, places=9)
        self.assertAlmostEqual(smart["longitude"], 121 + 8 / 60 + 43.75 / 3600, places=9)
        bare = normalizer.parse_pairs('13 51 \'39.52", 121 54\'20.64"')[0]
        self.assertAlmostEqual(bare["longitude"], 121 + 54 / 60 + 20.64 / 3600, places=9)
        self.assertFalse(bare["issues"])
        p = self.projects["ib:p693:r18"]
        self.assertEqual(p["segment_count"], 2)
        self.assertEqual(p["point_count"], 4)
        self.assertEqual(p["status"], "normalized")

    def test_dot_dms_separator_and_missing_seconds_quote(self):
        p = self.projects["ib:p726:r9"]
        self.assertEqual(p["status"], "normalized")
        self.assertAlmostEqual(p["start_latitude"], 8 + 54 / 60 + 22.32 / 3600, places=9)
        self.assertAlmostEqual(p["start_longitude"], 125 + 29 / 60 + 41.134 / 3600, places=9)
        self.assertIn("dms_seconds_quote_restored", p["normalization_rules"])

    def test_explicit_parenthesized_prefix_and_suffix_section_pairing(self):
        for project_id, count in [("ib:p678:r10", 2), ("ib:p670:r2", 2), ("ib:p697:r11", 5), ("ib:p695:r7", 4)]:
            p = self.projects[project_id]
            self.assertEqual(p["segment_count"], count)
            self.assertEqual(p["point_count"], count * 2)
            self.assertIsNone(p["start_longitude"])
            self.assertTrue(all(s["pairing_basis"] == "explicit_section" for s in p["segments"]))
            self.assertEqual(p["status"], "normalized")
        p = self.projects["ib:p678:r10"]
        self.assertEqual(p["segments"][0]["end_latitude"], 16.466869)
        self.assertEqual(p["segments"][1]["end_latitude"], 16.468489)

    def test_coordinate_arrays_keep_segments_and_longitude_first(self):
        p = self.projects["ib:p678:r10"]
        self.assertEqual(p["coordinates"], [
            [[121.783702, 16.464822], [121.805868, 16.466869]],
            [[121.809653, 16.467103], [121.810549, 16.468489]]])
        self.assertEqual(p["segments"][0]["coordinates"], p["coordinates"][0])
        self.assertEqual(self.projects["ib:p670:r4"]["coordinates"][0][1], [120.53601, 18.153581])
        self.assertEqual(self.projects["ib:p689:r18"]["coordinates"], [[[120.396365, 15.713972]]])
        csv_rows = list(csv.DictReader(io.StringIO(self.artifacts["hgab_fmr_projects_normalized.csv"])))
        csv_project = next(r for r in csv_rows if r["project_id"] == p["project_id"])
        self.assertEqual(json.loads(csv_project["coordinates_json"]), p["coordinates"])

    def test_unlabelled_lists_pair_in_order_and_do_not_become_a_polyline(self):
        p = self.projects["ib:p695:r4"]
        self.assertEqual(p["segment_count"], 4)
        self.assertTrue(all(s["pairing_basis"] == "source_list_order" for s in p["segments"]))
        self.assertEqual(p["segments"][0]["start_latitude"], 14.087951)
        self.assertEqual(p["segments"][0]["end_latitude"], 14.086705)
        self.assertEqual(p["segments"][3]["start_latitude"], 14.08412)

    def test_station_inference_and_single_point_are_distinct(self):
        stations = self.projects["ib:p718:r6"]
        self.assertEqual(stations["start_latitude"], 5.989279)
        self.assertEqual(stations["end_latitude"], 5.986219)
        self.assertIn("endpoint_roles_inferred_from_increasing_stations", stations["normalization_rules"])
        lone = self.projects["ib:p689:r18"]
        self.assertIsNone(lone["start_latitude"])
        self.assertIsNone(lone["end_latitude"])
        self.assertEqual(lone["point_latitude"], 15.713972)
        self.assertEqual(lone["point_longitude"], 120.396365)

    def test_numeric_repair_candidates_are_accepted_except_manual_bangbang(self):
        for project_id, column, candidate in [("ib:p680:r19", "start_latitude", 14.828381),
                                              ("ib:p703:r11", "end_longitude", 123.69192)]:
            p = self.projects[project_id]
            self.assertEqual(p[column], candidate)
            self.assertEqual(p["status"], "normalized")
            self.assertNotIn("source_numeric_repair_candidate", p["review_flags"])
            self.assertIn("source_numeric_repair_accepted", p["normalization_rules"])
        bangbang = self.projects["ib:p723:r3"]
        self.assertEqual(bangbang["start_latitude"], 7.005288)
        self.assertEqual(bangbang["status"], "needs_review")
        self.assertIn("source_numeric_repair_candidate", bangbang["review_flags"])

    def test_invalid_pairs_dms_hemispheres_and_residue_do_not_pass(self):
        for raw in ['120.153581, 120.53601', '13°61\'02"N, 121°08\'05"E', '13N, 121N', '13.123, 121.123 garbage']:
            p = normalizer.parse_pairs(raw)[0]
            self.assertTrue(p["issues"], raw)
            self.assertIsNone(p["latitude"], raw)
        # Accepted digit repair restores the Laoag end point for map use.
        self.assertEqual(self.projects["ib:p670:r4"]["end_latitude"], 18.153581)
        self.assertEqual(self.projects["ib:p670:r4"]["status"], "normalized")

    def test_marker_typos_axis_labels_annotation_and_missing_colon(self):
        for project_id in ["ib:p696:r2", "ib:p704:r10", "ib:p705:r4", "ib:p688:r8", "ib:p689:r15", "ib:p726:r8"]:
            self.assertEqual(self.projects[project_id]["status"], "normalized")
        p = self.projects["ib:p726:r8"]
        self.assertEqual(p["end_longitude"], 126.149157)
        self.assertEqual(p["points"][1]["trailing_annotation_raw"], "o 228")

    def test_csv_column_order_and_budget_not_repeated_per_segment(self):
        projects = list(csv.DictReader(io.StringIO(self.artifacts["hgab_fmr_projects_normalized.csv"])))
        segments = list(csv.DictReader(io.StringIO(self.artifacts["hgab_fmr_segments.csv"])))
        points = list(csv.DictReader(io.StringIO(self.artifacts["hgab_fmr_points.csv"])))
        self.assertEqual(sum(int(p["amount_php"]) for p in projects), 19_628_100_000)
        self.assertNotIn("amount_php", segments[0])
        self.assertNotIn("amount_php", points[0])
        self.assertLess(list(points[0]).index("longitude"), list(points[0]).index("latitude"))
        self.assertEqual(len({p["id"] for p in points}), 2007)

    def test_distance_off_by_one_repairs_keep_raw_text(self):
        p = self.projects["ib:p685:r5"]
        self.assertIn("129.8030109", p["coordinates_raw"])
        self.assertEqual(p["end_longitude"], 120.8030109)
        self.assertEqual(p["status"], "normalized")
        self.assertIn("off_by_one_digit_repair_accepted", p["normalization_rules"])
        self.assertNotIn("endpoint_distance_over_100_km", p["review_flags"])


if __name__ == "__main__":
    unittest.main()
