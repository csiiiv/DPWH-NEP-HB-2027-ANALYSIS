#!/usr/bin/env python3
"""Stage 1: extract *typed first-column entries* from COMELEC's 2025 elective positions PDF.

This conservative extractor does NOT output verified municipality-to-legislative links.
It captures ordered source rows, page numbers and district-heading types for review.
PDF text extraction is sensitive to layout; validate against the actual pages before
using records as authoritative electoral geography.

Requires PyMuPDF (fitz): python -m pip install pymupdf
"""
import argparse
import json
import re
from pathlib import Path

SOURCE = "https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/12202024_NoOfElectivePositions2025NLE.pdf"
DISTRICT = re.compile(r"^(?:(?:Lone|[1-9](?:st|nd|rd|th))\s+)(Legislative|Provincial|Councilor)\s+District\b", re.I)
REGION = re.compile(r"^(?:NATIONAL CAPITAL REGION|CORDILLERA ADM\.? REGION|REGION\s+(?:I|V|X|[0-9]|[ -])+|BARMM|B\s*A\s*R\s*M\s*M)$", re.I)
IGNORE = (
    "PHILIPPINES", "NOT VOTING", "MUNICIPAL", "SENATORS",
    "TOTAL", "REPUBLIC OF THE PHILIPPINES", "COMMISSION ON ELECTIONS",
)
ORDINAL = re.compile(r"^\d{1,3}\s+(?=[A-Za-zÀ-ÿ])")


def classify_label(line):
    """Classify heading without treating councilor/provincial seats as House seats."""
    text = " ".join(str(line).split())
    if not text or text.upper() in IGNORE:
        return "ignored"
    if "CITY REGION/PROVINCE" in text.upper() or "ELECTIVE POSITIONS" in text.upper():
        return "ignored"
    if REGION.fullmatch(text):
        return "region"
    kind = DISTRICT.match(text)
    if kind:
        return kind.group(1).lower() + "_district"
    if re.search(r"\b(?:Legislative|Provincial|Councilor)\s+District\b", text, flags=re.I):
        return "district_other"
    if ORDINAL.match(text):
        return "locality"
    if re.fullmatch(r"[A-Z][A-Z\s'().\-]+", text) and len(text) < 70:
        return "province_or_section"
    if re.match(r"^(?:City of |Science City of )", text, re.I):
        return "city_or_locality"
    if re.fullmatch(r"[\wÀ-ÿ][\wÀ-ÿ .,'()\-]+", text) and not re.search(r"\d{3,}", text):
        return "other_text"
    return "ignored"


def parse_column_lines(lines, page_number):
    """Accept ordered first-column lines; retain position and provenance."""
    entries = []
    for index, label in enumerate(lines):
        value = ORDINAL.sub("", " ".join(str(label).strip().split()))
        kind = classify_label(label)
        if kind == "ignored":
            continue
        entries.append({
            "page": page_number,
            "lineIndex": index,
            "text": value,
            "kind": kind,
            "districtType": {
                "legislative_district": "house_legislative",
                "provincial_district": "provincial_board",
                "councilor_district": "city_council",
            }.get(kind),
        })
    return entries


def first_column_lines(page, first_column_ratio=0.225):
    """Read only the first labeled geography column; group words by visual row."""
    cutoff = page.rect.width * first_column_ratio
    words = [w for w in page.get_text("words", sort=True) if w[0] < cutoff
             and w[2] <= cutoff + 1]
    rows = []
    for w in sorted(words, key=lambda item: (round((item[1] + item[3]) / 2, 1), item[0])):
        mid = (w[1] + w[3]) / 2
        if rows and abs(rows[-1]["y"] - mid) <= 2.0:
            rows[-1]["words"].append(w)
        else:
            rows.append({"y": mid, "words": [w]})
    return [" ".join(w[4] for w in sorted(row["words"], key=lambda item: item[0]))
            for row in rows]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path,
                        help="Official 2025 COMELEC elective positions PDF downloaded from manifest URL")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--column-ratio", type=float, default=0.225)
    args = parser.parse_args()
    if not 0.10 <= args.column_ratio <= 0.40:
        parser.error("--column-ratio must be between 0.10 and 0.40")
    try:
        import fitz
    except ImportError as exc:
        parser.error("PyMuPDF is required: python -m pip install pymupdf")
    if not args.pdf.is_file():
        parser.error("PDF not found: " + str(args.pdf))
    doc = fitz.open(args.pdf)
    output = []
    for idx, page in enumerate(doc):
        text = first_column_lines(page, args.column_ratio)
        output.extend(parse_column_lines(text, idx + 1))
    report = {
        "schemaVersion": "0.1.0", "election": "2025-05-12",
        "sourceUrl": SOURCE, "sourceFile": args.pdf.name,
        "reviewRequired": True, "scope": "first_column_typed_rows_not_verified_membership",
        "totalPages": len(doc), "entries": output,
        "countsByKind": {kind: sum(row["kind"] == kind for row in output)
                         for kind in sorted({row["kind"] for row in output})},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    print(f"Extracted {len(output)} typed rows from {len(doc)} pages; REVIEW REQUIRED")


if __name__ == "__main__":
    main()
