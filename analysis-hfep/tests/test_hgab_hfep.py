"""Source-backed extraction and corruption tests for the HFEP annex."""
import copy
import csv
import importlib.util
import io
from pathlib import Path
import unittest

import pymupdf

SCRIPT = Path(__file__).resolve().parents[1] / "extract_hgab_hfep.py"
spec = importlib.util.spec_from_file_location("hfep", SCRIPT)
hfep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hfep)


class HFEPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with pymupdf.open(hfep.IB) as doc, pymupdf.open(hfep.IA) as doc_ia:
            cls.rows, cls.pages = hfep.extract_rows(doc)
            cls.agency = hfep.agency_controls(doc_ia)
        cls.tree, _ = hfep.build_tree(cls.rows)
        cls.comparison = hfep.reading_comparison()
        cls.audit_once = None

    def audit(self, tree=None, rows=None, pages=None, agency=None, comparison=None):
        return hfep.validate(rows if rows is not None else self.rows,
                             pages if pages is not None else self.pages,
                             tree if tree is not None else self.tree,
                             agency if agency is not None else self.agency,
                             comparison if comparison is not None else self.comparison)

    def test_full_annex_controls_and_grand_total(self):
        audit = self.audit()
        self.assertTrue(audit["passed"], audit["errors"])
        summary = audit["summary"]
        self.assertEqual(summary["detail_pages"], 17)
        self.assertEqual(summary["facilities"], 513)
        self.assertEqual(summary["internal_control_checks"], 311)
        self.assertEqual(summary["failed_internal_controls"], 0)
        self.assertEqual(summary["facility_ledger_total_php"], 10_021_659_000)
        self.assertEqual(summary["facility_ledger_infrastructure_php"], 5_990_046_000)
        self.assertEqual(summary["facility_ledger_medical_equipment_php"], 3_900_913_000)
        self.assertEqual(summary["facility_ledger_motor_vehicle_php"], 130_700_000)
        self.assertEqual(summary["band_role_counts"]["category"], 8)
        self.assertEqual(summary["band_role_counts"]["subcategory"], 14)
        self.assertEqual(summary["band_role_counts"]["region"], 91)
        self.assertEqual(summary["band_role_counts"]["province"], 198)
        self.assertEqual(summary["band_role_counts"]["grand_total"], 1)

    def test_agency_capital_outlay_matches_annex_total(self):
        check = self.audit()["agency_check"]
        self.assertTrue(check["passed"])
        self.assertEqual(check["capital_outlay_php"], 10_021_659_000)
        self.assertEqual(check["mooe_php"], 67_173_000)
        self.assertEqual(check["total_php"], 10_088_832_000)

    def test_working_and_third_reading_annex_pages_are_textually_identical(self):
        comparison = self.comparison
        self.assertEqual(comparison["identical_pages"], 17)
        self.assertTrue(all(p["native_text_identical"] for p in comparison["pages"]))

    def test_five_level_hierarchy_paths(self):
        nodes = {n["id"]: n for n in self.tree["nodes"]}
        sample = nodes["ib:p877:r12"]  # first facility
        self.assertEqual(sample["kind"], "facility")
        self.assertEqual([nodes[i]["kind"] for i in sample["path_ids"]],
                         ["annex_program", "category_control", "subcategory_control",
                          "region_control", "province_control", "facility"])
        self.assertEqual(nodes[sample["path_ids"][1]]["label"], "1. Primary Care Facilities")
        self.assertEqual(nodes[sample["path_ids"][3]]["label"], "CAR")
        self.assertEqual(nodes[sample["path_ids"][4]]["label"], "Apayao")
        self.assertIn("Conner Malama", sample["label"])

    def test_component_columns_sum_to_total_on_every_row(self):
        for row in self.rows:
            if row["role"] not in {"category", "subcategory", "region", "province",
                                   "facility", "grand_total"}:
                continue
            amounts = row["amounts_php"]
            components = sum(amounts.get(name, 0) for name in
                             ("infrastructure", "medical_equipment", "motor_vehicle"))
            self.assertEqual(components, amounts["total"], row["id"])

    def test_wrapped_labels_and_columns_survive_verbatim(self):
        nodes = {n["id"]: n for n in self.tree["nodes"]}
        wrapped = nodes["ib:p890:r42"]
        self.assertEqual(wrapped["kind"], "subcategory_control")
        self.assertIn("\n", wrapped["label_raw"])
        self.assertIn("Rehabilitation Centers", wrapped["label"])
        self.assertEqual(wrapped["printed_amounts_php"]["total"], 296_000_000)
        grand = next(n for n in self.tree["nodes"] if n["kind"] == "grand_total")
        self.assertEqual(grand["label"], "GRAND TOTAL")
        self.assertEqual(grand["printed_amounts_php"]["motor_vehicle"], 130_700_000)

    def test_odd_even_page_grid_shift_is_detected(self):
        odd = next(p for p in self.pages if p["pdf_page"] == 877)
        even = next(p for p in self.pages if p["pdf_page"] == 878)
        shift = odd["column_boundaries_x"][0] - even["column_boundaries_x"][0]
        self.assertAlmostEqual(shift, 31.5, delta=1.5)

    def test_no_repeated_facility_rows_within_a_parent(self):
        groups = self.audit()["repeated_facility_groups"]
        self.assertEqual(len(groups), 0)

    def test_csv_ledger_roundtrip_and_hierarchy_columns(self):
        rows = list(csv.DictReader(io.StringIO(hfep.csv_rows(self.tree))))
        self.assertEqual(len(rows), 513)
        self.assertEqual(len({r["id"] for r in rows}), 513)
        self.assertEqual(sum(int(r["total_php"]) for r in rows), 10_021_659_000)
        every = all(r["category"] and r["subcategory"] and r["region"]
                    and r["province"] and r["facility"] for r in rows)
        self.assertTrue(every)

    def test_offsetting_corruption_fails_controls_even_when_grand_total_balances(self):
        tree = copy.deepcopy(self.tree)
        nodes = {n["id"]: n for n in tree["nodes"]}
        facilities = [n for n in tree["nodes"] if n["kind"] == "facility"]
        a = facilities[0]
        b = next(n for n in facilities if n["parent_id"] != a["parent_id"])
        a["printed_amounts_php"]["total"] = a["printed_amounts_php"]["total"] + 1_000_000
        b["printed_amounts_php"]["total"] = b["printed_amounts_php"]["total"] - 1_000_000
        audit = self.audit(tree=tree)
        self.assertFalse(audit["passed"])
        self.assertEqual(audit["summary"]["facility_ledger_total_php"], 10_021_659_000)
        self.assertGreaterEqual(audit["summary"]["failed_internal_controls"], 2)
        self.assertTrue(any(e.startswith("native_layout_evidence_disagreement") for e in audit["errors"]))

    def test_dropped_facility_breaks_grand_total_reconciliation(self):
        tree = copy.deepcopy(self.tree)
        nodes = {n["id"]: n for n in tree["nodes"]}
        victim = next(n for n in tree["nodes"] if n["kind"] == "facility")
        parent = nodes[victim["parent_id"]]
        parent["child_ids"].remove(victim["id"])
        tree["nodes"] = [n for n in tree["nodes"] if n["id"] != victim["id"]]
        audit = self.audit(tree=tree)
        self.assertFalse(audit["passed"])
        self.assertTrue(any(e.startswith("control_sum_disagreement") for e in audit["errors"]))

    def test_altered_agency_capital_outlay_is_rejected(self):
        agency = copy.deepcopy(self.agency)
        agency["capital_outlay_php"] += 1_000
        audit = self.audit(agency=agency)
        self.assertFalse(audit["passed"])
        self.assertIn("agency_control_disagreement", audit["errors"])

    def test_missing_amount_word_ownership_is_detected(self):
        rows = copy.deepcopy(self.rows)
        victim = next(r for r in rows if r["role"] == "facility")
        victim["word_indices"] = victim["word_indices"][:-1]
        audit = self.audit(rows=rows)
        self.assertFalse(audit["passed"])
        self.assertTrue(any(e.startswith("source_word_coverage_or_ownership") for e in audit["errors"]))


if __name__ == "__main__":
    unittest.main()
