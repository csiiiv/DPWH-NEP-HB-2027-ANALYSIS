#!/usr/bin/env python3
"""Phase 2a: Extract the official seat allocation (Annex A, COMELEC Res 11050)
into a clean jurisdiction -> district-count table.

Annex A layout: rows of (row-number, REGION or jurisdiction name, seat count).
Rows with region headers carry a subtotal; jurisdiction rows carry seats.
Handles OCR noise (I/l/1 confusion) via canonical name mapping.

Output: data/comelec_annexA_seats.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "sources" / "raw" / "comelec-res-11050__com_res_11050.pdf"
OUT = ROOT / "data" / "comelec_annexA_seats.json"

# ---- canonical OCR fixes (value -> canonical) ----
CANON = {
    "Parafraque": "Parañaque",
    "Las Pifras": "Las Piñas",
    "ltlalabon": "Malabon",
    "lloilo": "Iloilo",
    "GU!I/ARAS": "Guimaras",
    "!LOtLO": "Iloilo",
    "PATUPANGA": "PAMPANGA",
    "REGTON rV-A (CALABARZON)": "REGION IV-A (CALABARZON)",
    "REGTON rV-B (MIMAROPA)": "REGION IV-B (MIMAROPA)",
    "REGTON V!": "REGION VI",
    "REGTON/PROVTNCE": "REGION/PROVINCE",
    "REGTON/PROVINCE": "REGION/PROVINCE",
    "REGTON IX": "REGION IX",
    "GeneralSanFos": "General Santos",
    "TAW!-TAWI": "Tawi-Tawi",
    "USAN DEL NORTE": "Agusan del Norte",
    "]VIOUNTAIN PROVINCE": "Mountain Province",
    "Bifian": "Biñan",
    "Sonta": "Santa",
    "NC E": "",  # 'REGION/PROVINCE' header artifact ('NC E' = 'NCE' fragment)
}

REGION_MARKERS = (
    "NATIONAL CAPITAL REGION", "CORDILLERA", "REGION I", "REGION II",
    "REGION III", "REGION IV", "REGION V", "REGION VI", "REGION VII",
    "REGION VIII", "REGION IX", "REGION X", "REGION XI", "REGION XII",
    "NEGROS ISLAND REGION", "BANGSAMORO", "CARAGA",
)

FIX_KEYS = sorted((k for k in CANON if k), key=len, reverse=True)


def fix_name(s: str) -> str:
    for k in FIX_KEYS:
        if k in s:
            s = s.replace(k, CANON[k])
    return s.strip()


def norm_words(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def main() -> int:
    doc = pymupdf.open(SRC)
    entries = []          # (region, juror, seats, page)
    current_region = None
    skipped = []

    for pno in range(9, 14):  # pages 10-14 (0-indexed 9..13)
        page = doc[pno]
        words = page.get_text("words")
        lines = {}
        for w in words:
            key = (round(w[1] / 4) * 4, w[5], w[6])  # y-quantized line key
            lines.setdefault((key[0], key[1]), []).append((w[0], w[4]))
        for (y, blk) in sorted(lines.keys(), key=lambda k: (k[1] != 0, k[0])):
            pass
        for y in sorted({k[0] for k in lines}):
            # merge lines sharing y across blocks
            ws = sorted([w for (yy, _), lst in lines.items() if yy == y for w in lst])
            # separate the trailing count (rightmost numeric word)
            nums = [(x, t) for x, t in ws if re.fullmatch(r"[0-9lIIt,]{1,4}", t) and x > 400]
            text = norm_words(" ".join(t for x, t in ws if (x, t) not in nums or x <= 400))
            text = fix_name(text)
            if not text or text in ("ANNEX A",) or text.startswith("No. of"):
                continue
            if any(m in text.upper() for m in ("MAY 12", "Elections", "Department")):
                continue
            seat_val = None
            if nums:
                raw = sorted(nums)[-1][1]
                # OCR digit fixes
                raw = raw.replace("l", "1").replace("I", "1").replace("t", "1").replace(",", "")
                if re.fullmatch(r"\d{1,2}", raw):
                    seat_val = int(raw)
            # region header? (also catches OCR variants like 'REGION V!' fixed above)
            upper = text.upper()
            is_region = (
                upper.startswith("REGION")
                or upper.startswith("NEGROS ISLAND")
                or upper.startswith("BANGSAMORO")
                or upper.startswith("CARAGA")
                or upper.startswith("CORDILLERA")
                or upper.startswith("NATIONAL CAPITAL")
            )
            # row numbers like '1 City of Manila' -> strip leading ordinal
            m = re.match(r"^([0-9lIt]{1,2})\s+(.*)$", text)
            rowno, jur = (m.group(1), m.group(2)) if m else (None, text)
            if rowno is not None:
                rowno = rowno.replace("l", "1").replace("I", "1").replace("t", "1")
            yield_like = jur in ("", "E", "NC E")
            if is_region:
                current_region = text
                entries.append({"kind": "region", "name": text, "seats": seat_val, "page": pno + 1})
            elif seat_val is not None and not yield_like:
                entries.append({"kind": "jurisdiction", "region": current_region,
                                "name": jur, "seats": seat_val, "rowno": rowno, "page": pno + 1})
            else:
                skipped.append({"page": pno + 1, "text": text, "nums": nums})

    total = sum(e["seats"] for e in entries if e["kind"] == "jurisdiction")
    region_subtotals = {e["name"]: e["seats"] for e in entries if e["kind"] == "region" and e["seats"]}

    # validation: jurisdiction seats must sum to 254
    result = {
        "source": "COMELEC Resolution No. 11050 (4 Sep 2024), Annex A",
        "source_file": SRC.name,
        "entries": entries,
        "sum_jurisdiction_seats": total,
        "expected_total": 254,
        "region_subtotals_from_doc": region_subtotals,
        "skipped_lines": skipped[:30],
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(f"jurisdictions: {sum(1 for e in entries if e['kind']=='jurisdiction')}")
    print(f"region headers with seats: {len(region_subtotals)}")
    print(f"TOTAL SEATS = {total} (expect 254)")
    print("regions:", json.dumps(region_subtotals, ensure_ascii=False))
    if skipped:
        print(f"skipped {len(skipped)} lines; first few:")
        for s in skipped[:8]:
            print("  ", s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
