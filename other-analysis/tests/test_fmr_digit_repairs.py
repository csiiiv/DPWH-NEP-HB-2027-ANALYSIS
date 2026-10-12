"""Accepted off-by-one digit repair regressions."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "other-analysis"))
import fmr_digit_repairs as repairs  # noqa: E402

HGAB = REPO / "other-analysis/data/hgab_fmr_coordinates_normalized.json"
NEP = REPO / "other-analysis/data/nep_fmr_coordinates_normalized.json"


class DigitRepairTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hgab = {p["project_id"]: p for p in json.loads(HGAB.read_text())["projects"]}
        cls.nep = {p["project_id"]: p for p in json.loads(NEP.read_text())["projects"]}

    def test_acceptance_list_excludes_manual_bangbang(self):
        ids = {row[1] for row in repairs.ACCEPTANCES}
        self.assertNotIn("ib:p723:r3", ids)

    def test_tagumpay_latitudes_gain_leading_one(self):
        for layer, pid in (("hgab", "ib:p692:r16"), ("nep", "nep_fmr:p24:r10")):
            project = self.hgab[pid] if layer == "hgab" else self.nep[pid]
            self.assertEqual(project["status"], "normalized")
            lats = sorted(pt["latitude"] for pt in project["points"])
            self.assertTrue(all(14.6 < lat < 14.7 for lat in lats))
            self.assertIn(repairs.RULE_DIGIT, project["normalization_rules"])
            self.assertNotIn("endpoint_distance_over_100_km", project["review_flags"])

    def test_huge_bound_examples_resolve_to_title_scale(self):
        cases = [
            ("hgab", "ib:p667:r7", "start_latitude", 18.00918),
            ("hgab", "ib:p677:r5", "end_latitude", 16.826792),
            ("hgab", "ib:p685:r5", "end_longitude", 120.8030109),
            ("nep", "nep_fmr:p44:r10", "end_longitude", 126.008575),
            ("nep", "nep_fmr:p18:r15", "end_longitude", 120.8030109),
        ]
        for layer, pid, field, value in cases:
            project = self.hgab[pid] if layer == "hgab" else self.nep[pid]
            self.assertEqual(project[field], value)
            self.assertEqual(project["status"], "normalized")

    def test_invalid_pair_repairs_restore_end_point(self):
        for layer, pid in (("hgab", "ib:p670:r4"), ("nep", "nep_fmr:p4:r13")):
            project = self.hgab[pid] if layer == "hgab" else self.nep[pid]
            self.assertEqual(project["end_longitude"], 120.53601)
            self.assertEqual(project["end_latitude"], 18.153581)
            self.assertEqual(project["status"], "normalized")
            self.assertNotIn("invalid_coordinate_pair", project["review_flags"])

    def test_remaining_queue_is_structural_or_manual(self):
        flagged = sorted(pid for pid, p in self.hgab.items() if p["status"] == "needs_review")
        self.assertEqual(flagged, ["ib:p689:r18", "ib:p723:r3"])
        self.assertEqual([p for p in self.nep.values() if p["status"] == "needs_review"], [])

    def test_raw_text_stays_immutable_on_repaired_projects(self):
        p = self.hgab["ib:p685:r5"]
        self.assertIn("129.8030109", p["coordinates_raw"])
        self.assertEqual(p["end_longitude"], 120.8030109)


if __name__ == "__main__":
    unittest.main()
