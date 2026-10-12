"""Source-backed extraction and corruption tests for the FMR table family."""
import copy
import csv
import importlib.util
import io
from pathlib import Path
import unittest

import pymupdf

SCRIPT = Path(__file__).resolve().parents[1] / "extract_hgab_fmr.py"
spec = importlib.util.spec_from_file_location("fmr", SCRIPT)
fmr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fmr)


class FMRTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with pymupdf.open(fmr.IB) as doc:
            cls.rows, cls.pages = fmr.extract_rows(doc)
        cls.tree = fmr.build_tree(cls.rows)
        cls.cross = fmr.cross_volume_controls(cls.tree)

    def audit(self, tree=None, rows=None, pages=None, cross=None):
        return fmr.validate(rows if rows is not None else self.rows,
                            pages if pages is not None else self.pages,
                            tree if tree is not None else self.tree,
                            cross if cross is not None else self.cross)

    def test_full_annex_and_independent_cross_volume_controls(self):
        audit = self.audit()
        self.assertTrue(audit["passed"], audit["errors"])
        summary = audit["summary"]
        self.assertEqual(summary["projects"], 964)
        self.assertEqual(summary["regions"], 16)
        self.assertEqual(summary["project_ledger_total_php"], 19_628_100_000)
        self.assertEqual(summary["internal_control_checks"], 17)
        self.assertEqual(summary["cross_volume_control_checks"], 17)
        self.assertEqual(summary["cross_volume_office_echo_checks"], 16)
        self.assertEqual(summary["source_table_rows"], 1057)
        self.assertEqual(summary["row_role_counts"]["blank_spacer"], 16)
        self.assertEqual(summary["coordinate_review_projects"], 83)

    def test_wrapped_and_multisection_coordinates_own_one_project(self):
        project = next(n for n in self.tree["nodes"] if n["id"] == "ib:p678:r10")
        self.assertEqual(project["printed_amount_php"], 39_000_000)
        self.assertIn("San Agustin, Isabela", project["title"])
        self.assertEqual(len(project["coordinate_observations"]), 4)
        self.assertEqual([o["section_raw"] for o in project["coordinate_observations"]],
                         ["(SEC 1)", "(SEC 2)", "(SEC 1)", "(SEC 2)"])
        self.assertNotIn("START", project["title"])

    def test_mirrored_columns_and_coordinate_numbers_do_not_become_amounts(self):
        odd, even = self.pages[:2]
        shift = odd["column_boundaries_x"][1] - even["column_boundaries_x"][1]
        self.assertAlmostEqual(shift, 13.5, places=3)
        first = next(n for n in self.tree["nodes"] if n["kind"] == "project")
        self.assertEqual(first["printed_amount_php"], 15_000_000)
        self.assertEqual(first["coordinate_observations"][0]["parsed_decimal_pair"],
                         {"latitude": 18.284622, "longitude": 120.625421})
        self.assertEqual(first["coordinate_observations"][1]["parsed_decimal_pair"],
                         {"latitude": 18.287494, "longitude": 120.628232})

    def test_reversed_and_malformed_coordinates_are_not_repaired(self):
        reverse = next(n for n in self.tree["nodes"] if n["id"] == "ib:p669:r17")
        self.assertIn("120.58051, 18.20349", reverse["coordinates_raw"])
        self.assertIsNone(reverse["coordinate_observations"][0]["parsed_decimal_pair"])
        malformed = next(n for n in self.tree["nodes"] if "Brgy. Luna to Brgy. San Isidro" in n.get("title", ""))
        self.assertIn("123.691.92", malformed["coordinates_raw"])
        self.assertIsNone(malformed["coordinate_observations"][1]["parsed_decimal_pair"])

    def test_repeated_titles_are_retained_as_separate_printed_rows(self):
        groups = self.audit()["repeated_title_groups"]
        self.assertEqual(len(groups), 4)
        self.assertTrue(all(len(g["project_ids"]) == 2 for g in groups))

    def test_csv_ledger_roundtrip_and_multiline_coordinate_evidence(self):
        artifacts, audit = fmr.build()
        rows = list(csv.DictReader(io.StringIO(artifacts["hgab_fmr_projects.csv"])))
        self.assertEqual(len(rows), 964)
        self.assertEqual(len({r["id"] for r in rows}), 964)
        self.assertEqual(sum(int(r["amount_php"]) for r in rows), audit["summary"]["project_ledger_total_php"])
        section_row = next(r for r in rows if r["id"] == "ib:p678:r10")
        self.assertIn("START (SEC 1):", section_row["coordinates_raw"])
        self.assertIn("\nEND (SEC 2):", section_row["coordinates_raw"])

    def test_offsetting_errors_fail_regions_even_when_root_total_matches(self):
        tree = copy.deepcopy(self.tree)
        projects = [n for n in tree["nodes"] if n["kind"] == "project"]
        a = projects[0]
        b = next(n for n in projects if n["parent_id"] != a["parent_id"])
        a["printed_amount_php"] += 1_000_000
        b["printed_amount_php"] -= 1_000_000
        audit = self.audit(tree=tree)
        self.assertFalse(audit["passed"])
        self.assertEqual(audit["summary"]["project_ledger_total_php"], 19_628_100_000)
        self.assertEqual(audit["summary"]["failed_internal_controls"], 2)
        self.assertTrue(any(e.startswith("native_cell_evidence_disagreement") for e in audit["errors"]))

    def test_dropped_project_fails_source_coverage(self):
        tree = copy.deepcopy(self.tree)
        tree["nodes"].remove(next(n for n in tree["nodes"] if n["kind"] == "project"))
        audit = self.audit(tree=tree)
        self.assertFalse(audit["passed"])
        self.assertIn("source_amount_row_coverage_or_ownership", audit["errors"])

    def test_dropped_or_double_owned_word_fails_coverage(self):
        rows = copy.deepcopy(self.rows)
        project = next(r for r in rows if r["role"] == "project")
        project["label_lines"][0]["word_indices"].pop()
        self.assertTrue(any(e.startswith("source_word_coverage_or_ownership") for e in self.audit(rows=rows)["errors"]))
        rows = copy.deepcopy(self.rows)
        project = next(r for r in rows if r["role"] == "project")
        project["label_lines"][0]["word_indices"].append(project["label_lines"][0]["word_indices"][0])
        self.assertTrue(any(e.startswith("source_word_coverage_or_ownership") for e in self.audit(rows=rows)["errors"]))

    def test_swapping_equal_amount_projects_fails_printed_parent_evidence(self):
        tree = copy.deepcopy(self.tree)
        by_id = {n["id"]: n for n in tree["nodes"]}
        projects = [n for n in tree["nodes"] if n["kind"] == "project"]
        a = projects[0]
        b = next(n for n in projects if n["parent_id"] != a["parent_id"] and n["printed_amount_php"] == a["printed_amount_php"])
        pa, pb = by_id[a["parent_id"]], by_id[b["parent_id"]]
        pa["child_ids"][pa["child_ids"].index(a["id"])] = b["id"]
        pb["child_ids"][pb["child_ids"].index(b["id"])] = a["id"]
        a["parent_id"], b["parent_id"] = b["parent_id"], a["parent_id"]
        audit = self.audit(tree=tree)
        self.assertEqual(audit["summary"]["failed_internal_controls"], 0)
        self.assertFalse(audit["passed"])
        self.assertTrue(any(e.startswith("printed_heading_parent_disagreement") for e in audit["errors"]))

    def test_changed_coordinate_or_cross_volume_column_fails(self):
        tree = copy.deepcopy(self.tree)
        project = next(n for n in tree["nodes"] if n["kind"] == "project")
        project["coordinates_raw"] = "START: 0, 0"
        self.assertTrue(any(e.startswith("title_or_coordinate_ownership_disagreement") for e in self.audit(tree=tree)["errors"]))
        cross = copy.deepcopy(self.cross)
        cross[0]["co_php"] += 1_000
        self.assertTrue(any(e.startswith("cross_volume_control_disagreement") for e in self.audit(cross=cross)["errors"]))


if __name__ == "__main__":
    unittest.main()
