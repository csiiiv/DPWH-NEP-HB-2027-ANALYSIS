"""Scanner fragment detection and end-to-end inventory smoke checks."""
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import scan_gps_inventory as scan  # noqa: E402


class FragmentTests(unittest.TestCase):
    def test_title_paren_pair(self):
        hit = scan.analyze_text(
            "Construction of Multi-Purpose Building (14.701817, 120.928578)"
        )
        self.assertIsNotNone(hit)
        self.assertEqual(hit["status"], "parsed")
        self.assertEqual(hit["points"][0]["latitude"], 14.701817)
        self.assertIn("paren_pair", hit["fragment_kinds"])

    def test_chainage_without_gps_is_ignored(self):
        hit = scan.analyze_text(
            "Preventive Maintenance along Calapan South Road - K0029 + 690 - K0031 + 087, 0.750 km"
        )
        self.assertIsNone(hit)

    def test_canal_lateral_and_tail_end_not_gps(self):
        hit = scan.analyze_text(
            "Daet-Talisay RIS: Repair at Sta. 0+000-0+514.20, Lat. A-1b; "
            "Installation of Diesel Engine Pump at Tail end of Lateral A1"
        )
        self.assertIsNone(hit)

    def test_fmr_dedicated_field(self):
        hit = scan.analyze_text(
            "START: 18.284622, 120.625421\nEND: 18.287494, 120.628232",
            dedicated_field=True,
        )
        self.assertEqual(hit["status"], "parsed")
        self.assertEqual(len(hit["points"]), 2)


