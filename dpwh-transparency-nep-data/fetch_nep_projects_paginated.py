#!/usr/bin/env python3
"""
NEP Projects Paginated Extractor (BetterGov API variation)
==========================================================

Scrapes the DPWH NEP (National Expenditure Program) project listings from the
BetterGov-hosted API, which was provided with direct access and minimal limits:

    List endpoint:
        https://api.dpwh.bettergov.ph/nep/projects?page={page}&limit={limit}&fiscalYear={fy}
        - FY2027 has 11,372 total projects -> 23 pages at limit=500

    Response shape:
        {
          "status": 200,
          "code": "SUCCESS",
          "data": {
            "data": [ {project}, ... ],
            "pagination": {page, limit, totalCount, totalPages, hasNext, hasPrev},
            "summary": {totalAmount, totalProjects}
          }
        }

This is a lighter-weight variation of the transparency-api scraper: no TLS
impersonation pool or proxy rotation is needed because we have direct API
access. Resume capability, retry/backoff, and progress tracking are retained.

Usage:
    python fetch_nep_projects_paginated.py
    python fetch_nep_projects_paginated.py --start 1 --end 23
    python fetch_nep_projects_paginated.py --limit 500 --workers 5 --fiscal-year 2027
"""

import os
import sys
import json
import time
import random
import argparse
import threading
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FISCAL_YEAR = 2027
DEFAULT_LIMIT = 500

API_BASE = "https://api.dpwh.bettergov.ph/nep/projects"

# Provided info: FY2027 has 11,372 total projects. Used only as a fallback if
# pagination metadata is unavailable (e.g. when resuming without page 1 data).
FALLBACK_TOTAL_PROJECTS = {2027: 11372}

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
}

MIN_DELAY = 0.3   # direct access, but stay polite
MAX_DELAY = 1.0
MAX_RETRIES = 4
TIMEOUT = 30

progress_lock = threading.Lock()
progress = {"total": 0, "success": 0, "fail": 0, "items": 0, "retries": {}}


def out_dirs(fiscal_year: int):
    json_dir = os.path.join(BASE_DIR, "json", f"fy{fiscal_year}")
    lists_dir = os.path.join(BASE_DIR, "lists", f"fy{fiscal_year}")
    os.makedirs(json_dir, exist_ok=True)
    os.makedirs(lists_dir, exist_ok=True)
    return json_dir, lists_dir


def build_url(page: int, limit: int, fiscal_year: int) -> str:
    return f"{API_BASE}?page={page}&limit={limit}&fiscalYear={fiscal_year}"


def existing_pages(json_dir: str, limit: int) -> set:
    """Pages already saved on disk (dump files or successful_pages.txt)."""
    pages = set()
    prefix = f"dump-page-"
    for name in os.listdir(json_dir):
        if name.startswith(prefix) and name.endswith(f"-{limit}.json"):
            try:
                pages.add(int(name[len(prefix):].split("-")[0]))
            except ValueError:
                pass
    lists_dir = os.path.normpath(os.path.join(json_dir, "..", "..", "lists", os.path.basename(json_dir)))
    success_path = os.path.join(lists_dir, "successful_pages.txt")
    if os.path.exists(success_path):
        with open(success_path) as f:
            for line in f:
                try:
                    pages.add(int(line.strip()))
                except ValueError:
                    pass
    return pages


def fetch_page(session: requests.Session, page: int, limit: int, fiscal_year: int) -> Optional[dict]:
    url = build_url(page, limit, fiscal_year)
    for attempt in range(1, MAX_RETRIES + 1):
        time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT)
        except Exception as e:
            print(f"[RETRY] Page {page} attempt {attempt}/{MAX_RETRIES}: {str(e)[:120]}")
            if attempt == MAX_RETRIES:
                return None
            time.sleep(2 * attempt)
            continue

        if resp.status_code == 200:
            try:
                data = resp.json()
            except ValueError:
                print(f"[RETRY] Page {page}: invalid JSON")
                time.sleep(2 * attempt)
                continue
            if data.get("status") == 200 and isinstance(data.get("data"), dict):
                return data
            print(f"[RETRY] Page {page}: unexpected payload: {str(data)[:120]}")
            time.sleep(2 * attempt)
            continue

        if resp.status_code in (403, 429) or resp.status_code >= 500:
            print(f"[RETRY] Page {page} attempt {attempt}/{MAX_RETRIES}: HTTP {resp.status_code}, backing off")
            time.sleep(min(5 * attempt, 20))
            continue

        print(f"[FAIL] Page {page}: HTTP {resp.status_code} (non-retryable)")
        return None
    return None


