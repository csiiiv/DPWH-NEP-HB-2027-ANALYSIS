#!/usr/bin/env python3
"""Phase 0 source acquisition: download, verify, register.

Downloads each source into sources/raw/ (verbatim, never modified),
computes SHA-256, and appends/updates an entry in sources/register/sources.json.

Usage:
    python3 scripts/archive_source.py <source_id> <url> [--filename NAME]

The register is the single provenance record: id, url, publisher, dates,
hash, bytes, and inspection notes (filled in manually after inspection).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "sources" / "raw"
REGISTER_PATH = ROOT / "sources" / "register" / "sources.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
# Note: several PH government sites (uacs.gov.ph etc.) run WAFs that reject
# non-browser user agents; we send browser-like headers and identify via Referer.


def _headers(url: str) -> dict:
    parsed = urlparse(url)
    return {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"{parsed.scheme}://{parsed.netloc}/",
    }


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sniff_kind(path: Path, content_type: str) -> str:
    name = path.name.lower()
    if name.endswith((".xlsx", ".xls")):
        return "xlsx"
    if name.endswith(".csv"):
        return "csv"
    if name.endswith(".json"):
        return "json"
    if name.endswith(".pdf"):
        return "pdf"
    if name.endswith((".zip",)):
        return "zip"
    if name.endswith((".html", ".htm")):
        return "html"
    if "pdf" in content_type or name.endswith(".pdf"):
        return "pdf"
    if "json" in content_type:
        return "json"
    return "bin"


def download(url: str, dest: Path) -> tuple[int, str]:
    req = Request(url, headers=_headers(url))
    with urlopen(req, timeout=120) as resp:
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read()
    dest.write_bytes(data)
    return len(data), content_type


def load_register() -> dict:
    if REGISTER_PATH.exists():
        return json.loads(REGISTER_PATH.read_text(encoding="utf-8"))
    return {"register_version": 1, "sources": {}}


def save_register(reg: dict) -> None:
    REGISTER_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTER_PATH.write_text(
        json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source_id")
    ap.add_argument("url")
    ap.add_argument("--filename", help="override stored filename")
    ap.add_argument("--publisher", default="")
    ap.add_argument("--title", default="")
    ap.add_argument("--document-date", default="", help="official document date if known")
    ap.add_argument("--notes", default="")
    args = ap.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    parsed = urlparse(args.url)
    default_name = Path(parsed.path).name or "download"
    # Keep a filesystem-safe name; preserve extension.
    fname = args.filename or default_name
    dest = RAW_DIR / f"{args.source_id}__{fname}"

    print(f"Downloading {args.url}")
    print(f"  -> {dest}")
    try:
        nbytes, content_type = download(args.url, dest)
    except Exception as e:  # noqa: BLE001
        print(f"  FAILED: {e}", file=sys.stderr)
        return 1

    digest = sha256_file(dest)
    kind = sniff_kind(dest, content_type)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    reg = load_register()
    prev = reg["sources"].get(args.source_id)
    entry = {
        "source_id": args.source_id,
        "title": args.title or (prev or {}).get("title", ""),
        "publisher": args.publisher or (prev or {}).get("publisher", ""),
        "url": args.url,
        "document_date": args.document_date or (prev or {}).get("document_date", ""),
        "retrieved_at_utc": now,
        "filename": dest.name,
        "kind": kind,
        "bytes": nbytes,
        "sha256": digest,
        "content_type_on_fetch": content_type,
        "notes": args.notes or (prev or {}).get("notes", ""),
        "verification_status": (prev or {}).get("verification_status", "downloaded_not_yet_inspected"),
    }
    if prev:
        entry["superseded_sha256"] = (
            [prev["sha256"]] if prev.get("sha256") != digest else []
        ) and ([*prev.get("superseded_sha256", []), prev["sha256"]] if prev.get("sha256") != digest else [])
    reg["sources"][args.source_id] = entry
    save_register(reg)

    print(f"  {nbytes:,} bytes  sha256={digest[:16]}…  kind={kind}")
    print(f"  registered as '{args.source_id}' in {REGISTER_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