class DegreePairTests(unittest.TestCase):
    """Decimal-degree pairs written with degree symbols / hemisphere letters.

    These used to fall through PAREN_PAIR and INLINE_PH_PAIR (both tolerate
    bare digits only) and were reported hint_only despite carrying a valid,
    plottable coordinate pair.
    """

    def test_paren_pair_with_degree_and_hemisphere(self):
        hit = scan.analyze_text(
            "Construction of Bridge at Sitio San Joseph, Barangay San Jose, "
            "Antipolo City (14.656598°N, 121.267969°E)"
        )
        self.assertEqual(hit["status"], "parsed")
        self.assertIn("degree_pair", hit["fragment_kinds"])
        self.assertAlmostEqual(hit["points"][0]["latitude"], 14.656598)
        self.assertAlmostEqual(hit["points"][0]["longitude"], 121.267969)

    def test_bare_degree_pair_inside_prose(self):
        hit = scan.analyze_text(
            "Construction (Completion) of Bridge along Malasag River, Barangay "
            "Cugman, Cagayan de Oro City, Misamis Oriental, 8.452176°, 124.689299°"
        )
        self.assertEqual(hit["status"], "parsed")
        self.assertAlmostEqual(hit["points"][0]["latitude"], 8.452176)
        self.assertAlmostEqual(hit["points"][0]["longitude"], 124.689299)

    def test_masculine_ordinal_is_accepted_as_degree(self):
        # OCR often prints º (U+00BA) for °. The prefilter runs before
        # ascii_text normalization, so GPS_HINT itself must accept it or the
        # record is skipped before any parser sees it.
        hit = scan.analyze_text("Multi-Purpose Building (124.14134 º, 8.12081 °)")
        self.assertTrue(scan.has_gps_hint("Bridge (14.656598 º, 121.267969 º)"))
        self.assertEqual(hit["status"], "parsed")
        # Longitude-first ordering is detected and corrected downstream.
        self.assertAlmostEqual(hit["points"][0]["latitude"], 8.12081)
        self.assertAlmostEqual(hit["points"][0]["longitude"], 124.14134)

    def test_hemisphere_prefix_form(self):
        hit = scan.analyze_text(
            "Construction of Multi-Purpose Building at Purok Ligaa, Ibabang "
            "Talim, Lucena City (N 13.909041°, E 121.5°)"
        )
        self.assertEqual(hit["status"], "parsed")
        self.assertAlmostEqual(hit["points"][0]["latitude"], 13.909041)
        self.assertAlmostEqual(hit["points"][0]["longitude"], 121.5)

    def test_damaged_dms_stays_unparsed(self):
        # 124°5154.78E is not a real longitude; it must NOT be silently
        # coerced into a plausible-looking point.
        hit = scan.analyze_text(
            "Construction of Multi-Purpose Building, Barangay Payao, Catbalogan "
            "City, Samar ( 11°48'13.95°N, 124°5154.78E)"
        )
        self.assertEqual(hit["status"], "hint_only")
        self.assertEqual(hit["points"], [])

    def test_place_name_letters_are_not_hemispheres(self):
        # Regression: an unanchored [NSEW] let the trailing "s" of "Batanes"
        # be read as a South marker, flipping real Batanes projects to
        # latitude -20.3 and out of the Philippine bounding box.
        cases = [
            ("Batanes 20.34983°, 121.93853°", 20.34983, 121.93853),
            ("Basco, Batanes 20.44972°,121.96741°", 20.44972, 121.96741),
            ("Uyugan, Batanes 20.45211°, 121.96935°", 20.45211, 121.96935),
            ("Eastern Wao, 7.7761°, 124.2237°", 7.7761, 124.2237),
        ]
        for text, lat, lon in cases:
            with self.subTest(text=text):
                hit = scan.analyze_text(text)
                self.assertEqual(hit["status"], "parsed")
                point = hit["points"][0]
                self.assertAlmostEqual(point["latitude"], lat)
                self.assertAlmostEqual(point["longitude"], lon)
                self.assertGreater(point["latitude"], 0)
                self.assertEqual(point["issues"], [])

    def test_marker_is_required_outside_parentheses(self):
        # Regression: making the degree marker optional let branch A match any
        # "number, number" run, so it swallowed the hyphen of a hyphen-joined
        # barangay point list as a negative sign and produced latitude -15.1.
        # INLINE_PH_PAIR already parses these correctly with a positive sign.
        text = ("Construction of Multi-Purpose Building (Covered Court), "
                "Angeles City, Pampanga ANUNAS (FRIENDSHIP)-15.155685101922105, "
                "120.55356457224914 CAPAYA-15.145946770385812, 120.61682652428347")
        kinds = [kind for kind, _ in scan.candidate_fragments(text)]
        self.assertNotIn("degree_pair", kinds)
        hit = scan.analyze_text(text)
        self.assertEqual(hit["status"], "parsed")
        for point in hit["points"]:
            self.assertGreater(point["latitude"], 0, point)
            self.assertGreater(point["longitude"], 0, point)
            self.assertIn("inline_ph_pair", hit["fragment_kinds"])

    def test_longitude_first_point_lists_stay_positive(self):
        hit = scan.analyze_text(
            "Multi-Purpose Building (Covered Court), Magalang, Pampanga "
            "Ayala - 120.7034, 15.2275 San Francisco - 120.6488, 15.2074"
        )
        self.assertEqual(hit["status"], "parsed")
        self.assertGreaterEqual(len(hit["points"]), 2)
        for point in hit["points"]:
            self.assertGreater(point["latitude"], 0)
            self.assertIn("longitude_first_reordered", point["rules"])

    def test_hemisphere_letters_do_still_apply(self):
        # The boundary fix must not disable genuine southern/western markers.
        hit = scan.analyze_text("Site (20.34983°S, 121.93853°W)")
        point = hit["points"][0]
        self.assertAlmostEqual(point["latitude"], -20.34983)
        self.assertAlmostEqual(point["longitude"], -121.93853)
        # Out-of-box for the Philippines, so it must be flagged not dropped.
        self.assertIn("outside_philippines_orientation_bounds", point["issues"])

    def test_relaxed_prefilter_does_not_admit_prose(self):
        for text in (
            "Construction of Road, 3.5 km, 2 lanes",
            "Purchase of 5.5 hectares, 3 parcels",
            "Rehabilitation of Bridge (Sta. 0+100 to 0+250)",
        ):
            with self.subTest(text=text):
                self.assertIsNone(scan.analyze_text(text))


