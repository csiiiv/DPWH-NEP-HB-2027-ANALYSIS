"""NEP source, accounting, OCR lineage, and coordinate coverage regressions."""
import copy
import csv
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import extract_nep_fmr as fmr
import normalize_nep_fmr_coordinates as normalizer


class NEPFMRTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with pymupdf.open(fmr.SOURCE) as doc:
            cls.rows, cls.pages = fmr.extract_rows(doc)
        cls.tree = fmr.build_tree(cls.rows)
        cls.cross = fmr.cross_volume_controls(cls.tree)
        cls.normalized_artifacts, cls.normalized_audit = normalizer.build()
        cls.projects = {p["project_id"]: p for p in json.loads(
            cls.normalized_artifacts["nep_fmr_coordinates_normalized.json"])["projects"]}

    def audit(self, **overrides):
        return fmr.validate(overrides.get("rows", self.rows), overrides.get("pages", self.pages),
                            overrides.get("tree", self.tree), overrides.get("cross", self.cross))

    def test_complete_source_and_independent_agency_controls(self):
        audit = self.audit()
        self.assertTrue(audit["passed"], audit["errors"])
        s = audit["summary"]
        self.assertEqual((s["detail_pages"], s["source_table_rows"], s["projects"], s["regions"]),
                         (47, 769, 704, 16))
        self.assertEqual(s["project_ledger_total_php"], 16_000_000_000)
        self.assertEqual((s["internal_control_checks"], s["cross_volume_control_checks"],
                          s["cross_volume_office_echo_checks"]), (17, 17, 16))
        self.assertEqual(s["table_words_accounted_for"], 14155)
        self.assertTrue(all(c["passed"] for c in audit["rollup_checks"] + self.cross))
        self.assertEqual(len(audit["repeated_title_groups"]), 1)
        self.assertEqual(len(audit["repeated_title_groups"][0]["project_ids"]), 2)

    def test_open_bottom_row_and_all_printed_page_mappings(self):
        page = self.pages[27]
        self.assertEqual(page["row_boundary_basis"][-1],
                         "vertical_rule_extent_open_bottom_image_reviewed")
        row = next(r for r in self.rows if r["id"] == "nep_fmr:p28:r16")
        self.assertEqual(row["amount_php"], 45_000_000)
        self.assertIn("Sitio Cuta to Sitio Lucbanan", row["label_raw"])
        self.assertIn("END: 12.71479873, 121.51238645", row["label_raw"])
        for p in self.pages:
            self.assertEqual(p["printed_page"], p["pdf_page"] + 1510)
            self.assertEqual(p["printed_page_evidence"]["pdf_page"], p["pdf_page"] + 1534)
            self.assertFalse(p["outside_table_amount_tokens"])

    def test_ocr_amount_decorations_keep_raw_tokens_and_lineage(self):
        repairs = [r for r in self.rows if r["amount_interpretation"]]
        self.assertEqual(len(repairs), 4)
        self.assertEqual([r["amount_php"] for r in repairs],
                         [11_000_000, 15_125_000, 15_000_000, 10_000_000])
        for r in repairs:
            self.assertEqual(r["amount_raw"], r["amount_interpretation"]["raw"])
            self.assertNotEqual(r["amount_raw"], r["amount_interpretation"]["interpreted"])
        rows = copy.deepcopy(self.rows)
        next(r for r in rows if r["amount_interpretation"])["amount_interpretation"]["interpreted"] = "12,000,000"
        self.assertTrue(any(e.startswith("amount_repair_lineage_disagreement")
                            for e in self.audit(rows=rows)["errors"]))

    def test_offsetting_region_errors_fail_even_when_program_balances(self):
        tree = copy.deepcopy(self.tree)
        projects = [p for p in tree["nodes"] if p["kind"] == "project"]
        a = projects[0]
        b = next(p for p in projects if p["parent_id"] != a["parent_id"])
        a["printed_amount_php"] += 1_000_000
        b["printed_amount_php"] -= 1_000_000
        audit = self.audit(tree=tree)
        self.assertFalse(audit["passed"])
        self.assertEqual(audit["summary"]["project_ledger_total_php"], 16_000_000_000)
        self.assertEqual(audit["summary"]["failed_internal_controls"], 2)

    def test_dropped_project_and_missing_word_fail_coverage(self):
        tree = copy.deepcopy(self.tree)
        tree["nodes"].remove(next(p for p in tree["nodes"] if p["kind"] == "project"))
        self.assertIn("source_amount_row_coverage_or_ownership", self.audit(tree=tree)["errors"])
        rows = copy.deepcopy(self.rows)
        next(r for r in rows if r["role"] == "project")["label_lines"][0]["word_indices"].pop()
        self.assertTrue(any(e.startswith("source_word_coverage_or_ownership")
                            for e in self.audit(rows=rows)["errors"]))

    def test_equal_amount_parent_swap_fails_source_hierarchy(self):
        tree = copy.deepcopy(self.tree)
        by_id = {n["id"]: n for n in tree["nodes"]}
        projects = [n for n in tree["nodes"] if n["kind"] == "project"]
        a = projects[0]
        b = next(n for n in projects if n["parent_id"] != a["parent_id"]
                 and n["printed_amount_php"] == a["printed_amount_php"])
        pa, pb = by_id[a["parent_id"]], by_id[b["parent_id"]]
        pa["child_ids"][pa["child_ids"].index(a["id"])] = b["id"]
        pb["child_ids"][pb["child_ids"].index(b["id"])] = a["id"]
        a["parent_id"], b["parent_id"] = b["parent_id"], a["parent_id"]
        audit = self.audit(tree=tree)
        self.assertEqual(audit["summary"]["failed_internal_controls"], 0)
        self.assertTrue(any(e.startswith("printed_heading_parent_disagreement") for e in audit["errors"]))

    def test_changed_cross_volume_column_and_duplicate_control_fail(self):
        cross = copy.deepcopy(self.cross)
        cross[0]["co_php"] += 1000
        self.assertTrue(any(e.startswith("cross_volume_control_disagreement")
                            for e in self.audit(cross=cross)["errors"]))
        cross = copy.deepcopy(self.cross)
        region_indices = [i for i, c in enumerate(cross) if c["role"] == "region_control"]
        cross[region_indices[1]] = copy.deepcopy(cross[region_indices[0]])
        self.assertIn("cross_volume_control_ownership", self.audit(cross=cross)["errors"])

    def test_changed_source_coordinate_and_page_mapping_fail(self):
        tree = copy.deepcopy(self.tree)
        next(p for p in tree["nodes"] if p["kind"] == "project")["coordinates_raw"] = "START: 0, 0"
        self.assertTrue(any(e.startswith("title_or_coordinate_ownership_disagreement")
                            for e in self.audit(tree=tree)["errors"]))
        pages = copy.deepcopy(self.pages)
        pages[0]["printed_page_evidence"]["pdf_page"] += 1
        self.assertIn("printed_page_mapping_disagreement:1", self.audit(pages=pages)["errors"])

    def test_normalized_ledger_and_point_ownership(self):
        self.assertTrue(self.normalized_audit["passed"])
        s = self.normalized_audit["summary"]
        self.assertEqual((s["projects"], s["segments"], s["points"]), (704, 722, 1444))
        self.assertEqual(s["project_total_php"], 16_000_000_000)
        self.assertEqual((s["normalized_projects"], s["projects_needing_review"]), (704, 0))
        self.assertEqual(s["digit_repairs_accepted"], 9)
        for source in self.tree["nodes"]:
            if source["kind"] == "project":
                p = self.projects[source["id"]]
                self.assertEqual(p["coordinates_raw"], source["coordinates_raw"])
                self.assertCountEqual([i for s in p["segments"] for i in s["point_ids"]],
                                      [point["id"] for point in p["points"]])
        for suffix in ["segments", "points"]:
            rows = list(csv.DictReader(io.StringIO(self.normalized_artifacts[f"nep_fmr_{suffix}.csv"])))
            self.assertNotIn("amount_php", rows[0])
        ledger = list(csv.DictReader(io.StringIO(self.normalized_artifacts["nep_fmr_projects_normalized.csv"])))
        self.assertEqual(sum(int(r["amount_php"]) for r in ledger), 16_000_000_000)

    def test_ocr_marker_sections_and_reversed_coordinates(self):
        first = self.projects["nep_fmr:p1:r5"]
        self.assertEqual(first["coordinates"], [[[120.625421, 18.284622], [120.628232, 18.287494]]])
        typo = self.projects["nep_fmr:p1:r11"]
        self.assertEqual(typo["status"], "normalized")
        self.assertIn('"ISTART:', typo["coordinates_raw"])
        self.assertIn("endpoint_marker_typo_normalized", typo["normalization_rules"])
        sections = self.projects["nep_fmr:p26:r9"]
        self.assertEqual((sections["segment_count"], sections["point_count"]), (4, 8))
        self.assertIsNone(sections["start_longitude"])
        self.assertTrue(all(s["pairing_basis"] == "explicit_section" for s in sections["segments"]))
        reverse = self.projects["nep_fmr:p4:r13"]
        self.assertEqual(reverse["start_latitude"], 18.152453)
        self.assertEqual(reverse["start_longitude"], 120.540087)
        self.assertEqual(reverse["end_latitude"], 18.153581)
        self.assertEqual(reverse["end_longitude"], 120.53601)
        self.assertEqual(reverse["status"], "normalized")

    def test_uncertain_printed_values_accept_digit_repairs_and_ocr_decimal_is_reviewed(self):
        candidate = self.projects["nep_fmr:p30:r14"]
        self.assertEqual(candidate["end_longitude"], 123.69192)
        self.assertEqual(candidate["status"], "normalized")
        self.assertIn("source_numeric_repair_accepted", candidate["normalization_rules"])
        comma = self.projects["nep_fmr:p28:r6"]
        self.assertIn("121,432678", comma["coordinates_raw"])
        self.assertIn("121.432678", comma["coordinates_interpreted"])
        self.assertEqual(comma["end_longitude"], 121.432678)
        self.assertEqual(comma["status"], "normalized")
        self.assertEqual(comma["coordinate_text_basis"], "image_reviewed_ocr_transcription")
        long = self.projects["nep_fmr:p18:r15"]
        self.assertIn("129.8030109", long["coordinates_raw"])
        self.assertEqual(long["end_longitude"], 120.8030109)
        self.assertEqual(long["status"], "normalized")

    def test_image_review_recovers_dms_decimal_and_section_observations(self):
        s = self.normalized_audit["summary"]
        self.assertEqual((s["image_reviewed_projects"], s["image_reviewed_ocr_corrected_projects"],
                          s["image_reviewed_projects_resolved"]), (23, 16, 23))
        self.assertEqual(s["points_without_numeric_pair"], 0)
        valeriana = self.projects["nep_fmr:p20:r14"]
        self.assertEqual(valeriana["status"], "normalized")
        self.assertAlmostEqual(valeriana["start_latitude"], 15 + 24 / 60 + 26.21 / 3600, places=9)
        malayu = self.projects["nep_fmr:p33:r16"]
        self.assertEqual(malayu["start_latitude"], 11.115153)
        self.assertNotIn("source_numeric_repair_candidate", malayu["review_flags"])
        sapangan = self.projects["nep_fmr:p24:r6"]
        self.assertEqual((sapangan["segment_count"], sapangan["point_count"]), (2, 4))
        self.assertEqual([s["section_label"] for s in sapangan["segments"]], ["section:1", "section:2"])
        self.assertEqual(sapangan["segments"][1]["start_latitude"], 13.7059722)
        self.assertIsNone(sapangan["start_latitude"])
        self.assertEqual(sapangan["status"], "normalized")
        silangan = self.projects["nep_fmr:p25:r14"]
        self.assertEqual(silangan["status"], "normalized")
        self.assertAlmostEqual(silangan["segments"][1]["start_latitude"], 13 + 51 / 60 + 16.99 / 3600, places=9)
        tagumpay = self.projects["nep_fmr:p24:r10"]
        self.assertEqual(tagumpay["segment_count"], 2)
        self.assertNotIn("missing_or_ambiguous_segment_endpoint", tagumpay["review_flags"])
        self.assertEqual(tagumpay["segments"][0]["end_latitude"], 14.606694)
        self.assertEqual(tagumpay["segments"][1]["start_latitude"], 14.606488)
        self.assertEqual(tagumpay["status"], "normalized")
        self.assertIn("off_by_one_digit_repair_accepted", tagumpay["normalization_rules"])

    def test_reviewed_point_fragments_keep_original_and_interpreted_offsets(self):
        for p in self.projects.values():
            for point in p["points"]:
                a, b = point["source_offset"], point["source_end_offset"]
                self.assertEqual(point["source_fragment_raw"], p["coordinates_raw"][a:b])
                start = point["interpreted_source_offset"]
                self.assertEqual(point["source_fragment_interpreted"],
                                 p["coordinates_interpreted"][start:start + len(point["source_fragment_interpreted"])])
        comma = self.projects["nep_fmr:p28:r6"]["points"][1]
        self.assertIn("121,432678", comma["source_fragment_raw"])
        self.assertIn("121.432678", comma["source_fragment_interpreted"])
        apostrophe = self.projects["nep_fmr:p20:r14"]["points"][0]
        self.assertIn("15°2426.21", apostrophe["source_fragment_raw"])
        self.assertIn("15°24'26.21", apostrophe["source_fragment_interpreted"])

    def test_rendered_review_evidence_and_hgab_context_are_reproducible(self):
        normalizer.render_review_images(check=True)
        audit = json.loads(self.normalized_artifacts["nep_fmr_coordinate_image_review_audit.json"])
        self.assertEqual(audit["summary"]["hgab_context_rows"], 19)
        remaining = [p for p in self.projects.values() if p["status"] == "needs_review"]
        self.assertEqual(len(remaining), 0)
        accepted = [p for p in self.projects.values()
                    if p.get("image_review") and "off_by_one_digit_repair_accepted" in p["normalization_rules"]]
        self.assertGreaterEqual(len(accepted), 6)
        self.assertTrue(all(p["image_review"]["finding"] in
                            {"printed_source_anomaly", "ocr_and_printed_source_anomaly"} for p in accepted))

    def test_stale_review_transcription_image_and_context_are_rejected(self):
        review = copy.deepcopy(self.projects["nep_fmr:p28:r6"]["image_review"])
        source = next(n for n in self.tree["nodes"] if n["id"] == review["project_id"])
        review["coordinates_raw"] = "START: 0, 0"
        with self.assertRaisesRegex(ValueError, "no longer matches source row"):
            normalizer.reviewed_text(source, review)
        evidence = json.loads(normalizer.REVIEW_INPUT.read_text())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.json"
            modified = copy.deepcopy(evidence)
            modified["reviews"][0]["rendered_evidence"]["sha256"] = "wrong"
            path.write_text(json.dumps(modified))
            with self.assertRaisesRegex(ValueError, "Rendered coordinate evidence disagrees"):
                normalizer.load_reviews(json.loads(normalizer.INPUT.read_text()), path)
            modified = copy.deepcopy(evidence)
            modified["reviews"][0]["hgab_context"]["coordinates_raw"] = "START: 0, 0"
            path.write_text(json.dumps(modified))
            with self.assertRaisesRegex(ValueError, "HGAB contextual row disagrees"):
                normalizer.load_reviews(json.loads(normalizer.INPUT.read_text()), path)


if __name__ == "__main__":
    unittest.main()
