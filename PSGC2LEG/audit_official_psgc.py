#!/usr/bin/env python3
"""Compare the primary PSA PSGC publication (.xlsx or PSGC-sheet .csv) to the pinned mirror.

This tool never substitutes the mirror for the official source and never guesses district
boundaries. It produces row-level, versioned administrative differences.
Only Python standard library modules are needed.
"""
from __future__ import annotations
import argparse
import csv
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
DEFAULT_REGISTRY = ROOT / "outputs" / "psgc_admin_registry_2026-10-12.json"
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
DOCREL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
RELS = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def code10(raw):
    s = str(raw or "").strip()
    if not s:
        return None
    try:
        n = Decimal(s)
        if n != n.to_integral_value() or n < 0 or n >= 10_000_000_000:
            return None
        return f"{int(n):010d}"
    except InvalidOperation:
        return s if re.fullmatch(r"\d{10}", s) else None


def field_key(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def canonical_name(s):
    value = re.sub(r"\s+[a-z]/\s*$", "", str(s or "").strip())
    return " ".join(value.casefold().split())


def parse_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        yield from csv.reader(f)


def parse_xlsx(path):
    with zipfile.ZipFile(path) as z:
        doc = ET.fromstring(z.read("xl/workbook.xml"))
        sheets = doc.find(MAIN + "sheets")
        if sheets is None:
            raise ValueError("Excel file contains no sheets")
        sh = next((s for s in sheets if s.get("name") == "PSGC"), None)
        if sh is None:
            raise ValueError('Official Excel workbook requires sheet named "PSGC"')
        rid = sh.get(DOCREL + "id")
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = next((a.get("Target") for a in rels if a.get("Id") == rid), None)
        if not target:
            raise ValueError("Missing worksheet relationship")
        name = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            ss = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in ss.findall(MAIN + "si"):
                strings.append("".join((t.text or "") for t in si.iter(MAIN + "t")))
        with z.open(name) as stream:
            for _, elem in ET.iterparse(stream, events=("end",)):
                if elem.tag != MAIN + "row":
                    continue
                cells = {}
                for c in elem.findall(MAIN + "c"):
                    address = c.get("r", "")
                    letters = re.match(r"[A-Z]+", address)
                    if not letters:
                        continue
                    index = 0
                    for char in letters.group():
                        index = index * 26 + ord(char) - ord("A") + 1
                    t = c.get("t", "")
                    v = c.find(MAIN + "v")
                    raw = v.text if v is not None else None
                    if t == "s" and raw is not None:
                        raw = strings[int(raw)]
                    if t == "inlineStr":
                        inline = c.find(MAIN + "is")
                        raw = "".join((child.text or "") for child in inline.iter(MAIN + "t")) if inline is not None else None
                    cells[index - 1] = raw or ""
                row = [cells.get(i, "") for i in range(max(cells, default=-1) + 1)]
                yield row
                elem.clear()


def extract_rows(path):
    iterator = parse_xlsx(path) if path.suffix.lower() == ".xlsx" else parse_csv(path)
    header = None
    errors = []
    rows = {}
    for n, row in enumerate(iterator, 1):
        if header is None:
            names = {field_key(x): i for i, x in enumerate(row)}
            code = next((names[k] for k in ("10digitpsgc", "psgcid", "psgccode", "code") if k in names), None)
            area = next((names[k] for k in ("name", "areaname", "geographiclocation") if k in names), None)
            level = next((names[k] for k in ("geographiclevel", "level") if k in names), None)
            if code is not None and area is not None and level is not None:
                header = (code, area, level)
            continue
        def read_col(col):
            return str(row[col] if col < len(row) else "").strip()
        identifier = code10(read_col(header[0]))
        if identifier is None:
            continue  # title, footnote, summary row
        name = read_col(header[1])
        level = read_col(header[2])
        if not name or not level:
            errors.append({"line": n, "code": identifier, "issue": "Missing name/level"})
            continue
        if identifier in rows:
            errors.append({"line": n, "code": identifier, "issue": "Duplicate official PSGC code"})
            continue
        rows[identifier] = {"name": name, "level": level}
    if header is None:
        raise ValueError("Cannot identify PSGC code, Name and Geographic Level columns")
    if errors:
        raise ValueError("Official data invalid: " + json.dumps(errors[:15]))
    return rows


def compare(official, registry, primary_sha256, source_filename):
    mirror = registry["records"]
    changes = {"name_mismatch": [], "official_not_in_mirror": [], "mirror_not_in_official": []}
    for code, official_row in sorted(official.items()):
        record = mirror.get(code)
        if record is None:
            changes["official_not_in_mirror"].append({"code": code, **official_row})
        elif canonical_name(official_row["name"]) != canonical_name(record[0]):
            changes["name_mismatch"].append(
                {"code": code, "official": official_row["name"], "mirror": record[0]}
            )
    for code, record in sorted(mirror.items()):
        if code not in official:
            changes["mirror_not_in_official"].append(
                {"code": code, "name": record[0], "type": record[1]}
            )
    return {
        "schemaVersion": "1.0.0",
        "sourceFilename": source_filename,
        "sourceSha256": primary_sha256,
        "sourceAuthority": "Philippine Statistics Authority PSGC publication",
        "mirrorSource": registry["provenance"],
        "officialRowCount": len(official),
        "mirrorRowCount": len(mirror),
        "summary": {name: len(rows) for name, rows in changes.items()},
        "differences": changes,
        "note": "Some structural rows such as City of Isabela and submunicipalities may be modelled differently. Inspect every reported difference; PSGC does not encode legislative district membership."
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("official_psgc_file", type=Path, help="PSA publication XLSX (PSGC sheet) or exported PSGC CSV")
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    ap.add_argument("--output", type=Path, help="Write complete JSON diff here (defaults to stdout)")
    ap.add_argument("--fail-on-diff", action="store_true")
    args = ap.parse_args()
    if args.official_psgc_file.suffix.lower() not in (".csv", ".xlsx"):
        ap.error("Expected .csv or .xlsx")
    data = args.official_psgc_file.read_bytes()
    rows = extract_rows(args.official_psgc_file)
    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    result = compare(rows, registry, hashlib.sha256(data).hexdigest(), args.official_psgc_file.name)
    payload = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
        print(json.dumps({"output": str(args.output), "officialRowCount": result["officialRowCount"], "summary": result["summary"]}))
    else:
        print(payload)
    if args.fail_on_diff and any(result["summary"].values()):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
