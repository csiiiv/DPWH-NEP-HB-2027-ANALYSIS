#!/usr/bin/env python3
"""
gate.py — one-time human-in-the-loop Cloudflare gate for congress.gov.ph.

Opens a VISIBLE Chrome window on the local display. You (the human) solve
the Cloudflare challenge if one appears. Once the real page loads, this saves:

    session.json         cookies + storage state (reused by scrape.py)
    browser.json         the exact User-Agent (must match during scraping,
                         because cf_clearance is bound to IP + UA)
    house-members.html   fully-rendered first page (scrolls to bottom to
                         trigger lazy-loaded images / infinite scroll)

Re-run any time the session goes stale (scrape.py will tell you).
"""
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "https://www.congress.gov.ph/house-members/"
HERE = Path(__file__).resolve().parent
CHROME = "/usr/bin/google-chrome"
# Active X display on this machine; make sure children inherit it.
os.environ.setdefault("DISPLAY", ":0.0")

BLOCK_TITLE_FRAGMENTS = ("just a moment", "attention required", "blocked", "error")
HUMAN_TIMEOUT_S = 300  # 5 minutes to solve the challenge


def page_cleared(page) -> bool:
    """True once we're looking at real site content, not a CF interstitial."""
    try:
        title = (page.title() or "").strip().lower()
    except Exception:
        return False
    if not title:
        return False
    return not any(frag in title for frag in BLOCK_TITLE_FRAGMENTS)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            executable_path=CHROME,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--window-size=1366,900",
            ],
        )
        ctx = browser.new_context(
            locale="en-US",
            viewport={"width": 1366, "height": 900},
        )
        # Reduce obvious automation signals.
        ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page = ctx.new_page()

        print(f"Opening {URL} ...")
        print(">>> If a Cloudflare check appears, COMPLETE IT in the browser window. <<<")
        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=90_000)
        except Exception as e:
            print(f"goto warning: {e}")

        deadline = time.time() + HUMAN_TIMEOUT_S
        while time.time() < deadline:
            try:
                if page.is_closed():
                    # Tab was closed; reopen a fresh one on the target site.
                    print("  tab was closed — reopening ...", flush=True)
                    page = ctx.new_page()
                    page.goto(URL, wait_until="domcontentloaded", timeout=90_000)
                    continue
                # If the tab navigated somewhere else, bring it back.
                if "congress.gov.ph" not in (page.url or ""):
                    print(f"  tab wandered off to {page.url!r} — going back ...",
                          flush=True)
                    page.goto(URL, wait_until="domcontentloaded", timeout=90_000)
                    continue
                if page_cleared(page):
                    print(f"Challenge cleared. Page title: {page.title()!r}")
                    break
            except Exception as e:
                print(f"  (recovering: {e})", flush=True)
            print("  waiting for you to clear the challenge ...", flush=True)
            page.wait_for_timeout(2000)
        else:
            print("Timed out waiting for the challenge to clear. Try again.")
            browser.close()
            return 1

        # Persist session FIRST — most valuable artifact, in case anything
        # below (scroll/render) goes wrong.
        try:
            state = ctx.storage_state()
            (HERE / "session.json").write_text(json.dumps(state, indent=2))
            ua = page.evaluate("navigator.userAgent")
            (HERE / "browser.json").write_text(json.dumps({"user_agent": ua}, indent=2))
            cf = [c for c in state["cookies"] if c["name"] == "cf_clearance"]
            print(f"Saved session.json ({len(state['cookies'])} cookies, "
                  f"cf_clearance: {'YES' if cf else 'no'}) and browser.json")
            print(f"User-Agent: {ua}")
        except Exception as e:
            print(f"ERROR saving session: {e}")
            browser.close()
            return 1

        # Give the page a moment to finish rendering, then scroll through it
        # to trigger lazy-loaded images / infinite scroll.
        try:
            page.wait_for_timeout(3000)
            for _ in range(40):
                page.wait_for_timeout(500)
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2000)
            page.evaluate("window.scrollTo(0, 0)")
        except Exception as e:
            print(f"scroll warning: {e}")

        try:
            html = page.content()
            (HERE / "house-members.html").write_text(html, encoding="utf-8")
            print(f"Saved rendered page ({len(html)} chars) -> house-members.html")
        except Exception as e:
            print(f"HTML capture warning (session is still saved): {e}")

        try:
            page.wait_for_timeout(1500)
            browser.close()
        except Exception:
            pass
    print("Gate complete. Now run: python3 scrape.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
