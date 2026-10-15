"""Source-backed extraction and corruption tests for the NIA annex layout family."""
import copy
import csv
import importlib.util
import io
from pathlib import Path
import unittest

import pymupdf

SCRIPT = Path(__file__).resolve().parents[1] / "extract_hgab_nia.py"
spec = importlib.util.spec_from_file_location("nia", SCRIPT)
nia = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nia)


class NIATests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with pymupdf.open(nia.IB) as doc:
            cls.rows, cls.pages = nia.extract_rows(doc)
        cls.tree = nia.build_tree(cls.rows, cls.pages[0]["annex_title"])
        cls.agency = nia.agency_controls()
        cls.comparison = nia.reading_comparison()

    def audit(self, tree=None, rows=None, pages=None, agency=None):
        return nia.validate(rows if rows is not None else self.rows,
                            pages if pages is not None else self.pages,
                            tree if tree is not None else self.tree,
                            agency if agency is not None else self.agency,
                            self.comparison)

    def test_full_annex_and_agency_controls(self):
        audit = self.audit()
        self.assertTrue(audit["passed"], audit["errors"])
        summary = audit["summary"]
        self.assertEqual(summary["projects"], 828)
        self.assertEqual(summary["subprograms"], 6)
        self.assertEqual(summary["project_ledger_total_php"], 17_999_305_000)
        self.assertEqual(summary["internal_control_checks"], 6)
        self.assertEqual(summary["agency_control_checks"], 11)
        self.assertEqual(summary["failed_agency_controls"], 0)
        self.assertEqual(summary["agency_only_carp_rows"], 1)
        self.assertEqual(summary["detail_pages"], 46)
        self.assertEqual(summary["row_role_counts"]["program_control"], 1)

    def test_development_heading_groups_last_three_subprograms(self):
        by_id = {n["id"]: n for n in self.tree["nodes"]}
        program = next(n for n in self.tree["nodes"] if n["kind"] == "program_control")
        self.assertEqual(program["label"], "IRRIGATION SYSTEMS DEVELOPMENT PROGRAM")
        self.assertEqual(program["source"]["pdf_page"], 919)
        children = [by_id[c]["label"] for c in program["child_ids"]]
        self.assertEqual(len(children), 3)
        root_children = [by_id[c]["label"] for c in by_id[self.tree["root_id"]]["child_ids"]]
        self.assertEqual(len(root_children), 4)  # program heading + 3 restoration sub-programs

    def test_wrapped_and_cross_page_continuation_titles(self):
        project = next(n for n in self.tree["nodes"] if n["id"] == "ib:p896:r5")
        self.assertIn("Portland Cement Concrete Pavement (PCCP) with Embankment", project["label"])
        self.assertEqual(project["printed_amount_php"], 3_000_000)
        trailing = next(r for r in self.rows if r["pdf_page"] == 897 and r["continuation_lines"])
        self.assertIn("PRIS-SDC PH2", trailing["title_lines"][0]["label_text"])

    def test_title_numeric_tokens_do_not_become_amounts(self):
        flagged = {r["id"]: r for r in self.rows if r["title_numeric_tokens"]}
        self.assertEqual(set(flagged), {"ib:p906:r15", "ib:p915:r17"})
        audit = self.audit()
        self.assertEqual(audit["summary"]["title_numeric_token_rows"], 2)
        project = next(n for n in self.tree["nodes"] if n["id"] == "ib:p906:r15")
        self.assertIn("1,000 hectares", project["label"])

    def test_repeated_titles_are_retained_as_separate_printed_rows(self):
        groups = self.audit()["repeated_title_groups"]
        self.assertEqual(len(groups), 4)
        self.assertTrue(all(len(g["project_ids"]) == 2 for g in groups))

    def test_agency_only_carp_row_is_flagged_not_merged(self):
        checks = self.audit()["agency_checks"]
        carp = [c for c in checks if c["note"] and c["note"].startswith("agency-only scope")]
        self.assertEqual(len(carp), 1)
        self.assertEqual(carp[0]["total_php"], 698_067_000)
        self.assertIn("not printed as an annex sub-program", carp[0]["note"])
        annex_other = [c for c in checks
                       if c["label"].upper().startswith("OTHER IRRIGATION")
                       and c["annex_total_php"] == 460_000_000]
        self.assertEqual(len(annex_other), 1)

    def test_csv_ledger_roundtrip(self):
        artifacts, audit = nia.build()
        rows = list(csv.DictReader(io.StringIO(artifacts["hgab_nia_projects.csv"])))
        self.assertEqual(len(rows), 828)
        self.assertEqual(len({r["id"] for r in rows}), 828)
        self.assertEqual(sum(int(r["amount_php"]) for r in rows),
                         audit["summary"]["project_ledger_total_php"])
        subprograms = list(csv.DictReader(io.StringIO(artifacts["hgab_nia_subprograms.csv"])))
        self.assertEqual(len(subprograms), 6)
        self.assertTrue(all(int(s["difference_php"]) == 0 for s in subprograms))
        self.assertEqual(sum(int(s["project_count"]) for s in subprograms), 828)

    def test_offsetting_errors_fail_subprograms_even_when_root_total_matches(self):
        tree = copy.deepcopy(self.tree)
        projects = [n for n in tree["nodes"] if n["kind"] == "project"]
        a = projects[0]
        b = next(n for n in projects if n["parent_id"] != a["parent_id"])
        a["printed_amount_php"] += 1_000_000
        b["printed_amount_php"] -= 1_000_000
        audit = self.audit(tree=tree)
        self.assertFalse(audit["passed"])
        self.assertEqual(audit["summary"]["project_ledger_total_php"], 17_999_305_000)
        self.assertEqual(audit["summary"]["failed_internal_controls"], 2)
        self.assertTrue(any(e.startswith("native_layout_evidence_disagreement") for e in audit["errors"]))

    def test_dropped_project_fails_source_coverage(self):
        tree = copy.deepcopy(self.tree)
        tree["nodes"].remove(next(n for n in tree["nodes"] if n["kind"] == "project"))
        audit = self.audit(tree=tree)
        self.assertFalse(audit["passed"])
        self.assertIn("source_amount_row_coverage_or_ownership", audit["errors"])

    def test_dropped_or_double_owned_word_fails_coverage(self):
        rows = copy.deepcopy(self.rows)
        project = next(r for r in rows if r["role"] == "project")
        project["title_lines"][0]["word_indices"].pop()
        self.assertTrue(any(e.startswith("source_word_coverage_or_ownership")
                            for e in self.audit(rows=rows)["errors"]))
        rows = copy.deepcopy(self.rows)
        project = next(r for r in rows if r["role"] == "project")
        indices = project["title_lines"][0]["word_indices"]
        indices.append(indices[0])
        self.assertTrue(any(e.startswith("source_word_coverage_or_ownership")
                            for e in self.audit(rows=rows)["errors"]))

    def test_swapping_equal_amount_projects_fails_printed_parent_evidence(self):
        tree = copy.deepcopy(self.tree)
        by_id = {n["id"]: n for n in tree["nodes"]}
        projects = [n for n in tree["nodes"] if n["kind"] == "project"]
        a = projects[0]
        b = next(n for n in projects
                 if n["parent_id"] != a["parent_id"]
                 and n["printed_amount_php"] == a["printed_amount_php"])
        pa, pb = by_id[a["parent_id"]], by_id[b["parent_id"]]
        pa["child_ids"][pa["child_ids"].index(a["id"])] = b["id"]
        pb["child_ids"][pb["child_ids"].index(b["id"])] = a["id"]
        a["parent_id"], b["parent_id"] = b["parent_id"], a["parent_id"]
        a["subprogram_label"], b["subprogram_label"] = b["subprogram_label"], a["subprogram_label"]
        audit = self.audit(tree=tree)
        self.assertEqual(audit["summary"]["failed_internal_controls"], 0)
        self.assertFalse(audit["passed"])
        self.assertTrue(any(e.startswith("printed_heading_parent_disagreement")
                            for e in audit["errors"]))

    def test_changed_agency_control_amount_fails(self):
        agency = copy.deepcopy(self.agency)
        target = next(o for o in agency if o["label"].upper().startswith("IRRIGATION SYSTEMS RESTORATION"))
        target["total_php"] += 1_000
        self.assertTrue(any(e.startswith("agency_control_disagreement")
                            for e in self.audit(agency=agency)["errors"]))
        agency = copy.deepcopy(self.agency)
        target = next(o for o in agency if o["label"].upper().startswith("ESTABLISHMENT"))
        target["mooe_php"] -= 1_000
        self.assertTrue(any(e.startswith("agency_control_disagreement")
                            for e in self.audit(agency=agency)["errors"]))


if __name__ == "__main__":
    unittest.main()
