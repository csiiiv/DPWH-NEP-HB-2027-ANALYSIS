#!/usr/bin/env python3
"""Extract the DA FY2027 FMR working draft (Nov 5) from the supplied Excel workbook.

NEP and House GAB remain the printed source-of-truth ledgers. This artifact is a
third observation: DA's own FROM→TO working draft, retained with Excel row
numbers so every UI/audit row can cite the spreadsheet cell origin.

Outputs:
  data/da_fmr_draft.json — regions, project rows (original / NEW / L), proposed
  portfolio, and source file hashes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / 'DA_FMR_DATA'
OUTPUT = ANALYSIS / 'data/da_fmr_draft.json'

COORD_RE = re.compile(
    r'START\s*:\s*([-\d.]+)\s*,\s*([-\d.]+)\s*END\s*:\s*([-\d.]+)\s*,\s*([-\d.]+)',
    re.I | re.S,
)
# Numbered multi-segment lists, e.g.
#   START: (1) 16.75, 121.85, (2) 16.75, 121.85
#   END:   (1) 16.76, 121.86, (2) 16.75, 121.86
NUMBERED_POINT_RE = re.compile(r'\((\d+)\)\s*([-\d.]+)\s*,\s*([-\d.]+)')
# Section modifiers (same idea as numbered lists):
#   START: S1-13.78, 121.36 S2-13.70, 121.35
#   END:   S1-13.78, 121.35 S2-13.78, 121.35
#   START: Section 1: 120.60, 18.18, Section 2: ...
SECTION_POINT_RES = (
    re.compile(r'\bS(\d+)\s*[-–]\s*([-\d.]+)\s*[, ]+\s*([-\d.]+)', re.I),
    re.compile(r'\bSection\s+(\d+)\s*:\s*([-\d.]+)\s*,\s*([-\d.]+)', re.I),
)
# Interleaved per-section blocks:
#   START (SEC 1): lat, lon  END (SEC 1): lat, lon  START (SEC 2): ...
INTERLEAVED_SEC_RE = re.compile(
    r'\b(?P<role>START|END)\s*\(\s*SEC(?:TION)?\s*(?P<n>\d+)\s*\)\s*:\s*'
    r'(?P<a>[-\d.]+)\s*,\s*(?P<b>[-\d.]+)',
    re.I,
)
TITLE_SPLIT = re.compile(r'\n\s*START\b', re.I)
REGION_HINT = re.compile(
    r'^(?:REGION\s+[IVX]+[AB]?\b|CORDILLERA ADMINISTRATIVE REGION|NEGROS ISLAND REGION)',
    re.I,
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def find_workbook() -> Path:
    matches = sorted(SOURCE_DIR.glob('Working Draft as of Nov 5*.xlsx'))
    if not matches:
        raise FileNotFoundError(f'No DA working-draft workbook under {SOURCE_DIR}')
    return matches[0]


def money(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value)))
    text = str(value).replace(',', '').replace('(', '-').replace(')', '').strip()
    if not text or text == '-':
        return None
    try:
        return int(round(float(text)))
    except ValueError:
        return None


def collapse_ocr_digit_gaps(text: str) -> str:
    """Collapse spaces inside decimals / digit runs (e.g. '14. 233296' → '14.233296')."""
    return re.sub(r'(?<=[\d.])\s+(?=\d)', '', text)


def safe_float(token):
    try:
        text = collapse_ocr_digit_gaps(str(token))
        if text.count('.') > 1:
            return None
        return float(text)
    except (TypeError, ValueError):
        return None


def _lonlat_pair(lat, lon):
    """Excel FMR cells print lat,lon; workbench geometry stores [lon, lat]."""
    if lat is None or lon is None:
        return None
    # Guard obvious axis swaps: Philippine lon is ~117–127, lat ~4–21.
    if 117 <= lat <= 127 and 4 <= lon <= 21:
        lat, lon = lon, lat
    if not (117 <= lon <= 127 and 4 <= lat <= 21):
        return None
    return [lon, lat]


def _pair_labeled_points(start_block, end_block, patterns):
    """Collect labeled points from START/END blocks and pair by shared index."""
    def collect(block):
        points = {}
        for pattern in patterns:
            for number, a, b in pattern.findall(block):
                pair = _lonlat_pair(safe_float(a), safe_float(b))
                if pair:
                    points[int(number)] = pair
        return points

    starts, ends = collect(start_block), collect(end_block)
    shared = sorted(set(starts) & set(ends))
    if not shared:
        return None
    return [[starts[n], ends[n]] for n in shared]


def _parse_numbered_segments(text):
    """Pair numbered START/END lists into segments by index."""
    start_m = re.search(r'\bSTART\s*:', text, re.I)
    end_m = re.search(r'\bEND\s*:', text, re.I)
    if not start_m or not end_m or end_m.start() <= start_m.start():
        return None, None
    coordinates = _pair_labeled_points(
        text[start_m.end():end_m.start()], text[end_m.end():], (NUMBERED_POINT_RE,))
    raw = text[start_m.start():].strip()
    return coordinates, raw


def _parse_section_modifier_segments(text):
    """Pair S1-/Section-N modifiers inside START:/END: blocks."""
    start_m = re.search(r'\bSTART\s*:', text, re.I)
    end_m = re.search(r'\bEND\s*:', text, re.I)
    if not start_m or not end_m or end_m.start() <= start_m.start():
        return None, None
    coordinates = _pair_labeled_points(
        text[start_m.end():end_m.start()], text[end_m.end():], SECTION_POINT_RES)
    raw = text[start_m.start():].strip()
    return coordinates, raw


def _parse_interleaved_sec_segments(text):
    """Pair interleaved START (SEC n)/END (SEC n) endpoint blocks."""
    starts, ends = {}, {}
    for match in INTERLEAVED_SEC_RE.finditer(text):
        pair = _lonlat_pair(safe_float(match.group('a')), safe_float(match.group('b')))
        if not pair:
            continue
        bucket = starts if match.group('role').upper() == 'START' else ends
        bucket[int(match.group('n'))] = pair
    shared = sorted(set(starts) & set(ends))
    if not shared:
        return None, None
    return [[starts[n], ends[n]] for n in shared], text[INTERLEAVED_SEC_RE.search(text).start():].strip()


def parse_title_coords(text):
    """Return title, lon/lat coordinate arrays (workbench order), raw coord text."""
    if text is None:
        return None, None, None, False
    if not isinstance(text, str):
        text = str(text)
    stripped = text.strip()
    if not stripped:
        return None, None, None, False
    if stripped.upper() == 'RETAIN':
        return 'RETAIN', None, None, True

    # Pre-normalize OCR digit gaps before the simple START/END matcher.
    normalized = collapse_ocr_digit_gaps(text)
    match = COORD_RE.search(normalized)
    coordinates = None
    coordinates_raw = None
    if match:
        values = [safe_float(part) for part in match.groups()]
        if all(v is not None for v in values):
            start_lat, start_lon, end_lat, end_lon = values
            start = _lonlat_pair(start_lat, start_lon)
            end = _lonlat_pair(end_lat, end_lon)
            if start and end:
                # Workbench / normalized FMR coords are [longitude, latitude].
                coordinates = [[start, end]]
                coordinates_raw = (
                    f'START: {start_lat}, {start_lon}\nEND: {end_lat}, {end_lon}'
                )
            else:
                coordinates_raw = match.group(0)
        else:
            coordinates_raw = match.group(0)
    if coordinates is None and NUMBERED_POINT_RE.search(text):
        coordinates, coordinates_raw = _parse_numbered_segments(text)
    if coordinates is None and any(p.search(text) for p in SECTION_POINT_RES):
        coordinates, coordinates_raw = _parse_section_modifier_segments(text)
    if coordinates is None and INTERLEAVED_SEC_RE.search(text):
        coordinates, coordinates_raw = _parse_interleaved_sec_segments(text)

    title = re.sub(r'\s+', ' ', TITLE_SPLIT.split(text)[0].strip())
    return title, coordinates, coordinates_raw, False


def region_key(label: str) -> str:
    upper = label.upper()
    if 'CORDILLERA' in upper:
        return 'CAR'
    if 'NEGROS ISLAND' in upper:
        return 'NIR'
    match = re.match(r'REGION\s+([IVX]+[AB]?)\b', upper)
    if not match:
        raise ValueError(f'Unrecognized DA region: {label}')
    return match[1]


def control_kind(control_no: str) -> str:
    upper = control_no.upper()
    if '-NEW-' in upper:
        return 'new'
    if re.search(r'-L-', upper):
        return 'list_revision'
    return 'original'


def disposition_for(row):
    if row['is_retain']:
        return 'retain'
    proposed = row['proposed_amount_php']
    if proposed == 0:
        return 'dropped'
    if row['kind'] == 'new':
        return 'new'
    if row['kind'] == 'list_revision':
        return 'list_revision'
    if row['to_title'] and row['to_title'] != 'RETAIN':
        return 'modified'
    if proposed and proposed > 0:
        return 'kept'
    return 'other'


def extract(path: Path | None = None):
    workbook_path = path or find_workbook()
    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    try:
        if 'Draft' not in wb.sheetnames:
            raise ValueError(f'Expected sheet Draft; found {wb.sheetnames}')
        ws = wb['Draft']
        rows = list(ws.iter_rows(values_only=True))
    finally:
        wb.close()

    if not rows:
        raise ValueError('DA workbook Draft sheet is empty')

    header = list(rows[0]) + [None] * 8
    expected = ['Control No.', 'FROM', 'TO']
    for index, label in enumerate(expected):
        cell = header[index]
        if cell is None or label.lower() not in str(cell).lower().replace('\n', ' '):
            raise ValueError(f'Unexpected header at column {index + 1}: {cell!r}')

    program = None
    regions = []
    projects = []
    current_region = None
    current_region_key = None

    for excel_row, raw in enumerate(rows[1:], start=2):
        cells = list(raw) + [None] * 8
        control, from_cell, to_cell = cells[0], cells[1], cells[2]
        from_amount = money(cells[3])
        increase = money(cells[4])
        decrease = money(cells[5])
        proposed_amount = money(cells[6])
        remarks = str(cells[7]).strip() if cells[7] is not None else ''

        if control is None and isinstance(from_cell, str) and from_cell.strip():
            label = from_cell.strip()
            if 'REPAIR' in label.upper() and 'FARM-TO-MARKET' in label.upper():
                program = {
                    'excel_row': excel_row,
                    'label': label,
                    'from_amount_php': from_amount,
                    'proposed_increase_php': increase,
                    'proposed_decrease_php': decrease,
                    'proposed_amount_php': proposed_amount,
                }
                continue
            if REGION_HINT.match(label):
                current_region = label
                current_region_key = region_key(label)
                regions.append({
                    'excel_row': excel_row,
                    'region_key': current_region_key,
                    'label': label,
                    'from_amount_php': from_amount,
                    'proposed_increase_php': increase,
                    'proposed_decrease_php': decrease,
                    'proposed_amount_php': proposed_amount,
                })
                continue
            continue

        if control is None:
            continue

        control_no = str(control).strip()
        from_title, from_coords, from_coords_raw, from_retain = parse_title_coords(from_cell)
        to_title, to_coords, to_coords_raw, is_retain = parse_title_coords(to_cell)
        if from_retain:
            from_title = None
        kind = control_kind(control_no)
        row = {
            'id': f'da_fmr:r{excel_row}',
            'excel_row': excel_row,
            'control_no': control_no,
            'kind': kind,
            'region_key': current_region_key,
            'region': current_region,
            'from_title': from_title,
            'from_coordinates': from_coords,
            'from_coordinates_raw': from_coords_raw,
            'to_title': None if is_retain else to_title,
            'to_coordinates': to_coords,
            'to_coordinates_raw': to_coords_raw,
            'is_retain': is_retain,
            'from_amount_php': from_amount,
            'proposed_increase_php': increase,
            'proposed_decrease_php': decrease,
            'proposed_amount_php': proposed_amount,
            'remarks': remarks,
        }
        row['disposition'] = disposition_for(row)

        # Effective proposed observation used for NEP/House comparison.
        if is_retain:
            row['effective_title'] = from_title
            row['effective_coordinates'] = from_coords
            row['effective_coordinates_raw'] = from_coords_raw
            row['effective_amount_php'] = proposed_amount if proposed_amount is not None else from_amount
        elif proposed_amount and proposed_amount > 0:
            row['effective_title'] = to_title or from_title
            row['effective_coordinates'] = to_coords or from_coords
            row['effective_coordinates_raw'] = to_coords_raw or from_coords_raw
            row['effective_amount_php'] = proposed_amount
        else:
            row['effective_title'] = None
            row['effective_coordinates'] = None
            row['effective_coordinates_raw'] = None
            row['effective_amount_php'] = 0 if proposed_amount == 0 else proposed_amount

        projects.append(row)

    if program is None:
        raise ValueError('Program header row not found in DA draft')
    if not regions:
        raise ValueError('No region headers found in DA draft')
    if not projects:
        raise ValueError('No project rows found in DA draft')

    originals = [p for p in projects if p['kind'] == 'original']
    proposed = [p for p in projects if (p['effective_amount_php'] or 0) > 0]
    proposed_total = sum(p['effective_amount_php'] for p in proposed)
    from_total = sum(p['from_amount_php'] or 0 for p in originals)

    clarifications = sorted(SOURCE_DIR.glob('[BATCH 1] DA RESPONSES*.pdf'))
    clarification = clarifications[0] if clarifications else None

    payload = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'label': 'DA FMR working draft (Nov 5)',
        'role': 'da_working_draft',
        'note': (
            'DA-supplied FROM→TO working draft. NEP and House GAB printed annexes '
            'remain the source-of-truth ledgers; this file is compared against them.'
        ),
        'metadata': {
            'source_xlsx': str(workbook_path.relative_to(ROOT)),
            'source_xlsx_sha256': sha(workbook_path),
            'source_sheet': 'Draft',
            'clarifications_pdf': (
                str(clarification.relative_to(ROOT)) if clarification else None
            ),
            'clarifications_pdf_sha256': sha(clarification) if clarification else None,
            'extractor': 'other-analysis/extract_da_fmr.py',
        },
        'program': program,
        'regions': regions,
        'projects': projects,
        'summary': {
            'project_rows': len(projects),
            'original_rows': len(originals),
            'new_rows': sum(p['kind'] == 'new' for p in projects),
            'list_revision_rows': sum(p['kind'] == 'list_revision' for p in projects),
            'retain_rows': sum(p['disposition'] == 'retain' for p in projects),
            'dropped_rows': sum(p['disposition'] == 'dropped' for p in projects),
            'proposed_project_rows': len(proposed),
            'from_amount_php': from_total,
            'proposed_amount_php': proposed_total,
            'region_count': len(regions),
            'dispositions': {
                key: sum(p['disposition'] == key for p in projects)
                for key in sorted({p['disposition'] for p in projects})
            },
        },
    }

    if from_total != 16_000_000_000:
        raise ValueError(f'DA FROM originals sum to {from_total}, expected 16000000000')
    if proposed_total != 16_000_000_000:
        raise ValueError(
            f'DA proposed portfolio sums to {proposed_total}, expected 16000000000'
        )
    if len(originals) != 704:
        raise ValueError(f'DA original rows = {len(originals)}, expected 704')

    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--xlsx', type=Path, default=None)
    args = parser.parse_args()
    data = extract(args.xlsx)
    content = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != content:
            raise SystemExit('DA FMR draft is missing or stale; run extract_da_fmr.py')
        print(f'DA FMR draft verified: {OUTPUT}')
        return
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(content)
    summary = data['summary']
    print(
        f"DA FMR draft written: {OUTPUT} "
        f"({summary['project_rows']} rows, "
        f"{summary['proposed_project_rows']} proposed, "
        f"₱{summary['proposed_amount_php']:,})"
    )


if __name__ == '__main__':
    main()
