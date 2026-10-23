"""Regressions for typed COMELEC electoral headings (no generic district inference)."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from extract_positions_2025 import classify_label, parse_column_lines


class ExtractTypes(unittest.TestCase):
    def test_house_and_other_districts_are_distinct(self):
        items = parse_column_lines([
            "NUEVA ECIJA", "1st Legislative District", "1 Aliaga", "2 Cuyapo",
            "2nd Provincial District", "1 Carranglan",
            "1st Councilor District", "1 Pateros",
            "2nd Legislative District", "3 Lupao",
        ], 14)
        types = [(x["text"], x["districtType"]) for x in items if x["districtType"]]
        self.assertEqual(types, [
            ("1st Legislative District", "house_legislative"),
            ("2nd Provincial District", "provincial_board"),
            ("1st Councilor District", "city_council"),
            ("2nd Legislative District", "house_legislative"),
        ])
        self.assertEqual(next(x["text"] for x in items if x["kind"] == "locality"), "Aliaga")
        self.assertTrue(all(x["page"] == 14 for x in items))

    def test_lone_house_district(self):
        self.assertEqual(classify_label("Lone Legislative District"), "legislative_district")

    def test_cross_scope_heading_never_cast_as_house(self):
        self.assertEqual(classify_label("2nd Councilor District"), "councilor_district")
        self.assertEqual(classify_label("2nd Provincial District"), "provincial_district")
        self.assertEqual(classify_label("City of Taguig (2nd Councilor District) (1LD)"),
                         "district_other")

    def test_no_untyped_seat_assumptions(self):
        self.assertNotEqual(classify_label("1st District"), "legislative_district")
        self.assertEqual(classify_label("CITY REGION/PROVINCE/CITY/MUNICIPALITY/"), "ignored")


if __name__ == "__main__":
    unittest.main()
