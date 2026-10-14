"""Geolocation workbench dataset regressions."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_gps_workbench as builder  # noqa: E402


class WorkbenchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = builder.build()

    def test_schema_and_totals(self):
        self.assertEqual(self.data["schema_version"], 1)
        self.assertEqual(self.data["coordinate_column_order"], "longitude, latitude")
        totals = self.data["totals"]
        self.assertEqual(totals["records_with_gps"], len(self.data["records"]))
        self.assertEqual(sum(d["records"] for d in self.data["datasets"]), len(self.data["records"]))

    def test_every_record_has_dataset_metadata_group_and_link(self):
        for record in self.data["records"]:
            meta = builder.DATASETS[record["dataset"]]
            self.assertEqual(record["group"], meta["group"])
            if meta["group"] == "dpwh":
                self.assertTrue(record["pap"], "DPWH record missing PAP label")
            link = record["link"]
            if meta["deep_link"]:
                # Dataset-level deep links (comparison rows, annex trees) keep
                # the record id as the node/record selector.
                self.assertEqual(link["workspace"], meta["deep_link"][0])
                self.assertEqual(link["route"], meta["deep_link"][1])
                self.assertEqual(link["node"], record["record_id"])
            elif link:
                # Otherwise the link resolves from an evidence tree ref.
                self.assertIn("workspace", link)
                self.assertIn("node", link)
            self.assertTrue(record.get("sources"), "record missing evidence sources")

    def test_pap_facet_covers_dpwh_group_and_ranks(self):
        paps = self.data["paps"]
        self.assertGreaterEqual(len(paps), 5)
        self.assertTrue(all(p["pap"] for p in paps))
        self.assertEqual([p["records"] for p in paps], sorted((p["records"] for p in paps), reverse=True))
        total = sum(p["records"] for p in paps)
        dpwh_records = [r for r in self.data["records"] if r["group"] == "dpwh" and r["pap"]]
        self.assertEqual(total, len(dpwh_records))
        for entry in paps:
            self.assertTrue(entry["datasets"])
            self.assertEqual(entry["issues"], sum(
                1 for r in dpwh_records if r["pap"] == entry["pap"]
                for f in r["fields"] for p in f["points"]
                if (p.get("longitude") is None or p.get("latitude") is None) or p.get("issues")))

    def test_fmr_and_nia_deep_links_reference_real_node_ids(self):
        # FMR tree node ids come from the retained extraction layers; NIA ids
        # from the dataset builder. Both accept record_id as `node`.
        hgab = next(r for r in self.data["records"] if r["dataset"] == "hgab_fmr")
        self.assertEqual(hgab["link"]["workspace"], "fmr")
        self.assertRegex(hgab["record_id"], r"^ib:p\d+:r\d+$")
        nia = next(r for r in self.data["records"] if r["dataset"] == "nep_nia_projects")
        self.assertEqual(nia["link"]["workspace"], "nia")
        self.assertTrue(nia["record_id"])

    def test_every_dataset_uses_its_own_record_url_convention(self):
        """Each dataset addresses records differently; assert each format."""
        import urllib.parse

        def href(record):
            link = record["link"]
            prefix = "" if link["workspace"] == "dpwh" else f"{link['workspace']}/"
            params = list((link.get("params") or {}).items())
            if link["route"] == "compare":
                params = [("record", link["node"]), ("view", "projects")] + params
            else:
                params = params + [("node", link["node"])]
            return f"#{prefix}{link['route']}?" + urllib.parse.urlencode(params)

        first = {}
        for record in self.data["records"]:
            if not record.get("link"):
                continue
            key = (record["dataset"], record["link"]["route"],
                   tuple(sorted((record["link"].get("params") or {}).keys())))
            first.setdefault(key, record)

        # (dataset, route, params) → expected URL shape prefix/suffix
        expected = {
            ("hgab_fmr", "house", ()): ("#fmr/house?node=", "ib:p"),
            ("nep_fmr", "nep", ()): ("#fmr/nep?node=", "nep_fmr:p"),
            ("dpwh_comparison_2027", "compare", ()): ("#compare?record=", "house-reading:"),
            ("hb_dpwh_leaves_v5", "house", ("reading", "view")): ("#house?", "node=c"),
            ("nep_2027_source_projects", "nep", ()): ("#nep?node=", "p"),
            ("chainage_units_2027", "nep", ()): ("#nep?node=", "p"),
            ("chainage_units_2027", "house", ("reading", "view")): ("#house?", "node=c"),
            ("hgab_nia", "house", ()): ("#nia/house?node=", "ib:p"),
            ("nep_nia_projects", "nep", ()): ("#nia/nep?node=", "nep-nia-"),
        }
        for key, (start, contains) in expected.items():
            self.assertIn(key, first, f"no record links for {key}")
            url = urllib.parse.unquote(href(first[key]))
            self.assertTrue(url.startswith(start), f"{key}: {url} !~ {start}")
            self.assertIn(contains, url, f"{key}: {url} missing {contains}")

        # Unlinked leaves must still carry House I-C evidence refs; pages are
        # expected except where the source row itself lacks one.
        unlinked_without_page = [
            r["record_id"] for r in self.data["records"]
            if r["dataset"] == "hb_dpwh_leaves_v5" and not r.get("link")
            and not any(s.get("pdf_page") for s in r["sources"])
        ]
        self.assertLessEqual(len(unlinked_without_page), 5,
                             f"unlinked leaves without PDF page: {unlinked_without_page}")

    def test_documents_registry_pins_previewable_pdfs(self):
        docs = {d["key"]: d for d in self.data["documents"]}
        used = {s["document"] for r in self.data["records"] for s in r["sources"]}
        for key in used:
            self.assertIn(key, docs, f"records reference unregistered document {key}")
            self.assertGreater(docs[key]["pages"], 0)
        # every referenced page falls inside its document
        for record in self.data["records"]:
            for source in record["sources"]:
                page = source.get("pdf_page")
                if page is not None:
                    self.assertLessEqual(page, docs[source["document"]]["pages"],
                                         f"{record['record_id']} page {page} out of range")

    def test_parsed_points_conservative(self):
        points = 0
        for record in self.data["records"]:
            for field in record["fields"]:
                for p in field["points"]:
                    if p.get("longitude") is not None and p.get("latitude") is not None:
                        self.assertLessEqual(abs(p["longitude"]), 180)
                        self.assertLessEqual(abs(p["latitude"]), 90)
                        points += 1
        self.assertEqual(points, self.data["totals"]["points_parsed"])

    def test_output_matches_build(self):
        output = Path(builder.OUTPUT)
        if output.is_file():
            self.assertEqual(json.loads(output.read_text())["totals"], self.data["totals"])


if __name__ == "__main__":
    unittest.main()
