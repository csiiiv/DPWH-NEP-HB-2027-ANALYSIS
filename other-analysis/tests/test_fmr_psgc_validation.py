"""PSGC cross-validation provenance regressions (fast, no geocoding)."""
import csv
import json
from pathlib import Path
import sys
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "other-analysis"))
import validate_fmr_coordinates_psgc as psgc  # noqa: E402

AUDIT = REPO / "other-analysis/data/fmr_psgc_validation.json"
POINTS_CSV = REPO / "other-analysis/data/fmr_psgc_validation_points.csv"


class PSGCValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit = json.loads(AUDIT.read_text())
        with POINTS_CSV.open(newline="") as fh:
            cls.rows = list(csv.DictReader(fh))
        cls.layers = {
            "hgab": psgc.load_layer(psgc.HGAB_JSON),
            "nep": psgc.load_layer(psgc.NEP_JSON),
        }
        cls.flagged = {
            layer: {pid for pid, p in proj.items() if p.get("status") == "needs_review"}
            for layer, proj in cls.layers.items()}

    def test_audit_anchors_are_fresh(self):
        """Committed hashes must match current normalized layers and validator."""
        meta = self.audit["metadata"]
        self.assertEqual(meta["hgab_layer_sha256"],
                         psgc.sha256_file(REPO / psgc.HGAB_JSON))
        self.assertEqual(meta["nep_layer_sha256"],
                         psgc.sha256_file(REPO / psgc.NEP_JSON))
        self.assertEqual(meta["validator_sha256"],
                         psgc.sha256_file(Path(psgc.__file__)))

    def test_manifest_points_match_layers(self):
        """Stale manifest entries must be rejected by the staleness guard."""
        self.assertEqual(psgc.check_manifest_stale(self.layers), [])

    def test_every_flagged_project_is_covered(self):
        """Each flagged project in either layer must appear as printed points."""
        covered = {r["project_id"] for r in self.audit["points"]
                   if r["kind"] == "printed"}
        for layer, pids in self.flagged.items():
            for pid in pids:
                self.assertIn(pid, covered, f"{layer} flagged project {pid} missing")

    def test_repairs_reference_flagged_points_and_never_normalized_layers(self):
        """Repairs must name existing flagged points; outputs stay evidence-only."""
        for r in self.audit["points"]:
            project = self.layers[r["layer"]][r["project_id"]]
            if r["kind"] == "candidate_repair":
                self.assertEqual(project["status"], "needs_review")
                self.assertIn(r["point_id"], psgc.point_index(project))
                self.assertIn("repair", r)
            if r["kind"] == "printed":
                layer_point = psgc.point_index(project)[r["point_id"]]
                self.assertEqual(layer_point["coordinates"], r["coordinates"])

    def test_verdicts_are_exhaustive_and_summary_consistent(self):
        allowed = {"AGREE", "PARTIAL", "DISAGREE", "NO_MATCH"}
        for r in self.audit["points"]:
            self.assertIn(r["verdict"], allowed)
        summary = self.audit["summary"]
        printed = [r for r in self.audit["points"] if r["kind"] == "printed"]
        repairs = [r for r in self.audit["points"] if r["kind"] == "candidate_repair"]
        self.assertEqual(summary["printed_points"], len(printed))
        self.assertEqual(summary["candidate_repairs"], len(repairs))
        self.assertEqual(summary["repair_agree_projects"],
                         sorted({r["project_id"] for r in repairs if r["verdict"] == "AGREE"}))
        self.assertEqual(summary["manual_review_projects"],
                         sorted({r["project_id"] for r in repairs if r["verdict"] != "AGREE"}))

    def test_bangbang_is_the_only_manual_review_project(self):
        self.assertEqual(self.audit["summary"]["manual_review_projects"], ["ib:p723:r3"])

    def test_remaining_candidate_repair_is_bangbang_only(self):
        reps = [r for r in self.audit["points"] if r["kind"] == "candidate_repair"]
        self.assertEqual([r["project_id"] for r in reps], ["ib:p723:r3"])
        self.assertEqual(reps[0]["verdict"], "PARTIAL")

    def test_accepted_tagumpay_points_are_no_longer_flagged(self):
        self.assertEqual(self.layers["hgab"]["ib:p692:r16"]["status"], "normalized")
        lats = [pt["latitude"] for pt in self.layers["hgab"]["ib:p692:r16"]["points"]]
        self.assertTrue(all(14.6 < lat < 14.7 for lat in lats))

    def test_csv_preserves_all_points_and_verdicts(self):
        self.assertEqual(len(self.rows), len(self.audit["points"]))
        for row, record in zip(self.rows, self.audit["points"]):
            self.assertEqual(row["point_id"], record["point_id"])
            self.assertEqual(row["verdict"], record["verdict"])
            if record["coordinates"] is None:
                self.assertEqual(row["coordinates"], "")
            else:
                self.assertEqual(json.loads(row["coordinates"]), record["coordinates"])

    def test_metadata_records_geomapper_provenance(self):
        meta = self.audit["metadata"]
        self.assertEqual(meta["coordinate_column_order"], "longitude, latitude")
        self.assertIn("geomapper_submodule_commit", meta)
        self.assertEqual(len(meta["psgc_shapefiles_sha256"]), 4)
        for name in psgc.SHAPEFILES_USED:
            self.assertIn(name, meta["psgc_shapefiles_sha256"])
        self.assertIn("digit repairs were accepted", meta["disposition"])


if __name__ == "__main__":
    unittest.main()