class ChangeTypeTests(unittest.TestCase):
    """Budget-change buckets derived from unified DPWH comparison traces."""

    def test_trace_mapping_covers_the_five_categories(self):
        cases = {
            "house_only_candidate": "insertion",
            "nep_only_candidate": "deletion",
            "candidate_increase": "adjustment_increased",
            "candidate_decrease": "adjustment_decreased",
            "amount_same": "no_change",
        }
        for trace, expected in cases.items():
            with self.subTest(trace=trace):
                self.assertEqual(scan.comparison_change_type(trace, None), expected)

    def test_compound_traces_fall_back_to_the_signed_delta(self):
        # outside_api_then_* and transparency_gap_then_* rows carry a delta but
        # no direct trace key, so the signed House-minus-NEP amount decides.
        self.assertEqual(scan.comparison_change_type("outside_api_then_candidate_decrease", -4403000),
                         "adjustment_decreased")
        self.assertEqual(scan.comparison_change_type("outside_api_then_amount_same", 0), "no_change")
        self.assertEqual(scan.comparison_change_type("transparency_gap_then_candidate_increase", 1000),
                         "adjustment_increased")

    def test_fuzzy_match_without_a_nep_side_stays_unknown(self):
        # fuzzy_candidate rows can lack a NEP counterpart amount entirely; they
        # must not be forced into a change bucket they do not support.
        self.assertEqual(scan.comparison_change_type("fuzzy_candidate", None), "unknown")
        self.assertEqual(scan.comparison_change_type("ambiguous", None), "unknown")

    def test_missing_trace_returns_none(self):
        self.assertIsNone(scan.comparison_change_type(None, None))


class InventorySmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        summary_path = HERE / "data/gps_inventory_summary.json"
        if not summary_path.is_file():
            raise unittest.SkipTest("Run scan_gps_inventory.py first to build outputs")
        cls.summary = json.loads(summary_path.read_text())
        cls.inventory = json.loads((HERE / "data/gps_inventory.json").read_text())

    def test_fmr_projects_all_hit(self):
        self.assertEqual(self.summary["records_with_gps"].get("hgab_fmr"), 964)
        self.assertEqual(self.summary["records_with_gps"].get("nep_fmr"), 704)

    def test_dpwh_titles_yield_thousands(self):
        self.assertGreaterEqual(self.summary["records_with_gps"].get("dpwh_comparison_2027", 0), 2000)
        self.assertGreaterEqual(self.summary["records_with_gps"].get("hb_dpwh_leaves_v5", 0), 2000)

    def test_nia_hfep_near_zero(self):
        for key in ("hgab_nia", "nep_nia_projects", "hgab_hfep", "nep_hfep"):
            self.assertLessEqual(self.summary["records_with_gps"].get(key, 0), 20, key)

    def test_hit_schema(self):
        hit = self.inventory["hits"][0]
        for key in ("dataset", "record_id", "status", "fields", "point_count",
                    "amount", "change_type"):
            self.assertIn(key, hit)

    def test_amounts_are_attached_where_sources_print_them(self):
        # Every scanned source in this inventory prints an amount, so no hit
        # should be missing one.
        missing = [h["record_id"] for h in self.inventory["hits"]
                   if not isinstance(h.get("amount"), (int, float))]
        self.assertEqual(missing, [], f"{len(missing)} hits without an amount")
        self.assertEqual(self.summary["totals"]["with_amount"],
                         self.summary["totals"]["records_with_gps"])

    def test_change_type_only_set_on_comparison_rows(self):
        by_change = self.summary["totals"]["by_change_type"]
        # Change tracking exists only for the unified comparison dataset today;
        # FMR/NIA/HFEP and the other DPWH artifacts stay null (a known gap).
        for hit in self.inventory["hits"]:
            if hit["dataset"] == "dpwh_comparison_2027":
                self.assertIn(hit.get("change_type"),
                              {"insertion", "deletion", "adjustment_increased",
                               "adjustment_decreased", "no_change", "unknown"})
            else:
                self.assertIsNone(hit.get("change_type"), hit["dataset"])
        self.assertEqual(sum(by_change.values()),
                         self.summary["records_with_gps"]["dpwh_comparison_2027"])
        # The five documented buckets all actually occur in the GPS subset.
        for bucket in ("insertion", "deletion", "adjustment_increased",
                       "adjustment_decreased", "no_change"):
            self.assertGreater(by_change.get(bucket, 0), 0, bucket)


if __name__ == "__main__":
    unittest.main()
