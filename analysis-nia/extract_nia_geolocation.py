#!/usr/bin/env python3
"""Extract the supplied NIA geolocation enrichment (Nov 10) from the Anthony workbook.

The workbook's main sheet carries one row per existing NIA comparison row
(pair / house_only / nep_only ids), enriched with barangay-level 10-digit PSGC,
administrative names, legislative district, DPWH DEO and a location reference
URL. NEP/HGAB ledgers remain the printed source of truth; this layer is a
review aid produced off-system (AI-assisted, per the workbook's own flags).

Every row is retained, including unlocated rows, so the UI can show coverage
explicitly. PSGC codes are validated against the retained PSGC2LEG catalog;
invalid or unknown codes are flagged, never dropped or corrected.

Output: analysis-nia/data/nia_geolocation.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / 'anthony_data'
CATALOG = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
OUTPUT = HERE / 'data/nia_geolocation.json'

SHEET = 'bettergov-house-bill-2027-nia-p'

EXPECTED_COLUMNS = [
    'id', 'dataset', 'title', '10-digit PSGC', 'Name', 'Legislative District', 'DEO',
    'City/Municipality', 'Province', 'Location Reference',
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_catalog() -> dict[str, dict]:
    entries = {}
    with CATALOG.open() as handle:
        for line in handle:
            record = json.loads(line)
            code = record.get('code')
            if code:
                entries[str(code)] = record
    return entries


def text(value) -> str | None:
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped or None


def money(value) -> float | None:
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def find_workbook() -> Path:
    candidates = sorted(SOURCE_DIR.glob('*with geolocation*nia-projects*.xlsx'))
    if not candidates:
        raise ValueError(f'No NIA geolocation workbook found under {SOURCE_DIR}')
    return candidates[-1]


def extract(path: Path | None = None, catalog: dict[str, dict] | None = None):
    workbook_path = path or find_workbook()
    catalog = catalog if catalog is not None else load_catalog()

    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    try:
        if SHEET not in wb.sheetnames:
            raise ValueError(f'Expected sheet {SHEET!r}; found {wb.sheetnames}')
        ws = wb[SHEET]
        rows = list(ws.iter_rows(values_only=True))
    finally:
        wb.close()

    if not rows:
        raise ValueError('NIA geolocation sheet is empty')

    header = [text(cell) for cell in rows[0]]
    for column in EXPECTED_COLUMNS:
        if column not in header:
            raise ValueError(f'Missing expected column {column!r} in {SHEET}')
    index = {name: header.index(name) for name in header if name}

    records = []
    flags_counter: Counter[str] = Counter()
    for excel_row, raw in enumerate(rows[1:], start=2):
        cells = list(raw) + [None] * (len(header) - len(raw))
        get = lambda name: cells[index[name]] if index.get(name) is not None and index[name] < len(cells) else None

        comparison_id = text(get('id'))
        if not comparison_id:
            continue
        psgc = text(get('10-digit PSGC'))
        record_flags = []

        located = False
        psgc_status = None
        if psgc:
            if not re.fullmatch(r'\d{10}', psgc):
                psgc_status = 'malformed'
                record_flags.append('psgc_malformed')
            elif psgc not in catalog:
                psgc_status = 'unknown_code'
                record_flags.append('psgc_unknown')
            else:
                psgc_status = 'valid'
                located = True

        province = text(get('Province'))
        municipality = text(get('City/Municipality'))
        barangay = text(get('Name'))
        if located and not (province and municipality and barangay):
            record_flags.append('incomplete_names')

        deo = text(get('DEO'))
        if located and deo and province:
            match = re.match(r'^(.*?)\s+\d(?:st|nd|rd|th)\s+DEO$', deo)
            if match and match.group(1).strip().lower() not in province.lower():
                record_flags.append('deo_province_mismatch')

        location_reference = text(get('Location Reference'))
        if location_reference and 'facebook.com' in location_reference.lower():
            record_flags.append('weak_reference')

        workbook_flags = [flag for flag in (text(get('flags')) or '').split(';') if flag]

        record = {
            'id': comparison_id,
            'excel_row': excel_row,
            'dataset': text(get('dataset')),
            'title': text(get('title')),
            'psgc': psgc,
            'psgc_status': psgc_status,
            'barangay': barangay,
            'municipality': municipality,
            'province': province,
            'legislative_district': text(get('Legislative District')),
            'deo': deo,
            'location_reference': location_reference,
            'status_label': text(get('status_label')),
            'nep_php': money(get('nep_php')),
            'hgab2_php': money(get('hgab2_php')),
            'workbook_flags': workbook_flags,
            'flags': record_flags,
            'located': located,
        }
        records.append(record)
        flags_counter.update(record_flags)

    if not records:
        raise ValueError('No data rows extracted from the geolocation sheet')

    located_records = [r for r in records if r['located']]
    data = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'scope': 'AI-assisted geolocation enrichment for the FY2027 NIA comparison rows; review aid, not a certified site ledger.',
        'summary': {
            'records': len(records),
            'located': len(located_records),
            'located_pct': round(len(located_records) / len(records) * 100, 2) if records else 0,
            'unlocated': len(records) - len(located_records),
            'psgc_valid': sum(1 for r in located_records if r['psgc_status'] == 'valid'),
            'psgc_malformed': flags_counter.get('psgc_malformed', 0),
            'psgc_unknown': flags_counter.get('psgc_unknown', 0),
            'review_flags': dict(flags_counter),
        },
        'metadata': {
            'source_xlsx': str(workbook_path.relative_to(ROOT)),
            'source_xlsx_sha256': sha256(workbook_path),
            'source_sheet': SHEET,
            'psgc_catalog': str(CATALOG.relative_to(ROOT)),
            'note': 'Location Reference URLs include social-media links (facebook.com); treat as weak evidence.',
        },
        'records': records,
    }
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare the regenerated payload without writing')
    args = parser.parse_args()
    data = build_payload = extract()
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text() != payload:
            raise SystemExit('NIA geolocation dataset is missing or stale; run analysis-nia/extract_nia_geolocation.py')
        print(f'Checked {OUTPUT}')
    else:
        OUTPUT.write_text(payload)
        summary = data['summary']
        print(f'Wrote {OUTPUT}: {summary["records"]} rows, {summary["located"]} located '
              f'({summary["located_pct"]}%), flags {summary["review_flags"]}')


if __name__ == '__main__':
    main()
