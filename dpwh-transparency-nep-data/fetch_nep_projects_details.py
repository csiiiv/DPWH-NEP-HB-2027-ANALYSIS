#!/usr/bin/env python3
"""
NEP Per-Project Detail Extractor (BetterGov API variation)
==========================================================

Fetches full details (including document metadata with S3 PDF URLs) for every
NEP project code harvested by fetch_nep_projects_paginated.py:

    https://api.dpwh.bettergov.ph/nep/projects/{code}
    e.g. https://api.dpwh.bettergov.ph/nep/projects/2027DPWH-Proposal-00001

Reads the listing dumps produced by the paginated extractor
(dpwh-transparency-nep-data/json/fy{year}/dump-page-*.json), pulls the `code` field from every
item, and saves one JSON file per project plus resume-tracking lists.

The API was provided with direct access and minimal limits, so no TLS
impersonation pool or proxy rotation is used — just polite delays, retries,
and resume capability.

Usage:
    python fetch_nep_projects_details.py
    python fetch_nep_projects_details.py --workers 8 --delay 0.2
    python fetch_nep_projects_details.py --limit 100        # first 100 codes only
"""

import os
import json
import time
import random
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
API_BASE = "https://api.dpwh.bettergov.ph/nep/projects"
DEFAULT_FISCAL_YEAR = 2027

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
}

MIN_DELAY = 0.3
MAX_DELAY = 0.8
MAX_RETRIES = 4
TIMEOUT = 60  # detail payloads can be slow server-side

progress_lock = threading.Lock()
progress = {"total": 0, "success": 0, "fail": 0, "skip": 0, "documents_indexed": 0}


def year_dirs(fiscal_year: int):
    json_dir = os.path.join(BASE_DIR, "json", f"fy{fiscal_year}")
    details_dir = os.path.join(BASE_DIR, "json", f"fy{fiscal_year}-details")
    lists_dir = os.path.join(BASE_DIR, "lists", f"fy{fiscal_year}")
    det_lists_dir = os.path.join(BASE_DIR, "lists", f"fy{fiscal_year}-details")
    for d in (json_dir, details_dir, lists_dir, det_lists_dir):
        os.makedirs(d, exist_ok=True)
    return json_dir, details_dir, lists_dir, det_lists_dir


def load_codes(json_dir: str) -> list:
    """Collect unique project codes from every listing dump on disk."""
    codes = []
    seen = set()
    for name in sorted(os.listdir(json_dir)):
        if not (name.startswith("dump-page-") and name.endswith(".json")):
            continue
        try:
            with open(os.path.join(json_dir, name), encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"[WARN] Could not parse {name}: {e}")
            continue
        for item in data.get("data", {}).get("data", []) or []:
            code = item.get("code")
            if code and code not in seen:
                seen.add(code)
                codes.append(code)
    return codes


def existing_details(details_dir: str, det_lists_dir: str) -> set:
    done = set()
    for name in os.listdir(details_dir):
        if name.endswith(".json"):
            done.add(name[:-5])
    done_path = os.path.join(det_lists_dir, "successful_ids.txt")
    if os.path.exists(done_path):
        with open(done_path) as f:
            done |= {ln.strip() for ln in f if ln.strip()}
    return done


def fetch_detail(session, code):
    url = f"{API_BASE}/{code}"
    for attempt in range(1, MAX_RETRIES + 1):
        time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT)
        except Exception as e:
            print(f"[RETRY] {code} attempt {attempt}/{MAX_RETRIES}: {str(e)[:120]}")
            if attempt == MAX_RETRIES:
                return None
            time.sleep(2 * attempt)
            continue

        if resp.status_code == 200:
            try:
                data = resp.json()
            except ValueError:
                time.sleep(2 * attempt)
                continue
            if data.get("status") == 200 and isinstance(data.get("data"), dict):
                return data
            print(f"[RETRY] {code}: unexpected payload: {str(data)[:120]}")
            time.sleep(2 * attempt)
            continue

        if resp.status_code in (403, 429) or resp.status_code >= 500:
            print(f"[RETRY] {code} attempt {attempt}/{MAX_RETRIES}: HTTP {resp.status_code}")
            time.sleep(min(5 * attempt, 20))
            continue

        # 404 etc -> non-retryable
        print(f"[FAIL] {code}: HTTP {resp.status_code}")
        return ("HTTP_ERROR", resp.status_code)
    return None


def fetch_and_save(session, code, details_dir, success_path, fail_path, notfound_path, done):
    if code in done:
        with progress_lock:
            progress["skip"] += 1
        return

    result = fetch_detail(session, code)
    if isinstance(result, tuple):  # non-retryable HTTP error (e.g. 404)
        with progress_lock:
            progress["fail"] += 1
        with open(notfound_path, "a") as f:
            f.write(f"{code}\t{result[1]}\n")
        return
    if result is None:
        with progress_lock:
            progress["fail"] += 1
        with open(fail_path, "a") as f:
            f.write(f"{code}\n")
        return

    out = os.path.join(details_dir, f"{code}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    docs = result["data"].get("documents") or []
    with progress_lock:
        progress["success"] += 1
        progress["documents_indexed"] += len(docs)
    with open(success_path, "a") as f:
        f.write(f"{code}\n")


def main(limit_codes, max_workers, fiscal_year):
    start_time = time.time()
    json_dir, details_dir, lists_dir, det_lists_dir = year_dirs(fiscal_year)

    codes = load_codes(json_dir)
    print(f"[INFO] Discovered {len(codes)} unique project codes from listing dumps")
    if limit_codes:
        codes = codes[:limit_codes]
        print(f"[INFO] Limited to first {len(codes)} codes (--limit)")

    done = existing_details(details_dir, det_lists_dir)
    todo = [c for c in codes if c not in done]
    print(f"[INFO] {len(done)} already fetched, {len(todo)} to fetch")

    success_path = os.path.join(det_lists_dir, "successful_ids.txt")
    fail_path = os.path.join(det_lists_dir, "failed_ids.txt")
    notfound_path = os.path.join(det_lists_dir, "notfound_ids.txt")
    progress_path = os.path.join(det_lists_dir, "progress_stats.json")

    progress["total"] = len(todo)
    stop_flag = threading.Event()

    def progress_logger():
        while not stop_flag.is_set():
            with progress_lock:
                snap = json.dumps(progress, indent=2)
            with open(progress_path, "w") as f:
                f.write(snap)
            time.sleep(10)

    t = threading.Thread(target=progress_logger, daemon=True)
    t.start()

    session = requests.Session()
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {
            ex.submit(fetch_and_save, session, c, details_dir,
                      success_path, fail_path, notfound_path, done): c
            for c in todo
        }
        for fut in as_completed(futures):
            code = futures[fut]
            try:
                fut.result()
            except Exception as e:
                print(f"[ERROR] {code}: {e}")

    stop_flag.set()
    t.join()
    elapsed = time.time() - start_time
    with progress_lock:
        print(f"\n[STATS] Elapsed: {elapsed:.1f}s | fetched={progress['success']} "
              f"skip={progress['skip']} fail={progress['fail']} "
              f"docs_indexed={progress['documents_indexed']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Fetch per-project NEP details (BetterGov API)")
    ap.add_argument("--limit", type=int, default=None, help="Only fetch first N codes (testing)")
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--fiscal-year", type=int, default=DEFAULT_FISCAL_YEAR)
    args = ap.parse_args()
    main(args.limit, args.workers, args.fiscal_year)
