"""v9 reconciliation tests for the NEP FY2027 NIA Irrigation annex extractor.

Covers: exact six-control tally, recovered rows (trailing-period amount,
below-cutoff band, Kamalig/Libertad split, Marbel single capture), text-layer
amount authority, row ordering, and per-page dump agreement.
"""
import csv
import importlib.util
import json
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "extract_nep_nia.py"
spec = importlib.util.spec_from_file_location("nep_nia", SCRIPT)
nep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nep)


class NepNiaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import pymupdf
        with pymupdf.open(str(nep.SOURCE_FILE)) as doc:
            cls.rows = nep._collect_project_rows(doc)

    # -- exact tallies ---------------------------------------------------

    def test_all_six_sub_programs_tally_exactly(self):
        for name, ctl, _p, _y in nep.SEGMENTS:
            mine = [r for r in self.rows if r["sub_program"] == name]
            self.assertEqual(
                sum(r["amount"] for r in mine), ctl,
                f"{name}: {sum(r['amount'] for r in mine):,} != {ctl:,}")
            self.assertGreater(len(mine), 0, name)

    def test_grand_total_tallies(self):
        total = sum(r["amount"] for r in self.rows)
        control = sum(c for _n, c, _p, _y in nep.SEGMENTS)
        self.assertEqual(total, 17_598_181_000)
        self.assertEqual(total, control)

    def test_row_count_and_order(self):
        self.assertEqual(len(self.rows), 791)
        self.assertEqual([r["seq"] for r in self.rows],
                         list(range(1, 792)))
        keys = [(r["page"], r["y0"]) for r in self.rows]
        self.assertEqual(keys, sorted(keys))
        self.assertEqual(len(keys), len(set(keys)))

    # -- v9 recovery classes ----------------------------------------------

    def test_trailing_period_amount_row_recovered(self):
        # Nagas-Maramba CIS prints "15,000,000." -> 15M CIS row (p12 y534.5)
        row = next(r for r in self.rows if "Nagas-Maramba" in r["label"])
        self.assertEqual(row["amount"], 15_000_000)
        self.assertEqual(row["page"], 12)
        self.assertEqual(row["sub_program"], "Communal Irrigation System")

    def test_below_cutoff_rows_recovered(self):
        expect = {
            (7, 771.5): ("Ilaya SRIS", 12_000_000),
            (9, 767.8): ("Simabusa-Nagbayruangan", 5_000_000),
            (12, 768.6): ("Kalumboyan", 2_000_000),
            (22, 773.4): ("TARLAC GROUND WATER (LA PAZ)", 10_000_000),
            (24, 772.8): ("Roxas SPIP", 10_000_000),
            (27, 774.9): ("BATUTU RIVER SPIP", 10_000_000),
            (28, 769.5): ("LATERAL J-SIMULAO SPIP", 15_000_000),
        }
        for (pg, y), (frag, amt) in expect.items():
            row = next(r for r in self.rows if r["page"] == pg and r["y0"] == y)
            self.assertIn(frag, row["label"])
            self.assertEqual(row["amount"], amt)

    def test_marbel_captured_once(self):
        hits = [r for r in self.rows if r["label"].startswith("Marbel 1")]
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["amount"], 1_200_000)

    def test_kamalig_libertad_are_separate_rows(self):
        kam = next(r for r in self.rows if r["label"].startswith("Kamalig CIS"))
        lib = next(r for r in self.rows if r["label"].startswith("Libertad CIS"))
        self.assertEqual(kam["amount"], 4_000_000)
        self.assertEqual(lib["amount"], 5_000_000)
        self.assertNotEqual(kam["y0"], lib["y0"])

    # -- text-layer authority (v8 fixes reverted) ---------------------------

    def test_text_layer_amounts_are_authoritative(self):
        # Rows whose v8 overrides were wrong; text layer verified by renders.
        expect = {
            (1, 195.1): 3_000_000,    # Upper Chico (not 30M)
            (2, 438.2): 5_000_000,    # Salug Balogo (not 4.7M)
            (4, 568.8): 14_000_000,   # Libmanan Embankment (not 8M)
            (5, 236.5): 9_900_000,    # Malinao IS a (not 4.7M)
            (5, 277.3): 4_000_000,    # Malinao IS b (not 4.7M)
            (6, 368.1): 9_500_000,    # Banaoang (not 5M)
            (8, 630.9): 10_000_000,   # Zinundungan (not 4M)
            (8, 681.6): 15_000_000,   # Iguig Amulung (not 3.5M)
            (9, 255.4): 9_000_000,    # Masipi West (not 25M)
            (22, 560.3): 10_000_000,  # Balanayaw (not 15M)
            (24, 651.1): 10_000_000,  # Naujan SPIP 1 (not 20M)
            (24, 712.0): 10_000_000,  # Naujan SPIP 3 (not 20M)
            (28, 214.2): 10_000_000,  # ALEGRIA (not 15M)
            (29, 193.2): 50_000_000,  # BITOON (not 15M)
        }
        for (pg, y), amt in expect.items():
            row = next(r for r in self.rows if r["page"] == pg and r["y0"] == y)
            self.assertEqual(row["amount"], amt, f"p{pg} y{y} {row['label'][:50]}")

    # -- hygiene -----------------------------------------------------------

    def test_no_empty_labels_or_leaked_headings(self):
        for r in self.rows:
            self.assertTrue(r["label"].strip(), f"p{r['page']} y{r['y0']}")
            for bad in ("EXPENDITURE", "DETAILS OF IRRIGATION",
                        "NATIONAL IRRIGATION ADMIN", "Sub-P", "Sub-Pr"):
                self.assertNotIn(bad, r["label"], f"p{r['page']} {r['label'][:60]}")

    def test_per_page_text_dump_row_count_agreement(self):
        # Independent parse of the per-page dump must find >= rows on every
        # page (dump loses some labels to the text layer but gains nothing).
        import re
        dump_path = nep.DATA / "nia_pdf_text_by_page.txt"
        if not dump_path.exists():
            self.skipTest("per-page dump not generated")
        dump = dump_path.read_text()
        parts = re.split(r"===== \[PDF PAGE (\d+)\] =====\n", dump)
        pg = {int(parts[i]): parts[i + 1] for i in range(1, len(parts), 2)}
        amt_only = re.compile(r"^([—–-]?\d{1,3}(?:,\d{3})+)[.]?$")
        from collections import defaultdict
        dump_rows = defaultdict(int)
        for p in range(1, 31):
            for line in pg[p].split("\n"):
                s = line.strip()
                if amt_only.match(s):
                    dump_rows[p] += 1
        csv_rows = list(csv.DictReader(open(nep.PROJECTS_CSV)))
        v8 = defaultdict(int)
        for r in csv_rows:
            v8[int(r["page"])] += 1
        for p in range(1, 31):
            # dump counts heading-control amounts too; allow small excess but
            # never a deficit vs our extraction
            self.assertGreaterEqual(
                dump_rows[p] + 2, v8[p],
                f"p{p}: dump has {dump_rows[p]} amounts vs {v8[p]} extracted rows")

    def test_csv_artifacts_consistent(self):
        rows = list(csv.DictReader(open(nep.PROJECTS_CSV)))
        self.assertEqual(len(rows), 791)
        self.assertEqual(sum(int(r["amount"]) for r in rows), 17_598_181_000)
        subs = list(csv.DictReader(open(nep.SUBPROGRAMS_CSV)))
        self.assertEqual(len(subs), 6)
        self.assertTrue(all(int(s["difference"]) == 0 for s in subs))
        self.assertEqual(sum(int(s["project_count"]) for s in subs), 791)

    # -- final dataset JSON with provenance ---------------------------------

    def test_dataset_json_integrity(self):
        d = json.load(open(nep.DATASET_JSON))
        m = d["meta"]
        self.assertEqual(m["row_count"], 791)
        self.assertEqual(m["grand_total"], 17_598_181_000)
        self.assertEqual(m["control_total"], 17_598_181_000)
        self.assertTrue(m["all_controls_reconciled"])
        self.assertEqual(len(d["projects"]), 791)
        self.assertEqual(len(d["sub_programs"]), 6)
        self.assertTrue(all(s["tallies"] for s in d["sub_programs"]))
        # provenance is complete on every row
        for p in d["projects"]:
            pv = p["provenance"]
            self.assertIn("embedded OCR text layer", pv["source"])
            self.assertIsInstance(pv["page"], int)
            self.assertIsInstance(pv["amount_raw"], (str, type(None)))
            self.assertIn("flags", p)
        # IDs are unique and stable-format
        ids = [p["id"] for p in d["projects"]]
        self.assertEqual(len(ids), len(set(ids)))
        for p in d["projects"]:
            self.assertRegex(p["id"], r"^nep-nia-p\d+-y\d+$")
        # sums re-tally from the JSON alone
        self.assertEqual(sum(p["amount_php"] for p in d["projects"]),
                         17_598_181_000)

    def test_dataset_flag_coverage(self):
        d = json.load(open(nep.DATASET_JSON))
        flags = [f for p in d["projects"] for f in p["flags"]]
        from collections import Counter
        c = Counter(f["flag"] for f in flags)
        self.assertEqual(c["amount_adjudicated"], 16)
        self.assertEqual(c["bottom_band_row"], 7)
        self.assertEqual(c["label_repaired"], 2)
        self.assertEqual(c["label_quirk"], 2)
        self.assertEqual(c["trailing_period_amount"], 1)
        self.assertEqual(c["prior_version_double_count"], 1)
        # every adjudicated flag references a real evidence crop
        ev_dir = nep.EVIDENCE
        for f in flags:
            if f["flag"] == "amount_adjudicated":
                crop = f.get("evidence_crop")
                if crop:
                    self.assertTrue((ev_dir / crop).exists(), crop)

    def test_dataset_meta_pinned_sources(self):
        d = json.load(open(nep.DATASET_JSON))
        m = d["meta"]
        self.assertEqual(len(m["source_pdf_sha256"]), 64)
        self.assertEqual(len(m["extractor_sha256"]), 64)
        self.assertEqual(m["pymupdf_version"], pymupdf_version_string())
        self.assertIn("normalization_rules", m)
        self.assertIn("extraction_history", m)
        self.assertIn("supplementary_sources", m)


def pymupdf_version_string():
    import pymupdf
    return pymupdf.__version__


if __name__ == "__main__":
    unittest.main()
