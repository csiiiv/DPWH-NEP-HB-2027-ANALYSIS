#!/usr/bin/env python3
"""
scrape.py — build a dataset of House members (name, position, photo) from
https://www.congress.gov.ph/house-members/

Strategy
--------
The site sits behind a strict Cloudflare WAF (TLS-fingerprint + JS challenge),
so plain HTTP clients get 403. But the user's real Chrome profile already holds
a valid, long-lived `cf_clearance` cookie. Chrome 155's cookie encryption can't
be decrypted offline, so instead of extracting the cookie we give a HEADLESS
automation Chrome a *scratch copy* of the profile (Cookies DB + Local State).
Chrome itself decrypts via the keyring, the WAF sees a valid clearance with a
matching UA (same Chrome binary) and lets us through. The real browser and
profile are never touched.

Outputs
-------
    profiles.json / profiles.csv   dataset (name, position, photo file/url)
    photos/                        member photos
    house-members-scrape.html      rendered listing (for parser debugging)
    state/                         resume bookkeeping
"""
import csv
import json
import re
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright

BASE = "https://www.congress.gov.ph"
LIST_URL = f"{BASE}/house-members/"
HERE = Path(__file__).resolve().parent
PHOTOS = HERE / "photos"
STATE = HERE / "state"
SCRATCH_PROFILE = STATE / "chrome-profile"
REAL_PROFILE = Path.home() / ".config/google-chrome"
CHROME = "/usr/bin/google-chrome"

BLOCK_TITLE_FRAGMENTS = ("just a moment", "attention required", "access denied")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "unnamed"


def is_blocked(page) -> bool:
    try:
        title = (page.title() or "").strip().lower()
    except Exception:
        return False
    return any(f in title for f in BLOCK_TITLE_FRAGMENTS)


def build_scratch_profile() -> None:
    """Copy the minimum files Chrome needs to reuse decrypted cookies."""
    SCRATCH_PROFILE.mkdir(parents=True, exist_ok=True)
    (SCRATCH_PROFILE / "Default").mkdir(exist_ok=True)
    src_cookies = REAL_PROFILE / "Default" / "Cookies"
    dst_cookies = SCRATCH_PROFILE / "Default" / "Cookies"
    changed = False
    if src_cookies.exists():
        if not dst_cookies.exists() or src_cookies.stat().st_mtime > dst_cookies.stat().st_mtime:
            shutil.copy2(src_cookies, dst_cookies)
            changed = True
    src_ls = REAL_PROFILE / "Local State"
    if src_ls.exists():
        shutil.copy2(src_ls, SCRATCH_PROFILE / "Local State")
    print(f"Scratch profile ready at {SCRATCH_PROFILE}{' (cookies refreshed)' if changed else ''}")


def scroll_full(page, rounds: int = 80) -> None:
    last = 0
    for _ in range(rounds):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(600)
        h = page.evaluate("document.body.scrollHeight")
        if h == last:
            break
        last = h
    page.evaluate("window.scrollTo(0, 0)")


def extract_members(html: str):
    """Parse member cards generically; heuristics refined against real markup."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    best = []
    # Candidate card containers, ranked by how many produce plausible members.
    for sel in (
        "article",
        ".member-card",
        ".member-item",
        ".card",
        "li.member",
        ".views-row",
        ".item-list li",
    ):
        try:
            cards = soup.select(sel)
        except Exception:
            continue
        members = []
        for card in cards:
            name_el = card.select_one("h1, h2, h3, h4, h5, .name, .member-name, strong, b")
            if not name_el:
                continue
            # Card must contain a photo to be considered a member card.
            img = card.select_one("img")
            if not img:
                continue
            name = name_el.get_text(" ", strip=True)
            if not name or len(name) > 80:
                continue
            pos_el = card.select_one(
                ".position, .member-position, .role, .designation, p, small, em"
            )
            position = pos_el.get_text(" ", strip=True) if pos_el else ""
            photo_url = (
                img.get("data-src")
                or img.get("data-lazy-src")
                or (img.get("srcset") or "").split(" ")[-1]
                or img.get("src")
            )
            link = card.select_one("a[href]")
            members.append(
                {
                    "name": name,
                    "position": position,
                    "photo_url": photo_url,
                    "detail_url": urljoin(LIST_URL, link["href"]) if link else None,
                }
            )
        if len(members) > len(best):
            best = members
    # de-dup by name
    seen, out = set(), []
    for m in best:
        if m["name"] not in seen:
            seen.add(m["name"])
            out.append(m)
    return out


def download_photo(req_ctx, url: str, dest: Path) -> bool:
    if not url or url.startswith("data:"):
        return False
    try:
        r = req_ctx.get(urljoin(LIST_URL, url), headers={"Referer": LIST_URL}, timeout=30000)
        if r.ok and r.body():
            dest.write_bytes(r.body())
            return True
    except Exception as e:
        print(f"    photo error {url}: {e}")
    return False


def main() -> int:
    STATE.mkdir(exist_ok=True)
    PHOTOS.mkdir(exist_ok=True)
    done_file = STATE / "scraped.json"
    done = set(json.loads(done_file.read_text())) if done_file.exists() else set()

    build_scratch_profile()

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(SCRATCH_PROFILE),
            executable_path=CHROME,
            headless=False,  # headless sends HeadlessChrome client hints -> instant block
            locale="en-US",
            viewport={"width": 1366, "height": 900},
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--window-position=2000,2000",  # keep the automation window out of the way
            ],
        )
        page = ctx.new_page()
        print(f"Loading {LIST_URL} ...")
        page.goto(LIST_URL, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_timeout(4000)

        if is_blocked(page):
            # Challenge can appear on first automation run. Ask the human to
            # clear it once — the resulting clearance persists in the scratch
            # profile for all future (unattended) runs.
            print("Cloudflare challenge shown. >>> CLICK THE CHECKBOX in the "
                  "Chrome window that just opened. <<<")
            deadline = time.time() + 300
            while time.time() < deadline:
                page.wait_for_timeout(2000)
                if not is_blocked(page):
                    print(f"Challenge cleared: {page.title()!r}")
                    break
            else:
                print("Timed out waiting for challenge clearance.")
                (HERE / "blocked.html").write_text(page.content())
                ctx.close()
                return 2
            page.goto(LIST_URL, wait_until="domcontentloaded", timeout=90_000)
            page.wait_for_timeout(3000)
            if is_blocked(page):
                print("Still blocked after challenge — aborting.")
                (HERE / "blocked.html").write_text(page.content())
                ctx.close()
                return 2

        print(f"Page loaded: {page.title()!r}")
        scroll_full(page)
        html = page.content()
        (HERE / "house-members-scrape.html").write_text(html, encoding="utf-8")

        members = extract_members(html)
        print(f"Parsed {len(members)} member cards.")
        if not members:
            print("Parser found nothing — inspect house-members-scrape.html to fix selectors.")
            ctx.close()
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
                ext = Path(m["photo_url"]).suffix.lower() or ".jpg"
                if len(ext) > 5 or "/" in ext:
                    ext = ".jpg"
                dest = PHOTOS / f"{slug}{ext}"
                if download_photo(page.request, m["photo_url"], dest):
                    record["photo_file"] = dest.name
                    done.add(key)
                    done_file.write_text(json.dumps(sorted(done)))
                elif dest.exists():
                    dest.unlink()
            results.append(record)
            print(f"  [{i}/{len(members)}] {m['name']} | {m['position'][:50]} "
                  f"| photo: {record['photo_file'] or 'MISSING'}")

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
        ctx.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
