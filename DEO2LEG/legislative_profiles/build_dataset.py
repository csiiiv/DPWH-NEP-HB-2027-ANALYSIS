#!/usr/bin/env python3
"""
build_dataset.py — build the House members dataset (name, position, photo)
from a saved copy of https://www.congress.gov.ph/house-members/.

Sources, in priority order:
  1. CONGRESS_WEB/ — a "Save Page As → Webpage, Complete" capture made from
     the browser (contains the rendered HTML plus a *_files/ folder with every
     member photo already downloaded).
  2. house-members-scrape.html — captured via scrape_cdp.py; photos are then
     fetched from docs.congress.hrep.online (not behind Cloudflare).

Outputs:
    profiles.json / profiles.csv / photos/
"""
import csv
import json
import re
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
CONGRESS_WEB = HERE / "CONGRESS_WEB"
PHOTOS = HERE / "photos"
STATE = HERE / "state"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/155.0.8059.79 Safari/537.36"
    ),
    "Referer": "https://www.congress.gov.ph/",
}


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "unnamed"


def parse_members(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    members = []
    seen = set()
    for card in soup.select("div.member-card"):
        name_el = card.select_one("h6.hm-fullname") or card.select_one(".hm-fullname")
        if name_el is None:
            continue
        name = name_el.get_text(" ", strip=True)
        if not name or name in seen:
            continue
        seen.add(name)

        # Position block: line 1 = role ("Party-list Representative" /
        # "District Representative"), line 2 = party-list or district area.
        role = area = ""
        small = card.select_one("small.text-muted")
        if small:
            lines = [
                ln.strip()
                for ln in small.get_text("\n", strip=True).split("\n")
                if ln.strip()
            ]
            if lines:
                role = lines[0]
            if len(lines) > 1:
                area = " ".join(lines[1:])

        img = card.select_one("img")
        photo_url = (img.get("src") or "").strip() if img else ""
        link = card.select_one("a[href]")
        detail_url = urljoin("https://www.congress.gov.ph/", link["href"]) if link else ""
        member_code = detail_url.rstrip("/").split("/")[-1] if detail_url else ""

        members.append(
            {
                "name": name,
                "position": f"{role} {area}".strip(),
                "position_type": role,
                "area": area,
                "member_code": member_code,
                "photo_url": photo_url,
                "detail_url": detail_url,
            }
        )
    return members


def download(photo_url: str, dest: Path) -> bool:
    try:
        r = requests.get(photo_url, headers=HEADERS, timeout=30)
        if r.ok and r.content[:4] in (b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xe1", b"\xff\xd8\xff\xdb") \
                or r.ok and r.content[:8] == b"\x89PNG\r\n\x1a\n":
            dest.write_bytes(r.content)
            return True
        print(f"    bad response: status={r.status_code} bytes={len(r.content)}")
    except Exception as e:
        print(f"    error: {e}")
    return False


def load_saved_html() -> tuple[str, Path | None]:
    """Return (html, local_photo_dir) from the manual save, or from the
    scrape_cdp.py capture with no local photo dir."""
    if CONGRESS_WEB.exists():
        saves = sorted(CONGRESS_WEB.glob("*.html"))
        if saves:
            html = saves[0].read_text(encoding="utf-8", errors="replace")
            files_dir = CONGRESS_WEB / (saves[0].stem + "_files")
            if files_dir.is_dir():
                return html, files_dir
            return html, None
        raise FileNotFoundError("CONGRESS_WEB/ exists but has no .html save")
    html_file = HERE / "house-members-scrape.html"
    if html_file.exists():
        return html_file.read_text(encoding="utf-8"), None
    raise FileNotFoundError(
        "No saved listing page. Either save the page manually into "
        "CONGRESS_WEB/ (Save Page As → Webpage, Complete) or run scrape_cdp.py."
    )


def main() -> int:
    try:
        html, local_photo_dir = load_saved_html()
    except FileNotFoundError as e:
        print(e)
        return 1

    members = parse_members(html)
    print(f"Parsed {len(members)} members from listing page.")
    if not members:
        return 2

    PHOTOS.mkdir(exist_ok=True)
    STATE.mkdir(exist_ok=True)
    local_index = (
        {f.name.lower(): f for f in local_photo_dir.iterdir()}
        if local_photo_dir
        else {}
    )
    results = []
    failures = []
    for i, m in enumerate(members, 1):
        slug = slugify(m["name"])
        record = dict(m)
        record["photo_file"] = None
        if m["photo_url"]:
            existing = list(PHOTOS.glob(f"{slug}.*"))
            if existing:
                record["photo_file"] = existing[0].name
            else:
                ext = Path(m["photo_url"]).suffix.lower() or ".jpg"
                if len(ext) > 5:
                    ext = ".jpg"
                dest = PHOTOS / f"{slug}{ext}"
                # Prefer the photo already saved in CONGRESS_WEB *_files/.
                local = local_index.get(Path(m["photo_url"]).name.lower())
                copied = False
                if local:
                    shutil.copy2(local, dest)
                    copied = True
                else:
                    copied = download(m["photo_url"], dest)
                    if not copied:
                        time.sleep(1)
                if copied:
                    record["photo_file"] = dest.name
                else:
                    failures.append(m["name"])
        results.append(record)
        print(f"  [{i}/{len(members)}] {m['name']} | {m['position'][:48]} "
              f"| {record['photo_file'] or 'MISSING'}")

    (HERE / "profiles.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False)
    )
    with open(HERE / "profiles.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "name", "position", "position_type", "area", "member_code",
                "photo_url", "photo_file", "detail_url",
            ],
        )
        w.writeheader()
        w.writerows(results)

    ok = sum(1 for r in results if r["photo_file"])
    print(f"\nDone: {len(results)} profiles, {ok} photos, {len(failures)} failures.")
    if failures:
        print("Failed:", ", ".join(failures[:10]))
    print("Output: profiles.json, profiles.csv, photos/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
