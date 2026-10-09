#!/usr/bin/env python3
"""Exercise the packaged React migration under a GitHub Pages project prefix.

Requires Playwright and Chromium; run after packaging with --with-react.
"""
from pathlib import Path
import sys, tempfile, threading, json, re, os
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from serve_pages import RangeHandler


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


prefix = "DPWH-NEP-HB-2027-ANALYSIS"
tmp = tempfile.TemporaryDirectory()
Path(tmp.name, prefix).symlink_to(ROOT / "_site", target_is_directory=True)
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=tmp.name))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = os.environ.get(
    "REACT_WORKBENCH_URL", f"http://127.0.0.1:{server.server_port}/{prefix}/app/"
)
errors = []
bad = []
ranges = []
requests = []
with sync_playwright() as p:
    chrome = os.environ.get("CHROME_BIN") or (
        "/usr/bin/google-chrome" if Path("/usr/bin/google-chrome").exists() else None
    )
    browser = p.chromium.launch(
        headless=True,
        args=["--no-sandbox"],
        **({"executable_path": chrome} if chrome else {}),
    )
    for width in [390, 1440]:
        page = browser.new_page(viewport={"width": width, "height": 1000})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on(
            "response",
            lambda r: (
                bad.append([r.url, r.status])
                if r.status >= 400
                else (
                    ranges.append([r.url, r.status, r.headers.get("content-length")])
                    if r.status == 206
                    else None
                )
            ),
        )
        page.on("request", lambda r: requests.append(r.url))
        before = len(requests)
        page.goto(base, wait_until="networkidle")
        page.locator(".cards article").first.wait_for()
        native_summary = page.locator(".native-project-summary").inner_text()
        assert "15,972 named-project leaves" in native_summary
        assert "29 FAP totals" in native_summary
        assert "639,179,718,000" in native_summary and "excludes PS" in native_summary
        assert page.get_by_role("link", name="Inspect native I-C allocation candidates").get_attribute("href") == "#house-nep"

        assert not any(
            "stage_trace_2027.json" in url
            or "PdfPreview-" in url
            or "pdf.worker" in url
            for url in requests[before:]
        )
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.get_by_role("link", name="Open sortable comparison").click()
        page.locator("tbody tr").first.wait_for(timeout=60000)
        assert page.locator("tbody tr").count() == 46
        assert "native Volume I-C; v5 is retired" in page.locator("main").inner_text()
        fap = page.locator(".comparison-table tbody tr").filter(has_text="Foreign-assisted projects (FAP)")
        expect(fap).to_have_count(1)
        expect(fap).to_contain_text("117.749B")
        expect(fap).to_contain_text("44.749B")
        assert fap.locator("td").first.inner_text() == "—"
        expect(page.locator("tbody button.source-link").filter(has_text="House 2nd · I-C").first).to_be_visible()
        page.get_by_role("button", name="Missing from listing", exact=True).click()
        assert page.locator("tbody tr").count() == 23
        page.locator("tbody button.source-link").first.click()
        page.locator(".pdf-pane").wait_for()
        page.get_by_role("status").filter(
            has_text=re.compile(r"^Page \d+ of \d+$")
        ).wait_for(timeout=60000)
        assert page.locator("canvas").evaluate("e=>e.width>0 && e.height>0")
        assert page.get_by_role("dialog").count() == 0
        if width == 1440:
            table_box = page.locator(".comparison-table").bounding_box()
            pdf_box = page.locator(".source-pane").bounding_box()
            assert pdf_box["x"] >= table_box["x"] + table_box["width"]
        else:
            assert not page.locator(".comparison-table").is_visible()
        page.get_by_role("button", name="Fit H", exact=True).click()
        page.get_by_role("button", name="Fit W", exact=True).click()

        prior_page = int(page.get_by_label("PDF page", exact=True).input_value())
        page.get_by_role("button", name="Next page", exact=True).click()
        page.get_by_role("status").filter(
            has_text=re.compile(rf"^Page {prior_page+1} of \d+$")
        ).wait_for(timeout=60000)
        page.get_by_role("button", name="Clear preview").click()
        assert page.locator(".pdf-pane").count() == 0
        page.get_by_role("button", name="Project records", exact=True).click()
        page.get_by_role("button", name="Sort by House GAB", exact=True).click()
        page.get_by_role("menuitemradio", name="Delta vs previous", exact=False).click()
        page.get_by_role("button", name="Sort by House GAB", exact=True).click()
        page.get_by_role("menuitemradio", name="Delta vs previous", exact=False).click()
        assert (
            page.locator("thead th").nth(3).get_attribute("aria-sort") == "descending"
        )
        data = json.loads((ROOT / "analysis/data/stage_trace_2027.json").read_text())
        expected = max(
            (r for r in data["projects"] if r["nep"] and r["house"]),
            key=lambda r: r["house"]["amount_php"] - r["nep"]["amount_php"],
        )
        assert page.locator("tbody th").first.inner_text().startswith(expected["title"])
        assert page.locator("tbody tr").count() == 50
        page.get_by_role("button", name="Next", exact=True).click()
        assert "51–100" in page.locator(".pager").inner_text()
        # Office filtering consumes all records, not just the displayed page.
        office = "Ilocos Norte 1st District Engineering Office"
        region = "Region I"
        office_count = sum(r["region"] == region and any(
            (r.get(stage) or {}).get("office") == office and (r.get(stage) or {}).get("region") == region
            for stage in ("house", "nep", "api")) for r in data["projects"])
        page.get_by_label("Region", exact=True).select_option(region)
        page.get_by_label("Engineering office / DEO", exact=True).select_option(office)
        expect(page.locator(".result-count")).to_contain_text(f"{office_count:,} of")
        expect(page.locator(".pager")).to_contain_text("1–50")
        assert page.locator("tbody tr").count() == 50
        for text in page.locator("tbody th").all_inner_texts():
            assert office in text
        page.get_by_role("button", name="Next", exact=True).click()
        expect(page.locator(".pager")).to_contain_text("51–100")
        page.get_by_label("Region", exact=True).select_option("Region V")
        expect(page.get_by_label("Engineering office / DEO", exact=True)).to_have_value("")
        assert office not in page.get_by_label("Engineering office / DEO", exact=True).inner_text()
        page.get_by_label("Region", exact=True).select_option("")
        page.get_by_label("Search", exact=True).fill("Mindanao Transport Connectivity")
        page.locator("tbody th").first.wait_for()
        house = page.locator("tbody button.source-link").filter(has_text="House").first
        house.click()
        page.get_by_role("status").filter(
            has_text=re.compile(r"^Page \d+ of \d+$")
        ).wait_for(timeout=60000)
        assert page.locator("canvas").evaluate("e=>e.width>0 && e.height>0")
        page.get_by_role("button", name="Clear preview").click()
        assert page.locator(".pdf-pane").count() == 0
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.goto(base + "#compare", wait_until="networkidle")
        page.reload(wait_until="networkidle")
        page.locator("tbody tr").first.wait_for(timeout=60000)
        assert page.locator("tbody tr").count() == 46
        # All workspaces share the same shell and navigate without a document reload.
        page.evaluate("window.spaNavigationProbe = 42")
        nav = page.get_by_role("navigation", name="Workbench pages", exact=True)
        for name, key in [("House GAB", "house"), ("DBM NEP", "nep"), ("DPWH Transparency NEP", "transparency")]:
            link = nav.get_by_role("link", name=name, exact=True)
            link.click()
            # The previous workspace can still match #tree until React commits
            # the hash change. Wait for the requested route and source first.
            expect(link).to_have_attribute("aria-current", "page")
            heading = {
                "house": "House GAB — source hierarchy",
                "nep": "DBM NEP — source hierarchy",
                "transparency": "DPWH Transparency NEP — FY2027 API hierarchy",
            }[key]
            expect(page.locator(".retained-view h1")).to_have_text(heading, timeout=60000)
            page.locator(".retained-view #tree [data-node]").first.wait_for(timeout=60000)
            assert page.evaluate("window.spaNavigationProbe") == 42
            assert page.get_by_role("alert").count() == 0
            if key == "house":
                summary = page.locator("#projectDetailSummary").inner_text()
                assert page.locator("#projectDetail").is_visible()
                for value in ("15,972", "29 FAP totals", "639,179,718,000", "2,477", "56 independent I-B checks", "excludes PS"):
                    assert value in summary
                assert page.locator("#projectDetail a").get_attribute("href") == "#house-nep"
            else:
                assert page.locator("#projectDetail").is_hidden()
            if key in ("house", "nep"):
                pane = page.locator(".tree-pdf-pane")
                pane.locator("canvas").wait_for(timeout=60000)
                pane.get_by_role("status").filter(has_text=re.compile(r"^Page \d+ of \d+$")).wait_for(timeout=60000)
                assert pane.get_by_label("PDF page", exact=True).input_value() == ("9" if key == "house" else "8")
                if key == "house":
                    expect(pane).to_contain_text("House 2nd reading · Volume I-B")
                assert pane.locator("canvas").evaluate("e=>e.width>0 && e.height>0")
                if width == 1440:
                    left = page.locator(".tree-evidence-column").bounding_box()
                    right = pane.bounding_box()
                    assert right["x"] >= left["x"] + left["width"]
            if key == "nep":
                jump_href = page.locator(".workspace-jump").get_attribute("href")
                page.get_by_role("button", name="Start source review", exact=True).click()
                assert page.get_by_label("Viewer mode").input_value() == "queue"
                pane.get_by_role("status").filter(has_text=re.compile(r"^Page \d+ of \d+$")).wait_for(timeout=60000)
                assert pane.get_by_label("PDF page", exact=True).input_value() != "8"
                assert page.locator(".source-preview, .source-marker").count() == 0
                assert page.locator('.tree-evidence-column a[href*=".pdf"]').count() == 0
                assert page.locator(".retained-view a[href*=source_review_evidence]").count() == 0
                pane.get_by_role("button", name="Clear preview", exact=True).click()
                page.locator("#tree button[data-preview]").first.click()
                pane.get_by_role("status").filter(has_text=re.compile(r"^Page \d+ of \d+$")).wait_for(timeout=60000)
                assert page.locator('.tree-evidence-column a[href*=".pdf"]').count() == 0
                page.get_by_role("button", name="Reset view", exact=True).click()
                page.get_by_label("Expense class", exact=True).select_option(label="PS · Personnel Services")
                assert "Personnel Services" in page.locator("#details h2").inner_text()
                assert page.locator(".workspace-jump").get_attribute("href") == jump_href
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        nav.get_by_role("link", name="Compare stages", exact=True).click()
        page.get_by_role("button", name="House readings", exact=True).click()
        expect(page.get_by_role("region", name="House reading changes")).to_contain_text("₱134.000M", timeout=60000)
        page.get_by_label("Match status", exact=True).select_option("third_only")
        expect(page.locator(".comparison-table tbody tr")).to_have_count(5)
        expect(page.locator(".result-count")).to_contain_text("5 of")
        assert all("+₱" in text for text in page.locator(".comparison-table tbody tr").all_inner_texts())
        page.get_by_label("Engineering office / DEO", exact=True).select_option("Metro Manila 3rd District Engineering Office")
        expect(page.locator(".comparison-table tbody tr")).to_have_count(5)
        expect(page.locator(".comparison-table tbody button.source-link").filter(has_text="House 3rd · I-C").first).to_be_visible()
        page.locator(".comparison-table tbody button.source-link").filter(has_text="House 3rd").first.click()
        page.get_by_role("status").filter(has_text=re.compile(r"^Page \d+ of \d+$")).wait_for(timeout=60000)
        assert "House 3rd reading" in page.locator(".pdf-pane").inner_text()
        assert "HB_BUDGET_3rd_reading" in page.locator(".pdf-pane a[href*=pdf]").first.get_attribute("href")
        page.get_by_role("button", name="Clear preview", exact=True).click()
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.goto(base + "#compare?view=readings", wait_until="networkidle")
        expect(page.get_by_role("button", name="House readings", exact=True)).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".comparison-table thead")).to_contain_text("3rd − 2nd")
        page.get_by_role("navigation", name="Detail workspaces").get_by_role("link", name="House / NEP detail").click()
        page.locator("#budgetRows tr").first.wait_for(timeout=60000)
        assert "House native I-C operations extract" in page.locator("#cards").inner_text()
        assert "44/44" in page.locator("#coverageSummary").inner_text()
        assert "All mapped native I-C PAP controls balance" in page.locator("#unresolvedRows").inner_text()
        for filename in ("hb_dpwh_native_ic_projects.json", "hb_dpwh_native_ic_rollup_audit.json"):
            link = page.locator(f'a[download][href$="{filename}"]').first
            assert page.request.head(link.get_attribute("href")).status == 200
        page.locator("#papProgram").select_option("Foreign-assisted projects")
        expect(page.locator("#papCount")).to_contain_text("1 of 46")
        expect(page.locator("#papRows")).to_contain_text("Foreign-assisted projects (FAP)")
        page.locator("#papProgram").select_option("")
        office = "Albay 1st District Engineering Office"
        region = "Region V"
        detail = json.loads((ROOT / "analysis/data/source_comparison_2027.json").read_text())
        office_count = sum((r.get("house") or r.get("nep"))["region"] == region and any(
            (r.get(stage) or {}).get("office") == office and (r.get(stage) or {}).get("region") == region
            for stage in ("house", "nep")) for r in detail["projects"])
        page.locator("#projectRegion").select_option(region)
        page.locator("#projectOffice").select_option(office)
        expect(page.locator("#projectCount")).to_contain_text(f"of {office_count:,} matching records")
        for text in page.locator("#projectRows tr").all_inner_texts():
            assert office in text
        page.locator("#projectSearch").fill("no such project 9f87x")
        expect(page.locator("#projectCount")).to_contain_text("0 matching records")
        page.locator("#projectSearch").fill("")
        page.locator("#projectRegion").select_option("NCR")
        expect(page.locator("#projectOffice")).to_have_value("")
        assert office not in page.locator("#projectOffice").inner_text()
        page.locator("#projectRegion").select_option("")
        page.locator("#budget table th button").first.wait_for()
        page.locator("#budget table th button").first.click()
        assert page.locator("#budget table th").first.get_attribute("aria-sort") in ("ascending", "descending")
        page.get_by_role("navigation", name="Detail workspaces").get_by_role("link", name="NEP detail", exact=True).click()
        page.locator(".retained-view #tree [data-node]").first.wait_for(timeout=60000)
        page.get_by_label("Tree view", exact=True).select_option("program")
        page.locator(".retained-view #tree [data-node]").first.wait_for()
        assert page.evaluate("window.spaNavigationProbe") == 42
        page.goto(base + "#nep?view=review", wait_until="networkidle")
        page.get_by_label("Viewer mode").wait_for(timeout=60000)
        assert page.get_by_label("Viewer mode").input_value() == "queue"
        page.reload(wait_until="networkidle")
        page.get_by_label("Viewer mode").wait_for(timeout=60000)
        assert page.get_by_label("Viewer mode").input_value() == "queue"
        page.go_back(wait_until="networkidle")
        page.locator(".retained-view #tree [data-node]").first.wait_for(timeout=60000)
        assert page.get_by_role("alert").count() == 0
        page.close()
    assert not errors, errors
    assert not bad, bad
    assert any("NEP-2027-VOLUME-2B" in r[0] for r in ranges), ranges
    assert any("VOL%20IC" in r[0] for r in ranges), ranges
    browser.close()
server.shutdown()
tmp.cleanup()
print(
    json.dumps(
        {
            "widths": [390, 1440],
            "lazy_route_and_pdf": True,
            "ranges": len(ranges),
            "nep_and_house_rendered": True,
            "global_delta_sort_and_pagination": True,
            "all_spa_routes_review_expenses_and_history": True,
            "tree_pdf_buttons_without_crop_links": True,
            "house_gab_and_dbm_nep_tree_pdf_panes": True,
            "errors": errors,
            "http_failures": bad,
        }
    )
)
