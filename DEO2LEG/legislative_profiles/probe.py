#!/usr/bin/env python3
"""
probe.py — find a curl_cffi TLS impersonation fingerprint that passes
Cloudflare on congress.gov.ph (same strategy as the DPWH transparency
scraper: impersonation pool + realistic browser headers + rotation).
"""
import sys

from curl_cffi import requests as cr

URL = "https://www.congress.gov.ph/house-members/"

# Realistic browser-navigation header set (rotated per fingerprint family).
BASE_HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "dnt": "1",
    "referer": "https://www.congress.gov.ph/",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
}

POOL = [
    # Chrome family first (most common traffic, least suspicious)
    "chrome131", "chrome130", "chrome124", "chrome123", "chrome120",
    "chrome119", "chrome116", "chrome113", "chrome110", "chrome104",
    "chrome101", "chrome99",
    # Edge
    "edge119", "edge116", "edge113", "edge110", "edge104", "edge101",
    # Safari
    "safari18_0", "safari17_2_1", "safari17_0", "safari16_0", "safari15_5",
    # Firefox
    "firefox133", "firefox132", "firefox128", "firefox119", "firefox109",
]


def try_fingerprint(fp: str):
    try:
        session = cr.Session(impersonate=fp)
        r = session.get(URL, headers=BASE_HEADERS, timeout=40, allow_redirects=True)
    except Exception as e:
        return ("exception", str(e)[:120], 0)
    text = r.text or ""
    blocked = (
        "just a moment" in text.lower()
        or "attention required" in text.lower()
        or "cf-challenge" in text
        or r.status_code in (403, 503, 429)
    )
    return ("BLOCKED" if blocked else "PASS", r.status_code, len(text))


def main():
    print(f"Probing {URL}\n{'fp':<14}{'result':<10}{'status':<8}{'len'}")
    winners = []
    for fp in POOL:
        result, status, length = try_fingerprint(fp)
        print(f"{fp:<14}{result:<10}{status:<8}{length}")
        if result == "PASS":
            winners.append(fp)
            break  # first winner is enough
    if winners:
        print(f"\nWorking fingerprint(s): {winners}")
        return 0
    print("\nNo fingerprint passed — Cloudflare likely demands a JS challenge.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
