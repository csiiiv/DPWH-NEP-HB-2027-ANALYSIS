#!/usr/bin/env python3
"""
Combine all paginated NEP dump files (dump-page-*.json) from a source folder
into a single JSON file.

Each dump file follows the API response shape:
{
  "status": 200,
  "code": "SUCCESS",
  "data": {
    "data": [ {project}, {project}, ... ],
    "summary": { "totalProjects": N, "totalAmount": M },
    "pagination": { "page": 1, "limit": 500, ... }
  }
}

Output shape:
{
  "status": 200,
  "code": "SUCCESS",
  "data": {
    "data": [ all projects, ordered by page number ],
    "summary": { "totalProjects": combined, "totalAmount": combined },
    "pagination": { "page": 1, "limit": 500, "totalCount": combined,
                    "totalPages": 1, "hasNext": false, "hasPrev": false }
  }
}

Usage:
    python3 combine_nep_dumps.py                          # fy2027 -> json/fy2027-combined.json
    python3 combine_nep_dumps.py <source_dir> [output]    # custom source/output
"""

import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE = BASE_DIR / "json" / "fy2027"
DEFAULT_OUTPUT = BASE_DIR / "json" / "fy2027-combined.json"

PAGE_RE = re.compile(r"dump-page-(\d+)-")


def find_dump_files(source_dir: Path) -> list[Path]:
    """Find dump-page-*.json files sorted by page number."""
    files = []
    for f in source_dir.glob("dump-page-*.json"):
        m = PAGE_RE.search(f.name)
        if m:
            files.append((int(m.group(1)), f))
    files.sort(key=lambda t: t[0])
    return [f for _, f in files]


def combine(source_dir: Path, output_file: Path) -> None:
    dump_files = find_dump_files(source_dir)
    if not dump_files:
        print(f"No dump-page-*.json files found in {source_dir}")
        sys.exit(1)

    print(f"Found {len(dump_files)} dump file(s) in {source_dir}")

    all_projects: list[dict] = []
    seen_codes: set[str] = set()
    duplicates: list[str] = []
    expected_total: int | None = None

    for path in dump_files:
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)

        page_data = payload.get("data", {})
        projects = page_data.get("data", [])
        summary = page_data.get("summary", {})

        # summary is global (identical on every page), not per-page
        if expected_total is None and summary:
            expected_total = summary.get("totalProjects")

        for p in projects:
            code = p.get("code")
            if code and code in seen_codes:
                duplicates.append(code)
                continue
            if code:
                seen_codes.add(code)
            all_projects.append(p)

        print(f"  {path.name}: {len(projects)} project(s)")

    if duplicates:
        print(f"WARNING: skipped {len(duplicates)} duplicate project code(s):")
        for code in duplicates:
            print(f"  - {code}")

    total_amount = sum(p.get("amount") or 0 for p in all_projects)

    if expected_total is not None and len(all_projects) != expected_total:
        print(
            f"WARNING: combined {len(all_projects)} project(s) but "
            f"API summary reported {expected_total}"
        )

    combined = {
        "status": 200,
        "code": "SUCCESS",
        "data": {
            "data": all_projects,
            "summary": {
                "totalProjects": len(all_projects),
                "totalAmount": total_amount,
            },
            "pagination": {
                "page": 1,
                "limit": 500,
                "totalCount": len(all_projects),
                "totalPages": 1,
                "hasNext": False,
                "hasPrev": False,
            },
        },
    }

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\nCombined {len(all_projects)} projects -> {output_file}")
    print(f"Total amount: {total_amount:,}")


if __name__ == "__main__":
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT
    combine(source, output)
