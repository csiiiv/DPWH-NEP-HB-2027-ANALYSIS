"""Per-document FMR final dataset regressions (fast; no geocoding, uses --check
outputs and pure helpers)."""
import json
from pathlib import Path
import sys
import unittest
from unittest import mock

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "other-analysis"))
import build_fmr_final_dataset as builder  # noqa: E402

FILES = {key: REPO / rel_out["out"] for key, rel_out in builder.STAGES.items()}


class FinalDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = {key: json.loads(path.read_text())
                    for key, path in FILES.items()}

    def test_outputs_exist_and_are_per_document(self):
        for key in ("hgab", "nep"):
            meta = self.data[key]["metadata"]
            self.assertEqual(key, "hgab" if "House GAB" in meta["document"] else "nep")
            self.assertIn("separate analysis pass", meta["scope_note"])

    def test_project_coverage_and_amounts_unchanged(self):
        expected = {"hgab": (964, 19_628_100_000), "nep": (704, 16_000_000_000)}
        for key, (projects, amount) in expected.items():
            summary = self.data[key]["summary"]
            self.assertEqual(summary["projects"], projects)
            self.assertEqual(summary["amount_php"], amount)
            self.assertEqual(summary["flagged_projects"], {"hgab": 2, "nep": 0}[key])

    def test_every_point_has_psgc_result_or_note(self):
        for key in FILES:
            for project in self.data[key]["projects"]:
                self.assertEqual(len(project["points"]), project["point_count"])
                for pt in project["points"]:
                    if pt["psgc"] is None:
                        self.assertIn("cannot form", pt["psgc_note"])
                    else:
                        self.assertIsInstance(pt["psgc"]["match"], bool)

    def test_title_locality_parse_and_agreement_consistency(self):
        for key in FILES:
            for project in self.data[key]["projects"]:
                parsed = project["title_locality"]
                if parsed["barangays"]:
                    self.assertEqual(parsed["barangay"], parsed["barangays"][-1])
                if project["location_agreement"] == "ALL_POINTS_AGREE":
                    for v in project["point_verdicts"]:
                        self.assertEqual(v, "AGREE")
                if project["location_agreement"] == "MIXED":
                    self.assertTrue(any(v.startswith("AGREE")
                                        for v in project["point_verdicts"]))
                    self.assertNotEqual(set(project["point_verdicts"]), {"AGREE"})
                if parsed["barangay"] is None and parsed["municipality"] is None:
                    self.assertIsNotNone(parsed["parse_note"])

    def test_source_lineage_per_entry(self):
        layer_keys = {"hgab": "HB_BUDGET/2 - HB 10858 VOL IB.pdf",
                      "nep": "dbm-other-nep-line-data/FMR.pdf"}
        for key in FILES:
            src = self.data[key]["projects"][0]["source"]
            self.assertEqual(src["source_pdf"], layer_keys[key])
            for project in self.data[key]["projects"]:
                for field in ("pdf_page", "printed_page", "table_row", "bbox"):
                    self.assertIn(field, project["source"])

    def test_classify_location_pure_logic(self):
        parsed = {"barangay": "Elizabeth", "barangays": ["Escoda", "Elizabeth"],
                  "municipality": "Real", "province": "Quezon"}
        hit = {"match": True, "province": "Quezon", "municipality": "Real",
               "barangay": "Tagumpay"}
        self.assertEqual(builder.classify_location(hit, parsed),
                         "AGREE_MUNI_BRGY_DIFFERS")
        self.assertEqual(builder.classify_location(dict(hit, barangay="Escoda"),
                                                  parsed), "AGREE")
        no_brgy = {"barangay": None, "barangays": [], "municipality": "Real",
                   "province": "Quezon"}
        self.assertEqual(builder.classify_location(hit, no_brgy), "AGREE")
        self.assertEqual(builder.classify_location({"match": False}, parsed),
                         "NO_MATCH")
        off_province = dict(hit, province="Bukidnon", municipality="Lantapan")
        self.assertEqual(builder.classify_location(off_province, parsed), "DISAGREE")

    def test_parse_title_locality_variants(self):
        t1 = builder.parse_title_locality(
            "Construction of Brgy. Escoda - Brgy. Elizabeth FMR, "
            "Brgy. Escoda and Brgy. Elizabeth, Marcos, Ilocos Norte")
        self.assertEqual(t1["barangays"], ["Escoda", "Elizabeth"])
        self.assertEqual(t1["barangay"], "Elizabeth")
        self.assertEqual(t1["municipality"], "Marcos")
        self.assertEqual(t1["province"], "Ilocos Norte")
        t2 = builder.parse_title_locality(
            "Construction of FMR Leading to Ilocos Sur Provincial Trading "
            "Center, Brgy. Danuman West,")
        self.assertEqual(t2["province"], "")
        self.assertIsNotNone(t2["parse_note"])

    def test_anchor_verification_rejects_changed_layer(self):
        fake_meta = {"hgab_layer_sha256": "0" * 64, "nep_layer_sha256": "0" * 64,
                     "geomapper_submodule_commit": "deadbeef",
                     "psgc_shapefiles_sha256": {}}
        with mock.patch.object(builder, "PSGC_AUDIT", builder.PSGC_AUDIT), \
             mock.patch("json.loads", side_effect=[
                 {"metadata": fake_meta}] * 3):
            _audit, problems = builder.verify_anchors()
        self.assertTrue(any("hgab_fmr_coordinates_normalized.json" in p for p in problems))
        self.assertTrue(any("commit changed" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
