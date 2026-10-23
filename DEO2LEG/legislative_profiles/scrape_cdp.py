#!/usr/bin/env python3
"""
scrape_cdp.py — build the House members dataset by attaching to the USER'S
running Chrome over CDP (remote-debugging-port).

The user's real browser passes Cloudflare on its own (valid cf_clearance +
genuine fingerprint), so we simply automate inside it:
  1. connect to ws endpoint on localhost:9222
  2. find (or open) a tab on congress.gov.ph/house-members
  3. scroll to trigger lazy-loading, parse member cards
  4. download each photo via in-page fetch (uses the page's own session)
  5. write profiles.json / profiles.csv / photos/

Requirements: Chrome started with --remote-debugging-port=9222 and the
members page opened in it (manually by the user, or auto-opened here).
"""
import base64
import csv
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from scrape import extract_members, slugify, scroll_full  # reuse parser

CDP = "http://127.0.0.1:9222"
LIST_URL = "https://www.congress.gov.ph/house-members/"
HERE = Path(__file__).resolve().parent
PHOTOS = HERE / "photos"
STATE = HERE / "state"

FETCH_ONE_JS = """
async (url) => {
  try {
    const resp = await fetch(url, {credentials: 'include',
                                   headers: {'Accept': 'image/*'}});
    if (!resp.ok) return {ok: false, status: resp.status};
    const buf = await resp.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return {ok: true, b64: btoa(binary), mime: resp.headers.get('content-type') || ''};
  } catch (e) {
    return {ok: false, error: String(e)};
  }
}
"""


def find_target_page(browser):
    """Return a page whose URL is on congress.gov.ph (opening one if needed)."""
    ctx = browser.contexts[0]
    for page in ctx.pages:
        if "congress.gov.ph" in (page.url or ""):
            return page
    # open a new tab in the user's browser (their cookies -> passes CF)
    page = ctx.new_page()
    page.goto(LIST_URL, wait_until="domcontentloaded", timeout=90_000)
    page.wait_for_timeout(4000)
    title = (page.title() or "").lower()
    if "just a moment" in title or "attention required" in title:
        print("Challenge shown in your browser window — please click the "
              "checkbox to prove you're human.")
        deadline = time.time() + 300
        while time.time() < deadline:
            page.wait_for_timeout(2000)
            title = (page.title() or "").lower()
            if "just a moment" not in title and "attention required" not in title:
                break
        else:
            print("Timed out waiting for you to clear the challenge.")
            return None
    if "congress.gov.ph" not in (page.url or ""):
        page.goto(LIST_URL, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_timeout(3000)
    return page


def fetch_photo_inpage(page, url: str) -> bytes | None:
    result = page.evaluate(FETCH_ONE_JS, url)
    if result and result.get("ok"):
        return base64.b64decode(result["b64"])
    return None


def main() -> int:
    PHOTOS.mkdir(exist_ok=True)
    STATE.mkdir(exist_ok=True)
    done_file = STATE / "scraped.json"
    done = set(json.loads(done_file.read_text())) if done_file.exists() else set()

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP, timeout=15_000)
        except Exception as e:
            print(f"Cannot connect to Chrome on {CDP}: {e}")
            print("Start Chrome with: google-chrome --remote-debugging-port=9222 "
                  "--restore-last-session &")
            return 1

        page = find_target_page(browser)
        if page is None:
            return 2
        print(f"Attached to tab: {page.title()!r}")

        page.bring_to_front()
        print("Scrolling to trigger lazy-loading ...")
        scroll_full(page, rounds=100)
        html = page.content()
        (HERE / "house-members-scrape.html").write_text(html, encoding="utf-8")

        members = extract_members(html)
        print(f"Parsed {len(members)} member cards.")
        if not members:
            print("Parser found nothing — inspect house-members-scrape.html.")
            return 3

        results = []
        for i, m in enumerate(members, 1):
            key = m["detail_url"] or m["name"]
            slug = slugify(m["name"])
            record = dict(m)
            record["photo_file"] = None
            existing = list(PHOTOS.glob(f"{slug}.*"))
            if existing:
                record["photo_file"] = existing[0].name
            elif m["photo_url"] and key not in done:
                ext = Path(m["photo_url"]).suffix.lower()
                if len(ext) > 5 or "/" in ext or not ext:
                    ext = ".jpg"
                dest = PHOTOS / f"{slug}{ext}"
                data = fetch_photo_inpage(page, m["photo_url"])
                if data:
                    dest.write_bytes(data)
                    record["photo_file"] = dest.name
                    done.add(key)
                    done_file.write_text(json.dumps(sorted(done)))
            results.append(record)
            print(f"  [{i}/{len(members)}] {m['name']} | {m['position'][:50]} "
                  f"| {record['photo_file'] or 'NO PHOTO'}")

        (HERE / "profiles.json").write_text(
            json.dumps(results, indent=2, ensure_ascii=False)
        )
        with open(HERE / "profiles.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f, fieldnames=["name", "position", "photo_url", "photo_file", "detail_url"]
            )
            w.writeheader()
            w.writerows(results)

        ok = sum(1 for r in results if r["photo_file"])
        print(f"\nDone: {len(results)} profiles, {ok} photos.")
        print("Output: profiles.json, profiles.csv, photos/")
        # Leave the user's browser running; just disconnect.
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