def fetch_and_save(session, page, limit, fiscal_year, json_dir, success_path, fail_path, done):
    if page in done:
        print(f"[SKIP] Page {page} already saved")
        return 0
    print(f"[FETCH] Page {page} -> {build_url(page, limit, fiscal_year)}")
    data = fetch_page(session, page, limit, fiscal_year)
    if data is None:
        print(f"[FAIL] Page {page} failed after {MAX_RETRIES} attempts")
        with progress_lock:
            progress["fail"] += 1
        with open(fail_path, "a") as f:
            f.write(f"{page}\n")
        return 0

    items = data.get("data", {}).get("data", []) or []
    out = os.path.join(json_dir, f"dump-page-{page}-{limit}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[SAVE] Page {page} items={len(items)}")
    with progress_lock:
        progress["success"] += 1
        progress["items"] += len(items)
    with open(success_path, "a") as f:
        f.write(f"{page}\n")
    return len(items)


def discover_total_pages(session, limit, fiscal_year, start_page, json_dir):
    """Fetch page `start_page` once to read pagination metadata if available."""
    if start_page in existing_pages(json_dir, limit):
        return None
    url = build_url(start_page, limit, fiscal_year)
    try:
        resp = session.get(url, headers=HEADERS, timeout=TIMEOUT)
        data = resp.json()
        pag = data.get("data", {}).get("pagination", {})
        tp = pag.get("totalPages")
        tc = pag.get("totalCount")
        print(f"[INFO] Server pagination: totalCount={tc}, totalPages={tp}")
        return tp
    except Exception:
        return None


def main(start_page, end_page, limit, max_workers, fiscal_year):
    start_time = time.time()
    json_dir, lists_dir = out_dirs(fiscal_year)
    success_path = os.path.join(lists_dir, "successful_pages.txt")
    fail_path = os.path.join(lists_dir, "failed_pages.txt")
    progress_path = os.path.join(lists_dir, "progress_stats.json")

    done = existing_pages(json_dir, limit)
    if end_page is None:
        session = requests.Session()
        tp = discover_total_pages(session, limit, fiscal_year, start_page, json_dir)
        if tp is None:
            total = FALLBACK_TOTAL_PROJECTS.get(fiscal_year)
            tp = -(-total // limit) if total else 1
        end_page = max(start_page, tp)

    pages = [p for p in range(start_page, end_page + 1) if p not in done]
    print(f"[INFO] Pages to fetch: {len(pages)} (range {start_page}-{end_page}, {len(done)} already done)")
    if not pages:
        print("[INFO] Nothing to do.")
        return

    progress["total"] = len(pages)
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

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        session = requests.Session()
        futures = {
            ex.submit(fetch_and_save, session, p, limit, fiscal_year,
                      json_dir, success_path, fail_path, done): p
            for p in pages
        }
        for fut in as_completed(futures):
            page = futures[fut]
            try:
                fut.result()
            except Exception as e:
                print(f"[ERROR] Page {page}: {e}")

    stop_flag.set()
    t.join()
    elapsed = time.time() - start_time
    with progress_lock:
        print(f"\n[STATS] Elapsed: {elapsed:.1f}s | success={progress['success']} "
              f"fail={progress['fail']} items={progress['items']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Fetch DPWH NEP project listing pages (BetterGov API)")
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=None, help="Defaults to pagination.totalPages discovered from the API")
    ap.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--fiscal-year", type=int, default=DEFAULT_FISCAL_YEAR)
    args = ap.parse_args()
    main(args.start, args.end, args.limit, args.workers, args.fiscal_year)
