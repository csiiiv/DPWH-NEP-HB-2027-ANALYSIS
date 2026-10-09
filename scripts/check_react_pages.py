#!/usr/bin/env python3
"""Exercise the packaged React migration under a GitHub Pages project prefix.

Requires Playwright and Chromium; run after packaging with --with-react.
"""
from pathlib import Path
import sys, tempfile, threading, json, re, os
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright

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
base = f"http://127.0.0.1:{server.server_port}/{prefix}/app/"
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
        assert not any(
            "stage_trace_2027.json" in url
            or "PdfPreview-" in url
            or "pdf.worker" in url
            for url in requests[before:]
        )
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.get_by_role("link", name="Open sortable comparison").click()
        page.locator("tbody tr").first.wait_for(timeout=60000)
        assert page.locator("tbody tr").count() == 45
        page.get_by_role("button", name="Missing from listing", exact=True).click()
        assert page.locator("tbody tr").count() == 23
        page.locator("tbody button.source-link").first.click()
        page.get_by_role("dialog").wait_for()
        page.get_by_role("status").filter(
            has_text=re.compile(r"^Page \d+ of \d+$")
        ).wait_for(timeout=60000)
        assert page.locator("canvas").evaluate("e=>e.width>0 && e.height>0")
        prior_page = int(page.get_by_label("PDF page", exact=True).input_value())
        page.get_by_role("button", name="Next page", exact=True).click()
        page.get_by_role("status").filter(
            has_text=re.compile(rf"^Page {prior_page+1} of \d+$")
        ).wait_for(timeout=60000)
        page.get_by_role("button", name="Close preview").click()
        assert page.get_by_role("dialog").count() == 0
        page.get_by_role("button", name="Project records", exact=True).click()
        page.get_by_label("Sort column", exact=True).select_option("2")
        page.get_by_label("Sort amount by", exact=True).select_option("delta")
        page.get_by_role("button", name="Ascending", exact=False).click()
        data = json.loads((ROOT / "analysis/data/stage_trace_2027.json").read_text())
        expected = max(
            (r for r in data["projects"] if r["nep"] and r["house"]),
            key=lambda r: r["house"]["amount_php"] - r["nep"]["amount_php"],
        )
        assert page.locator("tbody th").first.inner_text().startswith(expected["title"])
        assert page.locator("tbody tr").count() == 50
        page.get_by_role("button", name="Next", exact=True).click()
        assert "51–100" in page.locator(".pager").inner_text()
        page.get_by_label("Search", exact=True).fill("Mindanao Transport Connectivity")
        page.locator("tbody th").first.wait_for()
        house = page.locator("tbody button.source-link").filter(has_text="House").first
        house.click()
        page.get_by_role("status").filter(
            has_text=re.compile(r"^Page \d+ of \d+$")
        ).wait_for(timeout=60000)
        assert page.locator("canvas").evaluate("e=>e.width>0 && e.height>0")
        page.keyboard.press("Escape")
        assert page.get_by_role("dialog").count() == 0
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.goto(base + "#compare", wait_until="networkidle")
        page.reload(wait_until="networkidle")
        page.locator("tbody tr").first.wait_for(timeout=60000)
        assert page.locator("tbody tr").count() == 45
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
            "errors": errors,
            "http_failures": bad,
        }
    )
)
