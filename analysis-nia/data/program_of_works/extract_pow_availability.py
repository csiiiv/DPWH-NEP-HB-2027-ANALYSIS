#!/usr/bin/env python3
"""Inventory PBC Program-of-Works packages and count supporting docs per Senate project.

Naming in the drop is mostly work-type / system / amount (e.g.
SERVICEROADSCIS-CONSUELO CIS-15.4M). Category-only folders (Resto-CIS, SPIP)
are expanded to their inner PDFs or project subfolders.

Outputs (this directory)
  * pow_availability.json — packages, per-project doc counts, region summary

Matching is region-scoped fuzzy scoring on system name + amount + category
hints. Weak / unmatched packages are re-checked against POW PDF text (native
layer, or tesseract OCR when the PDF is image-only). PDF confirmation can
promote a match to strong. Scores remain triage labels, not certified links.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent
ANALYSIS = HERE.parent.parent
SENATE_PATH = ANALYSIS / 'data' / 'senate_nia_dataset.json'
OUT_PATH = HERE / 'pow_availability.json'

# Local mirror of the PBC Drive drop (not discovered automatically). Rebuilds
# read this path; override with env NIA_POW_ROOT when the mirror moves.
# Upstream folder: PEOPLE'S BUDGET COALITION REQUIREMENTS on Google Drive.
PBC_DRIVE_URL = (
    'https://drive.google.com/drive/u/0/folders/1orH0hcmtfTuYRz4qdOBXwcYhIKk1Yt-m'
)
POW_ROOT = Path(os.environ.get(
    'NIA_POW_ROOT',
    '/media/temp/3dbc81e7-b4e7-4209-a85b-3f0afb0a5253/Downloads/'
    'NIA- PBC_Data/PEOPLE_S BUDGET COALITION REQUIREMENTS/'
    'PROGRAM OF WORKS AND PICTURES (ONGOING UPLOADING)',
))

REGION_MAP = {
    'CAR': ['Cordillera Administrative Region', 'CAR'],
    'REGION 1': ['Region 1'],
    'REGION 2': ['Region 2'],
    'REGION 3': ['Region 3', 'REGION 3'],
    'REGION 4A': ['Region 4A', 'Region IV-A'],
    'REGION 4B': ['Region 4B', 'Region IV-B'],
    'REGION 5': ['Region 5'],
    'REGION 6': ['Region 6'],
    'REGION 7': ['Region 7'],
    'REGION 8': ['Region 8'],
    'REGION 9': ['Region 9'],
    'REGION 10': ['Region 10'],
    'REGION 11': ['Region 11'],
    'REGION 12': ['Region 12'],
    'REGION 13': ['Region 13'],
    'MARIIS': ['MARIIS'],
    'UPRIIS': ['UPRIIS'],
}

WORK_HINTS = [
    ('SERVICEROADSCIS', 'Improvement of Service Roads in Communal Irrigation Systems'),
    ('SERVICEROADSNIS', 'Improvement of Service Roads in National Irrigation Systems'),
    ('SERVICEROADSNIA', 'Improvement of Service Roads in National Irrigation Systems'),
    ('SERVICEROADNIS', 'Improvement of Service Roads in National Irrigation Systems'),
    ('SERVICEROADCIS', 'Improvement of Service Roads in Communal Irrigation Systems'),
    ('SERVICEROADS', 'Improvement of Service Roads'),
    ('SERVICE ROADS', 'Improvement of Service Roads'),
    ('SERVICE ROAD', 'Improvement of Service Roads'),
    ('SERVICEROAD', 'Improvement of Service Roads'),
    ('REPAIRCIS', 'Repair of Communal Irrigation Systems'),
    ('REPAIRNIS', 'Repair of National Irrigation Systems'),
    ('REPAIRPIS', 'Repair of Pump Irrigation Systems'),
    ('REPAIR CIS', 'Repair of Communal Irrigation Systems'),
    ('REPAIR OF NIS', 'Repair of National Irrigation Systems'),
    ('REPAIR CIS', 'Repair of Communal Irrigation Systems'),
    ('RNIS', 'Repair of National Irrigation Systems'),
    ('RESTOCIS', 'Restoration of Communal Irrigation Systems'),
    ('RESTONIS', 'Restoration of National Irrigation Systems'),
    ('RESTO CIS', 'Restoration of Communal Irrigation Systems'),
    ('RESTO-CIS', 'Restoration of Communal Irrigation Systems'),
    ('RESTO-NIS', 'Restoration of National Irrigation Systems'),
    ('RESTO NIS', 'Restoration of National Irrigation Systems'),
    ('CLIMATECHANGENIS', 'Climate Change Adaptation Works (National Systems)'),
    ('CLIMATE CHANGE NIS', 'Climate Change Adaptation Works (National Systems)'),
    ('CLIMATE CHANGE', 'Climate Change Adaptation Works'),
    ('EPIPSOLAR', 'Establishment of Pump Irrigation Projects'),
    ('EGPIP', 'Establishment of Pump Irrigation Projects'),
    ('EPIP', 'Establishment of Pump Irrigation Projects'),
    ('EXTENSIONNIS', 'Extension/Expansion of Existing National Irrigation Systems'),
    ('EXTENSION NIS', 'Extension/Expansion of Existing National Irrigation Systems'),
    ('ISRNIS', 'Improvement of Service Roads in National Irrigation Systems'),
    ('ISR NIS', 'Improvement of Service Roads in National Irrigation Systems'),
    ('SIP', 'Small Irrigation Projects'),
    ('SPIP', 'Establishment of Pump Irrigation Projects'),
]

STOP = {
    'the', 'of', 'and', 'at', 'in', 'for', 'to', 'from', 'with', 'along', 'existing',
    'concrete', 'concreting', 'construction', 'improvement', 'rehabilitation', 'repair',
    'restoration', 'project', 'projects', 'irrigation', 'system', 'systems', 'canal',
    'service', 'road', 'roads', 'access', 'main', 'lateral', 'pump', 'solar', 'powered',
    'cy', 'pow', 'final', 'copy', 'pictures', 'picture', 'photos', 'nis', 'cis', 'ris',
    'pis', 'spip', 'spis', 'sip', 'egpip', 'epip', 'resto', 'isr', 'nia', 'sta', 'no',
    'p', 'm', 'pdf', 'pic', 'pertcpm', 'annex', 'b', 'photo',
}

DOC_EXTS = {'.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def tokens(s: str) -> set[str]:
    return {t for t in norm(s).split() if t and t not in STOP and len(t) > 1}


def parse_amount(name: str):
    m = re.search(r'[-_ ]P?(?P<a>\d+(?:\.\d+)?)\s*[Mm]\b\.?$', name)
    if not m:
        m = re.search(r'[-_ ]P(?P<a>\d+(?:\.\d+)?)\b', name)
    if not m:
        m = re.search(r'(?P<a>\d+(?:\.\d+)?)\s*[Mm]\b', name)
    if not m:
        return None
    return int(round(float(m.group('a')) * 1_000_000))


def parse_work(name: str):
    u = name.upper().replace('_', ' ')
    u = re.sub(r'^\d+\.\s*', '', u)
    for prefix, cat in WORK_HINTS:
        if u.startswith(prefix) or prefix in u[: max(len(prefix) + 8, 28)]:
            return prefix, cat
    return None, None


def parse_system(name: str, work_prefix: str | None) -> str:
    s = re.sub(r'^\d+\.\s*', '', name)
    if work_prefix:
        s = re.sub(re.escape(work_prefix), ' ', s, count=1, flags=re.I)
    s = re.sub(r'[-_ ]P?\d+(?:\.\d+)?\s*[MmBb]?\.?$', ' ', s)
    s = re.sub(r'[-_ ]P\d+(?:\.\d+)?$', ' ', s)
    s = re.sub(r'(?i)\b(pow|pictures?|photos?|pertcpm|pic\d*|final|copy|cy\s*2027|annex\s*b)\b', ' ', s)
    s = re.sub(r'[-_]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip(' -_.')


def package_key_from_stem(stem: str) -> str:
    key = re.sub(r'(?i)^(picture[-_ ]?|pic\d*[-_ ]?)', '', stem)
    key = re.sub(r'(?i)[-_ ]?(pow|pictures?|photos?|pertcpm|pic\d*|annex\s*b)$', '', key)
    return key.strip(' -_')


def is_picture_name(name: str) -> bool:
    return bool(re.search(
        r'(?i)(^|[-_ .])(picture|pictures|photos?|pic\d*)([-_ .]|$)', name))


def count_docs(path: Path) -> dict:
    pdfs, images, other = [], [], []
    if path.is_file():
        files = [path]
    else:
        files = [p for p in path.rglob('*') if p.is_file()]
    for f in files:
        ext = f.suffix.lower()
        rel = str(f.relative_to(POW_ROOT)) if POW_ROOT in f.parents or f == POW_ROOT else f.name
        if ext == '.pdf':
            pdfs.append(rel)
        elif ext in DOC_EXTS:
            images.append(rel)
        else:
            other.append(rel)
    picture_pdfs = sum(1 for rel in pdfs if is_picture_name(Path(rel).name))
    pow_pdf_count = len(pdfs) - picture_pdfs
    photo_count = len(images) + picture_pdfs
    return {
        'pdf_count': len(pdfs),
        'image_count': len(images),
        'other_count': len(other),
        'doc_count': len(pdfs) + len(images),
        'pow_pdf_count': pow_pdf_count,
        'photo_count': photo_count,
        'pdfs': pdfs[:8],
        'images': images[:8],
    }


def looks_category_only(name: str) -> bool:
    """Folder is work-type only (no system/amount) — expand children."""
    work, _ = parse_work(name)
    system = parse_system(name, work)
    amount = parse_amount(name)
    if amount:
        return False
    # short / work-type folder names
    cleaned = re.sub(r'^\d+\.\s*', '', name).strip()
    if work and (not system or len(tokens(system)) == 0):
        return True
    if not work and not amount and len(cleaned) < 40 and not re.search(r'\d', cleaned):
        return True
    return False


def add_package(pkgs: list, region: str, name: str, path: Path, kind: str,
                parent_work: str | None = None, parent_cat: str | None = None):
    docs = count_docs(path)
    work, cat = parse_work(name)
    if not work and parent_work:
        work, cat = parent_work, parent_cat
    system = parse_system(name, work)
    # If name is mostly amount after stripping work, try parent folder name pieces
    amount = parse_amount(name)
    pkgs.append({
        'id': f'{region}/{path.relative_to(POW_ROOT / region).as_posix()}'
              if path.is_relative_to(POW_ROOT / region) else f'{region}/{name}',
        'region_folder': region,
        'kind': kind,
        'name': name,
        'path': str(path.relative_to(POW_ROOT)),
        'work_prefix': work,
        'category_hint': cat,
        'system_guess': system or None,
        'amount_php': amount,
        **docs,
    })


def collect_packages() -> list[dict]:
    pkgs: list[dict] = []
    if not POW_ROOT.is_dir():
        return pkgs
    for region in sorted(p for p in POW_ROOT.iterdir() if p.is_dir()):
        kids = list(region.iterdir())
        dirs = [p for p in kids if p.is_dir()]
        files = [p for p in kids if p.is_file()]
        if dirs:
            for d in dirs:
                if looks_category_only(d.name):
                    work, cat = parse_work(d.name)
                    subdirs = [p for p in d.iterdir() if p.is_dir()]
                    pdfs = [p for p in d.iterdir() if p.is_file() and p.suffix.lower() == '.pdf']
                    if subdirs:
                        for sd in subdirs:
                            add_package(pkgs, region.name, sd.name, sd, 'nested_package',
                                        parent_work=work, parent_cat=cat)
                    # Loose PDFs inside category folders (dedupe POW vs PICTURE)
                    seen = set()
                    for pdf in pdfs:
                        key = package_key_from_stem(pdf.stem)
                        lk = key.lower()
                        if lk in seen:
                            # merge docs onto existing package of same key
                            for existing in pkgs:
                                if (existing['region_folder'] == region.name
                                        and existing['name'].lower() == lk
                                        and existing['kind'] == 'category_pdf'):
                                    extra = count_docs(pdf)
                                    existing['pdf_count'] += extra['pdf_count']
                                    existing['image_count'] += extra['image_count']
                                    existing['doc_count'] += extra['doc_count']
                                    existing['pow_pdf_count'] = existing.get('pow_pdf_count', 0) + extra.get('pow_pdf_count', 0)
                                    existing['photo_count'] = existing.get('photo_count', 0) + extra.get('photo_count', 0)
                                    existing['pdfs'] = (existing['pdfs'] + extra['pdfs'])[:8]
                                    break
                            continue
                        seen.add(lk)
                        add_package(pkgs, region.name, key, pdf, 'category_pdf',
                                    parent_work=work, parent_cat=cat)
                    if not subdirs and not pdfs:
                        add_package(pkgs, region.name, d.name, d, 'category_empty',
                                    parent_work=work, parent_cat=cat)
                else:
                    add_package(pkgs, region.name, d.name, d, 'package_dir')
        else:
            seen = set()
            for f in files:
                if f.suffix.lower() not in DOC_EXTS:
                    continue
                if f.suffix.lower() != '.pdf' and not f.stem.upper().startswith(('PICTURE', 'PIC')):
                    # standalone images without a package stem — skip as package keys
                    continue
                key = package_key_from_stem(f.stem)
                lk = key.lower()
                if lk in seen:
                    for existing in pkgs:
                        if (existing['region_folder'] == region.name
                                and existing['name'].lower() == lk
                                and existing['kind'] == 'loose_pdf'):
                            extra = count_docs(f)
                            existing['pdf_count'] += extra['pdf_count']
                            existing['image_count'] += extra['image_count']
                            existing['doc_count'] += extra['doc_count']
                            existing['pow_pdf_count'] = existing.get('pow_pdf_count', 0) + extra.get('pow_pdf_count', 0)
                            existing['photo_count'] = existing.get('photo_count', 0) + extra.get('photo_count', 0)
                            if f.suffix.lower() == '.pdf':
                                existing['pdfs'] = (existing['pdfs'] + [str(f.relative_to(POW_ROOT))])[:8]
                            else:
                                existing['images'] = (existing['images'] + [str(f.relative_to(POW_ROOT))])[:8]
                            break
                    continue
                seen.add(lk)
                # Prefer the POW pdf path as package path when grouping
                add_package(pkgs, region.name, key, f, 'loose_pdf')
            # Also count orphan images already merged; nothing else
    return pkgs


def load_senate():
    data = json.loads(SENATE_PATH.read_text())
    by_region = defaultdict(list)
    projects = []
    for p in data['projects']:
        title = p.get('submission_label') or p.get('label') or ''
        amount = p.get('hgab_amount') if p.get('hgab_amount') else p.get('nep_amount')
        row = {
            'id': p['id'],
            'status': p.get('status'),
            'category': p.get('category'),
            'region': p.get('region'),
            'title': title,
            'title_n': norm(title),
            'toks': tokens(title),
            'amount': amount,
            'nep_amount': p.get('nep_amount'),
            'hgab_amount': p.get('hgab_amount'),
        }
        projects.append(row)
        by_region[p.get('region') or ''].append(row)
    return projects, by_region


def score_package(pkg: dict, senate_row: dict) -> dict:
    sys_n = norm(pkg.get('system_guess') or '')
    sys_toks = tokens(pkg.get('system_guess') or '')
    cat_boost = 0.0
    if pkg.get('category_hint') and senate_row['category']:
        if pkg['category_hint'][:20].lower() in (senate_row['category'] or '').lower():
            cat_boost = 0.08
        elif set(norm(pkg['category_hint']).split()) & set(norm(senate_row['category']).split()) - {'of', 'in', 'the'}:
            cat_boost = 0.05
    amt_score = 0.0
    if pkg.get('amount_php') and senate_row['amount']:
        if senate_row['amount'] == pkg['amount_php']:
            amt_score = 0.25
        elif abs(senate_row['amount'] - pkg['amount_php']) / max(pkg['amount_php'], 1) <= 0.02:
            amt_score = 0.15
        elif abs(senate_row['amount'] - pkg['amount_php']) / max(pkg['amount_php'], 1) <= 0.10:
            amt_score = 0.05
    ratio = SequenceMatcher(None, sys_n, senate_row['title_n']).ratio() if sys_n else 0.0
    compact = ' '.join(t for t in senate_row['title_n'].split() if t not in STOP)
    ratio2 = SequenceMatcher(None, sys_n, compact).ratio() if sys_n else 0.0
    overlap = len(sys_toks & senate_row['toks']) / max(len(sys_toks), 1) if sys_toks else 0.0
    substr = 0.0
    if sys_n and sys_n.replace(' ', '') in senate_row['title_n'].replace(' ', ''):
        substr = 0.15
    elif sys_toks and any(len(t) >= 4 and t in senate_row['title_n'] for t in sys_toks):
        substr = 0.10
    score = 0.45 * max(ratio, ratio2) + 0.25 * overlap + amt_score + cat_boost + substr
    return {
        'score': round(score, 3),
        'title_ratio': round(max(ratio, ratio2), 3),
        'token_overlap': round(overlap, 3),
        'amount_hit': amt_score > 0,
        'cat_boost': cat_boost > 0,
        'senate_id': senate_row['id'],
        'status': senate_row['status'],
        'category': senate_row['category'],
        'region': senate_row['region'],
        'amount': senate_row['amount'],
        'title': senate_row['title'],
    }


def match_strength(top: dict | None, pkg: dict) -> str:
    if not top:
        return 'unmatched'
    if not pkg.get('system_guess') and not pkg.get('amount_php'):
        return 'review'
    if top.get('pdf_confirmed'):
        return 'strong'
    if top['score'] >= 0.55 or (top['amount_hit'] and top['score'] >= 0.40):
        return 'strong'
    if top['score'] >= 0.25:
        return 'weak'
    return 'unmatched'


def package_pdf_paths(pkg: dict) -> list[Path]:
    """Prefer non-picture POW PDFs; fall back to picture PDFs."""
    root = POW_ROOT / pkg['path']
    paths: list[Path] = []
    if root.is_file() and root.suffix.lower() == '.pdf':
        paths = [root]
        if re.search(r'(?i)^picture[-_ ]?|^pic\d*[-_ ]?', root.name):
            for sib in root.parent.iterdir():
                if (sib.is_file() and sib.suffix.lower() == '.pdf' and sib != root
                        and not re.search(r'(?i)picture|photos?', sib.name)):
                    stem_bits = set(re.findall(r'[A-Za-z0-9]{3,}', pkg['name'].upper()))
                    if stem_bits & set(re.findall(r'[A-Za-z0-9]{3,}', sib.stem.upper())):
                        paths.insert(0, sib)
    elif root.is_dir():
        paths = sorted({*root.rglob('*.pdf'), *root.rglob('*.PDF')})
    else:
        for rel in pkg.get('pdfs') or []:
            p = POW_ROOT / rel
            if p.is_file():
                paths.append(p)
    paths = sorted(set(paths), key=lambda p: (
        1 if re.search(r'(?i)picture|photos?|pic\d', p.name) else 0, p.name))
    return paths


def extract_pdf_text(pdf: Path, max_pages: int = 4) -> tuple[str, str]:
    """Return (text, method) where method is native|ocr|empty."""
    try:
        import pymupdf
    except ImportError:
        return '', 'empty'
    doc = pymupdf.open(pdf)
    try:
        parts = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            parts.append(page.get_text('text') or '')
        text = '\n'.join(parts).strip()
        if len(re.sub(r'\s+', '', text)) >= 40:
            return text, 'native'
        # Image-only / nearly empty: OCR first pages
        try:
            import subprocess
            import tempfile
            ocr_parts = []
            for i, page in enumerate(doc):
                if i >= min(2, max_pages):
                    break
                pix = page.get_pixmap(dpi=150)
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                    pix.save(tmp.name)
                    tmp_path = tmp.name
                try:
                    r = subprocess.run(
                        ['tesseract', tmp_path, 'stdout', '-l', 'eng'],
                        capture_output=True, text=True, timeout=90)
                    if r.returncode == 0 and r.stdout.strip():
                        ocr_parts.append(r.stdout)
                finally:
                    Path(tmp_path).unlink(missing_ok=True)
            ocr = '\n'.join(ocr_parts).strip()
            if len(re.sub(r'\s+', '', ocr)) >= 40:
                return ocr, 'ocr'
        except Exception:
            pass
        return text, 'empty' if not text else 'native'
    finally:
        doc.close()


def package_document_text(pkg: dict) -> tuple[str, str, list[str]]:
    """Concatenate text from package PDFs. Returns (text, method, pdf_rels)."""
    paths = package_pdf_paths(pkg)
    if not paths:
        return '', 'empty', []
    chunks = []
    methods = []
    used = []
    for pdf in paths[:3]:
        text, method = extract_pdf_text(pdf)
        if text:
            chunks.append(text)
            methods.append(method)
            used.append(str(pdf.relative_to(POW_ROOT)))
    if not chunks:
        return '', 'empty', [str(p.relative_to(POW_ROOT)) for p in paths[:3]]
    method = 'ocr' if methods == ['ocr'] else ('native' if 'native' in methods else methods[0])
    return '\n'.join(chunks), method, used


def amounts_in_text(text: str) -> set[int]:
    found: set[int] = set()
    for m in re.finditer(r'(?:php|₱)\s*\.?\s*([\d,]+(?:\.\d+)?)', text, re.I):
        try:
            v = float(m.group(1).replace(',', ''))
            found.add(int(round(v * 1_000_000)) if v < 10_000 else int(round(v)))
        except ValueError:
            pass
    for m in re.finditer(r'([\d,]+(?:\.\d+)?)\s*(?:million|\bM\b)', text, re.I):
        try:
            found.add(int(round(float(m.group(1).replace(',', '')) * 1_000_000)))
        except ValueError:
            pass
    # bare millions-scale totals common on POW forms
    for m in re.finditer(r'\b(\d{1,3}(?:,\d{3}){2,}(?:\.\d+)?)\b', text):
        try:
            found.add(int(round(float(m.group(1).replace(',', '')))))
        except ValueError:
            pass
    return found


def score_package_with_pdf(pkg: dict, senate_row: dict, pdf_text: str, pdf_n: str,
                           pdf_amounts: set[int]) -> dict:
    """Rescore a Senate candidate using POW PDF body text."""
    base = score_package(pkg, senate_row)
    title = senate_row['title']
    title_n = senate_row['title_n']
    toks = [t for t in title_n.split() if len(t) >= 4 and t not in STOP]
    hits = sum(1 for t in toks if t in pdf_n)
    hit_ratio = hits / max(len(toks), 1) if toks else 0.0
    # Phrase anchors: system name before colon (drop trailing CIS/RIS/PIS/IS)
    head = re.split(r'[:\-–]', title, maxsplit=1)[0].strip()
    head_n = norm(head)
    head_core = re.sub(r'\b(cis|ris|pis|is|spip|nis)\b', ' ', head_n)
    head_core = re.sub(r'\s+', ' ', head_core).strip()
    compact_pdf = pdf_n.replace(' ', '')
    phrase_hit = bool(head_n) and len(head_n) >= 6 and head_n.replace(' ', '') in compact_pdf
    if not phrase_hit and head_core and len(head_core) >= 6:
        phrase_hit = head_core.replace(' ', '') in compact_pdf
    if not phrase_hit and head_n:
        head_toks = [t for t in head_n.split() if len(t) >= 4 and t not in STOP]
        phrase_hit = len(head_toks) >= 2 and all(t in pdf_n for t in head_toks)
    # Distinctive site/system tokens (≥5 chars) present in PDF — e.g. Bantog, Labangan
    distinctive = [t for t in toks if len(t) >= 5]
    distinctive_hits = [t for t in distinctive if t in pdf_n]
    site_hit = len(distinctive_hits) >= 1 and any(len(t) >= 6 for t in distinctive_hits)
    amt = senate_row['amount']
    amt_in_pdf = False
    if amt and pdf_amounts:
        if amt in pdf_amounts:
            amt_in_pdf = True
        elif any(abs(a - amt) / max(amt, 1) <= 0.02 for a in pdf_amounts):
            amt_in_pdf = True
    # Combine: keep filename score, add PDF evidence boost
    pdf_score = (
        0.45 * hit_ratio
        + (0.2 if phrase_hit else 0.0)
        + (0.15 if site_hit else 0.0)
        + (0.2 if amt_in_pdf else 0.0)
        + (0.05 if base['cat_boost'] else 0.0)
    )
    combined = max(base['score'], 0.35 * base['score'] + 0.65 * pdf_score)
    # Picture-only packets with a unique site name (Bantog) can confirm without amount
    confirmed = (
        (phrase_hit and (amt_in_pdf or base['amount_hit'] or hit_ratio >= 0.35 or site_hit))
        or (hit_ratio >= 0.55 and (amt_in_pdf or base['amount_hit']))
        or (hit_ratio >= 0.7)
        or (phrase_hit and hit_ratio >= 0.4)
        or (site_hit and (amt_in_pdf or base['amount_hit'] or phrase_hit))
        # Picture sheets often name only the IA/site (e.g. "Bantog I.A")
        or (site_hit and any(len(t) >= 6 for t in distinctive_hits))
    )
    out = {
        **base,
        'score': round(combined, 3),
        'pdf_hit_ratio': round(hit_ratio, 3),
        'pdf_hits': hits,
        'pdf_tokens': len(toks),
        'pdf_phrase_hit': phrase_hit,
        'pdf_site_hit': site_hit,
        'pdf_amount_hit': amt_in_pdf,
        'pdf_confirmed': confirmed,
        'amount_hit': base['amount_hit'] or amt_in_pdf,
    }
    return out


def confirm_weak_with_pdf(pkg: dict, pool: list[dict], top: dict | None,
                          scored: list[dict]) -> tuple[dict | None, list[dict], dict | None]:
    """For weak/unmatched packages, read POW PDF text and re-rank candidates."""
    text, method, used = package_document_text(pkg)
    evidence = {
        'method': method,
        'pdfs': used,
        'chars': len(text),
        'snippet': re.sub(r'\s+', ' ', text)[:280] if text else '',
    }
    if method == 'empty' or len(text) < 40:
        return top, scored, evidence
    pdf_n = norm(text)
    pdf_amounts = amounts_in_text(text)
    rescored = [score_package_with_pdf(pkg, s, text, pdf_n, pdf_amounts) for s in pool]
    rescored.sort(key=lambda x: (
        -int(x.get('pdf_confirmed') or False),
        -x['score'],
        -(x.get('pdf_hit_ratio') or 0),
        x['title'] or '',
    ))
    new_top = rescored[0] if rescored else top
    if new_top and new_top.get('pdf_confirmed'):
        evidence['confirmed'] = True
        evidence['senate_id'] = new_top['senate_id']
        evidence['pdf_hit_ratio'] = new_top.get('pdf_hit_ratio')
        evidence['pdf_phrase_hit'] = new_top.get('pdf_phrase_hit')
        evidence['pdf_amount_hit'] = new_top.get('pdf_amount_hit')
    else:
        evidence['confirmed'] = False
    return new_top, rescored[:5], evidence


def build():
    pkgs = collect_packages()
    senate, by_region = load_senate()

    matched_packages = []
    for pkg in pkgs:
        regions = REGION_MAP.get(pkg['region_folder'], [])
        pool = []
        for r in regions:
            pool.extend(by_region.get(r, []))
        scored = [score_package(pkg, s) for s in pool]
        scored.sort(key=lambda x: (-x['score'], x['title'] or ''))
        top = scored[0] if scored else None
        strength = match_strength(top, pkg)
        pdf_evidence = None
        if strength in ('weak', 'unmatched', 'review') and pool:
            top, scored, pdf_evidence = confirm_weak_with_pdf(pkg, pool, top, scored)
            strength = match_strength(top, pkg)
        entry = {
            **{k: pkg[k] for k in (
                'id', 'region_folder', 'kind', 'name', 'path', 'work_prefix',
                'category_hint', 'system_guess', 'amount_php', 'pdf_count',
                'image_count', 'other_count', 'doc_count', 'pow_pdf_count',
                'photo_count', 'pdfs', 'images',
            )},
            'match_strength': strength,
            'best_match': top,
            'candidates': scored[:3],
            'pdf_evidence': pdf_evidence,
        }
        matched_packages.append(entry)

    # Aggregate supporting-doc counts onto Senate projects (accumulate all packages)
    by_project: dict[str, dict] = {}
    for pkg in matched_packages:
        top = pkg.get('best_match')
        if not top or pkg['match_strength'] in ('unmatched', 'review'):
            continue
        soft = pkg['match_strength'] == 'weak' and not top.get('pdf_confirmed')
        sid = top['senate_id']
        attribution = {
            'package_id': pkg['id'],
            'package_name': pkg['name'],
            'package_path': pkg['path'],
            'match_strength': pkg['match_strength'],
            'score': top['score'],
            'soft': soft,
            'pdf_confirmed': bool(top.get('pdf_confirmed')),
            'pdf_count': pkg['pdf_count'],
            'image_count': pkg['image_count'],
            'doc_count': pkg['doc_count'],
            'pow_pdf_count': pkg.get('pow_pdf_count', 0),
            'photo_count': pkg.get('photo_count', 0),
        }
        cur = by_project.get(sid)
        if not cur:
            by_project[sid] = {
                'senate_id': sid,
                'title': top['title'],
                'region': top['region'],
                'category': top['category'],
                'status': top['status'],
                'amount': top['amount'],
                'best_score': top['score'],
                'match_strength': pkg['match_strength'],
                'pdf_confirmed': bool(top.get('pdf_confirmed')),
                'package_count': 1,
                'pdf_count': pkg['pdf_count'],
                'image_count': pkg['image_count'],
                'doc_count': pkg['doc_count'],
                'pow_pdf_count': pkg.get('pow_pdf_count', 0),
                'photo_count': pkg.get('photo_count', 0),
                'packages': [attribution],
            }
            continue
        cur['package_count'] += 1
        cur['pdf_count'] += pkg['pdf_count']
        cur['image_count'] += pkg['image_count']
        cur['doc_count'] += pkg['doc_count']
        cur['pow_pdf_count'] = cur.get('pow_pdf_count', 0) + pkg.get('pow_pdf_count', 0)
        cur['photo_count'] = cur.get('photo_count', 0) + pkg.get('photo_count', 0)
        cur['packages'].append(attribution)
        if top['score'] > cur['best_score']:
            cur['best_score'] = top['score']
            cur['match_strength'] = pkg['match_strength']
        if top.get('pdf_confirmed') or pkg['match_strength'] == 'strong':
            # Prefer strong / PDF-confirmed label once earned
            if cur['match_strength'] != 'strong':
                cur['match_strength'] = pkg['match_strength']
            cur['pdf_confirmed'] = cur.get('pdf_confirmed') or bool(top.get('pdf_confirmed'))


    # Full Senate coverage: supported (has POW docs) vs unsupported (none in drop)
    coverage = []
    for srow in senate:
        hit = by_project.get(srow['id'])
        if hit:
            has_pow = (hit.get('pow_pdf_count') or 0) > 0
            has_photos = (hit.get('photo_count') or 0) > 0
            coverage.append({
                **{k: hit[k] for k in hit if k != 'best_score'},
                'supported': True,
                'support': 'supported',
                'has_pow': has_pow,
                'has_photos': has_photos,
            })
        else:
            coverage.append({
                'senate_id': srow['id'],
                'title': srow['title'],
                'region': srow['region'],
                'category': srow['category'],
                'status': srow['status'],
                'amount': srow['amount'],
                'supported': False,
                'support': 'unsupported',
                'has_pow': False,
                'has_photos': False,
                'match_strength': None,
                'package_count': 0,
                'pdf_count': 0,
                'image_count': 0,
                'doc_count': 0,
                'pow_pdf_count': 0,
                'photo_count': 0,
                'packages': [],
            })
    coverage.sort(key=lambda r: (
        0 if r['supported'] else 1,
        -(r['doc_count'] or 0),
        r['region'] or '',
        r['title'] or '',
    ))

    # Region summary (packages from drop + Senate coverage by region folder)
    by_reg = defaultdict(lambda: {
        'packages': 0, 'strong': 0, 'weak': 0, 'review': 0, 'unmatched': 0,
        'docs': 0, 'pdfs': 0, 'images': 0,
        'projects_with_docs': 0, 'senate_projects': 0, 'unsupported': 0,
    })
    for pkg in matched_packages:
        b = by_reg[pkg['region_folder']]
        b['packages'] += 1
        b[pkg['match_strength']] += 1
        b['docs'] += pkg['doc_count']
        b['pdfs'] += pkg['pdf_count']
        b['images'] += pkg['image_count']
    folder_for_region = {}
    for folder, labels in REGION_MAP.items():
        for label in labels:
            folder_for_region[label] = folder
    for row in coverage:
        folder = folder_for_region.get(row['region'] or '')
        if not folder:
            continue
        b = by_reg[folder]
        b['senate_projects'] += 1
        if row['supported']:
            b['projects_with_docs'] += 1
        else:
            b['unsupported'] += 1

    strength_counts = defaultdict(int)
    for pkg in matched_packages:
        strength_counts[pkg['match_strength']] += 1

    supported_n = sum(1 for r in coverage if r['supported'])
    unsupported_n = len(coverage) - supported_n
    with_pow_n = sum(1 for r in coverage if r.get('has_pow'))
    with_photos_n = sum(1 for r in coverage if r.get('has_photos'))
    support_scale = [
        {'id': 'pow', 'label': 'With POW', 'count': with_pow_n,
         'detail': 'Program of Works PDF in the PBC drop'},
        {'id': 'photos', 'label': 'With geotagged photos', 'count': with_photos_n,
         'detail': 'Site pictures / picture sheets in the PBC drop'},
        {'id': 'none', 'label': 'No supporting docs', 'count': unsupported_n,
         'detail': 'No package in this drop mapped to the Senate row'},
    ]

    payload = {
        'schema_version': 1,
        'source': str(POW_ROOT),
        'source_drive_url': PBC_DRIVE_URL,
        'source_drive_folder': "PEOPLE'S BUDGET COALITION REQUIREMENTS",
        'source_subfolder': 'PROGRAM OF WORKS AND PICTURES (ONGOING UPLOADING)',
        'note': (
            'Supporting-document availability from the PBC Program of Works drop. '
            'Package names are parsed as work-type / system / amount and fuzzy-matched '
            'to Senate workbook submission titles within the same region folder. '
            'Matches are triage candidates, not certified identity. '
            'Unsupported means no package in this drop mapped to the Senate row. '
            'With POW / With geotagged photos can overlap on the same project. '
            'Local path is configured in extract_pow_availability.py (or NIA_POW_ROOT); '
            'canonical upstream is the PBC Google Drive folder.'
        ),
        'summary': {
            'region_folders': len({p['region_folder'] for p in matched_packages}),
            'packages': len(matched_packages),
            'total_docs': sum(p['doc_count'] for p in matched_packages),
            'total_pdfs': sum(p['pdf_count'] for p in matched_packages),
            'total_images': sum(p['image_count'] for p in matched_packages),
            'match_strength': dict(strength_counts),
            'senate_projects': len(senate),
            'senate_projects_with_docs': supported_n,
            'senate_projects_unsupported': unsupported_n,
            'senate_projects_with_pow': with_pow_n,
            'senate_projects_with_photos': with_photos_n,
            'senate_docs_attributed': sum(p['doc_count'] for p in by_project.values()),
            'support_scale': support_scale,
        },
        'by_region': [
            {'region_folder': k, **v}
            for k, v in sorted(by_reg.items())
        ],
        'packages': matched_packages,
        # Supported-only shorthand (same rows as coverage where supported=true)
        'projects': sorted(
            ({k: v[k] for k in v if k != 'best_score'} for v in by_project.values()),
            key=lambda r: (-r['doc_count'], r['region'] or '', r['title'] or ''),
        ),
        'coverage': coverage,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n')
    return payload


if __name__ == '__main__':
    out = build()
    s = out['summary']
    print(f"packages={s['packages']} docs={s['total_docs']} "
          f"(pdfs={s['total_pdfs']} images={s['total_images']})")
    print(f"match_strength={s['match_strength']}")
    print(f"senate_with_docs={s['senate_projects_with_docs']}/{s['senate_projects']}")
    print(f"scale: pow={s['senate_projects_with_pow']} photos={s['senate_projects_with_photos']} "
          f"none={s['senate_projects_unsupported']}")
    print(f'wrote {OUT_PATH}')
